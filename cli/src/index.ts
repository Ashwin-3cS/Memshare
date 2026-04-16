#!/usr/bin/env node

const command = process.argv[2] ?? "help";

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
    console.log("Memshare CLI scaffold is present.");
    console.log("Next: wire config, relayer client, capture, remember-batch, and recall.");
    break;
}
