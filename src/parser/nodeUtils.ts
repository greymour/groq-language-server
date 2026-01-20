import type { SyntaxNode, Position, GroqNodeType } from './ASTTypes.js';

export function getNodeAtPosition(
  root: SyntaxNode,
  position: Position
): SyntaxNode | null {
  const point = { row: position.line, column: position.character };
  return root.descendantForPosition(point);
}

export function getNamedNodeAtPosition(
  root: SyntaxNode,
  position: Position
): SyntaxNode | null {
  const point = { row: position.line, column: position.character };
  return root.namedDescendantForPosition(point);
}

export function getAncestors(node: SyntaxNode): SyntaxNode[] {
  const ancestors: SyntaxNode[] = [];
  let current = node.parent;
  while (current) {
    ancestors.push(current);
    current = current.parent;
  }
  return ancestors;
}

export function findAncestorOfType(
  node: SyntaxNode,
  type: GroqNodeType | GroqNodeType[]
): SyntaxNode | null {
  const types = Array.isArray(type) ? type : [type];
  let current = node.parent;
  while (current) {
    if (types.includes(current.type as GroqNodeType)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

export function getNamedChildren(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = [];
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child) {
      children.push(child);
    }
  }
  return children;
}

export function getFieldNode(
  node: SyntaxNode,
  fieldName: string
): SyntaxNode | null {
  return node.childForFieldName(fieldName);
}

export function isInsideNode(
  position: Position,
  node: SyntaxNode
): boolean {
  const startPos = node.startPosition;
  const endPos = node.endPosition;

  if (position.line < startPos.row || position.line > endPos.row) {
    return false;
  }

  if (position.line === startPos.row && position.character < startPos.column) {
    return false;
  }

  if (position.line === endPos.row && position.character > endPos.column) {
    return false;
  }

  return true;
}

export function walkTree(
  node: SyntaxNode,
  callback: (node: SyntaxNode) => boolean | void
): void {
  if (callback(node) === false) {
    return;
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkTree(child, callback);
    }
  }
}

export function findAllNodesOfType(
  root: SyntaxNode,
  type: GroqNodeType | GroqNodeType[]
): SyntaxNode[] {
  const types = Array.isArray(type) ? type : [type];
  const results: SyntaxNode[] = [];
  walkTree(root, (node) => {
    if (types.includes(node.type as GroqNodeType)) {
      results.push(node);
    }
  });
  return results;
}

export function findFirstErrorNode(root: SyntaxNode): SyntaxNode | null {
  let errorNode: SyntaxNode | null = null;
  walkTree(root, (node) => {
    if (node.type === 'ERROR' || node.isMissing) {
      errorNode = node;
      return false;
    }
    return undefined;
  });
  return errorNode;
}

export function collectAllErrors(root: SyntaxNode): SyntaxNode[] {
  const errors: SyntaxNode[] = [];
  walkTree(root, (node) => {
    if (node.type === 'ERROR' || node.isMissing) {
      errors.push(node);
    }
  });
  return errors;
}

export function getPreviousSibling(node: SyntaxNode): SyntaxNode | null {
  return node.previousSibling;
}

export function getNextSibling(node: SyntaxNode): SyntaxNode | null {
  return node.nextSibling;
}

export function getPreviousNamedSibling(node: SyntaxNode): SyntaxNode | null {
  return node.previousNamedSibling;
}

export function getNextNamedSibling(node: SyntaxNode): SyntaxNode | null {
  return node.nextNamedSibling;
}

export function getNodeText(node: SyntaxNode): string {
  return node.text;
}

export function containsPosition(node: SyntaxNode, position: Position): boolean {
  const start = node.startPosition;
  const end = node.endPosition;

  if (position.line < start.row) return false;
  if (position.line > end.row) return false;
  if (position.line === start.row && position.character < start.column) return false;
  if (position.line === end.row && position.character > end.column) return false;

  return true;
}
