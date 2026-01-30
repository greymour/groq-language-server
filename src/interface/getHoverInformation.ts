import type { Hover, Position, MarkupContent } from "vscode-languageserver";
import { MarkupKind } from "vscode-languageserver";
import type { SyntaxNode } from "../parser/ASTTypes";
import { nodeToRange } from "../parser/ASTTypes";
import { getNamedNodeAtPosition } from "../parser/nodeUtils";
import { toLSPRange } from "../utils/Range";
import {
  GROQ_FUNCTIONS,
  GROQ_NAMESPACED_FUNCTIONS,
  GROQ_KEYWORDS,
} from "./completionData";
import type { SchemaLoader } from "../schema/SchemaLoader";
import type { ResolvedType } from "../schema/SchemaTypes";
import { inferTypeContext } from "../schema/TypeInference";
import { FunctionRegistry } from "../schema/FunctionRegistry";
import type { ExtensionRegistry, HoverContext } from "../extensions/index";

export function getHoverInformation(
  source: string,
  root: SyntaxNode,
  position: Position,
  schemaLoader?: SchemaLoader,
  extensionRegistry?: ExtensionRegistry
): Hover | null {
  const node = getNamedNodeAtPosition(root, position);
  if (!node) return null;

  const functionRegistry = new FunctionRegistry();
  functionRegistry.extractFromAST(
    root,
    schemaLoader,
    source,
    extensionRegistry
  );

  const info = getNodeHoverInfo(
    node,
    schemaLoader,
    functionRegistry,
    extensionRegistry
  );
  if (!info) return null;

  const range = nodeToRange(node);

  return {
    contents: info,
    range: toLSPRange(range),
  };
}

function getNodeHoverInfo(
  node: SyntaxNode,
  schemaLoader?: SchemaLoader,
  functionRegistry?: FunctionRegistry,
  extensionRegistry?: ExtensionRegistry
): MarkupContent | null {
  switch (node.type) {
    case "function_call": {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        const customFuncHover = functionRegistry
          ? getCustomFunctionHover(
              nameNode.text,
              functionRegistry,
              schemaLoader,
              extensionRegistry
            )
          : null;
        if (customFuncHover) return customFuncHover;
        return getFunctionHover(nameNode.text);
      }
      return null;
    }

    case "function_definition": {
      const nameNode = node.childForFieldName("name");
      const paramList = node.children.find((c) => c.type === "parameter_list");
      const bodyNode = node.childForFieldName("body");

      const funcName = nameNode?.text ?? "unknown";
      const params =
        paramList?.children
          .filter((c) => c.type === "variable")
          .map((c) => c.text)
          .join(", ") ?? "";
      const bodyPreview = bodyNode?.text?.slice(0, 50) ?? "";

      return createMarkdown(
        `**Function Definition**\n\n\`\`\`groq\nfn ${funcName}(${params}) = ${bodyPreview}${bodyPreview.length >= 50 ? "..." : ""}\n\`\`\`\n\nA custom GROQ function definition.`
      );
    }

    case "namespaced_identifier": {
      const fullName = node.text;
      if (node.parent?.type === "function_call") {
        const customFuncHover = functionRegistry
          ? getCustomFunctionHover(
              fullName,
              functionRegistry,
              schemaLoader,
              extensionRegistry
            )
          : null;
        if (customFuncHover) return customFuncHover;
        return getFunctionHover(fullName);
      }
      if (node.parent?.type === "function_definition") {
        const customFuncHover = functionRegistry
          ? getCustomFunctionHover(
              fullName,
              functionRegistry,
              schemaLoader,
              extensionRegistry
            )
          : null;
        if (customFuncHover) return customFuncHover;
        return createMarkdown(
          `**\`${fullName}\`** - Custom function name\n\nNamespaced identifier for a user-defined function.`
        );
      }
      return createMarkdown(`**\`${fullName}\`** - Namespaced identifier`);
    }

    case "identifier": {
      if (node.parent?.type === "function_call") {
        const nameField = node.parent.childForFieldName("name");
        if (nameField === node) {
          const customFuncHover = functionRegistry
            ? getCustomFunctionHover(
                node.text,
                functionRegistry,
                schemaLoader,
                extensionRegistry
              )
            : null;
          if (customFuncHover) return customFuncHover;
          return getFunctionHover(node.text);
        }
      }
      if (node.parent?.type === "namespaced_identifier") {
        const grandparent = node.parent.parent;
        if (grandparent?.type === "function_call") {
          const customFuncHover = functionRegistry
            ? getCustomFunctionHover(
                node.parent.text,
                functionRegistry,
                schemaLoader,
                extensionRegistry
              )
            : null;
          if (customFuncHover) return customFuncHover;
          return getFunctionHover(node.parent.text);
        }
        if (grandparent?.type === "function_definition") {
          const customFuncHover = functionRegistry
            ? getCustomFunctionHover(
                node.parent.text,
                functionRegistry,
                schemaLoader,
                extensionRegistry
              )
            : null;
          if (customFuncHover) return customFuncHover;
          return createMarkdown(
            `**\`${node.parent.text}\`** - Custom function name\n\nNamespaced identifier for a user-defined function.`
          );
        }
        return null;
      }
      if (node.parent?.type === "function_definition") {
        const nameField = node.parent.childForFieldName("name");
        if (nameField === node) {
          const customFuncHover = functionRegistry
            ? getCustomFunctionHover(
                node.text,
                functionRegistry,
                schemaLoader,
                extensionRegistry
              )
            : null;
          if (customFuncHover) return customFuncHover;
          const funcDef = node.parent;
          const paramList = funcDef.children.find(
            (c) => c.type === "parameter_list"
          );
          const bodyNode = funcDef.childForFieldName("body");
          const params =
            paramList?.children
              .filter((c) => c.type === "variable")
              .map((c) => c.text)
              .join(", ") ?? "";
          const bodyPreview = bodyNode?.text?.slice(0, 50) ?? "";
          return createMarkdown(
            `**Function Definition**\n\n\`\`\`groq\nfn ${node.text}(${params}) = ${bodyPreview}${bodyPreview.length >= 50 ? "..." : ""}\n\`\`\`\n\nA custom GROQ function definition.`
          );
        }
      }
      return getIdentifierHover(node, schemaLoader);
    }

    case "everything":
      return createMarkdown(
        '**`*`** - Everything selector\n\nSelects all documents in the dataset.\n\n```groq\n*[_type == "post"]\n```'
      );

    case "this":
      return createMarkdown(
        '**`@`** - Current item\n\nReferences the current item in the iteration scope.\n\n```groq\n*[_type == "post"]{ "title": @.title }\n```'
      );

    case "parent":
      return createMarkdown(
        '**`^`** - Parent scope\n\nReferences the parent scope in nested queries.\n\n```groq\n*[_type == "author"]{ "posts": *[_type == "post" && author._ref == ^._id] }\n```'
      );

    case "variable": {
      const containingFunc = functionRegistry?.isInsideFunctionBody(node);
      if (containingFunc) {
        const param = containingFunc.parameters.find(
          (p) => p.name === node.text
        );
        if (param) {
          let markdown = `**\`${node.text}\`** - Function parameter`;

          if (param.declaredType) {
            const arrayIndicator = param.declaredTypeIsArray ? "[]" : "";
            markdown += `\n\n**Type:** \`${param.declaredType}${arrayIndicator}\``;

            if (schemaLoader?.isLoaded()) {
              const schemaType = schemaLoader.getType(param.declaredType);
              if (schemaType) {
                markdown += formatSchemaTypeFields(
                  schemaType,
                  param.declaredTypeIsArray
                );
              }
            }
          } else if (param.inferredTypes.size > 0) {
            const types = Array.from(param.inferredTypes).join(" | ");
            markdown += `\n\n**Type:** \`${types}\` *(inferred)*`;
          }

          if (extensionRegistry && schemaLoader) {
            const hoverContext: HoverContext = {
              text: node.text,
              functionDef: containingFunc,
              parameter: param,
              schemaLoader,
            };
            const hooks = extensionRegistry.getHook("getHoverContent");
            for (const { hook } of hooks) {
              const extra = hook(hoverContext);
              if (extra && !markdown.includes(extra)) {
                markdown += `\n\n${extra}`;
              }
            }
          }

          return createMarkdown(markdown);
        }
      }
      return createMarkdown(
        `**\`${node.text}\`** - Query parameter\n\nA variable passed into the query at execution time.`
      );
    }

    case "pipe_expression":
      return createMarkdown(
        '**`|`** - Pipe operator\n\nPasses the result of the left expression to the right expression.\n\n```groq\n*[_type == "post"] | order(_createdAt desc)\n```'
      );

    case "dereference_expression":
      return createMarkdown(
        '**`->`** - Dereference operator\n\nFollows a reference to fetch the referenced document.\n\n```groq\n*[_type == "post"]{ author-> }\n```'
      );

    case "spread":
      return createMarkdown(
        '**`...`** - Spread operator\n\nIncludes all fields from the current document in a projection.\n\n```groq\n*[_type == "post"]{ ..., "authorName": author->name }\n```'
      );

    case "subscript_expression": {
      const indexField = node.childForFieldName("index");
      const operatorField = node.childForFieldName("operator");
      if (operatorField) {
        if (operatorField.text === "..") {
          return createMarkdown(
            '**`..`** - Exclusive slice\n\nSelects a range of elements, excluding the end index.\n\n```groq\n*[_type == "post"][0..10] // Gets items 0-9\n```'
          );
        }
        if (operatorField.text === "...") {
          return createMarkdown(
            '**`...`** - Inclusive slice\n\nSelects a range of elements, including the end index.\n\n```groq\n*[_type == "post"][0...10] // Gets items 0-10\n```'
          );
        }
      }
      if (!indexField && !operatorField) {
        return createMarkdown(
          '**Filter expression**\n\nFilters documents based on the condition inside brackets.\n\n```groq\n*[_type == "post" && published == true]\n```'
        );
      }
      return null;
    }

    case "projection":
    case "projection_expression":
      return createMarkdown(
        '**Projection**\n\nSelects which fields to return from documents.\n\n```groq\n*[_type == "post"]{\n  title,\n  "author": author->name,\n  _createdAt\n}\n```'
      );

    case "asc_expression":
      return createMarkdown(
        '**`asc`** - Ascending order\n\nSorts results in ascending order (A-Z, 0-9, oldest first).\n\n```groq\n*[_type == "post"] | order(_createdAt asc)\n```'
      );

    case "desc_expression":
      return createMarkdown(
        '**`desc`** - Descending order\n\nSorts results in descending order (Z-A, 9-0, newest first).\n\n```groq\n*[_type == "post"] | order(_createdAt desc)\n```'
      );

    case "in_expression":
      return createMarkdown(
        '**`in`** - Membership check\n\nChecks if a value exists in an array or range.\n\n```groq\n*[_type in ["post", "article"]]\n```'
      );

    case "match_expression":
      return createMarkdown(
        '**`match`** - Text search\n\nPerforms a full-text search match.\n\n```groq\n*[title match "hello*"]\n```'
      );

    case "pair":
      return createMarkdown(
        '**`=>`** - Conditional pair\n\nUsed in `select()` to map conditions to values.\n\n```groq\nselect(\n  _type == "post" => "Post",\n  _type == "page" => "Page"\n)\n```'
      );

    case "null":
      return createMarkdown(
        "**`null`** - Null value\n\nRepresents the absence of a value."
      );

    case "true":
      return createMarkdown("**`true`** - Boolean true");

    case "false":
      return createMarkdown("**`false`** - Boolean false");

    case "number":
      return createMarkdown(`**Number**: \`${node.text}\``);

    case "string":
      return createMarkdown(`**String**: \`${node.text}\``);

    default:
      return null;
  }
}

function getFunctionHover(name: string): MarkupContent | null {
  const fn =
    GROQ_FUNCTIONS.find((f) => f.name === name) ??
    GROQ_NAMESPACED_FUNCTIONS.find((f) => f.name === name);
  if (!fn) return null;

  let markdown = `**${fn.name}**\n\n\`\`\`groq\n${fn.signature}\n\`\`\`\n\n${fn.description}`;

  if (fn.parameters && fn.parameters.length > 0) {
    markdown += `\n\n**Parameters:**\n${fn.parameters.map((p) => `- \`${p}\``).join("\n")}`;
  }

  return createMarkdown(markdown);
}

function getCustomFunctionHover(
  name: string,
  functionRegistry: FunctionRegistry,
  schemaLoader?: SchemaLoader,
  extensionRegistry?: ExtensionRegistry
): MarkupContent | null {
  const funcDef = functionRegistry.getDefinition(name);
  if (!funcDef) return null;

  const getTypeString = (p: {
    declaredType: string | null;
    inferredTypes: Set<string>;
  }) => {
    if (p.declaredType) return p.declaredType;
    const types = Array.from(p.inferredTypes);
    return types.length > 0 ? types.join(" | ") : "unknown";
  };

  const paramSignatures = funcDef.parameters.map(
    (p) => `${p.name}: ${getTypeString(p)}`
  );

  const bodyPreview = funcDef.bodyNode.text.slice(0, 80);
  const bodyTruncated = bodyPreview.length >= 80 ? "..." : "";

  let markdown = `**${funcDef.name}** - Custom function\n\n`;
  markdown += `\`\`\`groq\nfn ${funcDef.name}(${paramSignatures.join(", ")}) = ${bodyPreview}${bodyTruncated}\n\`\`\`\n\n`;
  markdown += `A custom GROQ function defined in this document.`;

  if (funcDef.parameters.length > 0) {
    markdown += `\n\n**Parameters:**\n`;
    markdown += funcDef.parameters
      .map((p) => {
        const typeStr = getTypeString(p);
        const source = p.declaredType
          ? "*(from @param annotation)*"
          : "*(inferred)*";
        return `- \`${p.name}\`: ${typeStr} ${source}`;
      })
      .join("\n");
  }

  if (extensionRegistry && schemaLoader) {
    const hoverContext: HoverContext = {
      text: name,
      functionDef: funcDef,
      parameter: null,
      schemaLoader,
    };
    const hooks = extensionRegistry.getHook("getHoverContent");
    for (const { hook } of hooks) {
      const extra = hook(hoverContext);
      if (extra) {
        markdown += `\n\n${extra}`;
      }
    }
  }

  return createMarkdown(markdown);
}

function getIdentifierHover(
  node: SyntaxNode,
  schemaLoader?: SchemaLoader
): MarkupContent | null {
  const text = node.text;

  if (schemaLoader?.isLoaded()) {
    const schemaHover = getSchemaFieldHover(node, text, schemaLoader);
    if (schemaHover) return schemaHover;
  }

  const keyword = GROQ_KEYWORDS.find((k) => k.label === text);
  if (keyword) {
    return createMarkdown(
      `**\`${text}\`** - Keyword\n\n${keyword.description}`
    );
  }

  if (text.startsWith("_")) {
    const builtins: Record<string, string> = {
      _id: "Unique document identifier",
      _type: "Document type name",
      _createdAt: "Document creation timestamp",
      _updatedAt: "Document last update timestamp",
      _rev: "Document revision ID",
    };
    if (builtins[text]) {
      return createMarkdown(
        `**\`${text}\`** - Built-in field\n\n${builtins[text]}`
      );
    }
  }

  return getContextualIdentifierHover(node, text);
}

function getContextualIdentifierHover(
  node: SyntaxNode,
  text: string
): MarkupContent | null {
  const parent = node.parent;

  if (parent?.type === "subscript_expression") {
    const baseField = parent.childForFieldName("base");
    if (baseField === node) {
      return createMarkdown(
        `**\`${text}\`** - Field access\n\nAccesses the \`${text}\` field, followed by array filter/slice.`
      );
    }
  }

  if (parent?.type === "access_expression") {
    return createMarkdown(
      `**\`${text}\`** - Field access\n\nAccesses the \`${text}\` field from the current scope.`
    );
  }

  if (parent?.type === "dereference_expression") {
    return createMarkdown(
      `**\`${text}\`** - Reference field\n\nAccesses the \`${text}\` reference field for dereferencing.`
    );
  }

  if (
    parent?.type === "projection" ||
    parent?.type === "projection_expression"
  ) {
    return createMarkdown(
      `**\`${text}\`** - Projection field\n\nIncludes the \`${text}\` field in the projection output.`
    );
  }

  if (parent?.type === "pair") {
    const keyField = parent.childForFieldName("key");
    if (keyField === node) {
      return createMarkdown(
        `**\`${text}\`** - Projection alias\n\nDefines \`${text}\` as an alias for the computed value.`
      );
    }
  }

  return createMarkdown(
    `**\`${text}\`** - Field\n\nField identifier in the query.`
  );
}

function getSchemaFieldHover(
  node: SyntaxNode,
  fieldName: string,
  schemaLoader: SchemaLoader
): MarkupContent | null {
  const context = inferTypeContext(node, schemaLoader);

  if (context.type) {
    const field = schemaLoader.getField(context.type.name, fieldName);
    if (field) {
      return formatSchemaFieldHover(field, context.type.name);
    }
  }

  for (const typeName of context.documentTypes) {
    const field = schemaLoader.getField(typeName, fieldName);
    if (field) {
      return formatSchemaFieldHover(field, typeName);
    }
  }

  return null;
}

function formatSchemaFieldHover(
  field: {
    name: string;
    type: string;
    isReference: boolean;
    referenceTargets?: string[];
    isArray: boolean;
    arrayOf?: string[];
    description?: string;
  },
  typeName: string
): MarkupContent {
  let typeDisplay = field.type;

  if (field.isReference && field.referenceTargets?.length) {
    typeDisplay = `reference → ${field.referenceTargets.join(" | ")}`;
  } else if (field.isArray && field.arrayOf?.length) {
    typeDisplay = `array<${field.arrayOf.join(" | ")}>`;
  }

  let markdown = `**\`${field.name}\`** - Schema field\n\n`;
  markdown += `**Type:** \`${typeDisplay}\`\n\n`;
  markdown += `**Document:** \`${typeName}\``;

  if (field.description) {
    markdown += `\n\n${field.description}`;
  }

  return createMarkdown(markdown);
}

function formatSchemaTypeFields(
  schemaType: ResolvedType,
  isArray: boolean
): string {
  const fields = Array.from(schemaType.fields.values());
  if (fields.length === 0) return "";

  let result = isArray
    ? `\n\n*(array of \`${schemaType.name}\` documents)*`
    : "";

  result += "\n\n**Fields:**\n";

  const formatFieldType = (field: {
    type: string;
    isReference: boolean;
    referenceTargets?: string[];
    isArray: boolean;
    arrayOf?: string[];
  }) => {
    if (field.isReference && field.referenceTargets?.length) {
      return `reference → ${field.referenceTargets.join(" | ")}`;
    }
    if (field.isArray && field.arrayOf?.length) {
      return `${field.arrayOf.join(" | ")}[]`;
    }
    return field.type;
  };

  result += fields
    .slice(0, 10)
    .map((f) => `- \`${f.name}\`: ${formatFieldType(f)}`)
    .join("\n");

  if (fields.length > 10) {
    result += `\n- *...and ${fields.length - 10} more fields*`;
  }

  return result;
}

function createMarkdown(content: string): MarkupContent {
  return {
    kind: MarkupKind.Markdown,
    value: content,
  };
}
