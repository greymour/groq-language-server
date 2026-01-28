import { describe, it, expect, beforeAll } from 'vitest';
import { GroqParser } from '../../src/parser/GroqParser';
import { getDiagnostics } from '../../src/interface/getDiagnostics';
import { SchemaLoader } from '../../src/schema/SchemaLoader';
import { ExtensionRegistry, paramTypeAnnotationsExtension } from '../../src/extensions/index';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createExtensionRegistry(): ExtensionRegistry {
  const registry = new ExtensionRegistry();
  registry.register(paramTypeAnnotationsExtension);
  registry.enable('paramTypeAnnotations');
  return registry;
}

describe('getDiagnostics', () => {
  const parser = new GroqParser();

  it('returns empty diagnostics for valid query', () => {
    const result = parser.parse('*[_type == "post"]');
    const diagnostics = getDiagnostics(result);
    expect(diagnostics).toHaveLength(0);
  });

  it('returns diagnostics for incomplete filter', () => {
    const result = parser.parse('*[_type ==');
    const diagnostics = getDiagnostics(result);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].severity).toBe(1);
  });

  it('returns diagnostics for unclosed bracket', () => {
    const result = parser.parse('*[_type == "post"');
    const diagnostics = getDiagnostics(result);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('returns diagnostics for unclosed projection', () => {
    const result = parser.parse('*[_type == "post"]{ title');
    const diagnostics = getDiagnostics(result);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('returns diagnostics with correct range', () => {
    const result = parser.parse('*[_type ==]');
    const diagnostics = getDiagnostics(result);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].range).toBeDefined();
    expect(diagnostics[0].range.start.line).toBe(0);
  });

  it('returns error for function with multiple parameters', () => {
    const result = parser.parse('fn test($a, $b) = $a + $b');
    const diagnostics = getDiagnostics(result);
    const multiParamError = diagnostics.find(d =>
      d.message.includes('can only have one parameter')
    );
    expect(multiParamError).toBeDefined();
    expect(multiParamError?.severity).toBe(1); // Error
    expect(multiParamError?.message).toContain('2 parameters');
  });

  it('returns no error for function with single parameter', () => {
    const result = parser.parse('fn test($a) = $a + 1');
    const diagnostics = getDiagnostics(result);
    const multiParamError = diagnostics.find(d =>
      d.message.includes('can only have one parameter')
    );
    expect(multiParamError).toBeUndefined();
  });

  it('returns error for parameter used multiple times', () => {
    const result = parser.parse('fn test($a) = $a + $a');
    const diagnostics = getDiagnostics(result);
    const multiUseError = diagnostics.find(d =>
      d.message.includes('can only be used once')
    );
    expect(multiUseError).toBeDefined();
    expect(multiUseError?.severity).toBe(1); // Error
  });

  it('returns no error for parameter used once', () => {
    const result = parser.parse('fn test($a) = $a + 1');
    const diagnostics = getDiagnostics(result);
    const multiUseError = diagnostics.find(d =>
      d.message.includes('can only be used once')
    );
    expect(multiUseError).toBeUndefined();
  });
});

describe('param type annotation validation', () => {
  const parser = new GroqParser();
  const schemaLoader = new SchemaLoader();

  beforeAll(async () => {
    const schemaPath = path.join(__dirname, '../fixtures/test-schema.json');
    await schemaLoader.loadFromPath(schemaPath);
  });

  it('returns warning for unknown type in @param annotation', () => {
    const source = `// @param {nonExistentType} $ref
fn getStuff($ref) = $ref[] { title }`;
    const result = parser.parse(source);
    const diagnostics = getDiagnostics(result, {
      schemaLoader,
      source,
      extensionRegistry: createExtensionRegistry(),
    });

    const typeWarning = diagnostics.find(d =>
      d.message.includes('not found in schema')
    );
    expect(typeWarning).toBeDefined();
    expect(typeWarning?.severity).toBe(2); // Warning
    expect(typeWarning?.message).toContain('nonExistentType');
    expect(typeWarning?.message).toContain('Available types');
  });

  it('returns no warning for valid type in @param annotation', () => {
    const source = `// @param {post} $ref
fn getStuff($ref) = $ref[] { title }`;
    const result = parser.parse(source);
    const diagnostics = getDiagnostics(result, {
      schemaLoader,
      source,
      extensionRegistry: createExtensionRegistry(),
    });

    const typeWarning = diagnostics.find(d =>
      d.message.includes('not found in schema')
    );
    expect(typeWarning).toBeUndefined();
  });

  it('includes available types in warning message', () => {
    const source = `// @param {invalidType} $ref
fn getStuff($ref) = $ref[] { title }`;
    const result = parser.parse(source);
    const diagnostics = getDiagnostics(result, {
      schemaLoader,
      source,
      extensionRegistry: createExtensionRegistry(),
    });

    const typeWarning = diagnostics.find(d =>
      d.message.includes('not found in schema')
    );
    expect(typeWarning?.message).toContain('post');
    expect(typeWarning?.message).toContain('author');
    expect(typeWarning?.message).toContain('category');
  });
});
