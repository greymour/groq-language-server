import { describe, it, expect, beforeAll } from "vitest";
import { GroqParser } from "../../src/parser/GroqParser";
import { getHoverInformation } from "../../src/interface/getHoverInformation";
import {
  ExtensionRegistry,
  paramTypeAnnotationsExtension,
} from "../../src/extensions/index";
import { SchemaLoader } from "../../src/schema/SchemaLoader";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("getHoverInformation", () => {
  const parser = new GroqParser();

  it("returns hover for everything (*)", () => {
    const result = parser.parse("*");
    const hover = getHoverInformation("*", result.tree.rootNode, {
      line: 0,
      character: 0,
    });
    expect(hover).not.toBeNull();
    expect(hover?.contents).toBeDefined();
  });

  it("returns hover for function calls", () => {
    const query = "count(*)";
    const result = parser.parse(query);
    const hover = getHoverInformation(query, result.tree.rootNode, {
      line: 0,
      character: 1,
    });
    expect(hover).not.toBeNull();
    expect((hover?.contents as { value: string }).value).toContain("count");
  });

  it("returns hover for variable", () => {
    const query = "*[_type == $type]";
    const result = parser.parse(query);
    const hover = getHoverInformation(query, result.tree.rootNode, {
      line: 0,
      character: 12,
    });
    expect(hover).not.toBeNull();
    expect((hover?.contents as { value: string }).value).toContain("$type");
  });

  it("returns hover for this (@)", () => {
    const query = '*[_type == "post"]{ "self": @ }';
    const result = parser.parse(query);
    const atPos = query.indexOf("@");
    const hover = getHoverInformation(query, result.tree.rootNode, {
      line: 0,
      character: atPos,
    });
    expect(hover).not.toBeNull();
    expect((hover?.contents as { value: string }).value).toContain("@");
  });

  it("returns hover for parent (^)", () => {
    const query = '*[_type == "author"]{ "posts": *[author._ref == ^._id] }';
    const result = parser.parse(query);
    const caretPos = query.indexOf("^");
    const hover = getHoverInformation(query, result.tree.rootNode, {
      line: 0,
      character: caretPos,
    });
    expect(hover).not.toBeNull();
    expect((hover?.contents as { value: string }).value).toContain("^");
  });

  it("returns hover for builtin fields", () => {
    const query = '*[_type == "post"]{ _id }';
    const result = parser.parse(query);
    const idPos = query.lastIndexOf("_id");
    const hover = getHoverInformation(query, result.tree.rootNode, {
      line: 0,
      character: idPos,
    });
    expect(hover).not.toBeNull();
  });

  it("returns null for positions with no hover info", () => {
    const query = '*[_type == "post"]';
    const result = parser.parse(query);
    const hover = getHoverInformation(query, result.tree.rootNode, {
      line: 0,
      character: 100,
    });
    expect(hover).toBeNull();
  });

  it("returns hover for namespaced function calls", () => {
    const query = "geo::distance(point1, point2)";
    const result = parser.parse(query);
    const hover = getHoverInformation(query, result.tree.rootNode, {
      line: 0,
      character: 5,
    });
    expect(hover).not.toBeNull();
    expect((hover?.contents as { value: string }).value).toContain(
      "geo::distance"
    );
  });

  it("returns hover for pt::text function", () => {
    const query = "pt::text(body)";
    const result = parser.parse(query);
    const hover = getHoverInformation(query, result.tree.rootNode, {
      line: 0,
      character: 3,
    });
    expect(hover).not.toBeNull();
    expect((hover?.contents as { value: string }).value).toContain("pt::text");
  });

  it("returns hover for function definitions", () => {
    const query = "fn double($x) = $x * 2";
    const result = parser.parse(query);
    const hover = getHoverInformation(query, result.tree.rootNode, {
      line: 0,
      character: 3,
    });
    expect(hover).not.toBeNull();
    expect((hover?.contents as { value: string }).value).toContain("double");
    expect((hover?.contents as { value: string }).value).toContain(
      "Custom function"
    );
  });

  it("returns hover for namespaced function definitions", () => {
    const query = "fn myApp::getData($id) = *[_id == $id]";
    const result = parser.parse(query);
    const hover = getHoverInformation(query, result.tree.rootNode, {
      line: 0,
      character: 10,
    });
    expect(hover).not.toBeNull();
    expect((hover?.contents as { value: string }).value).toContain(
      "myApp::getData"
    );
  });

  describe("with @param type annotations", () => {
    const createExtensionRegistry = () => {
      const registry = new ExtensionRegistry();
      registry.register(paramTypeAnnotationsExtension);
      registry.enable("paramTypeAnnotations");
      return registry;
    };

    it("shows declared type when hovering over parameter inside function body", () => {
      const query = `// @param {author} $ref
fn getAuthor($ref) = $ref-> { name }`;
      const result = parser.parse(query);
      const registry = createExtensionRegistry();
      const refPos = query.lastIndexOf("$ref");
      const hover = getHoverInformation(
        query,
        result.tree.rootNode,
        { line: 1, character: refPos - query.lastIndexOf("\n") - 1 },
        undefined,
        registry
      );
      expect(hover).not.toBeNull();
      const content = (hover?.contents as { value: string }).value;
      expect(content).toContain("$ref");
      expect(content).toContain("**Type:** `author`");
    });

    it("shows declared type in function signature hover", () => {
      const query = `// @param {post} $ref
fn getPost($ref) = $ref-> { title }`;
      const result = parser.parse(query);
      const registry = createExtensionRegistry();
      const hover = getHoverInformation(
        query,
        result.tree.rootNode,
        { line: 1, character: 3 },
        undefined,
        registry
      );
      expect(hover).not.toBeNull();
      const content = (hover?.contents as { value: string }).value;
      expect(content).toContain("getPost");
      expect(content).toContain("$ref: post");
    });

    it("shows inferred type when no @param annotation exists", () => {
      const query = `fn double($x) = $x * 2`;
      const result = parser.parse(query);
      const registry = createExtensionRegistry();
      const xPos = query.lastIndexOf("$x");
      const hover = getHoverInformation(
        query,
        result.tree.rootNode,
        { line: 0, character: xPos },
        undefined,
        registry
      );
      expect(hover).not.toBeNull();
      const content = (hover?.contents as { value: string }).value;
      expect(content).toContain("$x");
      expect(content).toContain("Function parameter");
    });

    it("shows declared type for multiple parameters", () => {
      const query = `// @param {author} $authorRef
// @param {post} $postRef
fn linkAuthorToPost($authorRef, $postRef) = { "author": $authorRef->, "post": $postRef-> }`;
      const result = parser.parse(query);
      const registry = createExtensionRegistry();
      const hover = getHoverInformation(
        query,
        result.tree.rootNode,
        { line: 2, character: 3 },
        undefined,
        registry
      );
      expect(hover).not.toBeNull();
      const content = (hover?.contents as { value: string }).value;
      expect(content).toContain("$authorRef: author");
      expect(content).toContain("$postRef: post");
    });

    it("shows array type indicator for array parameters", () => {
      const query = `// @param {post[]} $refs
fn getPosts($refs) = $refs[]-> { title }`;
      const result = parser.parse(query);
      const registry = createExtensionRegistry();
      const refsPos = query.lastIndexOf("$refs");
      const hover = getHoverInformation(
        query,
        result.tree.rootNode,
        { line: 1, character: refsPos - query.lastIndexOf("\n") - 1 },
        undefined,
        registry
      );
      expect(hover).not.toBeNull();
      const content = (hover?.contents as { value: string }).value;
      expect(content).toContain("$refs");
      expect(content).toContain("**Type:** `post[]`");
    });
  });

  describe("with @param type annotations and schema", () => {
    const schemaLoader = new SchemaLoader();

    beforeAll(async () => {
      const schemaPath = path.join(__dirname, "../fixtures/test-schema.json");
      await schemaLoader.loadFromPath(schemaPath);
    });

    const createExtensionRegistry = () => {
      const registry = new ExtensionRegistry();
      registry.register(paramTypeAnnotationsExtension);
      registry.enable("paramTypeAnnotations");
      return registry;
    };

    it("shows schema fields in hover for typed parameter", () => {
      const query = `// @param {author} $ref
fn getAuthor($ref) = $ref-> { name }`;
      const result = parser.parse(query);
      const registry = createExtensionRegistry();
      const refPos = query.lastIndexOf("$ref");
      const hover = getHoverInformation(
        query,
        result.tree.rootNode,
        { line: 1, character: refPos - query.lastIndexOf("\n") - 1 },
        schemaLoader,
        registry
      );
      expect(hover).not.toBeNull();
      const content = (hover?.contents as { value: string }).value;
      expect(content).toContain("**Type:** `author`");
      expect(content).toContain("**Fields:**");
      expect(content).toContain("`name`");
      expect(content).toContain("`bio`");
      expect(content).toContain("`email`");
    });

    it("shows array indicator and fields for array typed parameter", () => {
      const query = `// @param {post[]} $refs
fn getPosts($refs) = $refs[]-> { title }`;
      const result = parser.parse(query);
      const registry = createExtensionRegistry();
      const refsPos = query.lastIndexOf("$refs");
      const hover = getHoverInformation(
        query,
        result.tree.rootNode,
        { line: 1, character: refsPos - query.lastIndexOf("\n") - 1 },
        schemaLoader,
        registry
      );
      expect(hover).not.toBeNull();
      const content = (hover?.contents as { value: string }).value;
      expect(content).toContain("**Type:** `post[]`");
      expect(content).toContain("array of `post` documents");
      expect(content).toContain("**Fields:**");
      expect(content).toContain("`title`");
      expect(content).toContain("`author`");
    });

    it("shows reference targets in field type", () => {
      const query = `// @param {post} $ref
fn getPost($ref) = $ref-> { title }`;
      const result = parser.parse(query);
      const registry = createExtensionRegistry();
      const refPos = query.lastIndexOf("$ref");
      const hover = getHoverInformation(
        query,
        result.tree.rootNode,
        { line: 1, character: refPos - query.lastIndexOf("\n") - 1 },
        schemaLoader,
        registry
      );
      expect(hover).not.toBeNull();
      const content = (hover?.contents as { value: string }).value;
      expect(content).toContain("`author`: reference → author");
    });
  });
});
