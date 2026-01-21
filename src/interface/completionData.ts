import { CompletionItemKind } from 'vscode-languageserver';
import type { CompletionItem } from 'vscode-languageserver';

export interface FunctionSignature {
  name: string;
  signature: string;
  description: string;
  parameters?: string[];
}

export const GROQ_FUNCTIONS: FunctionSignature[] = [
  {
    name: 'count',
    signature: 'count(array) -> number',
    description: 'Returns the number of elements in an array.',
    parameters: ['array'],
  },
  {
    name: 'defined',
    signature: 'defined(value) -> boolean',
    description: 'Returns true if the value is not null.',
    parameters: ['value'],
  },
  {
    name: 'length',
    signature: 'length(string) -> number',
    description: 'Returns the length of a string.',
    parameters: ['string'],
  },
  {
    name: 'references',
    signature: 'references(id) -> boolean',
    description: 'Returns true if the document contains a reference to the given ID.',
    parameters: ['id'],
  },
  {
    name: 'coalesce',
    signature: 'coalesce(...values) -> any',
    description: 'Returns the first non-null value from the arguments.',
    parameters: ['...values'],
  },
  {
    name: 'select',
    signature: 'select(condition => value, ...) -> any',
    description: 'Returns the value for the first matching condition.',
    parameters: ['condition => value', '...'],
  },
  {
    name: 'order',
    signature: 'order(field asc|desc, ...) -> array',
    description: 'Orders the result set by the specified fields.',
    parameters: ['field asc|desc'],
  },
  {
    name: 'score',
    signature: 'score(terms, ...) -> number',
    description: 'Calculates a relevance score based on the given terms.',
    parameters: ['...terms'],
  },
  {
    name: 'boost',
    signature: 'boost(condition, weight) -> number',
    description: 'Boosts the score when the condition is true.',
    parameters: ['condition', 'weight'],
  },
  {
    name: 'now',
    signature: 'now() -> datetime',
    description: 'Returns the current date and time.',
    parameters: [],
  },
  {
    name: 'identity',
    signature: 'identity() -> string',
    description: 'Returns the ID of the current user.',
    parameters: [],
  },
  {
    name: 'lower',
    signature: 'lower(string) -> string',
    description: 'Converts a string to lowercase.',
    parameters: ['string'],
  },
  {
    name: 'upper',
    signature: 'upper(string) -> string',
    description: 'Converts a string to uppercase.',
    parameters: ['string'],
  },
  {
    name: 'round',
    signature: 'round(number, precision?) -> number',
    description: 'Rounds a number to the specified precision.',
    parameters: ['number', 'precision?'],
  },
  {
    name: 'string',
    signature: 'string(value) -> string',
    description: 'Converts a value to a string.',
    parameters: ['value'],
  },
  {
    name: 'dateTime',
    signature: 'dateTime(string) -> datetime',
    description: 'Parses a string into a datetime.',
    parameters: ['string'],
  },
  {
    name: 'path',
    signature: 'path(string) -> path',
    description: 'Creates a path from a string for matching.',
    parameters: ['string'],
  },
  {
    name: 'global',
    signature: 'global::...',
    description: 'Access to global namespace functions.',
  },
  {
    name: 'pt',
    signature: 'pt::text(blocks) -> string',
    description: 'Extracts plain text from Portable Text blocks.',
  },
  {
    name: 'geo',
    signature: 'geo::distance(point1, point2) -> number',
    description: 'Calculates geographical distance between two points.',
  },
  {
    name: 'math',
    signature: 'math::sum(array) -> number',
    description: 'Mathematical functions namespace.',
  },
  {
    name: 'array',
    signature: 'array::unique(array) -> array',
    description: 'Array manipulation functions namespace.',
  },
  {
    name: 'string',
    signature: 'string::split(str, sep) -> array',
    description: 'String manipulation functions namespace.',
  },
  {
    name: 'sanity',
    signature: 'sanity::...',
    description: 'Sanity-specific functions namespace.',
  },
];

export const GROQ_KEYWORDS = [
  { label: 'in', description: 'Check if value is in an array or range' },
  { label: 'match', description: 'Pattern matching for text search' },
  { label: 'asc', description: 'Sort in ascending order' },
  { label: 'desc', description: 'Sort in descending order' },
  { label: 'true', description: 'Boolean true value' },
  { label: 'false', description: 'Boolean false value' },
  { label: 'null', description: 'Null value' },
];

export const GROQ_OPERATORS = [
  { label: '==', description: 'Equality comparison' },
  { label: '!=', description: 'Inequality comparison' },
  { label: '<', description: 'Less than' },
  { label: '>', description: 'Greater than' },
  { label: '<=', description: 'Less than or equal' },
  { label: '>=', description: 'Greater than or equal' },
  { label: '&&', description: 'Logical AND' },
  { label: '||', description: 'Logical OR' },
  { label: '!', description: 'Logical NOT' },
  { label: '+', description: 'Addition or string concatenation' },
  { label: '-', description: 'Subtraction' },
  { label: '*', description: 'Multiplication (or everything selector)' },
  { label: '/', description: 'Division' },
  { label: '%', description: 'Modulo' },
  { label: '**', description: 'Exponentiation' },
  { label: '|', description: 'Pipe operator' },
  { label: '->', description: 'Dereference operator' },
  { label: '=>', description: 'Arrow for select() pairs' },
  { label: '..', description: 'Exclusive range' },
  { label: '...', description: 'Inclusive range or spread' },
];

export const SPECIAL_CHARS = [
  { label: '*', description: 'Select all documents', detail: 'everything' },
  { label: '@', description: 'Current item in scope', detail: 'this' },
  { label: '^', description: 'Parent scope reference', detail: 'parent' },
];

export function getFunctionCompletions(): CompletionItem[] {
  return GROQ_FUNCTIONS.map((fn, index) => ({
    label: fn.name,
    kind: CompletionItemKind.Function,
    detail: fn.signature,
    documentation: fn.description,
    insertText: fn.parameters?.length
      ? `${fn.name}($1)`
      : `${fn.name}()`,
    insertTextFormat: 2,
    sortText: `3-${String(index).padStart(4, '0')}-${fn.name}`,
  }));
}

export function getKeywordCompletions(): CompletionItem[] {
  return GROQ_KEYWORDS.map((kw, index) => ({
    label: kw.label,
    kind: CompletionItemKind.Keyword,
    documentation: kw.description,
    sortText: `4-${String(index).padStart(4, '0')}-${kw.label}`,
  }));
}

export function getOperatorCompletions(): CompletionItem[] {
  return GROQ_OPERATORS.map((op) => ({
    label: op.label,
    kind: CompletionItemKind.Operator,
    documentation: op.description,
  }));
}

export function getSpecialCharCompletions(): CompletionItem[] {
  return SPECIAL_CHARS.map((sc) => ({
    label: sc.label,
    kind: CompletionItemKind.Constant,
    detail: sc.detail,
    documentation: sc.description,
  }));
}

export function getFilterStartCompletions(): CompletionItem[] {
  return [
    {
      label: '_type ==',
      kind: CompletionItemKind.Snippet,
      detail: 'Filter by document type',
      insertText: '_type == "$1"',
      insertTextFormat: 2,
    },
    {
      label: '_id ==',
      kind: CompletionItemKind.Snippet,
      detail: 'Filter by document ID',
      insertText: '_id == "$1"',
      insertTextFormat: 2,
    },
    {
      label: 'defined()',
      kind: CompletionItemKind.Snippet,
      detail: 'Check if field is defined',
      insertText: 'defined($1)',
      insertTextFormat: 2,
    },
    {
      label: 'references()',
      kind: CompletionItemKind.Snippet,
      detail: 'Check if document references another',
      insertText: 'references($1)',
      insertTextFormat: 2,
    },
  ];
}

export function getProjectionCompletions(): CompletionItem[] {
  return [
    {
      label: '...',
      kind: CompletionItemKind.Snippet,
      detail: 'Spread all fields',
      documentation: 'Include all fields from the document',
      sortText: '1-0000-...',
    },
    {
      label: '_id',
      kind: CompletionItemKind.Field,
      detail: 'Document ID',
      sortText: '2-0000-_id',
    },
    {
      label: '_type',
      kind: CompletionItemKind.Field,
      detail: 'Document type',
      sortText: '2-0001-_type',
    },
    {
      label: '_createdAt',
      kind: CompletionItemKind.Field,
      detail: 'Creation timestamp',
      sortText: '2-0002-_createdAt',
    },
    {
      label: '_updatedAt',
      kind: CompletionItemKind.Field,
      detail: 'Last update timestamp',
      sortText: '2-0003-_updatedAt',
    },
    {
      label: '_rev',
      kind: CompletionItemKind.Field,
      detail: 'Document revision',
      sortText: '2-0004-_rev',
    },
  ];
}

export function getPipeCompletions(): CompletionItem[] {
  return [
    {
      label: 'order()',
      kind: CompletionItemKind.Function,
      detail: 'order(field asc|desc)',
      documentation: 'Order the results by a field',
      insertText: 'order($1)',
      insertTextFormat: 2,
    },
    {
      label: 'score()',
      kind: CompletionItemKind.Function,
      detail: 'score(...terms)',
      documentation: 'Score results for relevance ranking',
      insertText: 'score($1)',
      insertTextFormat: 2,
    },
    {
      label: '[0]',
      kind: CompletionItemKind.Snippet,
      detail: 'Get first item',
      documentation: 'Select the first element',
    },
    {
      label: '[0..10]',
      kind: CompletionItemKind.Snippet,
      detail: 'Slice (exclusive end)',
      documentation: 'Get items 0-9',
      insertText: '[0..$1]',
      insertTextFormat: 2,
    },
    {
      label: '[0...10]',
      kind: CompletionItemKind.Snippet,
      detail: 'Slice (inclusive end)',
      documentation: 'Get items 0-10',
      insertText: '[0...$1]',
      insertTextFormat: 2,
    },
  ];
}

export function getAfterEverythingCompletions(): CompletionItem[] {
  return [
    {
      label: '[',
      kind: CompletionItemKind.Snippet,
      detail: 'Filter documents',
      documentation: 'Add a filter to select specific documents',
      insertText: '[$1]',
      insertTextFormat: 2,
    },
    {
      label: '{',
      kind: CompletionItemKind.Snippet,
      detail: 'Project fields',
      documentation: 'Select which fields to return',
      insertText: '{\n  $1\n}',
      insertTextFormat: 2,
    },
    {
      label: '|',
      kind: CompletionItemKind.Snippet,
      detail: 'Pipe operator',
      documentation: 'Pipe results to another operation',
    },
  ];
}
