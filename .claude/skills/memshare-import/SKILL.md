---
name: memshare-import
description: Use when Claude Code needs to import or publish Memshare project context through the local memshare CLI. This skill captures current repo context, pushes it to the Memshare relayer, and rehydrates recalled project context back into the current Claude workflow.
---

# Memshare Import

Use this skill when you need to move project context between coding sessions with the local `memshare` CLI.

## When To Use

- A user wants to save the current working context for later use.
- A user wants to import stored project context into the current Claude Code session.
- A task needs handoff context from a prior Codex or Claude session.

## Required Assumptions

- Run commands from the target project root.
- The `memshare` CLI is installed and available on `PATH`, or can be run from this repo with `npm run dev --`.
- The Memshare relayer is reachable from the configured CLI environment.

## Publish Current Context

Capture and push the current project context:

```bash
memshare capture \
  --push \
  --namespace memshare-e2e \
  --project-id <project-id> \
  --capsule-id <capsule-id> \
  --task-id <task-id> \
  --source-tool claude-code \
  --summary "<what this session is doing>" \
  --include-detailed-context
```

Use `--chunk-bytes <n>` if the detailed context needs smaller chunks.

## Import Stored Context

Rehydrate stored context back into the current Claude session:

```bash
memshare rehydrate "project context" \
  --namespace memshare-e2e \
  --project-id <project-id> \
  --task-id <task-id>
```

The command returns one rendered project-context artifact with:

- summary
- task summary
- project context facts
- working tree facts
- detailed context if it was stored

## Workflow

1. Confirm the project and task identifiers to use.
2. Run `memshare rehydrate ...` for imports or `memshare capture --push ...` for exports.
3. Insert the returned artifact into the active Claude reasoning context.
4. Treat the imported artifact as project memory, not as blindly trusted source-of-truth. Cross-check code state when needed.

## Notes

- `recall` returns decrypted plaintext from the trusted relayer path. The CLI does not decrypt blobs locally in the current implementation.
- `rehydrate` is the preferred import command for Claude because it assembles the recalled entries into one readable project-context artifact.
- If the relayer is down, fix the relayer first instead of fabricating context.
