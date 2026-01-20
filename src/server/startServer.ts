import {
  createConnection,
  ProposedFeatures,
} from 'vscode-languageserver/node.js';
import { MessageProcessor } from './MessageProcessor.js';

export interface ServerOptions {
  method: 'stdio' | 'node';
}

export function startServer(options: ServerOptions = { method: 'stdio' }): void {
  let connection;

  if (options.method === 'stdio') {
    connection = createConnection(ProposedFeatures.all);
  } else {
    connection = createConnection(ProposedFeatures.all);
  }

  new MessageProcessor(connection);

  connection.listen();
}
