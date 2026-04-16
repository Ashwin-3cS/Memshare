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

1. Generate a narrative summary of the current session. Include:
   - What the project does
   - What was built or changed today
   - Key decisions made and why
   - Current blockers or open questions
   - What to do next

2. Write the narrative to a temp file:

```bash
cat > /tmp/memshare-narrative.md << 'EOF'
[narrative text here]
EOF
```

3. Run the publish command:

```bash
node /home/ashwin/projects/memwal-cli/cli/dist/index.js publish \
  --summary "<one-line summary>" \
  --context-file /tmp/memshare-narrative.md
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
