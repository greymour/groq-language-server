import type { Extension } from '../index.js';
import { parseParamAnnotations } from './parser.js';
import { validateParamTypes } from './diagnostics.js';

/**
 * Extension that enables JSDoc-style parameter type annotations for GROQ functions.
 *
 * Syntax:
 * ```groq
 * // @param {typeName} $paramName
 * fn myFunction($paramName) = $paramName-> { ... };
 * ```
 *
 * Features:
 * - Autocomplete uses declared types for field suggestions inside function bodies
 * - Warnings when declared types don't exist in the schema
 * - Type information shown in hover documentation
 */
export const paramTypeAnnotationsExtension: Extension = {
  id: 'paramTypeAnnotations',
  name: 'Parameter Type Annotations',
  description: 'Enables // @param {type} $name syntax for typing GROQ function parameters',

  hooks: {
    onFunctionExtracted: (funcDef, rawSource, funcStartIndex) => {
      const annotations = parseParamAnnotations(rawSource, funcStartIndex);

      for (const param of funcDef.parameters) {
        const annotation = annotations.get(param.name);
        if (annotation) {
          param.declaredType = annotation.type;
          param.typeAnnotationRange = annotation.range;
        }
      }
    },

    getParameterType: (_funcDef, param, _paramIndex) => {
      return param.declaredType ?? null;
    },

    getDiagnostics: (context) => {
      return validateParamTypes(context);
    },

    getHoverContent: (context) => {
      if (context.parameter?.declaredType) {
        return `**Type:** \`${context.parameter.declaredType}\` *(from @param annotation)*`;
      }
      return null;
    },
  },
};

export { parseParamAnnotations } from './parser.js';
export { validateParamTypes } from './diagnostics.js';
