import type { SyntaxNode } from '../parser/ASTTypes';
import { walkTree, getFieldNode, findAncestorOfType } from '../parser/nodeUtils';
import type { SchemaLoader } from './SchemaLoader';
import { inferTypeContext } from './TypeInference';
import type { ExtensionRegistry } from '../extensions/index';

export interface FunctionParameter {
  name: string;
  inferredTypes: Set<string>;
  declaredType: string | null;
  declaredTypeIsArray: boolean;
  typeAnnotationRange: { startIndex: number; endIndex: number } | null;
}

export interface FunctionDefinition {
  name: string;
  nameNode: SyntaxNode;
  parameters: FunctionParameter[];
  bodyNode: SyntaxNode;
}

export interface CallSiteInfo {
  functionName: string;
  argumentTypes: (string[] | null)[];
  callNode: SyntaxNode;
}

export class FunctionRegistry {
  private definitions: Map<string, FunctionDefinition> = new Map();
  private callSites: Map<string, CallSiteInfo[]> = new Map();
  private visitedFunctions: Set<string> = new Set();
  private rawSource: string = '';
  private extensionRegistry: ExtensionRegistry | null = null;

  clear(): void {
    this.definitions.clear();
    this.callSites.clear();
    this.visitedFunctions.clear();
  }

  extractFromAST(
    root: SyntaxNode,
    schemaLoader?: SchemaLoader,
    rawSource?: string,
    extensionRegistry?: ExtensionRegistry
  ): void {
    this.clear();
    this.rawSource = rawSource ?? '';
    this.extensionRegistry = extensionRegistry ?? null;
    this.extractFunctionDefinitions(root);
    this.extractCallSites(root, schemaLoader);
    this.propagateTypes();
  }

  private extractFunctionDefinitions(root: SyntaxNode): void {
    walkTree(root, (node) => {
      if (node.type !== 'function_definition') return;

      const nameNode = getFieldNode(node, 'name');
      if (!nameNode) return;

      const funcName = nameNode.text;
      const paramListNode = node.children.find(c => c.type === 'parameter_list');
      const bodyNode = getFieldNode(node, 'body');

      if (!bodyNode) return;

      const parameters: FunctionParameter[] = [];
      if (paramListNode) {
        for (let i = 0; i < paramListNode.childCount; i++) {
          const child = paramListNode.child(i);
          if (child?.type === 'variable') {
            parameters.push({
              name: child.text,
              inferredTypes: new Set(),
              declaredType: null,
              declaredTypeIsArray: false,
              typeAnnotationRange: null,
            });
          }
        }
      }

      const funcDef: FunctionDefinition = {
        name: funcName,
        nameNode,
        parameters,
        bodyNode,
      };

      // Call extension hooks to augment the function definition
      if (this.extensionRegistry) {
        const hooks = this.extensionRegistry.getHook('onFunctionExtracted');
        for (const { hook } of hooks) {
          hook(funcDef, this.rawSource, node.startIndex);
        }
      }

      this.definitions.set(funcName, funcDef);
    });
  }

  private extractCallSites(root: SyntaxNode, schemaLoader?: SchemaLoader): void {
    walkTree(root, (node) => {
      if (node.type !== 'function_call') return;

      const nameNode = getFieldNode(node, 'name');
      if (!nameNode) return;

      const funcName = nameNode.text;

      if (!this.definitions.has(funcName)) return;

      const argumentTypes: (string[] | null)[] = [];

      // Arguments are named children after the function name
      // Skip the name node and collect remaining named children as arguments
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child && child.id !== nameNode.id) {
          const types = this.inferArgumentType(child, schemaLoader);
          argumentTypes.push(types);
        }
      }

      const callInfo: CallSiteInfo = {
        functionName: funcName,
        argumentTypes,
        callNode: node,
      };

      const existing = this.callSites.get(funcName) ?? [];
      existing.push(callInfo);
      this.callSites.set(funcName, existing);
    });
  }

  private inferArgumentType(argNode: SyntaxNode, schemaLoader?: SchemaLoader): string[] | null {
    if (!schemaLoader?.isLoaded()) return null;

    if (argNode.type === 'identifier') {
      const fieldName = argNode.text;
      const context = inferTypeContext(argNode, schemaLoader);

      if (context.type) {
        const field = schemaLoader.getField(context.type.name, fieldName);
        if (field) {
          if (field.isArray && field.arrayOf?.length) {
            return field.arrayOf;
          }
          if (field.isReference && field.referenceTargets?.length) {
            return field.referenceTargets;
          }
          if (field.type !== 'object') {
            return [field.type];
          }
        }
      }

      for (const typeName of schemaLoader.getTypeNames()) {
        const field = schemaLoader.getField(typeName, fieldName);
        if (field) {
          if (field.isArray && field.arrayOf?.length) {
            return field.arrayOf;
          }
          if (field.isReference && field.referenceTargets?.length) {
            return field.referenceTargets;
          }
          if (field.type !== 'object') {
            return [field.type];
          }
        }
      }
    }

    if (argNode.type === 'subscript_expression') {
      const baseNode = getFieldNode(argNode, 'base');
      if (baseNode?.type === 'identifier') {
        const fieldName = baseNode.text;
        const context = inferTypeContext(argNode, schemaLoader);

        if (context.type) {
          const field = schemaLoader.getField(context.type.name, fieldName);
          if (field?.isArray && field.arrayOf?.length) {
            return field.arrayOf;
          }
        }

        for (const typeName of schemaLoader.getTypeNames()) {
          const field = schemaLoader.getField(typeName, fieldName);
          if (field?.isArray && field.arrayOf?.length) {
            return field.arrayOf;
          }
        }
      }
    }

    if (argNode.type === 'access_expression' || argNode.type === 'dereference_expression') {
      const context = inferTypeContext(argNode, schemaLoader);
      if (context.type) {
        return [context.type.name];
      }
    }

    return null;
  }

  private propagateTypes(): void {
    for (const [funcName, callSites] of this.callSites) {
      const definition = this.definitions.get(funcName);
      if (!definition) continue;

      for (const callSite of callSites) {
        for (let i = 0; i < callSite.argumentTypes.length; i++) {
          const argTypes = callSite.argumentTypes[i];
          if (argTypes && i < definition.parameters.length) {
            for (const t of argTypes) {
              definition.parameters[i].inferredTypes.add(t);
            }
          }
        }
      }
    }
  }

  getDefinition(name: string): FunctionDefinition | undefined {
    return this.definitions.get(name);
  }

  getAllDefinitions(): FunctionDefinition[] {
    return Array.from(this.definitions.values());
  }

  getInferredParameterType(funcName: string, paramIndex: number): string[] {
    const definition = this.definitions.get(funcName);
    if (!definition || paramIndex >= definition.parameters.length) {
      return [];
    }
    return Array.from(definition.parameters[paramIndex].inferredTypes);
  }

  /**
   * Get the type for a parameter, checking extensions first then falling back to inferred types.
   */
  getParameterType(funcName: string, paramIndex: number): string[] {
    const definition = this.definitions.get(funcName);
    if (!definition || paramIndex >= definition.parameters.length) {
      return [];
    }

    const param = definition.parameters[paramIndex];

    // Check extensions for declared type
    if (this.extensionRegistry) {
      const hooks = this.extensionRegistry.getHook('getParameterType');
      for (const { hook } of hooks) {
        const declaredType = hook(definition, param, paramIndex);
        if (declaredType) {
          return [declaredType];
        }
      }
    }

    // Fall back to inferred types
    return Array.from(param.inferredTypes);
  }

  getParameterByName(funcName: string, paramName: string): FunctionParameter | undefined {
    const definition = this.definitions.get(funcName);
    if (!definition) return undefined;
    return definition.parameters.find(p => p.name === paramName);
  }

  isInsideFunctionBody(node: SyntaxNode): FunctionDefinition | null {
    const funcDef = findAncestorOfType(node, 'function_definition');
    if (!funcDef) return null;

    const nameNode = getFieldNode(funcDef, 'name');
    if (!nameNode) return null;

    return this.definitions.get(nameNode.text) ?? null;
  }

  findFunctionCallByName(root: SyntaxNode, funcName: string): SyntaxNode | null {
    let found: SyntaxNode | null = null;
    walkTree(root, (node) => {
      if (node.type === 'function_call') {
        const nameNode = getFieldNode(node, 'name');
        if (nameNode?.text === funcName) {
          found = node;
          return false;
        }
      }
      return undefined;
    });
    return found;
  }

  findFunctionDefinitionNode(root: SyntaxNode, funcName: string): SyntaxNode | null {
    let found: SyntaxNode | null = null;
    walkTree(root, (node) => {
      if (node.type === 'function_definition') {
        const nameNode = getFieldNode(node, 'name');
        if (nameNode?.text === funcName) {
          found = node;
          return false;
        }
      }
      return undefined;
    });
    return found;
  }

  hasDefinition(name: string): boolean {
    return this.definitions.has(name);
  }

  getCallSites(funcName: string): CallSiteInfo[] {
    return this.callSites.get(funcName) ?? [];
  }

  getExtensionRegistry(): ExtensionRegistry | null {
    return this.extensionRegistry;
  }
}
