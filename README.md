# Memshare

Share **AI coding session context** across a team. Capture what your agent (Claude Code, Cursor, Codex…) learned in one session, push it to encrypted long-term storage, then let a teammate pull it back into their own agent on a different machine.

Sessions die when the chat window closes. Memshare keeps them alive — durable, encrypted, addressable by on-chain identity.

```
  Dev A's agent  ──capture──▶  Memshare CLI  ──/remember/batch──▶  Relayer
                                                                      │
                                                            SEAL encrypt
                                                                      │
                                                  Walrus Quilt (1 blob, N patches)
                                                                      │
                                                       pgvector (HNSW, 1024-dim)
                                                                      │
  Dev B's agent  ◀──attach───  Memshare CLI  ◀──/recall─────────  Relayer
```

---

## Why Memshare

- **Team session sharing.** Your teammate's agent can pick up where yours left off — same project context, same mental model, no re-onboarding the LLM.
- **Long-term persistence via MemWal.** Storage rights live on Sui as a `MemWalAccount` object; access is granted via on-chain delegate keys. No central account server.
- **Quilt-based storage.** A single `memshare publish` typically writes 6–20 facts. Instead of N Walrus blobs (N register + N certify + N Sui objects), Memshare batches them into **one Walrus Quilt** — 1 Sui `Blob` object, N retrievable patches. ~Nx cheaper at write time, same per-fact read granularity.
- **Encrypted at rest.** Every fact is SEAL-encrypted before it ever leaves the relayer. Walrus stores ciphertext only.
- **Semantic recall.** pgvector HNSW index over text embeddings for cosine similarity retrieval.

---

## Architecture

| Piece | Lang | Role |
|---|---|---|
| `cli/` | TypeScript | Capture project context, push to relayer, recall, share access |
| `relayer/` | Rust (axum) | Auth (Ed25519 delegate sig), embedding, SEAL encrypt, Walrus quilt upload, pgvector index |
| `relayer/scripts/sidecar-server.ts` | TypeScript | Wraps `@mysten/seal` + Walrus publisher; auto-spawned by relayer |
| Postgres + pgvector | — | Vector index, blob/quilt metadata, delegate-key cache, storage quota |
| Redis | — | Per-key + per-user rate limiting |
| Sui (testnet/mainnet) | Move | `MemWalAccount` object + delegate-key grants |
| Walrus | — | Encrypted blob & quilt storage |

---

## Quick start

### 1. MemWal account

Create a `MemWalAccount` on Sui (use the MemWal site or call `account::create_account` on the package directly). You will get:

- `MEMWAL_ACCOUNT_ID` — Sui object id of your account.
- `MEMWAL_DELEGATE_KEY` — 32-byte Ed25519 secret (hex). Public key must already be granted on the account.
- `SUI_PRIVATE_KEY` — `suiprivkey1…` for any on-chain TX the CLI needs (e.g. `share`).

### 2. Relayer infra

```bash
docker run -d --name memshare-pg -p 55432:5432 \
  -e POSTGRES_USER=memwal -e POSTGRES_PASSWORD=memwal_secret -e POSTGRES_DB=memwal \
  pgvector/pgvector:pg16

docker run -d --name memshare-redis -p 56379:6379 redis:7-alpine
```

### 3. `relayer/.env`

```
PORT=8001
WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
SEAL_KEY_SERVERS=0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75
DATABASE_URL=postgresql://memwal:memwal_secret@localhost:55432/memwal
REDIS_URL=redis://localhost:56379
SUI_NETWORK=testnet
EMBEDDING_API_KEY=...
EMBEDDING_API_BASE=https://your-embedding-provider/v1
EMBEDDING_MODEL=your-embedding-model
EMBEDDING_DIMENSIONS=1024
MEMWAL_PACKAGE_ID=0xcf6ad755a1cdff7217865c796778fabe5aa399cb0cf2eba986f4b582047229c6
MEMWAL_REGISTRY_ID=0xe80f2feec1c139616a86c9f71210152e2a7ca552b20841f2e192f99f75864437
SERVER_SUI_PRIVATE_KEY=suiprivkey1...
SERVER_SUI_PRIVATE_KEYS=suiprivkey1...
SIDECAR_URL=http://localhost:9000
```

### 4. Run relayer

```bash
cd relayer
cargo run --release
```

Relayer auto-spawns the SEAL/Walrus sidecar on `SIDECAR_URL`, runs all migrations through `006_resize_embedding_1024.sql`, and serves on `:8001`.

### 5. CLI

```bash
cd cli && npm install
npx tsx src/index.ts init   # interactive; writes ./.env or ~/.config/memshare/.env
```

---

## CLI reference

All commands auto-detect your project from the closest git remote unless you override with `--project-id`. Filters (`--namespace`, `--capsule-id`, `--task-id`) scope reads/writes inside one account.

### Setup & identity

| Command | Purpose |
|---|---|
| `init [--global] [--relayer-url <url>] [--account-id <id>] [--delegate-key <hex>] [--sui-key <suiprivkey>]` | Write `.env` to the current dir or `~/.config/memshare/.env`. Bootstraps a working CLI in one shot. |
| `whoami` | Print resolved account id, delegate public key, project id, relayer URL. Sanity check before publishing. |
| `health` | `GET /health` against the relayer. Confirms relayer + sidecar + Walrus + DB are alive. |
| `status` | Local config status: which `.env` was loaded, which fields are set. No network. |

### Capture & publish (writes)

| Command | Purpose |
|---|---|
| `publish [--summary <text>] [--context-file <path>] [--stdin]` | One-shot. Captures session context (summary + project_context + working_tree + chunked detailed context), batches into facts, posts to `/api/remember/batch`, persists as a single Walrus **quilt**. Use this from inside an agent loop after each meaningful chunk of work. |
| `capture [--push] [--summary <text>] [--include-detailed-context]` | Same capture pipeline as `publish` but exposes intermediate JSON. Without `--push`, prints facts locally. With `--push`, sends to relayer. Useful for debugging what your agent is about to share. |
| `remember-batch --file <facts.json>` | Lower-level: take a hand-authored batch of facts and POST as-is. Bypasses the auto-capture heuristics. |

What `publish` actually writes per call:
- 1× `task_summary` fact
- 1× `summary` fact
- 1× `project_context` fact per git/project signal (branch, head, root, remote, …)
- 1× `working_tree` fact (changed paths)
- N× `detailed_context_chunk` facts when `--context-file` / `--stdin` is supplied (chunked by `--chunk-bytes`, default 24 KB)

All of those land in **one Walrus quilt**, one Sui `Blob` object.

### Recall & attach (reads)

| Command | Purpose |
|---|---|
| `recall <query> [--namespace <name>]` | Vector search against the relayer. Returns top-K JSON hits with `text`, `distance`, `metadata`, `quilt_id`, `quilt_patch_id`, `storage_kind`. Pipe into `jq` or save to file. |
| `rehydrate <query> [--namespace <name>]` | Like `recall` but format-optimised for re-injection: ordered, deduped, no JSON noise. Drop-in for "paste this back into the chat". |
| `attach --tool claude <query> [--output <path>] [--namespace <name>]` | Run `recall`, format for the chosen tool, and write the file the tool will pick up (e.g. `CLAUDE.md`-style). Default tool: `claude`. |

### Sharing (the headline feature)

| Command | Purpose |
|---|---|
| `share --pubkey <hex> [--label <name>]` | On-chain TX: grant a teammate's Ed25519 public key permission to read your `MemWalAccount`. Their CLI then uses `import` / `recall --from <your-account-id>` to pull and decrypt your sessions. |
| `import [<project-id>] [--from <account-id>] [--output <dir>] [--tool claude]` | Pull every fact for a project from another account (after they've shared with you), decrypt, and write to disk in the chosen tool's expected layout. This is how a teammate boots their agent into your session. |
| `export [<project-id>] [--output <dir>]` | Like `import` but for your own account — useful for backups or moving between machines. |

### Shared filter flags

```
--project-id <id>     overrides auto-detected git project
--capsule-id <id>     scope to one capsule (a "session" within a project)
--task-id <id>        scope to one task
--namespace <name>    logical bucket inside the account (default derived from project)
--chunk-bytes <n>     chunk size for detailed-context facts on publish (default 24576)
```

---

## Typical team flow

```bash
# Dev A — wraps up a working session, wants the team to inherit context
memshare publish --summary "wired up the new payment webhook end-to-end; notes on edge cases below"

# Dev A — grant Dev B's delegate pubkey access (one-time per teammate)
memshare share --pubkey <dev-b-delegate-pubkey> --label "dev-b"

# Dev B — pull Dev A's session into their local agent
memshare import <project-id> --from <dev-a-account-id> --tool claude

# Dev B — semantic query against the shared memory
memshare recall "how does the payment webhook handle retries" --namespace project:<name>
```

---

## Storage model

`vector_entries` row, per fact:

```
id              uuid
owner           sui address (account owner)
namespace       text
storage_kind    'blob' | 'quilt'
blob_id         walrus blobId        (NULL when storage_kind='quilt')
quilt_id        walrus parent blobId (NULL when storage_kind='blob')
quilt_patch_id  walrus patchId       (NULL when storage_kind='blob')
quilt_object_id sui Blob object id   (NULL when storage_kind='blob')
embedding       vector(1024)
metadata        jsonb (project_id, capsule_id, task_id, fact_type, tags, …)
blob_size_bytes bigint  (counts toward per-user 1 GB quota)
```

Reads branch on `storage_kind`:
- `blob`  → `GET /v1/blobs/{blob_id}` on aggregator
- `quilt` → `GET /v1/blobs/by-quilt-patch-id/{quilt_patch_id}` on aggregator

In both cases the bytes go through the same SEAL decrypt path before returning to the CLI.

---

## Migrations

| File | Purpose |
|---|---|
| `001_init.sql` | base `vector_entries`, HNSW index |
| `002_add_namespace.sql` | per-account namespacing |
| `003_rate_limiter.sql` | per-key & per-user counters |
| `004_memory_metadata.sql` | richer metadata jsonb |
| `005_quilt_columns.sql` | `quilt_id`, `quilt_patch_id`, `quilt_object_id`, `storage_kind`; `blob_id` nullable |
| `006_resize_embedding_1024.sql` | drop HNSW, `ALTER COLUMN embedding TYPE vector(1024)`, recreate index (matches `EMBEDDING_DIMENSIONS=1024`) |

All run automatically on relayer startup via `db.rs`.

---

## Endpoints

```
GET  /health
POST /api/remember           single fact, blob path
POST /api/remember/batch     N facts, quilt path  ← used by `publish`
POST /api/recall             top-K vector search
POST /api/restore            re-pull all blobs for an owner+namespace
POST /api/share              relayer-initiated delegate-key grant (when CLI lacks gas)
```

Auth header: `x-memwal-signature: ed25519(delegate_sk, body_hash)` + `x-memwal-account: <account_id>`. Signature is verified against the delegate keys currently granted on-chain for that account. Verified delegate→account mappings are cached in `delegate_key_cache`.

---

## Limits

- Per-user storage: **1 GB** (sum of `blob_size_bytes`).
- Rate limit: **60 req/min burst, 500/hr sustained** per account, **30/min per delegate key**.
- Batch embedding concurrency is throttled to stay within the configured embedding provider's concurrency caps.

---

## License

TBD.
