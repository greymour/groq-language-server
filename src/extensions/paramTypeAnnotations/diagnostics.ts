import type { Diagnostic } from 'vscode-languageserver';
import { DiagnosticSeverity } from 'vscode-languageserver';
import type { DiagnosticsContext } from '../index';

/**
 * Validate that all declared parameter types exist in the schema.
 * Returns warnings for types that don't exist.
 */
export function validateParamTypes(context: DiagnosticsContext): Diagnostic[] {
  const { functionDefinitions, schemaLoader, source } = context;
  const diagnostics: Diagnostic[] = [];

  if (!schemaLoader.isLoaded()) {
    return diagnostics;
  }

  for (const funcDef of functionDefinitions) {
    for (const param of funcDef.parameters) {
      if (param.declaredType && !schemaLoader.getType(param.declaredType)) {
        const availableTypes = schemaLoader.getTypeNames();
        const range = param.typeAnnotationRange
          ? offsetRangeToLSPRange(source, param.typeAnnotationRange.startIndex, param.typeAnnotationRange.endIndex)
          : { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };

        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range,
          message: `Type "${param.declaredType}" not found in schema. Available types: ${availableTypes.join(', ')}`,
          source: 'groq-ext:paramTypeAnnotations',
        });
      }
    }
  }

  return diagnostics;
}

/**
 * Convert character offset range to LSP line/character range.
 */
function offsetRangeToLSPRange(
  source: string,
  startOffset: number,
  endOffset: number
): { start: { line: number; character: number }; end: { line: number; character: number } } {
  let line = 0;
  let character = 0;
  let startLine = 0;
  let startCharacter = 0;

  for (let i = 0; i < endOffset && i < source.length; i++) {
    if (i === startOffset) {
      startLine = line;
      startCharacter = character;
    }
    if (source[i] === '\n') {
      line++;
      character = 0;
    } else {
      character++;
    }
  }

  return {
    start: { line: startLine, character: startCharacter },
    end: { line, character },
  };
}
