import type { Location, Position } from "vscode-languageserver";
import type { SyntaxNode } from "../parser/ASTTypes";
import { nodeToRange } from "../parser/ASTTypes";
import { getNamedNodeAtPosition, walkTree } from "../parser/nodeUtils";
import { toLSPRange } from "../utils/Range";
import { FunctionRegistry } from "../schema/FunctionRegistry";

export function getDefinition(
  _source: string,
  root: SyntaxNode,
  position: Position,
  uri: string
): Location | null {
  const node = getNamedNodeAtPosition(root, position);
  if (!node) return null;

  const functionRegistry = new FunctionRegistry();
  functionRegistry.extractFromAST(root);

  if (node.type === "variable") {
    const variableName = node.text;
    const firstOccurrence = findFirstVariableOccurrence(root, variableName);
    if (firstOccurrence && firstOccurrence !== node) {
      return {
        uri,
        range: toLSPRange(nodeToRange(firstOccurrence)),
      };
    }
    return {
      uri,
      range: toLSPRange(nodeToRange(node)),
    };
  }

  if (node.type === "namespaced_identifier") {
    if (node.parent?.type === "function_call") {
      const funcDef = functionRegistry.getDefinition(node.text);
      if (funcDef) {
        return {
          uri,
          range: toLSPRange(nodeToRange(funcDef.nameNode)),
        };
      }
    }
  }

  if (node.type === "identifier") {
    // Check if this is a function call
    if (node.parent?.type === "function_call") {
      const nameNode = node.parent.childForFieldName("name");
      if (nameNode === node) {
        const funcDef = functionRegistry.getDefinition(node.text);
        if (funcDef) {
          return {
            uri,
            range: toLSPRange(nodeToRange(funcDef.nameNode)),
          };
        }
      }
    }

    // Check if this is part of a namespaced function call
    if (node.parent?.type === "namespaced_identifier") {
      if (node.parent.parent?.type === "function_call") {
        const funcDef = functionRegistry.getDefinition(node.parent.text);
        if (funcDef) {
          return {
            uri,
            range: toLSPRange(nodeToRange(funcDef.nameNode)),
          };
        }
      }
    }

    if (
      node.parent?.type === "access_expression" ||
      node.parent?.type === "dereference_expression"
    ) {
      const memberField = node.parent.childForFieldName("member");
      if (memberField === node) {
        const definition = findProjectionField(root, node.text);
        if (definition) {
          return {
            uri,
            range: toLSPRange(nodeToRange(definition)),
          };
        }
      }
    }

    if (node.parent?.type === "projection_pair") {
      return {
        uri,
        range: toLSPRange(nodeToRange(node)),
      };
    }

    const definition = findProjectionField(root, node.text);
    if (definition && definition !== node) {
      return {
        uri,
        range: toLSPRange(nodeToRange(definition)),
      };
    }
  }

  return null;
}

function findFirstVariableOccurrence(
  root: SyntaxNode,
  name: string
): SyntaxNode | null {
  let firstOccurrence: SyntaxNode | null = null;

  walkTree(root, (node) => {
    if (node.type === "variable" && node.text === name) {
      if (!firstOccurrence || node.startIndex < firstOccurrence.startIndex) {
        firstOccurrence = node;
      }
    }
  });

  return firstOccurrence;
}

function findProjectionField(
  root: SyntaxNode,
  fieldName: string
): SyntaxNode | null {
  let definition: SyntaxNode | null = null;

  walkTree(root, (node) => {
    if (node.type === "projection_pair") {
      const keyNode = node.childForFieldName("key");
      if (keyNode) {
        let keyText = keyNode.text;
        if (keyNode.type === "string") {
          keyText = keyText.slice(1, -1);
        }
        if (keyText === fieldName) {
          definition = keyNode;
          return false;
        }
      }
    }
    return undefined;
  });

  return definition;
}
