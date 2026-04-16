import fs from "node:fs";
import path from "node:path";

import { captureStructuredContext } from "./capture.js";
import { type CliConfig, getMissingConfigKeys } from "./config.js";
import { MemshareClient } from "./client.js";
import type {
  MemoryMetadata,
  MemoryQueryFilters,
  RememberBatchRequest,
} from "./types.js";

type FlagMap = Record<string, string | boolean>;

function parseFlags(args: string[]): { positional: string[]; flags: FlagMap } {
  const positional: string[] = [];
  const flags: FlagMap = {};

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }

    const key = value.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return { positional, flags };
}

function getStringFlag(flags: FlagMap, key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

function readJsonFile<T>(filePath: string): T {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const content = fs.readFileSync(absolutePath, "utf8");
  return JSON.parse(content) as T;
}

function buildFilters(flags: FlagMap): MemoryQueryFilters {
  return {
    project_id: getStringFlag(flags, "project-id"),
    capsule_id: getStringFlag(flags, "capsule-id"),
    task_id: getStringFlag(flags, "task-id"),
  };
}

function buildMetadata(flags: FlagMap): MemoryMetadata {
  const tags = getStringFlag(flags, "tags")
    ?.split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    project_id: getStringFlag(flags, "project-id"),
    capsule_id: getStringFlag(flags, "capsule-id"),
    task_id: getStringFlag(flags, "task-id"),
    fact_type: getStringFlag(flags, "fact-type"),
    source_tool: getStringFlag(flags, "source-tool"),
    sender_id: getStringFlag(flags, "sender-id"),
    recipient_scope: getStringFlag(flags, "recipient-scope"),
    created_at: getStringFlag(flags, "created-at"),
    tags,
  };
}

export function printHelp(): void {
  console.log("memshare");
  console.log("");
  console.log("Commands:");
  console.log("  help");
  console.log("  status");
  console.log("  health");
  console.log("  capture [--push] [--summary <text>] [--include-detailed-context]");
  console.log("  remember-batch --file <facts.json>");
  console.log("  recall <query> [--namespace <name>]");
  console.log("");
  console.log("Shared filter flags:");
  console.log("  --project-id <id>");
  console.log("  --capsule-id <id>");
  console.log("  --task-id <id>");
  console.log("  --chunk-bytes <n>");
  console.log("  --include-detailed-context");
}

export function runStatus(config: CliConfig): number {
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
    return 1;
  }

  console.log("config looks ready for the first relayer-backed commands.");
  return 0;
}

export async function runCommand(config: CliConfig, argv: string[]): Promise<number> {
  const [command = "help", ...rest] = argv;
  const { positional, flags } = parseFlags(rest);

  switch (command) {
    case "help":
      printHelp();
      return 0;
    case "status":
      return runStatus(config);
    case "health": {
      const client = MemshareClient.fromConfig(config);
      const result = await client.health();
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    case "capture": {
      const namespace = getStringFlag(flags, "namespace") ?? "default";
      const summary = getStringFlag(flags, "summary");
      const captured = captureStructuredContext({
        cwd: process.cwd(),
        namespace,
        metadata: buildMetadata(flags),
        summary,
        includeDetailedContext: flags["include-detailed-context"] === true,
        detailedChunkBytes: getStringFlag(flags, "chunk-bytes")
          ? Number.parseInt(getStringFlag(flags, "chunk-bytes")!, 10)
          : undefined,
      });
      const batch = {
        facts: [captured.summary, ...captured.facts, ...captured.detailedContext],
      };

      if (flags.push === true) {
        const client = MemshareClient.fromConfig(config);
        const result = await client.rememberBatch(batch);
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(JSON.stringify(captured, null, 2));
      }
      return 0;
    }
    case "remember-batch": {
      const client = MemshareClient.fromConfig(config);
      const file = getStringFlag(flags, "file");
      const namespace = getStringFlag(flags, "namespace") ?? "default";
      if (!file) {
        throw new Error("remember-batch requires --file <facts.json>");
      }

      const facts = readJsonFile<Array<{ text: string }>>(file).map((fact) => ({
        text: fact.text,
        namespace,
        metadata: buildMetadata(flags),
      }));

      const body: RememberBatchRequest = { facts };
      const result = await client.rememberBatch(body);
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    case "recall": {
      const client = MemshareClient.fromConfig(config);
      const query = positional.join(" ").trim();
      if (!query) {
        throw new Error("recall requires a query string");
      }

      const namespace = getStringFlag(flags, "namespace") ?? "default";
      const limitFlag = getStringFlag(flags, "limit");
      const limit = limitFlag ? Number.parseInt(limitFlag, 10) : undefined;

      const result = await client.recall({
        query,
        namespace,
        limit,
        filters: buildFilters(flags),
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    default:
      throw new Error(`unknown command: ${command}`);
  }
}
