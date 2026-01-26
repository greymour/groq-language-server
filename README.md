# GROQ Language Server

A Language Server Protocol (LSP) implementation for [GROQ](https://www.sanity.io/docs/groq), the query language used by [Sanity.io](https://www.sanity.io/).

## Features
- Syntax error diagnostics
- Autocomplete suggestions for GROQ keywords and functions
- Schema-aware completions (when configured)
- Hover information
- Document symbols/outline
- Go to definition (for variables defined within queries)
- Support for embedded GROQ in JavaScript/TypeScript files (`groq\`...\``, `/* groq */`)

## Installation

### From Source

```bash
git clone https://github.com/greymour/groq-language-server.git
cd groq-language-server
npm install
npm run build
```

To make the language server available globally:

```bash
npm link
```

This adds `groq-language-server` to your PATH.

## Editor Setup

### Neovim

The repository includes a Neovim plugin in `editors/nvim/`.

#### Using lazy.nvim

```lua
{
  "greymour/groq-language-server",
  ft = { "groq", "typescript", "typescriptreact", "javascript", "javascriptreact" },
  config = function()
    require("groq-lsp").setup({
      -- Options (all optional)
      cmd = { "groq-language-server", "--stdio" },
      filetypes = { "groq", "typescript", "typescriptreact", "javascript", "javascriptreact" },
      auto_start = true,
    })
  end,
}
```

#### Using packer.nvim

```lua
use {
  "greymour/groq-language-server",
  config = function()
    require("groq-lsp").setup()
  end,
}
```

**Note:** Plugin managers only install the Lua files. You must also build and link the language server binary:

```bash
cd ~/.local/share/nvim/lazy/groq-language-server  # or your plugin directory
npm install && npm run build && npm link
```

#### Manual Installation

1. Add the plugin path to your runtimepath:

```lua
vim.opt.runtimepath:append("/path/to/groq-language-server/editors/nvim")
```

2. Configure the plugin:

```lua
require("groq-lsp").setup()
```

#### Neovim Commands

| Command | Description |
|---------|-------------|
| `:GroqLspStart` | Start the language server |
| `:GroqLspStop` | Stop the language server |
| `:GroqLspRestart` | Restart the language server |

#### Neovim Configuration Options

```lua
require("groq-lsp").setup({
  -- Command to start the language server
  cmd = { "groq-language-server", "--stdio" },

  -- File types that trigger the LSP
  filetypes = { "groq", "typescript", "typescriptreact", "javascript", "javascriptreact" },

  -- Patterns to find project root
  root_patterns = { "sanity.config.ts", "sanity.config.js", "sanity.json", "package.json" },

  -- Automatically start LSP when opening matching files
  auto_start = true,

  -- Path to schema file (relative to project root)
  schema_path = "schema.json",

  -- LSP settings
  settings = {
    groq = {
      schema = {
        enabled = true,
      },
      extensions = {
        -- Enable @param {type} $name syntax for typing function parameters
        paramTypeAnnotations = false,
      },
      schemaValidation = {
        enabled = true,           -- Enable schema validation
        maxDepth = 50,            -- Maximum nesting depth
        maxTypes = 10000,         -- Maximum number of types
        maxFieldsPerType = 1000,  -- Maximum fields per type
        cacheValidation = true,   -- Cache validation results
      },
    },
  },
})
```

### VSCode / Cursor

#### Building the Extension

From the repository root:

```bash
cd editors/vscode
npm install
npm run build
npm run package
```

This creates a `.vsix` file you can install. The build process automatically installs and builds the language server dependencies.

#### Installing the Extension

The easiest way to build and install (or update) the extension is using the install script:

```bash
./scripts/install-extension.sh vscode  # For Visual Studio Code
./scripts/install-extension.sh cursor  # For Cursor
```

This script builds, packages, and installs the extension in one step.

Alternatively, you can install manually:

1. Open VSCode/Cursor
2. Press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux)
3. Type "Install from VSIX"
4. Select the generated `.vsix` file from `editors/vscode/`

Or from the command line:

```bash
code --install-extension editors/vscode/groq-vscode-0.1.0.vsix
cursor --install-extension editors/vscode/groq-vscode-0.1.0.vsix
```

#### VSCode Configuration

Add to your `settings.json`:

```json
{
  "groq.schemaPath": "./path/to/schema.json"
}
```

| Setting | Description | Default |
|---------|-------------|---------|
| `groq.schemaPath` | Path to Sanity schema JSON file for schema-aware completions | `""` |
| `groq.extensions.paramTypeAnnotations` | Enable `@param {type} $name` syntax for typing function parameters | `false` |
| `groq.schema.validation.enabled` | Enable schema validation before processing | `true` |
| `groq.schema.validation.maxDepth` | Maximum nesting depth allowed in schema files | `50` |
| `groq.schema.validation.maxTypes` | Maximum number of types allowed in a schema | `10000` |
| `groq.schema.validation.maxFieldsPerType` | Maximum fields allowed per type | `1000` |
| `groq.schema.validation.cacheValidation` | Cache validation results for faster startup | `true` |
| `groq.trace.server` | Traces communication between VSCode and the language server (`off`, `messages`, `verbose`) | `"off"` |

## Supported File Types

- `.groq` files
- JavaScript/TypeScript files containing GROQ queries:
  - Tagged template literals: `` groq`*[_type == "post"]` ``
  - With comment annotation: `` /* groq */ `*[_type == "post"]` ``
  - Using defineQuery: `` defineQuery(`*[_type == "post"]`) ``

## Extensions and non-standard GROQ features
This language server includes support for some features that are not part of the GROQ spec, which can be enabled on an opt-in basis.

### Parameter Type Annotations

When enabled via `extensions.paramTypeAnnotations`, you can annotate function parameters with schema types using JSDoc-style comments:

```groq
// @param {post} $doc
// @param {author} $author
fn getAuthorName($doc, $author) = $doc.author->name + " by " + $author.name
```

This provides:
- Type-aware completions inside function bodies (e.g., `$doc.` suggests fields from the `post` type)
- Diagnostics for unknown types referenced in annotations
- Hover information showing the declared type

## Schema Validation & Security

The language server validates schema files before processing to protect against malformed or malicious schemas that could cause performance issues.

### Validation Checks

| Check | Description | Default Limit |
|-------|-------------|---------------|
| Depth limit | Prevents stack exhaustion from deeply nested objects | 50 levels |
| Type count | Limits the number of types in a schema | 10,000 types |
| Fields per type | Limits fields per type definition | 1,000 fields |
| Structure validation | Ensures schema matches expected Sanity or GROQ type format | - |

### Validation Cache

To improve startup performance, validation results are cached in a `.{schema-name}.groq-cache` file alongside your schema. The cache is automatically invalidated when:

- The schema file content changes (detected via SHA-256 hash)
- The validation configuration changes (maxDepth, maxTypes, maxFieldsPerType)
- The cache format version is incompatible

You can disable caching by setting `schema.validation.cacheValidation` to `false`.

### Disabling Validation

If you need to load schemas that exceed the default limits, you can either:

1. Increase the limits in your editor configuration
2. Disable validation entirely by setting `schema.validation.enabled` to `false`

## Development

### Building

```bash
npm run build          # Build the language server
npm run build:vscode   # Build the VSCode extension
npm run build:nvim     # Build the Neovim plugin (no-op, just Lua files)
```

### Testing

```bash
npm test               # Run tests
npm run test:watch     # Run tests in watch mode
```

### Project Structure

```
groq-language-server/
├── src/                    # Language server source code
│   ├── server/             # LSP server implementation
│   ├── parser/             # GROQ parsing (tree-sitter)
│   ├── interface/          # LSP features (completions, hover, etc.)
│   ├── schema/             # Schema loading and type inference
│   └── embedded/           # Embedded GROQ detection in JS/TS
├── editors/
│   ├── nvim/               # Neovim plugin
│   └── vscode/             # VSCode extension
├── bin/                    # CLI entry point
└── test/                   # Test suite
```

## License

MIT
