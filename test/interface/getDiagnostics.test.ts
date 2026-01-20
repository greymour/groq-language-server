import { describe, it, expect } from 'vitest';
import { GroqParser } from '../../src/parser/GroqParser.js';
import { getDiagnostics } from '../../src/interface/getDiagnostics.js';

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
