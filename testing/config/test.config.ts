import * as path from "node:path";
import { CANONICAL_THRESHOLDS, type QualityThresholds } from "./thresholds";

export interface TestingConfig {
  readonly workspaceRoot: string;
  readonly rendersDir: string;
  readonly outboxDir: string;
  readonly reportsDir: string;
  readonly executionTimeoutMs: number;
  readonly thresholds: QualityThresholds;
}

const root = path.resolve(__dirname, "../..");

export const TEST_CONFIG: TestingConfig = {
  workspaceRoot: root,
  rendersDir: path.join(root, "apps", "web", "data", "renders"),
  outboxDir: path.join(root, "apps", "web", "data", "outbox"),
  reportsDir: path.join(root, "testing", "reports", "output"),
  executionTimeoutMs: 60000,
  thresholds: CANONICAL_THRESHOLDS,
};
