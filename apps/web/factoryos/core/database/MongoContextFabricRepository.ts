import { MongoClient, type Db, type Collection } from "mongodb";
import type { ContextWorkspace } from "../cognitive/context/ContextFabricContracts";
import {
  ContextConcurrencyConflictError,
  ContextDurabilityUnavailableError,
  type ContextDurableCommit,
  type IContextFabricRepository,
  type ContextEditLedgerEntry,
} from "./DatabaseContracts";

type WorkspaceDoc = ContextWorkspace & { _id?: string };
type LedgerDoc = ContextEditLedgerEntry & { _id?: string };

export class MongoContextFabricRepository implements IContextFabricRepository {
  private readonly workspaces: Collection<WorkspaceDoc>;
  private readonly ledger: Collection<LedgerDoc>;

  constructor(
    private readonly db: Db,
    private readonly client?: MongoClient,
  ) {
    this.workspaces = db.collection<WorkspaceDoc>("context_workspaces");
    this.ledger = db.collection<LedgerDoc>("context_edit_ledger");
  }

  async getWorkspace(workspaceId: string): Promise<ContextWorkspace | null> {
    const doc = await this.workspaces.findOne({ workspaceId });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return structuredClone(rest);
  }

  async saveWorkspace(workspace: ContextWorkspace, expectedVersion?: number): Promise<void> {
    const cloned = structuredClone(workspace);

    if (expectedVersion === undefined) {
      await this.workspaces.replaceOne(
        { workspaceId: cloned.workspaceId },
        cloned,
        { upsert: true }
      );
      return;
    }

    const result = await this.workspaces.replaceOne(
      { workspaceId: cloned.workspaceId, version: expectedVersion },
      cloned
    );

    if (result.matchedCount !== 1) {
      const current = await this.getWorkspace(cloned.workspaceId);
      throw new ContextConcurrencyConflictError(
        cloned.workspaceId,
        expectedVersion,
        current?.version ?? null
      );
    }
  }

  async appendEdit(entry: ContextEditLedgerEntry): Promise<void> {
    try {
      await this.ledger.insertOne(structuredClone(entry));
    } catch (error: any) {
      if (error?.code === 11000) return;
      throw error;
    }
  }

  async commitWorkspace(commit: ContextDurableCommit): Promise<void> {
    const { workspace, edits, expectedVersion } = commit;
    if (!this.client) {
      throw new ContextDurabilityUnavailableError(workspace.workspaceId);
    }

    const existing = await this.getWorkspace(workspace.workspaceId);
    if (existing && existing.version > workspace.version) {
      throw new ContextConcurrencyConflictError(
        workspace.workspaceId,
        expectedVersion,
        existing.version,
      );
    }

    if (existing?.version === workspace.version && edits.length > 0) {
      const ids = edits.map((entry) => entry.editId);
      const committed = await this.ledger.find({ editId: { $in: ids } }).toArray();
      if (committed.length === ids.length) return;
    }

    const session = this.client.startSession();
    try {
      await session.withTransaction(async () => {
        const current = await this.workspaces.findOne(
          { workspaceId: workspace.workspaceId },
          { session },
        );

        if (current) {
          const currentVersion = current.version;
          if (currentVersion !== expectedVersion) {
            throw new ContextConcurrencyConflictError(
              workspace.workspaceId,
              expectedVersion,
              currentVersion,
            );
          }

          const result = await this.workspaces.replaceOne(
            { workspaceId: workspace.workspaceId, version: expectedVersion },
            structuredClone(workspace),
            { session },
          );
          if (result.matchedCount !== 1) {
            throw new ContextConcurrencyConflictError(
              workspace.workspaceId,
              expectedVersion,
              currentVersion,
            );
          }
        } else {
          if (expectedVersion !== 0) {
            throw new ContextConcurrencyConflictError(
              workspace.workspaceId,
              expectedVersion,
              null,
            );
          }
          await this.workspaces.insertOne(structuredClone(workspace), { session });
        }

        if (edits.length > 0) {
          await this.ledger.insertMany(edits.map((entry) => structuredClone(entry)), {
            session,
            ordered: true,
          });
        }
      });
    } catch (error: any) {
      if (error instanceof ContextConcurrencyConflictError) throw error;

      const message = String(error?.message ?? error);
      if (
        error?.code === 20 ||
        error?.codeName === "IllegalOperation" ||
        /Transaction numbers are only allowed|replica set|mongos/i.test(message)
      ) {
        throw new ContextDurabilityUnavailableError(
          workspace.workspaceId,
          "MongoDB atomic transaction support is unavailable",
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async getEditHistory(workspaceId: string, limit: number = 100): Promise<ContextEditLedgerEntry[]> {
    const docs = await this.ledger
      .find({ workspaceId })
      .sort({ resultingVersion: -1, recordedAt: -1, editId: -1 })
      .limit(limit)
      .toArray();

    return docs.map(({ _id, ...rest }) => structuredClone(rest));
  }
}
