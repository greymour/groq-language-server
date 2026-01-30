import type { Diagnostic } from "vscode-languageserver";
import type {
  FunctionDefinition,
  FunctionParameter,
} from "../schema/FunctionRegistry";
import type { SchemaLoader } from "../schema/SchemaLoader";

/**
 * Lifecycle hooks that extensions can implement to integrate with the language server.
 * All hooks are optional - extensions only implement the ones they need.
 */
export interface Hooks {
  /**
   * Called after a function definition is extracted from the AST.
   * Use this to parse additional metadata from comments or modify the function definition.
   *
   * @param funcDef - The extracted function definition (mutable)
   * @param rawSource - The raw source code of the document
   * @param funcStartIndex - Character offset where the function definition starts
   */
  onFunctionExtracted?: (
    funcDef: FunctionDefinition,
    rawSource: string,
    funcStartIndex: number
  ) => void;

  /**
   * Called to get the declared type for a function parameter.
   * Return null to defer to other extensions or fall back to inferred types.
   *
   * @param funcDef - The function definition containing the parameter
   * @param param - The parameter to get the type for
   * @param paramIndex - The index of the parameter in the function's parameter list
   * @returns The declared type name, or null if not declared
   */
  getParameterType?: (
    funcDef: FunctionDefinition,
    param: FunctionParameter,
    paramIndex: number
  ) => string | null;

  /**
   * Called to collect diagnostics from the extension.
   * Return an array of diagnostics to report (warnings, errors, hints).
   *
   * @param context - Context object with access to registries and source
   * @returns Array of diagnostics to report
   */
  getDiagnostics?: (context: DiagnosticsContext) => Diagnostic[];

  /**
   * Called to provide additional completion items.
   * Return an array of completion items to add to the suggestions.
   *
   * @param context - Context object with position, source, and type information
   * @returns Array of additional completion items
   */
  getCompletions?: (context: CompletionContext) => CompletionItem[];

  /**
   * Called to provide additional hover information.
   * Return markdown content to append to the hover, or null.
   *
   * @param context - Context object with the node being hovered
   * @returns Additional markdown content for hover, or null
   */
  getHoverContent?: (context: HoverContext) => string | null;
}

/**
 * Context provided to the getDiagnostics hook.
 */
export interface DiagnosticsContext {
  /** All extracted function definitions */
  functionDefinitions: FunctionDefinition[];
  /** The schema loader (may not be loaded) */
  schemaLoader: SchemaLoader;
  /** The raw source code */
  source: string;
}

/**
 * Context provided to the getCompletions hook.
 */
export interface CompletionContext {
  /** Current cursor position */
  position: { line: number; character: number };
  /** The raw source code */
  source: string;
  /** The function we're inside (if any) */
  containingFunction: FunctionDefinition | null;
  /** The schema loader (may not be loaded) */
  schemaLoader: SchemaLoader;
}

/**
 * A completion item suggestion.
 */
export interface CompletionItem {
  label: string;
  kind: "field" | "function" | "keyword" | "type" | "variable";
  detail?: string;
  documentation?: string;
  insertText?: string;
}

/**
 * Context provided to the getHoverContent hook.
 */
export interface HoverContext {
  /** The text being hovered over */
  text: string;
  /** The function definition if hovering over a function name */
  functionDef: FunctionDefinition | null;
  /** The parameter if hovering over a parameter */
  parameter: FunctionParameter | null;
  /** The schema loader (may not be loaded) */
  schemaLoader: SchemaLoader;
}

/**
 * An extension that adds non-standard functionality to the GROQ language server.
 */
export interface Extension {
  /** Unique identifier for the extension */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what the extension does */
  description: string;
  /** Lifecycle hooks implemented by this extension */
  hooks: Hooks;
}

/**
 * Configuration for an extension instance.
 */
export interface ExtensionConfig {
  /** Whether the extension is enabled */
  enabled: boolean;
  /** Extension-specific options */
  options?: Record<string, unknown>;
}

export { ExtensionRegistry } from "./ExtensionRegistry";
export { paramTypeAnnotationsExtension } from "./paramTypeAnnotations/index";
