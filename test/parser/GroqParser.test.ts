import { describe, it, expect } from 'vitest';
import { GroqParser } from '../../src/parser/GroqParser.js';

describe('GroqParser', () => {
  const parser = new GroqParser();

  describe('parse', () => {
    it('parses a simple everything query', () => {
      const result = parser.parse('*');
      expect(result.hasErrors).toBe(false);
      expect(result.tree.rootNode.type).toBe('source_file');
      expect(result.tree.rootNode.namedChildCount).toBe(1);
      expect(result.tree.rootNode.namedChild(0)?.type).toBe('everything');
    });

    it('parses a query with filter', () => {
      const result = parser.parse('*[_type == "post"]');
      expect(result.hasErrors).toBe(false);
      const rootChild = result.tree.rootNode.namedChild(0);
      expect(rootChild?.type).toBe('subscript_expression');
    });

    it('parses a query with projection', () => {
      const result = parser.parse('*[_type == "post"]{ title, body }');
      expect(result.hasErrors).toBe(false);
      const rootChild = result.tree.rootNode.namedChild(0);
      expect(rootChild?.type).toBe('projection_expression');
    });

    it('parses a query with pipe and order', () => {
      const result = parser.parse('*[_type == "post"] | order(_createdAt desc)');
      expect(result.hasErrors).toBe(false);
      const rootChild = result.tree.rootNode.namedChild(0);
      expect(rootChild?.type).toBe('pipe_expression');
    });

    it('parses function calls', () => {
      const result = parser.parse('count(*[_type == "post"])');
      expect(result.hasErrors).toBe(false);
      const rootChild = result.tree.rootNode.namedChild(0);
      expect(rootChild?.type).toBe('function_call');
    });

    it('parses dereference expressions', () => {
      const result = parser.parse('*[_type == "post"]{ author-> }');
      expect(result.hasErrors).toBe(false);
    });

    it('parses variables', () => {
      const result = parser.parse('*[_type == $type]');
      expect(result.hasErrors).toBe(false);
    });

    it('detects syntax errors', () => {
      const result = parser.parse('*[_type ==');
      expect(result.hasErrors).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('parses complex queries', () => {
      const query = `
        *[_type == "post" && defined(author)] {
          title,
          "authorName": author->name,
          "categories": categories[]->title,
          _createdAt
        } | order(_createdAt desc)[0...10]
      `;
      const result = parser.parse(query);
      expect(result.hasErrors).toBe(false);
    });
  });
});
