import fs from "node:fs";
import path from "node:path";

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

