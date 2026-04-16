import fs from "node:fs";
import path from "node:path";

import type { ContextFolder } from "./types.js";

export type ExportResult = {
  outputDir: string;
  files: string[];
};

export function writeContextFolder(
  folder: ContextFolder,
  outputDir: string,
): ExportResult {
  fs.mkdirSync(outputDir, { recursive: true });

  const fileMap: Record<string, string> = {
    "index.md": folder.index,
    "overview.md": folder.overview,
    "state.md": folder.state,
    "decisions.md": folder.decisions,
    "next-steps.md": folder.nextSteps,
    "files.md": folder.files,
    "git.md": folder.git,
  };

  const written: string[] = [];
  for (const [filename, content] of Object.entries(fileMap)) {
    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, `${content}\n`, "utf8");
    written.push(filePath);
  }

  return { outputDir, files: written };
}
