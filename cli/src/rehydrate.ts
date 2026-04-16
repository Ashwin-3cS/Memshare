import type { RecallResponse, RecallResult } from "./types.js";

type GroupedRecall = {
  summary: RecallResult[];
  taskSummary: RecallResult[];
  projectContext: RecallResult[];
  workingTree: RecallResult[];
  detailedContext: RecallResult[];
  other: RecallResult[];
};

export type RehydratedProjectContext = {
  summary: string | null;
  taskSummary: string[];
  projectContext: string[];
  workingTree: string[];
  detailedContext: string;
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
      default:
        grouped.other.push(result);
        break;
    }
  }

  grouped.detailedContext.sort((left, right) => getChunkOrder(left) - getChunkOrder(right));
  return grouped;
}

export function rehydrateProjectContext(response: RecallResponse): RehydratedProjectContext {
  const grouped = groupResults(response.results);
  const summary = grouped.summary[0]?.text ?? null;
  const detailedContext = grouped.detailedContext
    .map((result) => result.text.replace(/^Detailed context chunk \d+\/\d+\n/, ""))
    .join("\n");

  return {
    summary,
    taskSummary: grouped.taskSummary.map((result) => result.text),
    projectContext: grouped.projectContext.map((result) => result.text),
    workingTree: grouped.workingTree.map((result) => result.text),
    detailedContext,
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
