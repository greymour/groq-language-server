import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/server.ts'],
  format: ['cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node18',
  external: ['tree-sitter', 'tree-sitter-groq'],
  noExternal: [
    'vscode-languageserver',
    'vscode-languageserver-textdocument',
    'vscode-languageserver-protocol',
    'vscode-languageserver-types',
    'vscode-jsonrpc',
  ],
});
