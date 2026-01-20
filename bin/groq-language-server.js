#!/usr/bin/env node

const { startServer } = require('../dist/server');

const args = process.argv.slice(2);
const useStdio = args.includes('--stdio');

startServer({
  method: useStdio ? 'stdio' : 'node',
});
