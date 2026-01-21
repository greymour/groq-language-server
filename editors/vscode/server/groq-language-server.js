#!/usr/bin/env node
const { startServer } = require("./dist/server");
startServer({ method: "stdio" });
