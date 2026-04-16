import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { ProjectConfig } from "./types.js";

export type CliConfig = {
  envPath: string;
  relayerUrl: string | null;
  serverUrl: string | null;
  suiNetwork: string | null;
  accountId: string | null;
  delegateKey: string | null;
  suiPrivateKey: string | null;
  packageId: string | null;
  registryId: string | null;
  jinaApiKey: string | null;
};

function parseDotEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, "utf8");
  const entries: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries[key] = value;
  }

  return entries;
}

export function loadCliConfig(cwd = process.cwd()): CliConfig {
  const envPath = path.join(cwd, ".env");
  const fileEnv = parseDotEnvFile(envPath);
  const env = { ...fileEnv, ...process.env };

  return {
    envPath,
    relayerUrl: env.MEMSHARE_RELAYER_URL ?? null,
    serverUrl: env.MEMWAL_SERVER_URL ?? null,
    suiNetwork: env.SUI_NETWORK ?? null,
    accountId: env.MEMWAL_ACCOUNT_ID ?? null,
    delegateKey: env.MEMWAL_DELEGATE_KEY ?? null,
    suiPrivateKey: env.SUI_PRIVATE_KEY ?? null,
    packageId: env.MEMWAL_PACKAGE_ID ?? null,
    registryId: env.MEMWAL_REGISTRY_ID ?? null,
    jinaApiKey: env.JINA_API_KEY ?? null,
  };
}

function tryGitConfig(args: string[], cwd: string): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim() || null;
  } catch {
    return null;
  }
}

function deriveProjectId(remoteUrl: string): string {
  // SSH: git@github.com:owner/repo.git
  const sshMatch = remoteUrl.match(/[^/:]+\/[^/]+(?:\.git)?$/);
  if (sshMatch) {
    return sshMatch[0].replace(/\.git$/, "");
  }
  return remoteUrl;
}

function projectSlug(projectId: string): string {
  // Last segment: "owner/repo" → "repo"
  const parts = projectId.split("/");
  return parts[parts.length - 1] ?? projectId;
}

export function loadProjectConfig(cwd = process.cwd()): ProjectConfig {
  const configPath = path.join(
    tryGitConfig(["rev-parse", "--show-toplevel"], cwd) ?? cwd,
    ".memshare.json",
  );

  let stored: Partial<ProjectConfig> = {};
  if (fs.existsSync(configPath)) {
    try {
      stored = JSON.parse(fs.readFileSync(configPath, "utf8")) as Partial<ProjectConfig>;
    } catch {
      // ignore malformed file
    }
  }

  if (stored.projectId && stored.namespace) {
    return stored as ProjectConfig;
  }

  const remoteUrl = tryGitConfig(["remote", "get-url", "origin"], cwd);
  const repoRoot = tryGitConfig(["rev-parse", "--show-toplevel"], cwd) ?? cwd;
  const projectId =
    stored.projectId ??
    (remoteUrl ? deriveProjectId(remoteUrl) : path.basename(repoRoot));
  const namespace = stored.namespace ?? projectSlug(projectId);

  return {
    projectId,
    namespace,
    capsuleId: stored.capsuleId,
  };
}

export function saveProjectConfig(config: ProjectConfig, cwd = process.cwd()): void {
  const repoRoot = tryGitConfig(["rev-parse", "--show-toplevel"], cwd) ?? cwd;
  const configPath = path.join(repoRoot, ".memshare.json");
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function getMissingConfigKeys(config: CliConfig): string[] {
  const requiredEntries: Array<[string, string | null]> = [
    ["MEMSHARE_RELAYER_URL", config.relayerUrl],
    ["MEMWAL_ACCOUNT_ID", config.accountId],
    ["MEMWAL_DELEGATE_KEY", config.delegateKey],
    ["SUI_PRIVATE_KEY", config.suiPrivateKey],
    ["MEMWAL_PACKAGE_ID", config.packageId],
    ["MEMWAL_REGISTRY_ID", config.registryId],
  ];

  return requiredEntries
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

