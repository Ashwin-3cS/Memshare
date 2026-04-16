#!/usr/bin/env node

import { getMissingConfigKeys, loadCliConfig } from "./config.js";

const command = process.argv[2] ?? "help";
const config = loadCliConfig();

switch (command) {
  case "help":
  default:
    console.log("memshare");
    console.log("");
    console.log("Commands:");
    console.log("  help      Show this help");
    console.log("  status    Show local CLI bootstrap status");
    break;
  case "status":
    {
      const missingKeys = getMissingConfigKeys(config);

      console.log("Memshare CLI status");
      console.log("");
      console.log(`env file:      ${config.envPath}`);
      console.log(`relayer url:   ${config.relayerUrl ?? "(missing)"}`);
      console.log(`server url:    ${config.serverUrl ?? "(missing)"}`);
      console.log(`sui network:   ${config.suiNetwork ?? "(missing)"}`);
      console.log(`account id:    ${config.accountId ?? "(missing)"}`);
      console.log(`package id:    ${config.packageId ?? "(missing)"}`);
      console.log(`registry id:   ${config.registryId ?? "(missing)"}`);
      console.log(`delegate key:  ${config.delegateKey ? "present" : "(missing)"}`);
      console.log(`sui key:       ${config.suiPrivateKey ? "present" : "(missing)"}`);
      console.log(`jina api key:  ${config.jinaApiKey ? "present" : "(missing)"}`);
      console.log("");

      if (missingKeys.length > 0) {
        console.log("missing required keys:");
        for (const key of missingKeys) {
          console.log(`  - ${key}`);
        }
        process.exitCode = 1;
      } else {
        console.log("config looks ready for the first relayer-backed commands.");
      }
    }
    break;
}
