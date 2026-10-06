import { MongoClient, type Db, type Collection } from "mongodb";
import type { ContextWorkspace } from "../cognitive/context/ContextFabricContracts";
import { ContextConcurrencyConflictError, type IContextFabricRepository, type ContextEditLedgerEntry } from "./DatabaseContracts";

type WorkspaceDoc = ContextWorkspace & { _id?: string };
type LedgerDoc = ContextEditLedgerEntry & { _id?: string };

export class MongoContextFabricRepository implements IContextFabricRepository {
  private readonly workspaces: Collection<WorkspaceDoc>;
  private readonly ledger: Collection<LedgerDoc>;

  constructor(private readonly db: Db) {
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

  async getEditHistory(workspaceId: string, limit: number = 100): Promise<ContextEditLedgerEntry[]> {
    const docs = await this.ledger
      .find({ workspaceId })
      .sort({ resultingVersion: -1, recordedAt: -1, editId: -1 })
      .limit(limit)
      .toArray();

    return docs.map(({ _id, ...rest }) => structuredClone(rest));
  }
}
