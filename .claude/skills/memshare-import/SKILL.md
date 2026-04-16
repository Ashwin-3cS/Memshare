---
name: memshare-import
description: Import project context from Memshare into the current Claude session. Use when a user wants to load context from another agent, session, or collaborator.
---

# Memshare Import

Use this skill to pull stored project context from the Memshare relayer into the current session.

## When To Use

- User says "import memshare context", "get context from friend", "load shared context", "what did we build last session"
- A handoff is happening from another agent or developer

## Steps

1. Run the import command from the project root:

```bash
node /home/ashwin/projects/memwal-cli/cli/dist/index.js import
```

To import a specific project (e.g. from a collaborator):

```bash
node /home/ashwin/projects/memwal-cli/cli/dist/index.js import owner/project-name
```

2. Read the index file to understand what was imported:

```bash
cat .memshare/context/index.md
```

3. Read only the files relevant to the current task — do not load all files at once.

4. Tell the user what context is available and what the project state is.

## Notes

- Context folder is written to `.memshare/context/` by default
- `index.md` is the entry point — read it first, it costs ~150 tokens
- Each file focuses on one topic: overview, state, decisions, next-steps, files, git
- The relayer must be running and reachable from the CLI environment
