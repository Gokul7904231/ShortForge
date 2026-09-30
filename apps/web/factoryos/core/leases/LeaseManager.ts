/**
 * FactoryOS v1 — Task Ownership Lease Manager
 * Prevents zombie tasks, duplicate repairs, and double-healing across autonomous swarms.
 */

import type { ILeaseRepository, TaskLease } from "../database/DatabaseContracts";
import { InMemoryLeaseRepository } from "../database/InMemoryDatabase";

export class LeaseManager {
  private repository: ILeaseRepository;
  private defaultTtlMs: number;

  constructor(repository: ILeaseRepository = new InMemoryLeaseRepository(), defaultTtlMs: number = 30000) {
    this.repository = repository;
    this.defaultTtlMs = defaultTtlMs;
  }

  async acquire(taskId: string, agentId: string, ttlMs: number = this.defaultTtlMs, attempt: number = 1): Promise<boolean> {
    return this.repository.acquireLease(taskId, agentId, ttlMs, attempt);
  }

  async heartbeat(taskId: string, agentId: string, ttlMs: number = this.defaultTtlMs): Promise<boolean> {
    return this.repository.renewLease(taskId, agentId, ttlMs);
  }

  async release(taskId: string, agentId: string): Promise<void> {
    await this.repository.releaseLease(taskId, agentId);
  }

  /**
   * Fenced release: mutate the worker lease only when the observed
   * lease generation still matches.
   */
  async releaseFenced(
    taskId: string,
    agentId: string,
    expectedFencingToken: number
  ): Promise<boolean> {
    if (this.repository.releaseLeaseIfFenced) {
      return this.repository.releaseLeaseIfFenced(
        taskId,
        agentId,
        expectedFencingToken,
      );
    }

    const current = await this.repository.getLease(taskId);
    if (
      !current ||
      current.ownerAgentId !== agentId ||
      current.status !== "ACTIVE" ||
      current.fencingToken !== expectedFencingToken
    ) {
      return false;
    }

    await this.repository.releaseLease(taskId, agentId);
    return true;
  }

  async getLease(taskId: string): Promise<TaskLease | null> {
    return this.repository.getLease(taskId);
  }

  async getRecoverableTasks(): Promise<TaskLease[]> {
    return this.repository.getExpiredLeases();
  }
}
