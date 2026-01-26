/**
 * Parses @param type annotations from comments before a function definition.
 *
 * Syntax: // @param {typeName} $paramName
 *
 * Example:
 * ```groq
 * // @param {author} $ref
 * fn getAuthor($ref) = $ref-> { name };
 * ```
 */

export interface ParamAnnotation {
  /** The declared type name */
  type: string;
  /** The parameter name (including $) */
  paramName: string;
  /** Source location of the type name for diagnostics */
  range: {
    startIndex: number;
    endIndex: number;
  };
}

/**
 * Parse @param annotations from comments immediately before a function definition.
 *
 * @param rawSource - The full source code
 * @param funcStartIndex - Character offset where the function definition starts
 * @returns Map of parameter name to annotation
 */
export function parseParamAnnotations(
  rawSource: string,
  funcStartIndex: number
): Map<string, ParamAnnotation> {
  const annotations = new Map<string, ParamAnnotation>();
  if (!rawSource) return annotations;

  // Look at content before the function definition
  const beforeFunc = rawSource.slice(0, funcStartIndex);

  // Pattern: // @param {typeName} $paramName
  const regex = /\/\/\s*@param\s*\{([_A-Za-z][_0-9A-Za-z]*)\}\s*(\$[_A-Za-z][_0-9A-Za-z]*)/g;

  // Only look at the last contiguous block of // comments before the function
  const lines = beforeFunc.split('\n');
  let commentBlockStart = -1;

  // Find the start of the comment block immediately before function
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('//')) {
      commentBlockStart = i;
    } else if (trimmed === '') {
      // Empty line - continue looking
      continue;
    } else {
      // Non-comment, non-empty line - stop
      break;
    }
  }

  if (commentBlockStart === -1) return annotations;

  // Calculate the character offset where the comment block starts
  let blockStartOffset = 0;
  for (let i = 0; i < commentBlockStart; i++) {
    blockStartOffset += lines[i].length + 1; // +1 for newline
  }

  const commentBlock = lines.slice(commentBlockStart).join('\n');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(commentBlock)) !== null) {
    const typeName = match[1];
    const paramName = match[2];

    // Calculate the range of the type name within the source
    const typeStartInBlock = match.index + match[0].indexOf('{') + 1;
    const typeEndInBlock = typeStartInBlock + typeName.length;

    annotations.set(paramName, {
      type: typeName,
      paramName,
      range: {
        startIndex: blockStartOffset + typeStartInBlock,
        endIndex: blockStartOffset + typeEndInBlock,
      },
    });
  }

  return annotations;
}
