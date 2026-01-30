import { describe, it, expect } from "vitest";
import { GroqParser } from "../../src/parser/GroqParser";

describe("GroqParser", () => {
  const parser = new GroqParser();

  describe("parse", () => {
    it("parses a simple everything query", () => {
      const result = parser.parse("*");
      expect(result.hasErrors).toBe(false);
      expect(result.tree.rootNode.type).toBe("source_file");
      expect(result.tree.rootNode.namedChildCount).toBe(1);
      expect(result.tree.rootNode.namedChild(0)?.type).toBe("everything");
    });

    it("parses a query with filter", () => {
      const result = parser.parse('*[_type == "post"]');
      expect(result.hasErrors).toBe(false);
      const rootChild = result.tree.rootNode.namedChild(0);
      expect(rootChild?.type).toBe("subscript_expression");
    });

    it("parses a query with projection", () => {
      const result = parser.parse('*[_type == "post"]{ title, body }');
      expect(result.hasErrors).toBe(false);
      const rootChild = result.tree.rootNode.namedChild(0);
      expect(rootChild?.type).toBe("projection_expression");
    });

    it("parses a query with pipe and order", () => {
      const result = parser.parse(
        '*[_type == "post"] | order(_createdAt desc)'
      );
      expect(result.hasErrors).toBe(false);
      const rootChild = result.tree.rootNode.namedChild(0);
      expect(rootChild?.type).toBe("pipe_expression");
    });

    it("parses function calls", () => {
      const result = parser.parse('count(*[_type == "post"])');
      expect(result.hasErrors).toBe(false);
      const rootChild = result.tree.rootNode.namedChild(0);
      expect(rootChild?.type).toBe("function_call");
    });

    it("parses dereference expressions", () => {
      const result = parser.parse('*[_type == "post"]{ author-> }');
      expect(result.hasErrors).toBe(false);
    });

    it("parses variables", () => {
      const result = parser.parse("*[_type == $type]");
      expect(result.hasErrors).toBe(false);
    });

    it("detects syntax errors", () => {
      const result = parser.parse("*[_type ==");
      expect(result.hasErrors).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("parses complex queries", () => {
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

    it("parses namespaced function calls", () => {
      const result = parser.parse("geo::distance(point1, point2)");
      expect(result.hasErrors).toBe(false);
      const rootChild = result.tree.rootNode.namedChild(0);
      expect(rootChild?.type).toBe("function_call");
      const nameNode = rootChild?.childForFieldName("name");
      expect(nameNode?.type).toBe("namespaced_identifier");
      expect(nameNode?.text).toBe("geo::distance");
    });

    it("parses pt::text function call", () => {
      const result = parser.parse("pt::text(body)");
      expect(result.hasErrors).toBe(false);
      const rootChild = result.tree.rootNode.namedChild(0);
      expect(rootChild?.type).toBe("function_call");
    });

    it("parses simple function definition", () => {
      const result = parser.parse("fn double($x) = $x * 2");
      expect(result.hasErrors).toBe(false);
      const rootChild = result.tree.rootNode.namedChild(0);
      expect(rootChild?.type).toBe("function_definition");
      const nameNode = rootChild?.childForFieldName("name");
      expect(nameNode?.text).toBe("double");
    });

    it("parses namespaced function definition", () => {
      const result = parser.parse(
        "fn myApp::getPosts($type) = *[_type == $type]"
      );
      expect(result.hasErrors).toBe(false);
      const rootChild = result.tree.rootNode.namedChild(0);
      expect(rootChild?.type).toBe("function_definition");
      const nameNode = rootChild?.childForFieldName("name");
      expect(nameNode?.type).toBe("namespaced_identifier");
      expect(nameNode?.text).toBe("myApp::getPosts");
    });

    it("parses function definition with semicolon", () => {
      const result = parser.parse("fn utils::add($a, $b) = $a + $b;");
      expect(result.hasErrors).toBe(false);
    });

    it("parses multiple function definitions followed by expression", () => {
      const query = `
        fn utils::double($x) = $x * 2;
        fn utils::add($a, $b) = $a + $b;
        utils::add(1, utils::double(2))
      `;
      const result = parser.parse(query);
      expect(result.hasErrors).toBe(false);
      expect(result.tree.rootNode.namedChildCount).toBe(3);
      expect(result.tree.rootNode.namedChild(0)?.type).toBe(
        "function_definition"
      );
      expect(result.tree.rootNode.namedChild(1)?.type).toBe(
        "function_definition"
      );
      expect(result.tree.rootNode.namedChild(2)?.type).toBe("function_call");
    });
  });
});
