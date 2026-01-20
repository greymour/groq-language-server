import type { Diagnostic } from 'vscode-languageserver';
import { DiagnosticSeverity } from 'vscode-languageserver';
import type { ParseResult } from '../parser/ASTTypes.js';
import { toLSPRange } from '../utils/Range.js';

export function getDiagnostics(parseResult: ParseResult): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const error of parseResult.errors) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: toLSPRange(error.range),
      message: error.message,
      source: 'groq',
    });
  }

  return diagnostics;
}
