import type { QualityThresholds } from "../config/thresholds";

export interface MissionGoalDefinition {
  readonly description: string;
  readonly topic: string;
  readonly targetAudience?: string;
  readonly style?: string;
  readonly durationSeconds?: number;
}

export interface DependencyConstraint {
  readonly predecessor: string;
  readonly successor: string;
}

export interface TerminalConditions {
  readonly requiredStatus: "COMPLETED" | "DELIVERED";
  readonly requirePhysicalArtifact: boolean;
  readonly requireVerificationPass: boolean;
  readonly requireDeliveryOutbox: boolean;
}

export interface MissionSpecification {
  readonly id: string;
  readonly name: string;
  readonly goal: MissionGoalDefinition;
  readonly requiredStages: string[];
  readonly optionalStages: string[];
  readonly dependencyConstraints: DependencyConstraint[];
  readonly forbiddenBehaviors: string[];
  readonly terminalConditions: TerminalConditions;
  readonly qualityThresholds: QualityThresholds;
}
