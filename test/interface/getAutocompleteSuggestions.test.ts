import { describe, it, expect } from 'vitest';
import { GroqParser } from '../../src/parser/GroqParser.js';
import { getAutocompleteSuggestions } from '../../src/interface/getAutocompleteSuggestions.js';

describe('getAutocompleteSuggestions', () => {
  const parser = new GroqParser();

  it('returns special char completions for empty input', () => {
    const result = parser.parse('');
    const completions = getAutocompleteSuggestions('', result.tree.rootNode, { line: 0, character: 0 });
    expect(completions.some(c => c.label === '*')).toBe(true);
    expect(completions.some(c => c.label === '@')).toBe(true);
  });

  it('returns filter bracket after *', () => {
    const result = parser.parse('*');
    const completions = getAutocompleteSuggestions('*', result.tree.rootNode, { line: 0, character: 1 });
    expect(completions.some(c => c.label === '[')).toBe(true);
  });

  it('returns filter suggestions inside brackets', () => {
    const result = parser.parse('*[');
    const completions = getAutocompleteSuggestions('*[', result.tree.rootNode, { line: 0, character: 2 });
    expect(completions.some(c => c.label === '_type ==')).toBe(true);
  });

  it('returns projection fields inside braces', () => {
    const query = '*[_type == "post"]{';
    const result = parser.parse(query);
    const completions = getAutocompleteSuggestions(query, result.tree.rootNode, { line: 0, character: query.length });
    expect(completions.some(c => c.label === '...')).toBe(true);
    expect(completions.some(c => c.label === '_id')).toBe(true);
  });

  it('returns functions', () => {
    const result = parser.parse('');
    const completions = getAutocompleteSuggestions('', result.tree.rootNode, { line: 0, character: 0 });
    expect(completions.some(c => c.label === 'count')).toBe(true);
    expect(completions.some(c => c.label === 'defined')).toBe(true);
    expect(completions.some(c => c.label === 'order')).toBe(true);
  });

  it('returns pipe operations after pipe', () => {
    const query = '*[_type == "post"] |';
    const result = parser.parse(query);
    const completions = getAutocompleteSuggestions(query, result.tree.rootNode, { line: 0, character: query.length });
    expect(completions.some(c => c.label === 'order()')).toBe(true);
    expect(completions.some(c => c.label === 'score()')).toBe(true);
  });

  it('returns keywords', () => {
    const result = parser.parse('*[');
    const completions = getAutocompleteSuggestions('*[', result.tree.rootNode, { line: 0, character: 2 });
    expect(completions.some(c => c.label === 'in')).toBe(true);
    expect(completions.some(c => c.label === 'match')).toBe(true);
  });

  it('returns namespaced functions', () => {
    const result = parser.parse('');
    const completions = getAutocompleteSuggestions('', result.tree.rootNode, { line: 0, character: 0 });
    expect(completions.some(c => c.label === 'geo::distance')).toBe(true);
    expect(completions.some(c => c.label === 'pt::text')).toBe(true);
    expect(completions.some(c => c.label === 'math::sum')).toBe(true);
    expect(completions.some(c => c.label === 'array::unique')).toBe(true);
  });

  it('returns fn keyword', () => {
    const result = parser.parse('');
    const completions = getAutocompleteSuggestions('', result.tree.rootNode, { line: 0, character: 0 });
    expect(completions.some(c => c.label === 'fn')).toBe(true);
  });
});
