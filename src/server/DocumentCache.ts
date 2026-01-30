import type { TextDocument } from "vscode-languageserver-textdocument";
import type { ParseResult, Tree } from "../parser/ASTTypes";
import { getSharedParser } from "../parser/GroqParser";

interface CachedDocument {
  document: TextDocument;
  parseResult: ParseResult;
  version: number;
}

export class DocumentCache {
  private cache: Map<string, CachedDocument> = new Map();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  get(uri: string): CachedDocument | undefined {
    return this.cache.get(uri);
  }

  getParseResult(uri: string): ParseResult | undefined {
    return this.cache.get(uri)?.parseResult;
  }

  getTree(uri: string): Tree | undefined {
    return this.cache.get(uri)?.parseResult.tree;
  }

  set(document: TextDocument): ParseResult {
    const existing = this.cache.get(document.uri);
    const parser = getSharedParser();

    let parseResult: ParseResult;
    if (existing && existing.version < document.version) {
      parseResult = parser.parse(document.getText(), existing.parseResult.tree);
    } else {
      parseResult = parser.parse(document.getText());
    }

    this.cache.set(document.uri, {
      document,
      parseResult,
      version: document.version,
    });

    this.enforceMaxSize();

    return parseResult;
  }

  update(document: TextDocument): ParseResult {
    return this.set(document);
  }

  delete(uri: string): boolean {
    return this.cache.delete(uri);
  }

  has(uri: string): boolean {
    return this.cache.has(uri);
  }

  clear(): void {
    this.cache.clear();
  }

  getDocument(uri: string): TextDocument | undefined {
    return this.cache.get(uri)?.document;
  }

  getAllUris(): string[] {
    return Array.from(this.cache.keys());
  }

  getSize(): number {
    return this.cache.size;
  }

  private enforceMaxSize(): void {
    if (this.cache.size > this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }
}
