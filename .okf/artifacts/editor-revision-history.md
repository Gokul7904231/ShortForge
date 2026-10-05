# Editor: Durable Revision Graph and Replay

> Status: IMPLEMENTED / PRE-PRODUCTION
> Source: `apps/web/factoryos/core/editor/DurableEditor.ts`
> Persistence: `EditorRevisionStore.ts`

## Authority

The editor stores and replays **CompositionIR**, but does not become a rendering, economic, governance, or release authority.

`F05 CompositionIR -> OKF admission -> F06 RenderFabric -> ComputeRouter -> CAS -> F07`

## Revision graph

Every material editor change creates an immutable revision node:

- `ROOT`
- `COMMAND`
- `UNDO`
- `REDO`
- `RESTORE`

Each node records its parent, actor, command digest, operation ID, composition SHA-256 and deterministic history state.

Undo and redo do not delete or mutate historical revisions. They append navigation revisions that point to the target historical node.

## Operation log

The durable journal contains both:

1. immutable revision state;
2. an explicit `EditorOperationRecord`.

This makes the journal replayable and auditable without relying on the current in-memory editor.

Command IDs are durable idempotency keys. Repeating a previously committed command returns the prior receipt. Reusing a command ID with a different digest fails closed.

## Persistence

### Disk

`DiskEditorRevisionStore` writes an fsynced JSONL journal and atomically written checkpoints. The final partial journal line is treated as a crash-tail; non-final corruption fails closed.

### MongoDB

`MongoEditorRevisionStore` uses durable revision documents with unique composition/revision and composition/command indexes. The revision itself contains the operation and materialized CompositionIR, so the latest state is recoverable by ordering revisions; no second mutable authority is required.

## Checkpoints

Checkpoints are immutable snapshots containing:

- checkpoint ID
- source revision
- CompositionIR
- composition SHA-256
- creation timestamp
- optional reason

Restoring a checkpoint creates a new `RESTORE` revision rather than rewriting history.

## Deterministic replay

Replay starts at `ROOT` and processes the immutable journal in revision order.

For `COMMAND` nodes, ShortForge re-applies the exact stored command.

For `UNDO`, `REDO` and `RESTORE`, ShortForge resolves the recorded target revision.

Every reconstructed state is validated and its canonical CompositionIR SHA-256 must exactly match the stored revision hash.

A mismatch is a hard replay failure.

## Collaboration contract

The durable editor remains optimistic-concurrency based:

`expectedRevision == persistedHead.revision`

External writers therefore produce an explicit revision conflict instead of silently overwriting another actor's edit.

## Next hardening

Tracked separately in the follow-on roadmap:

- distributed persistence latency/throughput benchmarks
- durable session registry
- bounded history compaction with cryptographic lineage preservation
- conflict-resolution UI/agent protocol
- authenticated editor command gateway
- production rollout behind existing OKF/F07 boundaries
