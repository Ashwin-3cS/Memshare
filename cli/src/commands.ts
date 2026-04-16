import fs from "node:fs";
import path from "node:path";

import { attachContext } from "./attach.js";
import { captureStructuredContext } from "./capture.js";
import { addDelegateKey, derivePublicKeyHex } from "./sui.js";
import {
  type CliConfig,
  getMissingConfigKeys,
  globalConfigPath,
  loadProjectConfig,
  saveProjectConfig,
} from "./config.js";
import { MemshareClient } from "./client.js";
import { writeContextFolder } from "./export.js";
import {
  buildContextFolder,
  formatProjectContextArtifact,
  rehydrateProjectContext,
} from "./rehydrate.js";
import type {
  MemoryMetadata,
  MemoryQueryFilters,
  ProjectConfig,
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

function buildFilters(flags: FlagMap, proj?: ProjectConfig): MemoryQueryFilters {
  return {
    project_id: getStringFlag(flags, "project-id") ?? proj?.projectId,
    capsule_id: getStringFlag(flags, "capsule-id") ?? proj?.capsuleId,
    task_id: getStringFlag(flags, "task-id"),
  };
}

function buildMetadata(flags: FlagMap, proj?: ProjectConfig): MemoryMetadata {
  const tags = getStringFlag(flags, "tags")
    ?.split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    project_id: getStringFlag(flags, "project-id") ?? proj?.projectId,
    capsule_id: getStringFlag(flags, "capsule-id") ?? proj?.capsuleId,
    task_id: getStringFlag(flags, "task-id"),
    fact_type: getStringFlag(flags, "fact-type"),
    source_tool: getStringFlag(flags, "source-tool"),
    sender_id: getStringFlag(flags, "sender-id"),
    recipient_scope: getStringFlag(flags, "recipient-scope"),
    created_at: getStringFlag(flags, "created-at"),
    tags,
  };
}

function readNarrativeText(flags: FlagMap): string | undefined {
  const contextFile = getStringFlag(flags, "context-file");
  if (contextFile) {
    return fs.readFileSync(path.resolve(process.cwd(), contextFile), "utf8");
  }
  if (flags.stdin === true) {
    return fs.readFileSync("/dev/stdin", "utf8");
  }
  return undefined;
}

export function printHelp(): void {
  console.log("memshare");
  console.log("");
  console.log("Simple commands (auto-detect project from git):");
  console.log("  init [--global] [--relayer-url <url>] [--account-id <id>] ...  (writes .env)");
  console.log("  publish [--summary <text>] [--context-file <path>] [--stdin]");
  console.log("  import [<project-id>] [--from <account-id>] [--output <dir>] [--tool claude]");
  console.log("  export [<project-id>] [--output <dir>]");
  console.log("  share --pubkey <hex> [--label <name>]");
  console.log("  whoami");
  console.log("");
  console.log("Advanced commands:");
  console.log("  capture [--push] [--summary <text>] [--include-detailed-context]");
  console.log("  remember-batch --file <facts.json>");
  console.log("  recall <query> [--namespace <name>]");
  console.log("  rehydrate <query> [--namespace <name>]");
  console.log("  attach --tool claude <query> [--namespace <name>] [--output <path>]");
  console.log("  health");
  console.log("  status");
  console.log("");
  console.log("Shared filter flags (advanced):");
  console.log("  --project-id <id>  (overrides auto-detected project)");
  console.log("  --capsule-id <id>");
  console.log("  --task-id <id>");
  console.log("  --namespace <name>");
  console.log("  --chunk-bytes <n>");
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
    case "init": {
      const envPath = flags.global
        ? globalConfigPath()
        : path.join(process.cwd(), ".env");
      const relayerUrl = getStringFlag(flags, "relayer-url");
      const accountId = getStringFlag(flags, "account-id");
      const delegateKey = getStringFlag(flags, "delegate-key");
      const suiPrivateKey = getStringFlag(flags, "sui-private-key");
      const packageId = getStringFlag(flags, "package-id");
      const registryId = getStringFlag(flags, "registry-id");
      const suiNetwork = getStringFlag(flags, "network") ?? "mainnet";

      const lines = [
        `MEMSHARE_RELAYER_URL=${relayerUrl ?? "http://localhost:8010"}`,
        `MEMWAL_ACCOUNT_ID=${accountId ?? ""}`,
        `MEMWAL_DELEGATE_KEY=${delegateKey ?? ""}`,
        `SUI_PRIVATE_KEY=${suiPrivateKey ?? ""}`,
        `MEMWAL_PACKAGE_ID=${packageId ?? ""}`,
        `MEMWAL_REGISTRY_ID=${registryId ?? ""}`,
        `SUI_NETWORK=${suiNetwork}`,
      ];

      if (fs.existsSync(envPath) && !flags.force) {
        console.log(`.env already exists at ${envPath}`);
        console.log("Use --force to overwrite, or edit it manually.");
        return 1;
      }

      fs.mkdirSync(path.dirname(envPath), { recursive: true });
      fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf8");
      console.log(`Wrote ${envPath}`);

      const missing = lines
        .filter((l) => l.endsWith("="))
        .map((l) => l.split("=")[0]);
      if (missing.length > 0) {
        console.log("");
        console.log("Fill in these missing values:");
        for (const key of missing) console.log(`  ${key}`);
      } else {
        console.log("Run: memshare status  (to verify config)");
      }
      return 0;
    }
    case "publish": {
      const proj = loadProjectConfig(process.cwd());
      const capsuleId =
        getStringFlag(flags, "capsule-id") ??
        `${proj.namespace}-${Date.now()}`;
      const namespace = getStringFlag(flags, "namespace") ?? proj.namespace;
      const summary = getStringFlag(flags, "summary");
      const narrativeText = readNarrativeText(flags);

      const metadata = buildMetadata(flags, {
        ...proj,
        capsuleId,
      });

      const captured = captureStructuredContext({
        cwd: process.cwd(),
        namespace,
        metadata,
        summary,
        narrativeText,
        includeDetailedContext: true,
        detailedChunkBytes: getStringFlag(flags, "chunk-bytes")
          ? Number.parseInt(getStringFlag(flags, "chunk-bytes")!, 10)
          : undefined,
      });

      const batch = {
        facts: [captured.summary, ...captured.facts, ...captured.detailedContext],
      };

      const client = MemshareClient.fromConfig(config);
      const result = await client.rememberBatch(batch);

      saveProjectConfig({ ...proj, capsuleId }, process.cwd());

      console.log(`Published.`);
      console.log(`  Project:  ${proj.projectId}`);
      console.log(`  Capsule:  ${capsuleId}`);
      console.log(`  Facts:    ${result.total}`);
      return 0;
    }
    case "export": {
      const client = MemshareClient.fromConfig(config);
      const projectIdArg = positional[0];
      const proj = projectIdArg
        ? { projectId: projectIdArg, namespace: projectIdArg.split("/").at(-1) ?? projectIdArg }
        : loadProjectConfig(process.cwd());

      const namespace = getStringFlag(flags, "namespace") ?? proj.namespace;
      const result = await client.recall({
        query: "project context overview decisions state",
        namespace,
        limit: 100,
        filters: { project_id: proj.projectId },
      });

      const context = rehydrateProjectContext(result);
      const capturedAt = new Date().toISOString().slice(0, 10);
      const folder = buildContextFolder(context, proj.projectId, capturedAt);

      const outputDir = path.resolve(
        process.cwd(),
        getStringFlag(flags, "output") ?? ".memshare/context",
      );
      const exported = writeContextFolder(folder, outputDir);

      console.log(`Exported context folder: ${exported.outputDir}`);
      console.log(`  ${exported.files.length} files written`);
      console.log(`  Read ${path.join(exported.outputDir, "index.md")} first`);
      return 0;
    }
    case "import": {
      const client = MemshareClient.fromConfig(config);
      const projectIdArg = positional[0];
      const proj = projectIdArg
        ? { projectId: projectIdArg, namespace: projectIdArg.split("/").at(-1) ?? projectIdArg }
        : loadProjectConfig(process.cwd());

      const namespace = getStringFlag(flags, "namespace") ?? proj.namespace;
      const fromAccountId = getStringFlag(flags, "from");
      const result = await client.recall({
        query: "project context overview decisions state",
        namespace,
        limit: 100,
        filters: { project_id: proj.projectId },
      }, fromAccountId);

      const context = rehydrateProjectContext(result);
      const capturedAt = new Date().toISOString().slice(0, 10);
      const folder = buildContextFolder(context, proj.projectId, capturedAt);

      const outputDir = path.resolve(
        process.cwd(),
        getStringFlag(flags, "output") ?? ".memshare/context",
      );
      const exported = writeContextFolder(folder, outputDir);

      if (getStringFlag(flags, "tool") === "claude") {
        const singleFile = path.join(process.cwd(), ".claude", "memshare-context.md");
        fs.mkdirSync(path.dirname(singleFile), { recursive: true });
        fs.writeFileSync(
          singleFile,
          `<!-- Generated by memshare import --tool claude -->\n<!-- Full context folder: ${outputDir} -->\n\n${folder.index}\n`,
          "utf8",
        );
        console.log(`Claude context: ${singleFile}`);
      }

      console.log(`Imported context folder: ${exported.outputDir}`);
      console.log(`  ${exported.files.length} files written`);
      console.log(`  Read ${path.join(exported.outputDir, "index.md")} first`);
      return 0;
    }
    case "capture": {
      const proj = loadProjectConfig(process.cwd());
      const namespace = getStringFlag(flags, "namespace") ?? proj.namespace;
      const summary = getStringFlag(flags, "summary");
      const narrativeText = readNarrativeText(flags);
      const captured = captureStructuredContext({
        cwd: process.cwd(),
        namespace,
        metadata: buildMetadata(flags, proj),
        summary,
        narrativeText,
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

      const proj = loadProjectConfig(process.cwd());
      const namespace = getStringFlag(flags, "namespace") ?? proj.namespace;
      const limitFlag = getStringFlag(flags, "limit");
      const limit = limitFlag ? Number.parseInt(limitFlag, 10) : undefined;

      const result = await client.recall({
        query,
        namespace,
        limit,
        filters: buildFilters(flags, proj),
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    case "rehydrate": {
      const client = MemshareClient.fromConfig(config);
      const query = positional.join(" ").trim();
      if (!query) {
        throw new Error("rehydrate requires a query string");
      }

      const proj = loadProjectConfig(process.cwd());
      const namespace = getStringFlag(flags, "namespace") ?? proj.namespace;
      const limitFlag = getStringFlag(flags, "limit");
      const limit = limitFlag ? Number.parseInt(limitFlag, 10) : 20;

      const result = await client.recall({
        query,
        namespace,
        limit,
        filters: buildFilters(flags, proj),
      });

      const artifact = rehydrateProjectContext(result);
      console.log(formatProjectContextArtifact(artifact));
      return 0;
    }
    case "attach": {
      const client = MemshareClient.fromConfig(config);
      const tool = getStringFlag(flags, "tool");
      if (tool !== "claude") {
        throw new Error("attach requires --tool claude");
      }

      const query = positional.join(" ").trim();
      if (!query) {
        throw new Error("attach requires a query string");
      }

      const proj = loadProjectConfig(process.cwd());
      const namespace = getStringFlag(flags, "namespace") ?? proj.namespace;
      const limitFlag = getStringFlag(flags, "limit");
      const limit = limitFlag ? Number.parseInt(limitFlag, 10) : 20;

      const result = await client.recall({
        query,
        namespace,
        limit,
        filters: buildFilters(flags, proj),
      });

      const attached = attachContext(result, {
        tool,
        outputPath: getStringFlag(flags, "output"),
        cwd: process.cwd(),
      });
      console.log(attached.path);
      return 0;
    }
    case "whoami": {
      if (!config.delegateKey) throw new Error("MEMWAL_DELEGATE_KEY not set");
      const { pubkeyHex, suiAddress } = derivePublicKeyHex(config.delegateKey);
      console.log(`Delegate public key : ${pubkeyHex}`);
      console.log(`Sui address         : ${suiAddress}`);
      console.log(``);
      console.log(`Share the public key with the account owner so they can run:`);
      console.log(`  memshare share --pubkey ${pubkeyHex} --label "<your name>"`);
      return 0;
    }
    case "share": {
      const pubkey = getStringFlag(flags, "pubkey");
      if (!pubkey) throw new Error("share requires --pubkey <hex>");

      const label = getStringFlag(flags, "label") ?? pubkey.slice(0, 10);
      const proj = loadProjectConfig(process.cwd());

      console.log(`Submitting add_delegate_key transaction...`);
      const digest = await addDelegateKey(config, {
        friendPubkeyHex: pubkey,
        label,
      });

      console.log(`Shared.`);
      console.log(`  TX digest: ${digest}`);
      console.log(`  Friend can now run:`);
      console.log(`    memshare import ${proj.projectId} --from ${config.accountId}`);
      return 0;
    }
    default:
      throw new Error(`unknown command: ${command}`);
  }
}
