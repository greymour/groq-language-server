#!/usr/bin/env node
const { startServer } = require("./dist/server.cjs");
startServer({ method: "stdio" });
