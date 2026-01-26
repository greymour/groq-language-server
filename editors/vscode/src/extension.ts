import * as path from 'path';
import * as fs from 'fs';
import { workspace, ExtensionContext, window } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient;
const outputChannel = window.createOutputChannel('GROQ Language Server');

export function activate(context: ExtensionContext) {
  outputChannel.appendLine('GROQ extension activating...');

  const serverModule = context.asAbsolutePath(
    path.join('server', 'groq-language-server.js')
  );

  outputChannel.appendLine(`Server module path: ${serverModule}`);
  outputChannel.appendLine(`Server exists: ${fs.existsSync(serverModule)}`);

  if (!fs.existsSync(serverModule)) {
    window.showErrorMessage(`GROQ Language Server not found at: ${serverModule}`);
    return;
  }

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.stdio,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.stdio,
      options: {
        execArgv: ['--nolazy', '--inspect=6009'],
      },
    },
  };

  const config = workspace.getConfiguration('groq');
  const schemaPath = config.get<string>('schemaPath');
  const paramTypeAnnotations = config.get<boolean>('extensions.paramTypeAnnotations');

  outputChannel.appendLine(`Schema path from config: ${schemaPath}`);
  outputChannel.appendLine(`Extensions - paramTypeAnnotations: ${paramTypeAnnotations}`);

  // Resolve schema path relative to workspace
  let resolvedSchemaPath: string | undefined;
  if (schemaPath && workspace.workspaceFolders?.[0]) {
    resolvedSchemaPath = path.resolve(workspace.workspaceFolders[0].uri.fsPath, schemaPath);
    outputChannel.appendLine(`Resolved schema path: ${resolvedSchemaPath}`);
    outputChannel.appendLine(`Schema exists: ${fs.existsSync(resolvedSchemaPath)}`);
  }

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'groq' },
      { scheme: 'file', language: 'javascript' },
      { scheme: 'file', language: 'typescript' },
      { scheme: 'file', language: 'javascriptreact' },
      { scheme: 'file', language: 'typescriptreact' },
    ],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.groq'),
    },
    initializationOptions: {
      schemaPath: resolvedSchemaPath,
      extensions: {
        paramTypeAnnotations: paramTypeAnnotations ?? false,
      },
    },
    outputChannel,
  };

  client = new LanguageClient(
    'groq',
    'GROQ Language Server',
    serverOptions,
    clientOptions
  );

  client.start().then(() => {
    outputChannel.appendLine('GROQ Language Server started successfully');
  }).catch((error) => {
    outputChannel.appendLine(`Failed to start GROQ Language Server: ${error}`);
    window.showErrorMessage(`Failed to start GROQ Language Server: ${error}`);
  });

  outputChannel.appendLine('GROQ extension activated');
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
