import type { SyntaxNode } from "../parser/ASTTypes";
import type { SchemaLoader } from "./SchemaLoader";
import type { FunctionRegistry } from "./FunctionRegistry";
import type { InferredContext } from "./TypeInference";
import {
  inferTypeFromExplicitFilter,
  inferTypeContextInFunctionBody,
  inferTypeContext,
  inferTypeContextFromText,
} from "./TypeInference";

export interface ResolverOptions {
  schemaLoader: SchemaLoader;
  functionRegistry?: FunctionRegistry;
  source?: string;
  position?: { line: number; character: number };
}

export function resolveTypeContext(
  node: SyntaxNode | null,
  options: ResolverOptions
): InferredContext {
  const { schemaLoader, functionRegistry, source, position } = options;

  // Priority 1: Explicit _type filter in AST
  if (node) {
    const explicitContext = inferTypeFromExplicitFilter(node, schemaLoader);
    if (explicitContext?.type) {
      return explicitContext;
    }
  }

  // Priority 2: Text-based _type pattern (for incomplete expressions)
  if (source && position) {
    const textContext = inferTypeContextFromText(
      source,
      position,
      schemaLoader
    );
    if (textContext?.type) {
      return textContext;
    }
  }

  // Priority 3: Function body context with declared/inferred types
  if (node && functionRegistry) {
    const funcDef = functionRegistry.isInsideFunctionBody(node);
    if (funcDef) {
      const funcContext = inferTypeContextInFunctionBody(
        node,
        funcDef,
        functionRegistry,
        schemaLoader
      );
      if (funcContext?.type) {
        return funcContext;
      }
    }
  }

  // Priority 4: General AST-based inference
  if (node) {
    return inferTypeContext(node, schemaLoader);
  }

  // Fallback: no type context
  return {
    type: null,
    field: null,
    isArray: false,
    documentTypes: schemaLoader.getDocumentTypeNames(),
  };
}
