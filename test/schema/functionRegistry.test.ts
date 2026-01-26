import { describe, it, expect, beforeAll } from 'vitest';
import { GroqParser } from '../../src/parser/GroqParser.js';
import { FunctionRegistry } from '../../src/schema/FunctionRegistry.js';
import { SchemaLoader } from '../../src/schema/SchemaLoader.js';
import { ExtensionRegistry, paramTypeAnnotationsExtension } from '../../src/extensions/index.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

function createExtensionRegistry(): ExtensionRegistry {
  const registry = new ExtensionRegistry();
  registry.register(paramTypeAnnotationsExtension);
  registry.enable('paramTypeAnnotations');
  return registry;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('FunctionRegistry', () => {
  const parser = new GroqParser();

  describe('extractFromAST', () => {
    it('extracts simple function definitions', () => {
      const query = 'fn double($x) = $x * 2';
      const result = parser.parse(query);
      const registry = new FunctionRegistry();
      registry.extractFromAST(result.tree.rootNode);

      expect(registry.hasDefinition('double')).toBe(true);
      const def = registry.getDefinition('double');
      expect(def).toBeDefined();
      expect(def?.name).toBe('double');
      expect(def?.parameters).toHaveLength(1);
      expect(def?.parameters[0].name).toBe('$x');
    });

    it('extracts namespaced function definitions', () => {
      const query = 'fn custom::helper($ref) = $ref[]';
      const result = parser.parse(query);
      const registry = new FunctionRegistry();
      registry.extractFromAST(result.tree.rootNode);

      expect(registry.hasDefinition('custom::helper')).toBe(true);
      const def = registry.getDefinition('custom::helper');
      expect(def?.name).toBe('custom::helper');
      expect(def?.parameters).toHaveLength(1);
    });

    it('extracts multiple function definitions', () => {
      const query = `
        fn double($x) = $x * 2;
        fn add($a, $b) = $a + $b;
        fn triple($y) = $y * 3
      `;
      const result = parser.parse(query);
      const registry = new FunctionRegistry();
      registry.extractFromAST(result.tree.rootNode);

      expect(registry.hasDefinition('double')).toBe(true);
      expect(registry.hasDefinition('add')).toBe(true);
      expect(registry.hasDefinition('triple')).toBe(true);

      const addDef = registry.getDefinition('add');
      expect(addDef?.parameters).toHaveLength(2);
      expect(addDef?.parameters[0].name).toBe('$a');
      expect(addDef?.parameters[1].name).toBe('$b');
    });

    it('returns all definitions', () => {
      const query = `
        fn one($x) = $x;
        fn two($a, $b) = $a + $b
      `;
      const result = parser.parse(query);
      const registry = new FunctionRegistry();
      registry.extractFromAST(result.tree.rootNode);

      const allDefs = registry.getAllDefinitions();
      expect(allDefs).toHaveLength(2);
    });
  });

  describe('call site tracking', () => {
    it('tracks call sites for custom functions', () => {
      const query = `
        fn double($x) = $x * 2;
        double(5)
      `;
      const result = parser.parse(query);
      const registry = new FunctionRegistry();
      registry.extractFromAST(result.tree.rootNode);

      const callSites = registry.getCallSites('double');
      expect(callSites).toHaveLength(1);
    });

    it('tracks multiple call sites', () => {
      const query = `
        fn double($x) = $x * 2;
        double(5);
        double(10)
      `;
      const result = parser.parse(query);
      const registry = new FunctionRegistry();
      registry.extractFromAST(result.tree.rootNode);

      const callSites = registry.getCallSites('double');
      expect(callSites).toHaveLength(2);
    });

    it('does not track built-in function calls', () => {
      const query = `
        fn myFunc($x) = $x;
        count(*[_type == "post"])
      `;
      const result = parser.parse(query);
      const registry = new FunctionRegistry();
      registry.extractFromAST(result.tree.rootNode);

      const countCallSites = registry.getCallSites('count');
      expect(countCallSites).toHaveLength(0);
    });
  });

  describe('isInsideFunctionBody', () => {
    it('returns function definition when inside body', () => {
      const query = 'fn process($ref) = $ref[] { title }';
      const result = parser.parse(query);
      const registry = new FunctionRegistry();
      registry.extractFromAST(result.tree.rootNode);

      const titleNode = findNodeByText(result.tree.rootNode, 'title');
      expect(titleNode).not.toBeNull();

      const funcDef = registry.isInsideFunctionBody(titleNode!);
      expect(funcDef).not.toBeNull();
      expect(funcDef?.name).toBe('process');
    });

    it('returns null when outside function body', () => {
      const query = `
        fn process($ref) = $ref[];
        *[_type == "post"] { title }
      `;
      const result = parser.parse(query);
      const registry = new FunctionRegistry();
      registry.extractFromAST(result.tree.rootNode);

      const titleNode = findNodeByText(result.tree.rootNode, 'title');
      expect(titleNode).not.toBeNull();

      const funcDef = registry.isInsideFunctionBody(titleNode!);
      expect(funcDef).toBeNull();
    });
  });

  describe('getParameterByName', () => {
    it('finds parameter by name', () => {
      const query = 'fn process($ref, $limit) = $ref[0..$limit]';
      const result = parser.parse(query);
      const registry = new FunctionRegistry();
      registry.extractFromAST(result.tree.rootNode);

      const refParam = registry.getParameterByName('process', '$ref');
      expect(refParam).toBeDefined();
      expect(refParam?.name).toBe('$ref');

      const limitParam = registry.getParameterByName('process', '$limit');
      expect(limitParam).toBeDefined();
      expect(limitParam?.name).toBe('$limit');
    });

    it('returns undefined for non-existent parameter', () => {
      const query = 'fn process($ref) = $ref[]';
      const result = parser.parse(query);
      const registry = new FunctionRegistry();
      registry.extractFromAST(result.tree.rootNode);

      const param = registry.getParameterByName('process', '$nonexistent');
      expect(param).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('clears all definitions and call sites', () => {
      const query = `
        fn double($x) = $x * 2;
        double(5)
      `;
      const result = parser.parse(query);
      const registry = new FunctionRegistry();
      registry.extractFromAST(result.tree.rootNode);

      expect(registry.hasDefinition('double')).toBe(true);

      registry.clear();

      expect(registry.hasDefinition('double')).toBe(false);
      expect(registry.getAllDefinitions()).toHaveLength(0);
    });
  });

  describe('param type annotations', () => {
    it('extracts @param type annotation from comment before function', () => {
      const source = `// @param {author} $ref
fn getAuthor($ref) = $ref-> { name }`;
      const result = parser.parse(source);
      const registry = new FunctionRegistry();
      registry.extractFromAST(result.tree.rootNode, undefined, source, createExtensionRegistry());

      const def = registry.getDefinition('getAuthor');
      expect(def).toBeDefined();
      expect(def?.parameters[0].declaredType).toBe('author');
    });

    it('extracts multiple @param annotations', () => {
      const source = `// @param {block} $items
// @param {settings} $config
fn process($items, $config) = $items[]`;
      const result = parser.parse(source);
      const registry = new FunctionRegistry();
      registry.extractFromAST(result.tree.rootNode, undefined, source, createExtensionRegistry());

      const def = registry.getDefinition('process');
      expect(def).toBeDefined();
      expect(def?.parameters[0].declaredType).toBe('block');
      expect(def?.parameters[1].declaredType).toBe('settings');
    });

    it('returns null declaredType when no annotation present', () => {
      const source = 'fn getStuff($ref) = $ref[]';
      const result = parser.parse(source);
      const registry = new FunctionRegistry();
      registry.extractFromAST(result.tree.rootNode, undefined, source, createExtensionRegistry());

      const def = registry.getDefinition('getStuff');
      expect(def).toBeDefined();
      expect(def?.parameters[0].declaredType).toBeNull();
    });

    it('extracts type annotation with underscores and numbers', () => {
      const source = `// @param {my_type_2} $ref
fn getStuff($ref) = $ref[]`;
      const result = parser.parse(source);
      const registry = new FunctionRegistry();
      registry.extractFromAST(result.tree.rootNode, undefined, source, createExtensionRegistry());

      const def = registry.getDefinition('getStuff');
      expect(def?.parameters[0].declaredType).toBe('my_type_2');
    });

    it('stores type annotation range', () => {
      const source = `// @param {author} $ref
fn getAuthor($ref) = $ref-> { name }`;
      const result = parser.parse(source);
      const registry = new FunctionRegistry();
      registry.extractFromAST(result.tree.rootNode, undefined, source, createExtensionRegistry());

      const def = registry.getDefinition('getAuthor');
      expect(def?.parameters[0].typeAnnotationRange).toBeDefined();
      expect(def?.parameters[0].typeAnnotationRange?.startIndex).toBeGreaterThan(0);
    });

    it('handles empty lines between comment and function', () => {
      const source = `// @param {author} $ref

fn getAuthor($ref) = $ref-> { name }`;
      const result = parser.parse(source);
      const registry = new FunctionRegistry();
      registry.extractFromAST(result.tree.rootNode, undefined, source, createExtensionRegistry());

      const def = registry.getDefinition('getAuthor');
      expect(def?.parameters[0].declaredType).toBe('author');
    });
  });
});

describe('FunctionRegistry with schema', () => {
  const parser = new GroqParser();
  const schemaLoader = new SchemaLoader();

  beforeAll(async () => {
    const schemaPath = path.join(__dirname, '../fixtures/test-schema.json');
    await schemaLoader.loadFromPath(schemaPath);
  });

  describe('type inference from call sites', () => {
    it('infers array type from field argument', () => {
      const query = `
        fn getContent($items) = $items[] { title };
        *[_type == "post"] { "stuff": getContent(content) }
      `;
      const result = parser.parse(query);
      const registry = new FunctionRegistry();
      registry.extractFromAST(result.tree.rootNode, schemaLoader);

      const types = registry.getInferredParameterType('getContent', 0);
      expect(types).toContain('block');
    });

    it('infers reference target type from field argument', () => {
      const query = `
        fn getAuthor($ref) = $ref-> { name };
        *[_type == "post"] { "authorData": getAuthor(author) }
      `;
      const result = parser.parse(query);
      const registry = new FunctionRegistry();
      registry.extractFromAST(result.tree.rootNode, schemaLoader);

      const types = registry.getInferredParameterType('getAuthor', 0);
      expect(types).toContain('author');
    });

    it('collects types from multiple call sites', () => {
      const query = `
        fn process($field) = defined($field);
        *[_type == "post"] { "hasTitle": process(title) };
        *[_type == "author"] { "hasName": process(name) }
      `;
      const result = parser.parse(query);
      const registry = new FunctionRegistry();
      registry.extractFromAST(result.tree.rootNode, schemaLoader);

      const types = registry.getInferredParameterType('process', 0);
      expect(types).toContain('string');
    });
  });
});

function findNodeByText(node: any, text: string): any {
  if (node.text === text && node.type === 'identifier') {
    return node;
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      const found = findNodeByText(child, text);
      if (found) return found;
    }
  }
  return null;
}
