#!/usr/bin/env node

import { loadCliConfig } from "./config.js";
import { runCommand } from "./commands.js";

const config = loadCliConfig();

runCommand(config, process.argv.slice(2)).then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  },
);
