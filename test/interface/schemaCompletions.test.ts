import { describe, it, expect, beforeAll } from "vitest";
import { GroqParser } from "../../src/parser/GroqParser";
import { getAutocompleteSuggestions } from "../../src/interface/getAutocompleteSuggestions";
import { getHoverInformation } from "../../src/interface/getHoverInformation";
import { SchemaLoader } from "../../src/schema/SchemaLoader";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Schema-aware completions", () => {
  const parser = new GroqParser();
  const schemaLoader = new SchemaLoader();

  beforeAll(async () => {
    const schemaPath = path.join(__dirname, "../fixtures/test-schema.json");
    const loaded = await schemaLoader.loadFromPath(schemaPath);
    expect(loaded).toBe(true);
  });

  describe("document type completions", () => {
    it("suggests document types after _type ==", () => {
      const query = "*[_type == ";
      const result = parser.parse(query);
      const completions = getAutocompleteSuggestions(
        query,
        result.tree.rootNode,
        { line: 0, character: query.length },
        schemaLoader
      );

      expect(completions.some((c) => c.label === '"post"')).toBe(true);
      expect(completions.some((c) => c.label === '"author"')).toBe(true);
      expect(completions.some((c) => c.label === '"category"')).toBe(true);
    });

    it('suggests document types after _type == "', () => {
      const query = '*[_type == "';
      const result = parser.parse(query);
      const completions = getAutocompleteSuggestions(
        query,
        result.tree.rootNode,
        { line: 0, character: query.length },
        schemaLoader
      );

      expect(completions.some((c) => c.label === '"post"')).toBe(true);
    });
  });

  describe("schema field completions in filter", () => {
    it("suggests schema fields inside filter with type context", () => {
      const query = '*[_type == "post" && ';
      const result = parser.parse(query);
      const completions = getAutocompleteSuggestions(
        query,
        result.tree.rootNode,
        { line: 0, character: query.length },
        schemaLoader
      );

      expect(completions.some((c) => c.label === "title")).toBe(true);
      expect(completions.some((c) => c.label === "author")).toBe(true);
      expect(completions.some((c) => c.label === "publishedAt")).toBe(true);
    });
  });

  describe("schema field completions in projection", () => {
    it("suggests schema fields inside projection with type context", () => {
      const query = '*[_type == "post"]{';
      const result = parser.parse(query);
      const completions = getAutocompleteSuggestions(
        query,
        result.tree.rootNode,
        { line: 0, character: query.length },
        schemaLoader
      );

      expect(completions.some((c) => c.label === "title")).toBe(true);
      expect(completions.some((c) => c.label === "content")).toBe(true);
      expect(completions.some((c) => c.label === "author")).toBe(true);
    });

    it("shows reference type info in field details", () => {
      const query = '*[_type == "post"]{';
      const result = parser.parse(query);
      const completions = getAutocompleteSuggestions(
        query,
        result.tree.rootNode,
        { line: 0, character: query.length },
        schemaLoader
      );

      const authorCompletion = completions.find((c) => c.label === "author");
      expect(authorCompletion?.detail).toContain("reference");
      expect(authorCompletion?.detail).toContain("author");
    });

    it("shows array type info in field details", () => {
      const query = '*[_type == "post"]{';
      const result = parser.parse(query);
      const completions = getAutocompleteSuggestions(
        query,
        result.tree.rootNode,
        { line: 0, character: query.length },
        schemaLoader
      );

      const contentCompletion = completions.find((c) => c.label === "content");
      expect(contentCompletion?.detail).toContain("array");
    });
  });

  describe("graceful degradation", () => {
    it("returns static completions without schema", () => {
      const query = '*[_type == "post"]{';
      const result = parser.parse(query);
      const completions = getAutocompleteSuggestions(
        query,
        result.tree.rootNode,
        { line: 0, character: query.length }
      );

      expect(completions.some((c) => c.label === "...")).toBe(true);
      expect(completions.some((c) => c.label === "_id")).toBe(true);
    });
  });

  describe("type hint support", () => {
    it("uses typeHint for field completions in fragments without type filter", () => {
      // Fragment query without _type filter - normally wouldn't get specific type completions
      const query = "{ t";
      const result = parser.parse(query);
      // With typeHint set to 'post', should get post fields
      const completions = getAutocompleteSuggestions(
        query,
        result.tree.rootNode,
        { line: 0, character: 3 },
        schemaLoader,
        { typeHint: "post" }
      );

      // Should have title from post type (matches 't' prefix)
      expect(completions.some((c) => c.label === "title")).toBe(true);
    });

    it("uses typeHint for author type fields", () => {
      const query = "{ n";
      const result = parser.parse(query);
      const completions = getAutocompleteSuggestions(
        query,
        result.tree.rootNode,
        { line: 0, character: 3 },
        schemaLoader,
        { typeHint: "author" }
      );

      // Should have 'name' from author type
      expect(completions.some((c) => c.label === "name")).toBe(true);
    });

    it("prefers inferred type over typeHint when both available", () => {
      // Query with explicit _type filter
      const query = '*[_type == "post"]{ n';
      const result = parser.parse(query);
      // Even with author typeHint, should use post type from filter
      const completions = getAutocompleteSuggestions(
        query,
        result.tree.rootNode,
        { line: 0, character: query.length },
        schemaLoader,
        { typeHint: "author" }
      );

      // Should NOT have 'name' since post type doesn't have that field
      // (name is on author type, not post)
      expect(completions.some((c) => c.label === "name")).toBe(false);
    });
  });
});

describe("Schema-aware hover", () => {
  const parser = new GroqParser();
  const schemaLoader = new SchemaLoader();

  beforeAll(async () => {
    const schemaPath = path.join(__dirname, "../fixtures/test-schema.json");
    await schemaLoader.loadFromPath(schemaPath);
  });

  it("shows schema field info on hover", () => {
    const query = '*[_type == "post"]{ title }';
    const result = parser.parse(query);
    const hover = getHoverInformation(
      query,
      result.tree.rootNode,
      { line: 0, character: 22 },
      schemaLoader
    );

    expect(hover).not.toBeNull();
    expect(hover?.contents).toBeDefined();
    const content = hover?.contents as { value: string };
    expect(content.value).toContain("title");
    expect(content.value).toContain("string");
  });

  it("shows field description from schema", () => {
    const query = '*[_type == "post"]{ title }';
    const result = parser.parse(query);
    const hover = getHoverInformation(
      query,
      result.tree.rootNode,
      { line: 0, character: 22 },
      schemaLoader
    );

    const content = hover?.contents as { value: string };
    expect(content.value).toContain("The title of the post");
  });

  it("shows reference type info on hover", () => {
    const query = '*[_type == "post"]{ author }';
    const result = parser.parse(query);
    const hover = getHoverInformation(
      query,
      result.tree.rootNode,
      { line: 0, character: 22 },
      schemaLoader
    );

    const content = hover?.contents as { value: string };
    expect(content.value).toContain("reference");
    expect(content.value).toContain("author");
  });

  it("falls back to static info without schema", () => {
    const query = '*[_type == "post"]{ _id }';
    const result = parser.parse(query);
    const hover = getHoverInformation(query, result.tree.rootNode, {
      line: 0,
      character: 22,
    });

    expect(hover).not.toBeNull();
    const content = hover?.contents as { value: string };
    expect(content.value).toContain("_id");
    expect(content.value).toContain("document");
  });
});
