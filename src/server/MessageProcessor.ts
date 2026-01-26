import type {
  Connection,
  TextDocumentSyncKind,
  InitializeResult,
  InitializeParams,
  TextDocumentPositionParams,
  CompletionParams,
  DocumentSymbolParams,
  DidOpenTextDocumentParams,
  DidChangeTextDocumentParams,
  DidCloseTextDocumentParams,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { GroqLanguageService } from './GroqLanguageService.js';

export class MessageProcessor {
  private connection: Connection;
  private service: GroqLanguageService;
  private documents: Map<string, TextDocument> = new Map();

  constructor(connection: Connection) {
    this.connection = connection;
    this.service = new GroqLanguageService();
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.connection.onInitialize(this.handleInitialize.bind(this));
    this.connection.onShutdown(this.handleShutdown.bind(this));

    this.connection.onDidOpenTextDocument(this.handleDidOpen.bind(this));
    this.connection.onDidChangeTextDocument(this.handleDidChange.bind(this));
    this.connection.onDidCloseTextDocument(this.handleDidClose.bind(this));

    this.connection.onCompletion(this.handleCompletion.bind(this));
    this.connection.onHover(this.handleHover.bind(this));
    this.connection.onDocumentSymbol(this.handleDocumentSymbol.bind(this));
    this.connection.onDefinition(this.handleDefinition.bind(this));
  }

  private handleInitialize(params: InitializeParams): InitializeResult {
    const initOptions = params.initializationOptions as {
      schemaPath?: string;
      schemaEnabled?: boolean;
      extensions?: {
        paramTypeAnnotations?: boolean;
      };
      schemaValidation?: {
        enabled?: boolean;
        maxDepth?: number;
        maxTypes?: number;
        maxFieldsPerType?: number;
        cacheValidation?: boolean;
      };
    } | undefined;

    if (initOptions) {
      this.service.updateConfig({
        schemaPath: initOptions.schemaPath,
        extensions: initOptions.extensions,
        schemaValidation: initOptions.schemaValidation,
      });
    }

    return {
      capabilities: {
        textDocumentSync: 1 as TextDocumentSyncKind,
        completionProvider: {
          resolveProvider: false,
          triggerCharacters: ['.', '[', '{', '|', '-', '*', '@', '^', '$', '('],
        },
        hoverProvider: true,
        documentSymbolProvider: true,
        definitionProvider: true,
      },
    };
  }

  private handleShutdown(): void {
    this.documents.clear();
  }

  private handleDidOpen(params: DidOpenTextDocumentParams): void {
    const { uri, languageId, version, text } = params.textDocument;
    const document = TextDocument.create(uri, languageId, version, text);
    this.documents.set(uri, document);
    this.service.updateDocument(document);
    this.publishDiagnostics(document);
  }

  private handleDidChange(params: DidChangeTextDocumentParams): void {
    const { uri, version } = params.textDocument;
    const existing = this.documents.get(uri);
    if (!existing) return;

    const document = TextDocument.update(
      existing,
      params.contentChanges,
      version
    );
    this.documents.set(uri, document);
    this.service.updateDocument(document);
    this.publishDiagnostics(document);
  }

  private handleDidClose(params: DidCloseTextDocumentParams): void {
    const { uri } = params.textDocument;
    this.documents.delete(uri);
    this.service.removeDocument(uri);
    this.connection.sendDiagnostics({ uri, diagnostics: [] });
  }

  private handleCompletion(params: CompletionParams) {
    const document = this.documents.get(params.textDocument.uri);
    if (!document) return [];
    return this.service.getCompletions(document, params.position);
  }

  private handleHover(params: TextDocumentPositionParams) {
    const document = this.documents.get(params.textDocument.uri);
    if (!document) return null;
    return this.service.getHover(document, params.position);
  }

  private handleDocumentSymbol(params: DocumentSymbolParams) {
    const document = this.documents.get(params.textDocument.uri);
    if (!document) return [];
    return this.service.getDocumentSymbols(document);
  }

  private handleDefinition(params: TextDocumentPositionParams) {
    const document = this.documents.get(params.textDocument.uri);
    if (!document) return null;
    return this.service.getDefinition(document, params.position);
  }

  private publishDiagnostics(document: TextDocument): void {
    const diagnostics = this.service.getDiagnostics(document);
    this.connection.sendDiagnostics({ uri: document.uri, diagnostics });
  }
}
