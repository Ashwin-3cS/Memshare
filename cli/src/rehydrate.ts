import type { ContextFolder, RecallResponse, RecallResult } from "./types.js";

type GroupedRecall = {
  summary: RecallResult[];
  taskSummary: RecallResult[];
  projectContext: RecallResult[];
  workingTree: RecallResult[];
  detailedContext: RecallResult[];
  sessionContext: RecallResult[];
  other: RecallResult[];
};

export type RehydratedProjectContext = {
  summary: string | null;
  taskSummary: string[];
  projectContext: string[];
  workingTree: string[];
  detailedContext: string;
  sessionContext: string;
  raw: RecallResult[];
};

function getFactType(result: RecallResult): string | null {
  const value = result.metadata.fact_type;
  return typeof value === "string" ? value : null;
}

function getChunkOrder(result: RecallResult): number {
  const tags = Array.isArray(result.metadata.tags) ? result.metadata.tags : [];
  for (const tag of tags) {
    if (typeof tag !== "string") {
      continue;
    }
    const match = tag.match(/^chunk:(\d+)\/(\d+)$/);
    if (match) {
      return Number.parseInt(match[1], 10);
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

function groupResults(results: RecallResult[]): GroupedRecall {
  const grouped: GroupedRecall = {
    summary: [],
    taskSummary: [],
    projectContext: [],
    workingTree: [],
    detailedContext: [],
    sessionContext: [],
    other: [],
  };

  for (const result of results) {
    switch (getFactType(result)) {
      case "summary":
        grouped.summary.push(result);
        break;
      case "task_summary":
        grouped.taskSummary.push(result);
        break;
      case "project_context":
        grouped.projectContext.push(result);
        break;
      case "working_tree":
        grouped.workingTree.push(result);
        break;
      case "detailed_context_chunk":
        grouped.detailedContext.push(result);
        break;
      case "session_context":
        grouped.sessionContext.push(result);
        break;
      default:
        grouped.other.push(result);
        break;
    }
  }

  grouped.detailedContext.sort((left, right) => getChunkOrder(left) - getChunkOrder(right));
  grouped.sessionContext.sort((left, right) => getChunkOrder(left) - getChunkOrder(right));
  return grouped;
}

export function rehydrateProjectContext(response: RecallResponse): RehydratedProjectContext {
  const grouped = groupResults(response.results);
  const summary = grouped.summary[0]?.text ?? null;
  const detailedContext = grouped.detailedContext
    .map((result) => result.text.replace(/^Detailed context chunk \d+\/\d+\n/, ""))
    .join("\n");
  const sessionContext = grouped.sessionContext
    .map((result) => result.text.replace(/^Session context chunk \d+\/\d+\n/, ""))
    .join("\n");

  return {
    summary,
    taskSummary: grouped.taskSummary.map((result) => result.text),
    projectContext: grouped.projectContext.map((result) => result.text),
    workingTree: grouped.workingTree.map((result) => result.text),
    detailedContext,
    sessionContext,
    raw: response.results,
  };
}

export function formatProjectContextArtifact(context: RehydratedProjectContext): string {
  const lines: string[] = [];

  lines.push("# Memshare Project Context");
  lines.push("");

  if (context.summary) {
    lines.push("## Summary");
    lines.push(context.summary);
    lines.push("");
  }

  if (context.taskSummary.length > 0) {
    lines.push("## Task Summary");
    for (const item of context.taskSummary) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (context.projectContext.length > 0) {
    lines.push("## Project Context");
    for (const item of context.projectContext) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (context.workingTree.length > 0) {
    lines.push("## Working Tree");
    for (const item of context.workingTree) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (context.detailedContext.trim().length > 0) {
    lines.push("## Detailed Context");
    lines.push(context.detailedContext);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function buildContextFolder(
  context: RehydratedProjectContext,
  projectId: string,
  capturedAt: string,
): ContextFolder {
  const index = [
    `# Project Context: ${projectId}`,
    `Captured: ${capturedAt}`,
    "",
    "## Files in this folder",
    "- overview.md — What the project is, architecture, goals",
    "- state.md — Current build status, what works, what does not",
    "- decisions.md — Technical decisions and rationale",
    "- next-steps.md — Remaining work and open todos",
    "- files.md — Key files and working tree",
    "- git.md — Branch, HEAD, remote, recent commits",
    "",
    "Read index.md first, then open only the files relevant to your task.",
  ].join("\n");

  const overviewParts: string[] = [`# Overview: ${projectId}`, ""];
  if (context.summary) {
    overviewParts.push("## Summary", context.summary, "");
  }
  if (context.sessionContext.trim()) {
    overviewParts.push("## Project Details", context.sessionContext, "");
  }
  const overview = overviewParts.join("\n").trimEnd();

  const stateParts: string[] = ["# Current State", ""];
  if (context.detailedContext.trim()) {
    stateParts.push(context.detailedContext, "");
  }
  const state = stateParts.join("\n").trimEnd();

  const decisions = [
    "# Key Decisions",
    "",
    context.workingTree.length > 0
      ? context.workingTree.join("\n")
      : "_No decision records found._",
  ].join("\n");

  const nextStepsParts: string[] = ["# Next Steps", ""];
  for (const item of context.taskSummary) {
    nextStepsParts.push(`- ${item}`);
  }
  if (context.taskSummary.length === 0) {
    nextStepsParts.push("_No task summary recorded._");
  }
  const nextSteps = nextStepsParts.join("\n");

  const filesParts: string[] = ["# Files", ""];
  for (const item of context.workingTree) {
    filesParts.push(`- ${item}`);
  }
  if (context.workingTree.length === 0) {
    filesParts.push("_No working tree data recorded._");
  }
  const files = filesParts.join("\n");

  const gitParts: string[] = ["# Git State", ""];
  for (const item of context.projectContext) {
    gitParts.push(`- ${item}`);
  }
  if (context.projectContext.length === 0) {
    gitParts.push("_No git context recorded._");
  }
  const git = gitParts.join("\n");

  return { index, overview, state, decisions, nextSteps, files, git };
}
