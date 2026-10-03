/**
 * ShortForge / FactoryOS — canonical Treasury execution scope digest.
 *
 * The digest is derived from the actual mission/job/render intent scope so an
 * economic permit cannot be replayed against a materially different render.
 */

import { createHash } from "node:crypto";

export interface TreasuryExecutionScope {
  readonly version: 1;
  readonly missionId: string;
  readonly jobId: string;
  readonly floorId: string;
  readonly overseerCommandId: string;
  readonly renderIntent: unknown;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function computeTreasuryExecutionScopeDigest(
  scope: TreasuryExecutionScope,
): string {
  return (
    "sha256:" +
    createHash("sha256")
      .update(JSON.stringify(canonicalize(scope)))
      .digest("hex")
  );
}
