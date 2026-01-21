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

  -- LSP settings
  settings = {
    groq = {
      schema = {
        enabled = true,
      },
    },
  },
})
```

### VSCode / Cursor

#### Building the Extension

```bash
cd editors/vscode
npm install
npm run build
npm run package
```

This creates a `.vsix` file you can install.

#### Installing the Extension

1. Open VSCode/Cursor
2. Press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux)
3. Type "Install from VSIX"
4. Select the generated `.vsix` file from `editors/vscode/`

Or from the command line:

```bash
code --install-extension editors/vscode/groq-vscode-0.1.0.vsix
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
| `groq.trace.server` | Traces communication between VSCode and the language server (`off`, `messages`, `verbose`) | `"off"` |

## Supported File Types

- `.groq` files
- JavaScript/TypeScript files containing GROQ queries:
  - Tagged template literals: `` groq`*[_type == "post"]` ``
  - With comment annotation: `` /* groq */ `*[_type == "post"]` ``
  - Using defineQuery: `` defineQuery(`*[_type == "post"]`) ``

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
