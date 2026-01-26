import { describe, it, expect, beforeAll } from 'vitest';
import { GroqParser } from '../../src/parser/GroqParser.js';
import { getDiagnostics } from '../../src/interface/getDiagnostics.js';
import { getAutocompleteSuggestions } from '../../src/interface/getAutocompleteSuggestions.js';
import { getHoverInformation } from '../../src/interface/getHoverInformation.js';
import { getDefinition } from '../../src/interface/getDefinition.js';
import { SchemaLoader } from '../../src/schema/SchemaLoader.js';
import { ExtensionRegistry, paramTypeAnnotationsExtension } from '../../src/extensions/index.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createExtensionRegistry(): ExtensionRegistry {
  const registry = new ExtensionRegistry();
  registry.register(paramTypeAnnotationsExtension);
  registry.enable('paramTypeAnnotations');
  return registry;
}

describe('Function Type Inference Integration', () => {
  const parser = new GroqParser();
  const schemaLoader = new SchemaLoader();

  beforeAll(async () => {
    const schemaPath = path.join(__dirname, '../fixtures/test-schema.json');
    await schemaLoader.loadFromPath(schemaPath);
  });

  describe('diagnostics for custom functions', () => {
    it('does not report errors for custom function calls', () => {
      const query = `
        fn brex::legalPageLinks($ref) = $ref[] { title };
        *[_type == "post"] { "links": brex::legalPageLinks(content) }
      `;
      const result = parser.parse(query);
      const diagnostics = getDiagnostics(result, { schemaLoader, source: query });

      const functionNameErrors = diagnostics.filter(d =>
        d.message.includes('brex') || d.message.includes('legalPageLinks')
      );
      expect(functionNameErrors).toHaveLength(0);
    });

    it('does not report errors for valid fields in function body', () => {
      const query = `
        fn getAuthorName($ref) = $ref-> { name };
        *[_type == "post"] { "authorName": getAuthorName(author) }
      `;
      const result = parser.parse(query);
      const diagnostics = getDiagnostics(result, { schemaLoader, source: query });

      const nameFieldErrors = diagnostics.filter(d =>
        d.message.includes('name') && d.message.includes('does not exist')
      );
      expect(nameFieldErrors).toHaveLength(0);
    });

    it('does not report errors for function definition names', () => {
      const query = 'fn myCustomFunc($x) = $x * 2';
      const result = parser.parse(query);
      const diagnostics = getDiagnostics(result, { schemaLoader, source: query });

      const funcNameErrors = diagnostics.filter(d =>
        d.message.includes('myCustomFunc')
      );
      expect(funcNameErrors).toHaveLength(0);
    });
  });

  describe('autocomplete for custom functions', () => {
    it('suggests custom functions in general context', () => {
      const query = `
        fn brex::helper($x) = $x[];
        `;
      const result = parser.parse(query);
      const completions = getAutocompleteSuggestions(
        query,
        result.tree.rootNode,
        { line: 2, character: 8 },
        schemaLoader
      );

      expect(completions.some(c => c.label === 'brex::helper')).toBe(true);
    });

    it('suggests custom functions in projection', () => {
      const query = `fn getLinks($ref) = $ref[];
*[_type == "post"] { `;
      const result = parser.parse(query);
      const completions = getAutocompleteSuggestions(
        query,
        result.tree.rootNode,
        { line: 1, character: 21 },
        schemaLoader
      );

      expect(completions.some(c => c.label === 'getLinks')).toBe(true);
    });

    it('shows inferred parameter types in completion detail', () => {
      const query = `fn processAuthor($ref) = $ref-> { name };
*[_type == "post"] { "a": processAuthor(author) };
`;
      const result = parser.parse(query);
      const completions = getAutocompleteSuggestions(
        query,
        result.tree.rootNode,
        { line: 2, character: 0 },
        schemaLoader
      );

      const funcCompletion = completions.find(c => c.label === 'processAuthor');
      expect(funcCompletion).toBeDefined();
      expect(funcCompletion?.detail).toContain('$ref');
    });
  });

  describe('hover for custom functions', () => {
    it('shows custom function info on hover over call', () => {
      const query = `fn double($x) = $x * 2;
double(5)`;
      const result = parser.parse(query);
      const hover = getHoverInformation(
        query,
        result.tree.rootNode,
        { line: 1, character: 2 },
        schemaLoader
      );

      expect(hover).not.toBeNull();
      const content = hover?.contents as { value: string };
      expect(content.value).toContain('double');
      expect(content.value).toContain('Custom function');
    });

    it('shows inferred types on hover over function definition', () => {
      const query = `fn processContent($items) = $items[] { title };
*[_type == "post"] { "stuff": processContent(content) }`;
      const result = parser.parse(query);
      const hover = getHoverInformation(
        query,
        result.tree.rootNode,
        { line: 0, character: 5 },
        schemaLoader
      );

      expect(hover).not.toBeNull();
      const content = hover?.contents as { value: string };
      expect(content.value).toContain('processContent');
    });

    it('shows hover for namespaced custom function', () => {
      const query = `fn brex::helper($ref) = $ref[];
brex::helper(content)`;
      const result = parser.parse(query);
      const hover = getHoverInformation(
        query,
        result.tree.rootNode,
        { line: 1, character: 5 },
        schemaLoader
      );

      expect(hover).not.toBeNull();
      const content = hover?.contents as { value: string };
      expect(content.value).toContain('brex::helper');
    });
  });

  describe('go-to-definition for custom functions', () => {
    it('navigates from function call to definition', () => {
      const query = `fn double($x) = $x * 2;
double(5)`;
      const result = parser.parse(query);
      const definition = getDefinition(
        query,
        result.tree.rootNode,
        { line: 1, character: 2 },
        'file:///test.groq'
      );

      expect(definition).not.toBeNull();
      expect(definition?.range.start.line).toBe(0);
    });

    it('navigates from namespaced function call to definition', () => {
      const query = `fn myApp::helper($ref) = $ref[];
myApp::helper(content)`;
      const result = parser.parse(query);
      const definition = getDefinition(
        query,
        result.tree.rootNode,
        { line: 1, character: 5 },
        'file:///test.groq'
      );

      expect(definition).not.toBeNull();
      expect(definition?.range.start.line).toBe(0);
    });
  });

  describe('namespace filtering', () => {
    it('filters completions to only show functions in typed namespace', () => {
      const query = `fn brex::helper($x) = $x;
fn other::func($y) = $y;
brex::`;
      const result = parser.parse(query);
      const completions = getAutocompleteSuggestions(
        query,
        result.tree.rootNode,
        { line: 2, character: 6 },
        schemaLoader
      );

      // Should only show brex:: functions
      expect(completions.some(c => c.label === 'helper')).toBe(true);
      // Should not show other namespace or non-namespaced functions
      expect(completions.some(c => c.label === 'other::func')).toBe(false);
      expect(completions.some(c => c.label === 'func')).toBe(false);
      expect(completions.some(c => c.label === 'count')).toBe(false);
    });

    it('filters built-in namespaced functions', () => {
      const query = `geo::`;
      const result = parser.parse(query);
      const completions = getAutocompleteSuggestions(
        query,
        result.tree.rootNode,
        { line: 0, character: 5 },
        schemaLoader
      );

      // Should show geo:: functions
      expect(completions.some(c => c.label === 'distance')).toBe(true);
      expect(completions.some(c => c.label === 'contains')).toBe(true);
      // Should not show functions from other namespaces
      expect(completions.some(c => c.label === 'text')).toBe(false); // pt::text
      expect(completions.some(c => c.label === 'avg')).toBe(false); // math::avg
    });
  });

  describe('field completions in function bodies', () => {
    it('provides schema field completions inside function body projection', () => {
      const query = `fn getAuthor($ref) = $ref-> { };
*[_type == "post"] { "a": getAuthor(author) }`;
      const result = parser.parse(query);
      // Position inside the projection braces
      const completions = getAutocompleteSuggestions(
        query,
        result.tree.rootNode,
        { line: 0, character: 29 },
        schemaLoader
      );

      // Should have schema fields from the inferred type (author)
      expect(completions.some(c => c.label === 'name')).toBe(true);
      expect(completions.some(c => c.label === 'bio')).toBe(true);
    });

    it('provides schema field completions inside built-in function arguments', () => {
      // Use a query with a placeholder to have a clear position inside the function
      const query = `*[_type == "post"] { "c": count(t) }`;
      const result = parser.parse(query);
      // Position at the 't' inside count(t)
      const completions = getAutocompleteSuggestions(
        query,
        result.tree.rootNode,
        { line: 0, character: 32 },
        schemaLoader
      );

      // Should have schema fields from post type (filtered by 't' prefix)
      expect(completions.some(c => c.label === 'title')).toBe(true);
    });

    it('provides schema field completions inside defined() function', () => {
      // Use a query with a partial field name to have a clear position inside the function
      const query = `*[_type == "post" && defined(t)]`;
      const result = parser.parse(query);
      // Position at the 't' inside defined(t)
      const completions = getAutocompleteSuggestions(
        query,
        result.tree.rootNode,
        { line: 0, character: 29 },
        schemaLoader
      );

      // Should have schema fields from post type (filtered by 't' prefix)
      expect(completions.some(c => c.label === 'title')).toBe(true);
    });

    it('uses declared @param type for field completions', () => {
      const query = `// @param {author} $ref
fn getAuthor($ref) = $ref-> {  };`;
      const result = parser.parse(query);

      // Position inside the projection braces after the space
      const completions = getAutocompleteSuggestions(
        query,
        result.tree.rootNode,
        { line: 1, character: 29 },
        schemaLoader,
        createExtensionRegistry()
      );

      // Should have schema fields from declared type (author)
      expect(completions.some(c => c.label === 'name')).toBe(true);
      expect(completions.some(c => c.label === 'bio')).toBe(true);
      expect(completions.some(c => c.label === 'email')).toBe(true);

      // Should NOT have fields from other types (post, category)
      // These are fields unique to post/category, not on author
      expect(completions.some(c => c.label === 'slug')).toBe(false);        // post only
      expect(completions.some(c => c.label === 'publishedAt')).toBe(false); // post only
      expect(completions.some(c => c.label === 'categories')).toBe(false);  // post only
    });
  });

  describe('complex scenarios', () => {
    it('handles the example from the plan', () => {
      const query = `
fn brex::legalPageLinkTitles($ref) = $ref[] {
  "title": title
};

*[_type == "post"] {
  "titles": brex::legalPageLinkTitles(content)
}
      `;
      const result = parser.parse(query);
      expect(result.hasErrors).toBe(false);

      const diagnostics = getDiagnostics(result, { schemaLoader, source: query });
      const brexErrors = diagnostics.filter(d =>
        d.message.includes('brex') || d.message.includes('legalPageLinkTitles')
      );
      expect(brexErrors).toHaveLength(0);
    });

    it('handles multiple function definitions and calls', () => {
      const query = `
fn utils::double($x) = $x * 2;
fn utils::add($a, $b) = $a + $b;

*[_type == "post"] {
  "computed": utils::add(1, utils::double(2))
}
      `;
      const result = parser.parse(query);
      expect(result.hasErrors).toBe(false);

      const diagnostics = getDiagnostics(result, { schemaLoader, source: query });
      const utilsErrors = diagnostics.filter(d =>
        d.message.includes('utils') ||
        d.message.includes('double') ||
        d.message.includes('add')
      );
      expect(utilsErrors).toHaveLength(0);
    });
  });

  describe('recursion prevention', () => {
    it('reports error for direct recursive function calls', () => {
      const query = `fn recurse($x) = recurse($x)`;
      const result = parser.parse(query);
      const diagnostics = getDiagnostics(result, { schemaLoader, source: query });

      const recursionErrors = diagnostics.filter(d =>
        d.message.includes('Recursive')
      );
      expect(recursionErrors).toHaveLength(1);
      expect(recursionErrors[0].message).toBe('Recursive function calls are not supported in GROQ');
    });

    it('reports error for namespaced recursive function calls', () => {
      const query = `fn brex::legalPageContent($ref) = $ref[] { "titles": brex::legalPageContent(@) }`;
      const result = parser.parse(query);
      const diagnostics = getDiagnostics(result, { schemaLoader, source: query });

      const recursionErrors = diagnostics.filter(d =>
        d.message.includes('Recursive')
      );
      expect(recursionErrors).toHaveLength(1);
    });

    it('does not show recursive function in autocomplete when inside its body', () => {
      const query = `fn brex::legalPageContent($ref) = $ref[] { t };`;
      const result = parser.parse(query);
      // Position at 't' inside the function body
      const completions = getAutocompleteSuggestions(
        query,
        result.tree.rootNode,
        { line: 0, character: 43 },
        schemaLoader
      );

      // Should not suggest the function we're currently defining
      expect(completions.some(c => c.label === 'brex::legalPageContent')).toBe(false);
      expect(completions.some(c => c.label === 'legalPageContent')).toBe(false);
    });

    it('allows calling other functions from within a function body', () => {
      const query = `
fn helper($x) = $x * 2;
fn main($y) = helper($y);
      `;
      const result = parser.parse(query);
      const diagnostics = getDiagnostics(result, { schemaLoader, source: query });

      const recursionErrors = diagnostics.filter(d =>
        d.message.includes('Recursive')
      );
      expect(recursionErrors).toHaveLength(0);
    });
  });
});
