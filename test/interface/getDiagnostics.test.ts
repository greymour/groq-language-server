import { describe, it, expect, beforeAll } from 'vitest';
import { GroqParser } from '../../src/parser/GroqParser.js';
import { getDiagnostics } from '../../src/interface/getDiagnostics.js';
import { SchemaLoader } from '../../src/schema/SchemaLoader.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
});

describe('typeHint validation', () => {
  const parser = new GroqParser();
  const schemaLoader = new SchemaLoader();

  beforeAll(async () => {
    const schemaPath = path.join(__dirname, '../fixtures/test-schema.json');
    await schemaLoader.loadFromPath(schemaPath);
  });

  it('returns warning for unknown type in typeHint', () => {
    const result = parser.parse('{ title }');
    const diagnostics = getDiagnostics(result, {
      schemaLoader,
      source: '{ title }',
      typeHint: 'nonExistentType',
    });

    const typeHintWarning = diagnostics.find(d =>
      d.message.includes('not found in schema')
    );
    expect(typeHintWarning).toBeDefined();
    expect(typeHintWarning?.severity).toBe(2); // Warning
    expect(typeHintWarning?.message).toContain('nonExistentType');
    expect(typeHintWarning?.message).toContain('Available types');
  });

  it('returns no warning for valid type in typeHint', () => {
    const result = parser.parse('{ title }');
    const diagnostics = getDiagnostics(result, {
      schemaLoader,
      source: '{ title }',
      typeHint: 'post',
    });

    const typeHintWarning = diagnostics.find(d =>
      d.message.includes('not found in schema')
    );
    expect(typeHintWarning).toBeUndefined();
  });

  it('includes available types in warning message', () => {
    const result = parser.parse('{ title }');
    const diagnostics = getDiagnostics(result, {
      schemaLoader,
      source: '{ title }',
      typeHint: 'invalidType',
    });

    const typeHintWarning = diagnostics.find(d =>
      d.message.includes('not found in schema')
    );
    expect(typeHintWarning?.message).toContain('post');
    expect(typeHintWarning?.message).toContain('author');
    expect(typeHintWarning?.message).toContain('category');
  });
});
