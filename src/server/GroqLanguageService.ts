import type { TextDocument } from 'vscode-languageserver-textdocument';
import type {
  CompletionItem,
  Diagnostic,
  Hover,
  Position,
  SymbolInformation,
  Location,
} from 'vscode-languageserver';
import { DocumentCache } from './DocumentCache.js';
import { getDiagnostics } from '../interface/getDiagnostics.js';
import { getAutocompleteSuggestions } from '../interface/getAutocompleteSuggestions.js';
import { getHoverInformation } from '../interface/getHoverInformation.js';
import { getOutline } from '../interface/getOutline.js';
import { getDefinition } from '../interface/getDefinition.js';
import type { EmbeddedQuery, InterpolationRange } from '../embedded/findGroqTags.js';
import { findGroqTags } from '../embedded/findGroqTags.js';
import { SchemaLoader } from '../schema/SchemaLoader.js';

export interface GroqLanguageServiceConfig {
  schemaEnabled?: boolean;
  schemaPath?: string;
}

export class GroqLanguageService {
  private documentCache: DocumentCache;
  private embeddedQueryCache: Map<string, EmbeddedQuery[]> = new Map();
  private config: GroqLanguageServiceConfig;
  private schemaLoader: SchemaLoader;

  constructor(config: GroqLanguageServiceConfig = {}) {
    this.documentCache = new DocumentCache();
    this.config = config;
    this.schemaLoader = new SchemaLoader();

    if (config.schemaPath) {
      this.loadSchema(config.schemaPath);
    }
  }

  private async loadSchema(schemaPath: string): Promise<void> {
    await this.schemaLoader.loadFromPath(schemaPath);
  }

  getSchemaLoader(): SchemaLoader {
    return this.schemaLoader;
  }

  updateDocument(document: TextDocument): void {
    if (this.isEmbeddedLanguage(document.uri)) {
      this.updateEmbeddedQueries(document);
    } else {
      this.documentCache.update(document);
    }
  }

  removeDocument(uri: string): void {
    this.documentCache.delete(uri);
    this.embeddedQueryCache.delete(uri);
  }

  getDiagnostics(document: TextDocument): Diagnostic[] {
    if (this.isEmbeddedLanguage(document.uri)) {
      return this.getEmbeddedDiagnostics(document);
    }

    const source = document.getText();
    const parseResult = this.documentCache.getParseResult(document.uri);
    if (!parseResult) {
      const result = this.documentCache.set(document);
      return getDiagnostics(result, { schemaLoader: this.schemaLoader, source });
    }
    return getDiagnostics(parseResult, { schemaLoader: this.schemaLoader, source });
  }

  getCompletions(document: TextDocument, position: Position): CompletionItem[] {
    if (this.isEmbeddedLanguage(document.uri)) {
      return this.getEmbeddedCompletions(document, position);
    }

    const parseResult = this.documentCache.getParseResult(document.uri);
    if (!parseResult) {
      const result = this.documentCache.set(document);
      return getAutocompleteSuggestions(document.getText(), result.tree.rootNode, position, this.schemaLoader);
    }
    return getAutocompleteSuggestions(document.getText(), parseResult.tree.rootNode, position, this.schemaLoader);
  }

  getHover(document: TextDocument, position: Position): Hover | null {
    if (this.isEmbeddedLanguage(document.uri)) {
      return this.getEmbeddedHover(document, position);
    }

    const parseResult = this.documentCache.getParseResult(document.uri);
    if (!parseResult) {
      const result = this.documentCache.set(document);
      return getHoverInformation(document.getText(), result.tree.rootNode, position, this.schemaLoader);
    }
    return getHoverInformation(document.getText(), parseResult.tree.rootNode, position, this.schemaLoader);
  }

  getDocumentSymbols(document: TextDocument): SymbolInformation[] {
    if (this.isEmbeddedLanguage(document.uri)) {
      return this.getEmbeddedSymbols(document);
    }

    const parseResult = this.documentCache.getParseResult(document.uri);
    if (!parseResult) {
      const result = this.documentCache.set(document);
      return getOutline(result.tree.rootNode, document.uri);
    }
    return getOutline(parseResult.tree.rootNode, document.uri);
  }

  getDefinition(document: TextDocument, position: Position): Location | null {
    if (this.isEmbeddedLanguage(document.uri)) {
      return this.getEmbeddedDefinition(document, position);
    }

    const parseResult = this.documentCache.getParseResult(document.uri);
    if (!parseResult) {
      const result = this.documentCache.set(document);
      return getDefinition(document.getText(), result.tree.rootNode, position, document.uri);
    }
    return getDefinition(document.getText(), parseResult.tree.rootNode, position, document.uri);
  }

  private isEmbeddedLanguage(uri: string): boolean {
    return /\.(ts|tsx|js|jsx)$/.test(uri);
  }

  private updateEmbeddedQueries(document: TextDocument): void {
    const queries = findGroqTags(document.getText());
    this.embeddedQueryCache.set(document.uri, queries);
  }

  private getQueryAtPosition(uri: string, position: Position): EmbeddedQuery | null {
    const queries = this.embeddedQueryCache.get(uri);
    if (!queries) return null;

    for (const query of queries) {
      if (
        position.line >= query.range.start.line &&
        position.line <= query.range.end.line
      ) {
        if (position.line === query.range.start.line && position.character < query.range.start.character) {
          continue;
        }
        if (position.line === query.range.end.line && position.character > query.range.end.character) {
          continue;
        }
        return query;
      }
    }
    return null;
  }

  private toEmbeddedPosition(query: EmbeddedQuery, position: Position): Position {
    const relativeLine = position.line - query.range.start.line;
    let character = position.character;
    if (relativeLine === 0) {
      character -= query.range.start.character;
    }
    return { line: relativeLine, character };
  }

  private getEmbeddedDiagnostics(document: TextDocument): Diagnostic[] {
    const queries = this.embeddedQueryCache.get(document.uri);
    if (!queries) {
      this.updateEmbeddedQueries(document);
      return this.getEmbeddedDiagnostics(document);
    }

    const allDiagnostics: Diagnostic[] = [];
    for (const query of queries) {
      const diagnostics = getDiagnostics(query.parseResult, {
        schemaLoader: this.schemaLoader,
        source: query.content,
        typeHint: query.typeHint,
      });
      for (const diag of diagnostics) {
        // Skip diagnostics that overlap with interpolation replacement positions
        if (this.overlapsWithInterpolation(diag.range, query.interpolationRanges)) {
          continue;
        }

        diag.range.start.line += query.range.start.line;
        diag.range.end.line += query.range.start.line;
        if (diag.range.start.line === query.range.start.line) {
          diag.range.start.character += query.range.start.character;
        }
        if (diag.range.end.line === query.range.start.line) {
          diag.range.end.character += query.range.start.character;
        }
        allDiagnostics.push(diag);
      }
    }
    return allDiagnostics;
  }

  private overlapsWithInterpolation(
    diagRange: { start: Position; end: Position },
    interpolationRanges: InterpolationRange[]
  ): boolean {
    for (const interpRange of interpolationRanges) {
      if (this.rangesOverlap(diagRange, interpRange)) {
        return true;
      }
    }
    return false;
  }

  private rangesOverlap(
    a: { start: Position; end: Position },
    b: { start: Position; end: Position }
  ): boolean {
    // Check if range a ends before range b starts
    if (
      a.end.line < b.start.line ||
      (a.end.line === b.start.line && a.end.character <= b.start.character)
    ) {
      return false;
    }
    // Check if range b ends before range a starts
    if (
      b.end.line < a.start.line ||
      (b.end.line === a.start.line && b.end.character <= a.start.character)
    ) {
      return false;
    }
    return true;
  }

  private getEmbeddedCompletions(document: TextDocument, position: Position): CompletionItem[] {
    const query = this.getQueryAtPosition(document.uri, position);
    if (!query) return [];

    const embeddedPosition = this.toEmbeddedPosition(query, position);
    return getAutocompleteSuggestions(
      query.content,
      query.parseResult.tree.rootNode,
      embeddedPosition,
      this.schemaLoader,
      { typeHint: query.typeHint }
    );
  }

  private getEmbeddedHover(document: TextDocument, position: Position): Hover | null {
    const query = this.getQueryAtPosition(document.uri, position);
    if (!query) return null;

    const embeddedPosition = this.toEmbeddedPosition(query, position);
    const hover = getHoverInformation(query.content, query.parseResult.tree.rootNode, embeddedPosition, this.schemaLoader);
    if (hover?.range) {
      hover.range.start.line += query.range.start.line;
      hover.range.end.line += query.range.start.line;
      if (hover.range.start.line === query.range.start.line) {
        hover.range.start.character += query.range.start.character;
      }
      if (hover.range.end.line === query.range.start.line) {
        hover.range.end.character += query.range.start.character;
      }
    }
    return hover;
  }

  private getEmbeddedSymbols(document: TextDocument): SymbolInformation[] {
    const queries = this.embeddedQueryCache.get(document.uri);
    if (!queries) return [];

    const allSymbols: SymbolInformation[] = [];
    for (const query of queries) {
      const symbols = getOutline(query.parseResult.tree.rootNode, document.uri);
      for (const symbol of symbols) {
        symbol.location.range.start.line += query.range.start.line;
        symbol.location.range.end.line += query.range.start.line;
        allSymbols.push(symbol);
      }
    }
    return allSymbols;
  }

  private getEmbeddedDefinition(document: TextDocument, position: Position): Location | null {
    const query = this.getQueryAtPosition(document.uri, position);
    if (!query) return null;

    const embeddedPosition = this.toEmbeddedPosition(query, position);
    const location = getDefinition(query.content, query.parseResult.tree.rootNode, embeddedPosition, document.uri);
    if (location) {
      location.range.start.line += query.range.start.line;
      location.range.end.line += query.range.start.line;
      if (location.range.start.line === query.range.start.line) {
        location.range.start.character += query.range.start.character;
      }
      if (location.range.end.line === query.range.start.line) {
        location.range.end.character += query.range.start.character;
      }
    }
    return location;
  }

  updateConfig(config: Partial<GroqLanguageServiceConfig>): void {
    const oldSchemaPath = this.config.schemaPath;
    this.config = { ...this.config, ...config };

    if (config.schemaPath && config.schemaPath !== oldSchemaPath) {
      this.loadSchema(config.schemaPath);
    }
  }
}
