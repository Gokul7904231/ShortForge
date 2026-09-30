import { nextDeliveryState, shouldRetry } from "../../apps/web/factoryos/core/comms/CommsFabric";

export interface CommsLoadSample {
  readonly concurrency: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly retries: number;
  readonly completed: number;
  readonly elapsedMs: number;
}

export interface CommsLoadResult {
  readonly samples: CommsLoadSample[];
  readonly throughputPerSecond: number;
  readonly completedRate: number;
}

/**
 * Deterministic load-model helper for the protocol state machine.
 * This is deliberately transport-neutral; real network benchmarks belong
 * at the adapter/integration layer.
 */
export function evaluateCommsLoad(samples: CommsLoadSample[]): CommsLoadResult {
  if (samples.length === 0) {
    return { samples: [], throughputPerSecond: 0, completedRate: 0 };
  }

  const elapsedMs = Math.max(...samples.map((s) => s.elapsedMs));
  const completed = samples.reduce((sum, s) => sum + s.completed, 0);
  const accepted = samples.reduce((sum, s) => sum + s.accepted, 0);
  const throughputPerSecond = elapsedMs > 0 ? (completed / elapsedMs) * 1000 : 0;
  const completedRate = accepted > 0 ? completed / accepted : 0;

  return { samples, throughputPerSecond, completedRate };
}

test("Comms delivery path reaches ACKED only through explicit lifecycle", () => {
  const admitted = nextDeliveryState("CREATED", "admit");
  const queued = nextDeliveryState(admitted, "queue");
  const dispatched = nextDeliveryState(queued, "dispatch");
  const delivered = nextDeliveryState(dispatched, "deliver");
  const acked = nextDeliveryState(delivered, "ack");
  expect(acked).toBe("ACKED");
});

test("Comms retry budget is bounded", () => {
  expect(shouldRetry("NACKED", 1, 5, true)).toBe(true);
  expect(shouldRetry("RETRYING", 4, 5, true)).toBe(true);
  expect(shouldRetry("RETRYING", 5, 5, true)).toBe(false);
});

test("Load result reports throughput and completion rate", () => {
  const result = evaluateCommsLoad([
    { concurrency: 10, accepted: 1000, rejected: 0, retries: 5, completed: 995, elapsedMs: 5000 },
  ]);
  expect(result.throughputPerSecond).toBe(199);
  expect(result.completedRate).toBe(0.995);
});
