---
name: memshare-publish
description: Publish current project context to Memshare so another agent or collaborator can import it. Use when a user wants to save or share what they have built in this session.
---

# Memshare Publish

Use this skill to capture the current session state and push it to the Memshare relayer.

## When To Use

- User says "publish context", "share this project", "save session context", "send context to friend"
- End of a work session, before handoff to another developer or agent

## Steps

1. Read the codebase to gather real context — do NOT summarize from memory:
   - `git log --oneline -20` — recent work
   - `git diff HEAD~3..HEAD --stat` — what changed
   - Read all source files in `src/` or equivalent (every `.ts`, `.rs`, `.py` etc.)
   - Read key config files (`.env.example`, `Cargo.toml`, `package.json`, etc.)
   - Read any existing docs (`README.md`, `docs/`, `CLAUDE.md`)

2. Write a comprehensive narrative covering:
   - What the project is and does (architecture, tech stack)
   - Every major component and what it does
   - What was built or changed recently (with specifics — function names, file paths)
   - Key decisions made and why
   - Current state: what works, what's broken, what's incomplete
   - How to run / set up the project
   - What to do next / open questions

3. Write the narrative to `.memshare/<project-name>.md` in the repo root:

```bash
mkdir -p .memshare
cat > .memshare/<project-name>.md << 'EOF'
[narrative text here]
EOF
```

4. Run the publish command:

```bash
memshare publish \
  --summary "<one-line summary>" \
  --context-file .memshare/<project-name>.md
```

4. Report back to the user:
   - The project ID that was published under
   - The capsule ID (for reference)
   - Confirm a collaborator can now run `memshare import <project-id>` to get this context

## Notes

- Project ID is auto-detected from git remote (e.g. `owner/repo`)
- No flags required — the CLI reads `.memshare.json` or derives from git
- The narrative text becomes `session_context` facts in the relayer, searchable by meaning
- The relayer must be running and reachable from the CLI environment
