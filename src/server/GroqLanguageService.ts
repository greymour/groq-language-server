import type { TextDocument } from 'vscode-languageserver-textdocument';
import type {
  CompletionItem,
  Diagnostic,
  Hover,
  Position,
  SymbolInformation,
  Location,
} from 'vscode-languageserver';
import { DocumentCache } from './DocumentCache';
import { getDiagnostics } from '../interface/getDiagnostics';
import { getAutocompleteSuggestions } from '../interface/getAutocompleteSuggestions';
import { getHoverInformation } from '../interface/getHoverInformation';
import { getOutline } from '../interface/getOutline';
import { getDefinition } from '../interface/getDefinition';
import { EmbeddedLanguageHandler } from '../embedded/EmbeddedLanguageHandler';
import { SchemaLoader } from '../schema/SchemaLoader';
import type { SchemaValidationConfig } from '../schema/SchemaLoader';
import { ExtensionRegistry, paramTypeAnnotationsExtension } from '../extensions/index';

export type { SchemaValidationConfig };

export interface ExtensionsConfig {
  paramTypeAnnotations?: boolean;
}

export interface GroqLanguageServiceConfig {
  schemaEnabled?: boolean;
  schemaPath?: string;
  extensions?: ExtensionsConfig;
  schemaValidation?: SchemaValidationConfig;
}

export class GroqLanguageService {
  private documentCache: DocumentCache;
  private embeddedHandler: EmbeddedLanguageHandler;
  private config: GroqLanguageServiceConfig;
  private schemaLoader: SchemaLoader;
  private extensionRegistry: ExtensionRegistry;

  constructor(config: GroqLanguageServiceConfig = {}) {
    this.documentCache = new DocumentCache();
    this.embeddedHandler = new EmbeddedLanguageHandler();
    this.config = config;
    this.schemaLoader = new SchemaLoader(config.schemaValidation);
    this.extensionRegistry = this.createExtensionRegistry(config.extensions);

    if (config.schemaPath) {
      this.loadSchema(config.schemaPath);
    }
  }

  private createExtensionRegistry(extensionsConfig?: ExtensionsConfig): ExtensionRegistry {
    const registry = new ExtensionRegistry();

    registry.register(paramTypeAnnotationsExtension);

    if (extensionsConfig?.paramTypeAnnotations) {
      registry.enable('paramTypeAnnotations');
    }

    return registry;
  }

  private async loadSchema(schemaPath: string): Promise<void> {
    await this.schemaLoader.loadFromPath(schemaPath);
  }

  getSchemaLoader(): SchemaLoader {
    return this.schemaLoader;
  }

  updateDocument(document: TextDocument): void {
    if (this.isEmbeddedLanguage(document.uri)) {
      this.embeddedHandler.update(document.uri, document.getText());
    } else {
      this.documentCache.update(document);
    }
  }

  removeDocument(uri: string): void {
    this.documentCache.delete(uri);
    this.embeddedHandler.remove(uri);
  }

  getDiagnostics(document: TextDocument): Diagnostic[] {
    if (this.isEmbeddedLanguage(document.uri)) {
      return this.getEmbeddedDiagnostics(document);
    }

    const source = document.getText();
    const parseResult = this.documentCache.getParseResult(document.uri);
    if (!parseResult) {
      const result = this.documentCache.set(document);
      return getDiagnostics(result, {
        schemaLoader: this.schemaLoader,
        source,
        extensionRegistry: this.extensionRegistry,
      });
    }
    return getDiagnostics(parseResult, {
      schemaLoader: this.schemaLoader,
      source,
      extensionRegistry: this.extensionRegistry,
    });
  }

  getCompletions(document: TextDocument, position: Position): CompletionItem[] {
    if (this.isEmbeddedLanguage(document.uri)) {
      return this.getEmbeddedCompletions(document, position);
    }

    const parseResult = this.documentCache.getParseResult(document.uri);
    if (!parseResult) {
      const result = this.documentCache.set(document);
      return getAutocompleteSuggestions(
        document.getText(),
        result.tree.rootNode,
        position,
        this.schemaLoader,
        this.extensionRegistry
      );
    }
    return getAutocompleteSuggestions(
      document.getText(),
      parseResult.tree.rootNode,
      position,
      this.schemaLoader,
      this.extensionRegistry
    );
  }

  getHover(document: TextDocument, position: Position): Hover | null {
    if (this.isEmbeddedLanguage(document.uri)) {
      return this.getEmbeddedHover(document, position);
    }

    const parseResult = this.documentCache.getParseResult(document.uri);
    if (!parseResult) {
      const result = this.documentCache.set(document);
      return getHoverInformation(document.getText(), result.tree.rootNode, position, this.schemaLoader, this.extensionRegistry);
    }
    return getHoverInformation(document.getText(), parseResult.tree.rootNode, position, this.schemaLoader, this.extensionRegistry);
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

  private getEmbeddedDiagnostics(document: TextDocument): Diagnostic[] {
    const queries = this.embeddedHandler.getQueries(document.uri);
    if (queries.length === 0) {
      this.embeddedHandler.update(document.uri, document.getText());
      return this.getEmbeddedDiagnostics(document);
    }

    return queries.flatMap(query => {
      const diagnostics = getDiagnostics(query.parseResult, {
        schemaLoader: this.schemaLoader,
        source: query.content,
        extensionRegistry: this.extensionRegistry,
      });
      const filtered = this.embeddedHandler.filterInterpolationDiagnostics(
        diagnostics,
        query.interpolationRanges
      );
      return this.embeddedHandler.mapResultsToDocument(query, filtered);
    });
  }

  private getEmbeddedCompletions(document: TextDocument, position: Position): CompletionItem[] {
    const query = this.embeddedHandler.getQueryAtPosition(document.uri, position);
    if (!query) return [];

    const embeddedPosition = this.embeddedHandler.toEmbeddedPosition(query, position);
    return getAutocompleteSuggestions(
      query.content,
      query.parseResult.tree.rootNode,
      embeddedPosition,
      this.schemaLoader,
      this.extensionRegistry
    );
  }

  private getEmbeddedHover(document: TextDocument, position: Position): Hover | null {
    const query = this.embeddedHandler.getQueryAtPosition(document.uri, position);
    if (!query) return null;

    const embeddedPosition = this.embeddedHandler.toEmbeddedPosition(query, position);
    const hover = getHoverInformation(query.content, query.parseResult.tree.rootNode, embeddedPosition, this.schemaLoader, this.extensionRegistry);
    if (hover?.range) {
      hover.range = this.embeddedHandler.toDocumentRange(query, hover.range);
    }
    return hover;
  }

  private getEmbeddedSymbols(document: TextDocument): SymbolInformation[] {
    const queries = this.embeddedHandler.getQueries(document.uri);
    return queries.flatMap(query => {
      const symbols = getOutline(query.parseResult.tree.rootNode, document.uri);
      return symbols.map(symbol => ({
        ...symbol,
        location: {
          ...symbol.location,
          range: this.embeddedHandler.toDocumentRange(query, symbol.location.range),
        },
      }));
    });
  }

  private getEmbeddedDefinition(document: TextDocument, position: Position): Location | null {
    const query = this.embeddedHandler.getQueryAtPosition(document.uri, position);
    if (!query) return null;

    const embeddedPosition = this.embeddedHandler.toEmbeddedPosition(query, position);
    const location = getDefinition(query.content, query.parseResult.tree.rootNode, embeddedPosition, document.uri);
    if (location) {
      location.range = this.embeddedHandler.toDocumentRange(query, location.range);
    }
    return location;
  }

  updateConfig(config: Partial<GroqLanguageServiceConfig>): void {
    const oldSchemaPath = this.config.schemaPath;
    this.config = { ...this.config, ...config };

    if (config.schemaValidation !== undefined) {
      this.schemaLoader.updateValidationConfig(config.schemaValidation);
    }

    if (config.schemaPath && config.schemaPath !== oldSchemaPath) {
      this.loadSchema(config.schemaPath);
    }

    if (config.extensions !== undefined) {
      this.extensionRegistry = this.createExtensionRegistry(config.extensions);
    }
  }

  getExtensionRegistry(): ExtensionRegistry {
    return this.extensionRegistry;
  }
}
