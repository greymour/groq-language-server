import { describe, it, expect } from 'vitest';
import { GroqParser } from '../../src/parser/GroqParser.js';
import { getHoverInformation } from '../../src/interface/getHoverInformation.js';

describe('getHoverInformation', () => {
  const parser = new GroqParser();

  it('returns hover for everything (*)', () => {
    const result = parser.parse('*');
    const hover = getHoverInformation('*', result.tree.rootNode, { line: 0, character: 0 });
    expect(hover).not.toBeNull();
    expect(hover?.contents).toBeDefined();
  });

  it('returns hover for function calls', () => {
    const query = 'count(*)';
    const result = parser.parse(query);
    const hover = getHoverInformation(query, result.tree.rootNode, { line: 0, character: 1 });
    expect(hover).not.toBeNull();
    expect((hover?.contents as { value: string }).value).toContain('count');
  });

  it('returns hover for variable', () => {
    const query = '*[_type == $type]';
    const result = parser.parse(query);
    const hover = getHoverInformation(query, result.tree.rootNode, { line: 0, character: 12 });
    expect(hover).not.toBeNull();
    expect((hover?.contents as { value: string }).value).toContain('$type');
  });

  it('returns hover for this (@)', () => {
    const query = '*[_type == "post"]{ "self": @ }';
    const result = parser.parse(query);
    const atPos = query.indexOf('@');
    const hover = getHoverInformation(query, result.tree.rootNode, { line: 0, character: atPos });
    expect(hover).not.toBeNull();
    expect((hover?.contents as { value: string }).value).toContain('@');
  });

  it('returns hover for parent (^)', () => {
    const query = '*[_type == "author"]{ "posts": *[author._ref == ^._id] }';
    const result = parser.parse(query);
    const caretPos = query.indexOf('^');
    const hover = getHoverInformation(query, result.tree.rootNode, { line: 0, character: caretPos });
    expect(hover).not.toBeNull();
    expect((hover?.contents as { value: string }).value).toContain('^');
  });

  it('returns hover for builtin fields', () => {
    const query = '*[_type == "post"]{ _id }';
    const result = parser.parse(query);
    const idPos = query.lastIndexOf('_id');
    const hover = getHoverInformation(query, result.tree.rootNode, { line: 0, character: idPos });
    expect(hover).not.toBeNull();
  });

  it('returns null for positions with no hover info', () => {
    const query = '*[_type == "post"]';
    const result = parser.parse(query);
    const hover = getHoverInformation(query, result.tree.rootNode, { line: 0, character: 100 });
    expect(hover).toBeNull();
  });

  it('returns hover for namespaced function calls', () => {
    const query = 'geo::distance(point1, point2)';
    const result = parser.parse(query);
    const hover = getHoverInformation(query, result.tree.rootNode, { line: 0, character: 5 });
    expect(hover).not.toBeNull();
    expect((hover?.contents as { value: string }).value).toContain('geo::distance');
  });

  it('returns hover for pt::text function', () => {
    const query = 'pt::text(body)';
    const result = parser.parse(query);
    const hover = getHoverInformation(query, result.tree.rootNode, { line: 0, character: 3 });
    expect(hover).not.toBeNull();
    expect((hover?.contents as { value: string }).value).toContain('pt::text');
  });

  it('returns hover for function definitions', () => {
    const query = 'fn double($x) = $x * 2';
    const result = parser.parse(query);
    const hover = getHoverInformation(query, result.tree.rootNode, { line: 0, character: 3 });
    expect(hover).not.toBeNull();
    expect((hover?.contents as { value: string }).value).toContain('Function Definition');
  });

  it('returns hover for namespaced function definitions', () => {
    const query = 'fn myApp::getData($id) = *[_id == $id]';
    const result = parser.parse(query);
    const hover = getHoverInformation(query, result.tree.rootNode, { line: 0, character: 10 });
    expect(hover).not.toBeNull();
    expect((hover?.contents as { value: string }).value).toContain('myApp::getData');
  });
});
