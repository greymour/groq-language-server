import { CompletionItemKind, InsertTextFormat } from "vscode-languageserver";
import type { CompletionItem } from "vscode-languageserver";

export interface FunctionSignature {
  name: string;
  signature: string;
  description: string;
  parameters?: string[];
}

export const GROQ_FUNCTIONS: FunctionSignature[] = [
  {
    name: "count",
    signature: "count(array) -> number",
    description: "Returns the number of elements in an array.",
    parameters: ["array"],
  },
  {
    name: "defined",
    signature: "defined(value) -> boolean",
    description: "Returns true if the value is not null.",
    parameters: ["value"],
  },
  {
    name: "length",
    signature: "length(string) -> number",
    description: "Returns the length of a string.",
    parameters: ["string"],
  },
  {
    name: "references",
    signature: "references(id) -> boolean",
    description:
      "Returns true if the document contains a reference to the given ID.",
    parameters: ["id"],
  },
  {
    name: "coalesce",
    signature: "coalesce(...values) -> any",
    description: "Returns the first non-null value from the arguments.",
    parameters: ["...values"],
  },
  {
    name: "select",
    signature: "select(condition => value, ...) -> any",
    description: "Returns the value for the first matching condition.",
    parameters: ["condition => value", "..."],
  },
  {
    name: "order",
    signature: "order(field asc|desc, ...) -> array",
    description: "Orders the result set by the specified fields.",
    parameters: ["field asc|desc"],
  },
  {
    name: "score",
    signature: "score(terms, ...) -> number",
    description: "Calculates a relevance score based on the given terms.",
    parameters: ["...terms"],
  },
  {
    name: "boost",
    signature: "boost(condition, weight) -> number",
    description: "Boosts the score when the condition is true.",
    parameters: ["condition", "weight"],
  },
  {
    name: "now",
    signature: "now() -> datetime",
    description: "Returns the current date and time.",
    parameters: [],
  },
  {
    name: "identity",
    signature: "identity() -> string",
    description: "Returns the ID of the current user.",
    parameters: [],
  },
  {
    name: "lower",
    signature: "lower(string) -> string",
    description: "Converts a string to lowercase.",
    parameters: ["string"],
  },
  {
    name: "upper",
    signature: "upper(string) -> string",
    description: "Converts a string to uppercase.",
    parameters: ["string"],
  },
  {
    name: "round",
    signature: "round(number, precision?) -> number",
    description: "Rounds a number to the specified precision.",
    parameters: ["number", "precision?"],
  },
  {
    name: "string",
    signature: "string(value) -> string",
    description: "Converts a value to a string.",
    parameters: ["value"],
  },
  {
    name: "dateTime",
    signature: "dateTime(string) -> datetime",
    description: "Parses a string into a datetime.",
    parameters: ["string"],
  },
  {
    name: "path",
    signature: "path(string) -> path",
    description: "Creates a path from a string for matching.",
    parameters: ["string"],
  },
];

export const GROQ_NAMESPACED_FUNCTIONS: FunctionSignature[] = [
  // geo:: namespace
  {
    name: "geo::contains",
    signature: "geo::contains(geo1, geo2) -> boolean",
    description:
      "Returns true if the second argument is fully contained within the first.",
    parameters: ["geo1", "geo2"],
  },
  {
    name: "geo::distance",
    signature: "geo::distance(point1, point2) -> number",
    description:
      "Calculates the distance in meters between two geographic points.",
    parameters: ["point1", "point2"],
  },
  {
    name: "geo::intersects",
    signature: "geo::intersects(geo1, geo2) -> boolean",
    description: "Returns true if the two geographic shapes intersect.",
    parameters: ["geo1", "geo2"],
  },
  {
    name: "geo::latLng",
    signature: "geo::latLng(lat, lng) -> geopoint",
    description: "Creates a geopoint from latitude and longitude values.",
    parameters: ["lat", "lng"],
  },
  // pt:: namespace (Portable Text)
  {
    name: "pt::text",
    signature: "pt::text(blocks) -> string",
    description: "Extracts plain text from Portable Text blocks.",
    parameters: ["blocks"],
  },
  // math:: namespace
  {
    name: "math::avg",
    signature: "math::avg(array) -> number",
    description: "Calculates the average of numeric values in an array.",
    parameters: ["array"],
  },
  {
    name: "math::max",
    signature: "math::max(array) -> number",
    description: "Returns the maximum value from an array of numbers.",
    parameters: ["array"],
  },
  {
    name: "math::min",
    signature: "math::min(array) -> number",
    description: "Returns the minimum value from an array of numbers.",
    parameters: ["array"],
  },
  {
    name: "math::sum",
    signature: "math::sum(array) -> number",
    description: "Calculates the sum of numeric values in an array.",
    parameters: ["array"],
  },
  // array:: namespace
  {
    name: "array::compact",
    signature: "array::compact(array) -> array",
    description: "Removes null values from an array.",
    parameters: ["array"],
  },
  {
    name: "array::intersects",
    signature: "array::intersects(array1, array2) -> boolean",
    description: "Returns true if the two arrays have any common elements.",
    parameters: ["array1", "array2"],
  },
  {
    name: "array::join",
    signature: "array::join(array, separator) -> string",
    description: "Joins array elements into a string with the given separator.",
    parameters: ["array", "separator"],
  },
  {
    name: "array::unique",
    signature: "array::unique(array) -> array",
    description: "Returns an array with duplicate values removed.",
    parameters: ["array"],
  },
  // string:: namespace
  {
    name: "string::split",
    signature: "string::split(str, separator) -> array",
    description: "Splits a string into an array using the given separator.",
    parameters: ["str", "separator"],
  },
  {
    name: "string::startsWith",
    signature: "string::startsWith(str, prefix) -> boolean",
    description: "Returns true if the string starts with the given prefix.",
    parameters: ["str", "prefix"],
  },
  // global:: namespace
  {
    name: "global::references",
    signature: "global::references(id) -> boolean",
    description:
      "Checks if any document in the dataset references the given ID.",
    parameters: ["id"],
  },
  // sanity:: namespace
  {
    name: "sanity::dataset",
    signature: "sanity::dataset() -> string",
    description: "Returns the name of the current dataset.",
    parameters: [],
  },
  {
    name: "sanity::projectId",
    signature: "sanity::projectId() -> string",
    description: "Returns the ID of the current Sanity project.",
    parameters: [],
  },
  {
    name: "sanity::partOfRelease",
    signature: "sanity::partOfRelease(releaseId) -> boolean",
    description:
      "Returns true if the document is part of the specified release.",
    parameters: ["releaseId"],
  },
  {
    name: "sanity::versionOf",
    signature: "sanity::versionOf(documentId) -> boolean",
    description:
      "Returns true if the document is a version of the specified document.",
    parameters: ["documentId"],
  },
];

export const GROQ_KEYWORDS = [
  { label: "fn", description: "Define a custom function" },
  { label: "in", description: "Check if value is in an array or range" },
  { label: "match", description: "Pattern matching for text search" },
  { label: "asc", description: "Sort in ascending order" },
  { label: "desc", description: "Sort in descending order" },
  { label: "true", description: "Boolean true value" },
  { label: "false", description: "Boolean false value" },
  { label: "null", description: "Null value" },
];

export const GROQ_OPERATORS = [
  { label: "==", description: "Equality comparison" },
  { label: "!=", description: "Inequality comparison" },
  { label: "<", description: "Less than" },
  { label: ">", description: "Greater than" },
  { label: "<=", description: "Less than or equal" },
  { label: ">=", description: "Greater than or equal" },
  { label: "&&", description: "Logical AND" },
  { label: "||", description: "Logical OR" },
  { label: "!", description: "Logical NOT" },
  { label: "+", description: "Addition or string concatenation" },
  { label: "-", description: "Subtraction" },
  { label: "*", description: "Multiplication (or everything selector)" },
  { label: "/", description: "Division" },
  { label: "%", description: "Modulo" },
  { label: "**", description: "Exponentiation" },
  { label: "|", description: "Pipe operator" },
  { label: "->", description: "Dereference operator" },
  { label: "=>", description: "Arrow for select() pairs" },
  { label: "..", description: "Exclusive range" },
  { label: "...", description: "Inclusive range or spread" },
];

export const SPECIAL_CHARS = [
  { label: "*", description: "Select all documents", detail: "everything" },
  { label: "@", description: "Current item in scope", detail: "this" },
  { label: "^", description: "Parent scope reference", detail: "parent" },
];

export function getFunctionCompletions(): CompletionItem[] {
  const basicFunctions = GROQ_FUNCTIONS.map((fn, index) => ({
    label: fn.name,
    kind: CompletionItemKind.Function,
    detail: fn.signature,
    documentation: fn.description,
    insertText: fn.parameters?.length ? `${fn.name}($1)` : `${fn.name}()`,
    insertTextFormat: InsertTextFormat.Snippet,
    sortText: `3-${String(index).padStart(4, "0")}-${fn.name}`,
  }));

  const namespacedFunctions = GROQ_NAMESPACED_FUNCTIONS.map((fn, index) => ({
    label: fn.name,
    kind: CompletionItemKind.Function,
    detail: fn.signature,
    documentation: fn.description,
    insertText: fn.parameters?.length ? `${fn.name}($1)` : `${fn.name}()`,
    insertTextFormat: InsertTextFormat.Snippet,
    sortText: `3-${String(index + GROQ_FUNCTIONS.length).padStart(4, "0")}-${fn.name}`,
  }));

  return [...basicFunctions, ...namespacedFunctions];
}

export function getKeywordCompletions(): CompletionItem[] {
  return GROQ_KEYWORDS.map((kw, index) => ({
    label: kw.label,
    kind: CompletionItemKind.Keyword,
    documentation: kw.description,
    sortText: `4-${String(index).padStart(4, "0")}-${kw.label}`,
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
      label: "_type ==",
      kind: CompletionItemKind.Snippet,
      detail: "Filter by document type",
      insertText: '_type == "$1"',
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "_id ==",
      kind: CompletionItemKind.Snippet,
      detail: "Filter by document ID",
      insertText: '_id == "$1"',
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "defined()",
      kind: CompletionItemKind.Snippet,
      detail: "Check if field is defined",
      insertText: "defined($1)",
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "references()",
      kind: CompletionItemKind.Snippet,
      detail: "Check if document references another",
      insertText: "references($1)",
      insertTextFormat: InsertTextFormat.Snippet,
    },
  ];
}

export function getProjectionCompletions(): CompletionItem[] {
  return [
    {
      label: "...",
      kind: CompletionItemKind.Snippet,
      detail: "Spread all fields",
      documentation: "Include all fields from the document",
      sortText: "1-0000-...",
    },
    {
      label: "_id",
      kind: CompletionItemKind.Field,
      detail: "Document ID",
      sortText: "2-0000-_id",
    },
    {
      label: "_type",
      kind: CompletionItemKind.Field,
      detail: "Document type",
      sortText: "2-0001-_type",
    },
    {
      label: "_createdAt",
      kind: CompletionItemKind.Field,
      detail: "Creation timestamp",
      sortText: "2-0002-_createdAt",
    },
    {
      label: "_updatedAt",
      kind: CompletionItemKind.Field,
      detail: "Last update timestamp",
      sortText: "2-0003-_updatedAt",
    },
    {
      label: "_rev",
      kind: CompletionItemKind.Field,
      detail: "Document revision",
      sortText: "2-0004-_rev",
    },
  ];
}

export function getPipeCompletions(): CompletionItem[] {
  return [
    {
      label: "order()",
      kind: CompletionItemKind.Function,
      detail: "order(field asc|desc)",
      documentation: "Order the results by a field",
      insertText: "order($1)",
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "score()",
      kind: CompletionItemKind.Function,
      detail: "score(...terms)",
      documentation: "Score results for relevance ranking",
      insertText: "score($1)",
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "[0]",
      kind: CompletionItemKind.Snippet,
      detail: "Get first item",
      documentation: "Select the first element",
    },
    {
      label: "[0..10]",
      kind: CompletionItemKind.Snippet,
      detail: "Slice (exclusive end)",
      documentation: "Get items 0-9",
      insertText: "[0..$1]",
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "[0...10]",
      kind: CompletionItemKind.Snippet,
      detail: "Slice (inclusive end)",
      documentation: "Get items 0-10",
      insertText: "[0...$1]",
      insertTextFormat: InsertTextFormat.Snippet,
    },
  ];
}

export function getAfterEverythingCompletions(): CompletionItem[] {
  return [
    {
      label: "[",
      kind: CompletionItemKind.Snippet,
      detail: "Filter documents",
      documentation: "Add a filter to select specific documents",
      insertText: "[$1]",
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "{",
      kind: CompletionItemKind.Snippet,
      detail: "Project fields",
      documentation: "Select which fields to return",
      insertText: "{\n  $1\n}",
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "|",
      kind: CompletionItemKind.Snippet,
      detail: "Pipe operator",
      documentation: "Pipe results to another operation",
    },
  ];
}
