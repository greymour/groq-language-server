import { describe, it, expect, beforeAll } from "vitest";
import { parseParamAnnotations } from "../../src/extensions/paramTypeAnnotations/parser";
import { validateParamTypes } from "../../src/extensions/paramTypeAnnotations/diagnostics";
import { paramTypeAnnotationsExtension } from "../../src/extensions/paramTypeAnnotations/index";
import { ExtensionRegistry } from "../../src/extensions/ExtensionRegistry";
import { SchemaLoader } from "../../src/schema/SchemaLoader";
import type { FunctionDefinition } from "../../src/schema/FunctionRegistry";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("paramTypeAnnotations extension", () => {
  describe("parser", () => {
    it("parses single @param annotation", () => {
      const source = `// @param {author} $ref
fn getAuthor($ref) = $ref-> { name }`;

      const funcStartIndex = source.indexOf("fn");
      const annotations = parseParamAnnotations(source, funcStartIndex);

      expect(annotations.size).toBe(1);
      expect(annotations.get("$ref")?.type).toBe("author");
    });

    it("parses multiple @param annotations", () => {
      const source = `// @param {block} $items
// @param {settings} $config
fn process($items, $config) = $items[]`;

      const funcStartIndex = source.indexOf("fn");
      const annotations = parseParamAnnotations(source, funcStartIndex);

      expect(annotations.size).toBe(2);
      expect(annotations.get("$items")?.type).toBe("block");
      expect(annotations.get("$config")?.type).toBe("settings");
    });

    it("returns empty map when no annotations", () => {
      const source = `fn getStuff($ref) = $ref[]`;

      const annotations = parseParamAnnotations(source, 0);

      expect(annotations.size).toBe(0);
    });

    it("ignores annotations separated by code", () => {
      const source = `// @param {oldType} $ref
const x = 1;
fn getAuthor($ref) = $ref-> { name }`;

      const funcStartIndex = source.indexOf("fn");
      const annotations = parseParamAnnotations(source, funcStartIndex);

      // Should not pick up the @param because there's code between it and the function
      expect(annotations.size).toBe(0);
    });

    it("includes all annotations in contiguous comment block", () => {
      const source = `// @param {author} $ref

// This is a description
fn getAuthor($ref) = $ref-> { name }`;

      const funcStartIndex = source.indexOf("fn");
      const annotations = parseParamAnnotations(source, funcStartIndex);

      // Empty lines within comment block are allowed (JSDoc style)
      expect(annotations.size).toBe(1);
      expect(annotations.get("$ref")?.type).toBe("author");
    });

    it("handles empty lines between annotation and function", () => {
      const source = `// @param {author} $ref

fn getAuthor($ref) = $ref-> { name }`;

      const funcStartIndex = source.indexOf("fn");
      const annotations = parseParamAnnotations(source, funcStartIndex);

      expect(annotations.size).toBe(1);
      expect(annotations.get("$ref")?.type).toBe("author");
    });

    it("captures source range for type name", () => {
      const source = `// @param {author} $ref
fn getAuthor($ref) = $ref-> { name }`;

      const funcStartIndex = source.indexOf("fn");
      const annotations = parseParamAnnotations(source, funcStartIndex);

      const annotation = annotations.get("$ref");
      expect(annotation?.range.startIndex).toBe(source.indexOf("author"));
      expect(annotation?.range.endIndex).toBe(
        source.indexOf("author") + "author".length
      );
    });

    it("parses type names with underscores and numbers", () => {
      const source = `// @param {my_type_2} $ref
fn getStuff($ref) = $ref[]`;

      const funcStartIndex = source.indexOf("fn");
      const annotations = parseParamAnnotations(source, funcStartIndex);

      expect(annotations.get("$ref")?.type).toBe("my_type_2");
    });
  });

  describe("diagnostics", () => {
    const schemaLoader = new SchemaLoader();

    beforeAll(async () => {
      const schemaPath = path.join(__dirname, "../fixtures/test-schema.json");
      await schemaLoader.loadFromPath(schemaPath);
    });

    it("returns warning for unknown type", () => {
      const funcDef: FunctionDefinition = {
        name: "test",
        nameNode: {} as any,
        bodyNode: {} as any,
        parameters: [
          {
            name: "$ref",
            inferredTypes: new Set(),
            declaredType: "nonExistentType",
            typeAnnotationRange: { startIndex: 10, endIndex: 25 },
          },
        ],
      };

      const diagnostics = validateParamTypes({
        functionDefinitions: [funcDef],
        schemaLoader,
        source: "// @param {nonExistentType} $ref\nfn test($ref) = $ref",
      });

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("nonExistentType");
      expect(diagnostics[0].message).toContain("not found in schema");
      expect(diagnostics[0].source).toBe("groq-ext:paramTypeAnnotations");
    });

    it("returns no warning for valid type", () => {
      const funcDef: FunctionDefinition = {
        name: "test",
        nameNode: {} as any,
        bodyNode: {} as any,
        parameters: [
          {
            name: "$ref",
            inferredTypes: new Set(),
            declaredType: "author",
            typeAnnotationRange: { startIndex: 10, endIndex: 16 },
          },
        ],
      };

      const diagnostics = validateParamTypes({
        functionDefinitions: [funcDef],
        schemaLoader,
        source: "// @param {author} $ref\nfn test($ref) = $ref",
      });

      expect(diagnostics).toHaveLength(0);
    });

    it("returns no warnings when no declared types", () => {
      const funcDef: FunctionDefinition = {
        name: "test",
        nameNode: {} as any,
        bodyNode: {} as any,
        parameters: [
          {
            name: "$ref",
            inferredTypes: new Set(),
            declaredType: null,
            typeAnnotationRange: null,
          },
        ],
      };

      const diagnostics = validateParamTypes({
        functionDefinitions: [funcDef],
        schemaLoader,
        source: "fn test($ref) = $ref",
      });

      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("extension hooks", () => {
    it("onFunctionExtracted populates declaredType", () => {
      const funcDef: FunctionDefinition = {
        name: "getAuthor",
        nameNode: {} as any,
        bodyNode: {} as any,
        parameters: [
          {
            name: "$ref",
            inferredTypes: new Set(),
            declaredType: null,
            typeAnnotationRange: null,
          },
        ],
      };

      const source = `// @param {author} $ref
fn getAuthor($ref) = $ref-> { name }`;
      const funcStartIndex = source.indexOf("fn");

      paramTypeAnnotationsExtension.hooks.onFunctionExtracted!(
        funcDef,
        source,
        funcStartIndex
      );

      expect(funcDef.parameters[0].declaredType).toBe("author");
      expect(funcDef.parameters[0].typeAnnotationRange).toBeDefined();
    });

    it("getParameterType returns declared type", () => {
      const funcDef: FunctionDefinition = {
        name: "test",
        nameNode: {} as any,
        bodyNode: {} as any,
        parameters: [
          {
            name: "$ref",
            inferredTypes: new Set(),
            declaredType: "author",
            typeAnnotationRange: null,
          },
        ],
      };

      const type = paramTypeAnnotationsExtension.hooks.getParameterType!(
        funcDef,
        funcDef.parameters[0],
        0
      );

      expect(type).toBe("author");
    });

    it("getParameterType returns null when no declared type", () => {
      const funcDef: FunctionDefinition = {
        name: "test",
        nameNode: {} as any,
        bodyNode: {} as any,
        parameters: [
          {
            name: "$ref",
            inferredTypes: new Set(),
            declaredType: null,
            typeAnnotationRange: null,
          },
        ],
      };

      const type = paramTypeAnnotationsExtension.hooks.getParameterType!(
        funcDef,
        funcDef.parameters[0],
        0
      );

      expect(type).toBeNull();
    });
  });

  describe("ExtensionRegistry integration", () => {
    it("can register and enable the extension", () => {
      const registry = new ExtensionRegistry();
      registry.register(paramTypeAnnotationsExtension);

      expect(registry.isEnabled("paramTypeAnnotations")).toBe(false);

      registry.enable("paramTypeAnnotations");

      expect(registry.isEnabled("paramTypeAnnotations")).toBe(true);
    });

    it("getHook returns the hook when enabled", () => {
      const registry = new ExtensionRegistry();
      registry.register(paramTypeAnnotationsExtension);
      registry.enable("paramTypeAnnotations");

      const hooks = registry.getHook("onFunctionExtracted");

      expect(hooks).toHaveLength(1);
      expect(hooks[0].extension.id).toBe("paramTypeAnnotations");
      expect(hooks[0].hook).toBe(
        paramTypeAnnotationsExtension.hooks.onFunctionExtracted
      );
    });

    it("getHook returns empty array when disabled", () => {
      const registry = new ExtensionRegistry();
      registry.register(paramTypeAnnotationsExtension);
      // Not enabled

      const hooks = registry.getHook("onFunctionExtracted");

      expect(hooks).toHaveLength(0);
    });
  });
});
