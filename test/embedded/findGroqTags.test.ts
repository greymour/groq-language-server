import { describe, it, expect } from 'vitest';
import { findGroqTags, isInsideGroqTag } from '../../src/embedded/findGroqTags.js';

describe('findGroqTags', () => {
  it('finds groq tagged template literals', () => {
    const source = `
      const query = groq\`*[_type == "post"]\`;
    `;
    const tags = findGroqTags(source);
    expect(tags).toHaveLength(1);
    expect(tags[0].content).toBe('*[_type == "post"]');
  });

  it('finds multiple groq tags', () => {
    const source = `
      const query1 = groq\`*[_type == "post"]\`;
      const query2 = groq\`*[_type == "author"]\`;
    `;
    const tags = findGroqTags(source);
    expect(tags).toHaveLength(2);
  });

  it('finds defineQuery calls', () => {
    const source = `
      const query = defineQuery(\`*[_type == "post"]\`);
    `;
    const tags = findGroqTags(source);
    expect(tags).toHaveLength(1);
    expect(tags[0].content).toBe('*[_type == "post"]');
  });

  it('parses the embedded query content', () => {
    const source = `
      const query = groq\`*[_type == "post"]{ title }\`;
    `;
    const tags = findGroqTags(source);
    expect(tags[0].parseResult.hasErrors).toBe(false);
  });

  it('returns correct range for single line', () => {
    const source = 'const q = groq`*`;';
    const tags = findGroqTags(source);
    expect(tags).toHaveLength(1);
    expect(tags[0].range.start.line).toBe(0);
    expect(tags[0].range.start.character).toBe(15);
    expect(tags[0].range.end.character).toBe(16);
  });

  it('handles multiline queries', () => {
    const source = `const query = groq\`
      *[_type == "post"] {
        title,
        body
      }
    \`;`;
    const tags = findGroqTags(source);
    expect(tags).toHaveLength(1);
    expect(tags[0].range.start.line).toBe(0);
    expect(tags[0].range.end.line).toBe(5);
  });

  it('finds /* groq */ comment tagged template literals', () => {
    const source = `
      const query = /* groq */ \`*[_type == "post"]\`;
    `;
    const tags = findGroqTags(source);
    expect(tags).toHaveLength(1);
    expect(tags[0].content).toBe('*[_type == "post"]');
  });

  it('finds /* groq */ with multiline content', () => {
    const source = `export const fragment = /* groq */ \`
...,
storiesContent[] {
  ...,
},
\`;`;
    const tags = findGroqTags(source);
    expect(tags).toHaveLength(1);
    expect(tags[0].content).toContain('storiesContent[]');
  });
});

describe('isInsideGroqTag', () => {
  it('returns true when inside a groq tag', () => {
    const source = 'const q = groq`*[_type == "post"]`;';
    expect(isInsideGroqTag(source, { line: 0, character: 16 })).toBe(true);
  });

  it('returns false when outside a groq tag', () => {
    const source = 'const q = groq`*[_type == "post"]`;';
    expect(isInsideGroqTag(source, { line: 0, character: 5 })).toBe(false);
  });

  it('returns false after the groq tag', () => {
    const source = 'const q = groq`*`;';
    expect(isInsideGroqTag(source, { line: 0, character: 17 })).toBe(false);
  });
});
