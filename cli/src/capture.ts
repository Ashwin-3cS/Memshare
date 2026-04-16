import { execFileSync } from "node:child_process";

import type { MemoryMetadata, RememberFactInput } from "./types.js";

type CaptureOptions = {
  cwd: string;
  namespace: string;
  metadata: MemoryMetadata;
  summary?: string;
  includeDetailedContext?: boolean;
  detailedChunkBytes?: number;
};

export type CapturedContext = {
  summary: RememberFactInput;
  facts: RememberFactInput[];
  detailedContext: RememberFactInput[];
};

function runGit(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function tryGit(args: string[], cwd: string): string | null {
  try {
    return runGit(args, cwd);
  } catch {
    return null;
  }
}

function collectTouchedFiles(cwd: string): string[] {
  const output = tryGit(["status", "--porcelain"], cwd);
  if (!output) {
    return [];
  }

  return output
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      const renamedIndex = line.indexOf(" -> ");
      if (renamedIndex !== -1) {
        return line.slice(renamedIndex + 4).trim();
      }
      const matched = line.match(/^(?:.. |.\s)(.*)$/);
      return (matched?.[1] ?? line).trim();
    })
    .filter(Boolean);
}

export function captureCurrentContext(options: CaptureOptions): RememberFactInput[] {
  const repoRoot = tryGit(["rev-parse", "--show-toplevel"], options.cwd) ?? options.cwd;
  const branch = tryGit(["branch", "--show-current"], options.cwd) ?? "unknown";
  const remoteUrl = tryGit(["remote", "get-url", "origin"], options.cwd) ?? "unknown";
  const head = tryGit(["rev-parse", "HEAD"], options.cwd) ?? "unknown";
  const touchedFiles = collectTouchedFiles(options.cwd);
  const dirty = touchedFiles.length > 0;

  const facts: string[] = [
    `Working repository root is ${repoRoot}.`,
    `Current git branch is ${branch}.`,
    `Current git HEAD is ${head}.`,
    `Origin remote is ${remoteUrl}.`,
    dirty
      ? `Working tree has local changes in: ${touchedFiles.join(", ")}.`
      : "Working tree is clean.",
  ];

  if (options.summary) {
    facts.unshift(`Current task summary: ${options.summary}.`);
  }

  return facts.map((text) => ({
    text,
    namespace: options.namespace,
    metadata: options.metadata,
  }));
}

function withFactType(metadata: MemoryMetadata, factType: string): MemoryMetadata {
  return {
    ...metadata,
    fact_type: factType,
  };
}

function chunkTextByBytes(text: string, maxBytes: number): string[] {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) {
    return [text];
  }

  const lines = text.split("\n");
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const candidate = current.length > 0 ? `${current}\n${line}` : line;
    if (Buffer.byteLength(candidate, "utf8") <= maxBytes) {
      current = candidate;
      continue;
    }

    if (current.length > 0) {
      chunks.push(current);
      current = "";
    }

    if (Buffer.byteLength(line, "utf8") <= maxBytes) {
      current = line;
      continue;
    }

    let partial = "";
    for (const char of line) {
      const next = `${partial}${char}`;
      if (Buffer.byteLength(next, "utf8") > maxBytes) {
        chunks.push(partial);
        partial = char;
      } else {
        partial = next;
      }
    }
    current = partial;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

export function captureStructuredContext(options: CaptureOptions): CapturedContext {
  const repoRoot = tryGit(["rev-parse", "--show-toplevel"], options.cwd) ?? options.cwd;
  const branch = tryGit(["branch", "--show-current"], options.cwd) ?? "unknown";
  const remoteUrl = tryGit(["remote", "get-url", "origin"], options.cwd) ?? "unknown";
  const head = tryGit(["rev-parse", "HEAD"], options.cwd) ?? "unknown";
  const touchedFiles = collectTouchedFiles(options.cwd);
  const dirty = touchedFiles.length > 0;
  const statusPorcelain = tryGit(["status", "--porcelain"], options.cwd) ?? "";
  const recentCommits = tryGit(["log", "--oneline", "-5"], options.cwd) ?? "";

  const summaryParts = [
    options.summary ? `Task summary: ${options.summary}.` : null,
    `Repo: ${repoRoot}.`,
    `Branch: ${branch}.`,
    dirty
      ? `Working tree has ${touchedFiles.length} changed path(s).`
      : "Working tree is clean.",
  ].filter(Boolean);

  const summary: RememberFactInput = {
    text: summaryParts.join(" "),
    namespace: options.namespace,
    metadata: withFactType(options.metadata, "summary"),
  };

  const facts: RememberFactInput[] = [
    {
      text: `Working repository root is ${repoRoot}.`,
      namespace: options.namespace,
      metadata: withFactType(options.metadata, "project_context"),
    },
    {
      text: `Current git branch is ${branch}.`,
      namespace: options.namespace,
      metadata: withFactType(options.metadata, "project_context"),
    },
    {
      text: `Current git HEAD is ${head}.`,
      namespace: options.namespace,
      metadata: withFactType(options.metadata, "project_context"),
    },
    {
      text: `Origin remote is ${remoteUrl}.`,
      namespace: options.namespace,
      metadata: withFactType(options.metadata, "project_context"),
    },
    dirty
      ? {
          text: `Working tree has local changes in: ${touchedFiles.join(", ")}.`,
          namespace: options.namespace,
          metadata: withFactType(options.metadata, "working_tree"),
        }
      : {
          text: "Working tree is clean.",
          namespace: options.namespace,
          metadata: withFactType(options.metadata, "working_tree"),
        },
  ];

  if (options.summary) {
    facts.unshift({
      text: `Current task summary: ${options.summary}.`,
      namespace: options.namespace,
      metadata: withFactType(options.metadata, "task_summary"),
    });
  }

  const detailedContext: RememberFactInput[] = [];
  if (options.includeDetailedContext) {
    const detailedSections = [
      `Task Summary\n${options.summary ?? "(none)"}`,
      `Repository Root\n${repoRoot}`,
      `Branch\n${branch}`,
      `Head\n${head}`,
      `Origin Remote\n${remoteUrl}`,
      `Git Status Porcelain\n${statusPorcelain || "(clean)"}`,
      `Touched Files\n${touchedFiles.join("\n") || "(none)"}`,
      `Recent Commits\n${recentCommits || "(none)"}`,
    ];
    const detailedText = detailedSections.join("\n\n");
    const maxChunkBytes = options.detailedChunkBytes ?? 12_000;
    const chunks = chunkTextByBytes(detailedText, maxChunkBytes);

    chunks.forEach((chunk, index) => {
      detailedContext.push({
        text: `Detailed context chunk ${index + 1}/${chunks.length}\n${chunk}`,
        namespace: options.namespace,
        metadata: {
          ...withFactType(options.metadata, "detailed_context_chunk"),
          tags: [
            ...(options.metadata.tags ?? []),
            `chunk:${index + 1}/${chunks.length}`,
          ],
        },
      });
    });
  }

  return { summary, facts, detailedContext };
}
