import type { ReMakerReceipt } from "./ReMakerContracts";

export interface ReMakerIdempotencyStore {
  get(idempotencyKey: string): Promise<ReMakerReceipt | undefined>;
  put(idempotencyKey: string, receipt: ReMakerReceipt): Promise<void>;
}

/**
 * Development/test implementation only.
 * Production should provide a durable, transactional implementation.
 */
export class InMemoryReMakerIdempotencyStore implements ReMakerIdempotencyStore {
  private readonly receipts = new Map<string, ReMakerReceipt>();

  async get(idempotencyKey: string): Promise<ReMakerReceipt | undefined> {
    return this.receipts.get(idempotencyKey);
  }

  async put(idempotencyKey: string, receipt: ReMakerReceipt): Promise<void> {
    if (!this.receipts.has(idempotencyKey)) {
      this.receipts.set(idempotencyKey, receipt);
    }
  }
}
