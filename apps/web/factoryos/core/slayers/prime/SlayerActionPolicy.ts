import type {
  SlayerActionIntent,
  SlayerAuthorizationGrant,
  SlayerPrimeAction,
  SlayerPrimeScope,
} from "../../contracts/SlayerPrimeContracts";

const SCOPE_ORDER: SlayerPrimeScope[] = [
  "WORKER",
  "TASK",
  "QUEUE",
  "RESOURCE_POOL",
  "PROVIDER",
  "FLOOR",
  "FACTORY",
];

const ACTION_RISK: Record<
  SlayerPrimeAction,
  "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
> = {
  OBSERVE: "LOW",
  PROTECT: "MEDIUM",
  CONTAIN: "MEDIUM",
  FENCE: "HIGH",
  REVOKE_LEASE: "HIGH",
  ISOLATE: "HIGH",
  TERMINATE: "CRITICAL",
  FLOOR_HALT: "CRITICAL",
  FACTORY_HALT: "CRITICAL",
};

export interface ActionPolicyDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly risk: string;
  readonly requiresAuthorization: boolean;
  readonly requiresHumanApproval: boolean;
}

export class SlayerActionPolicy {
  evaluate(
    intent: SlayerActionIntent,
    grant: SlayerAuthorizationGrant | undefined,
    now: string = new Date().toISOString()
  ): ActionPolicyDecision {
    const risk = ACTION_RISK[intent.action];
    const requiresAuthorization = intent.action !== "OBSERVE";
    const requiresHumanApproval =
      intent.action === "FLOOR_HALT" || intent.action === "FACTORY_HALT";

    if (!requiresAuthorization) {
      return {
        allowed: true,
        reason: "Observation action is non-mutating.",
        risk,
        requiresAuthorization: false,
        requiresHumanApproval: false,
      };
    }

    if (!grant) {
      return {
        allowed: false,
        reason: "Guardian/Human authorization grant is required for mutating Slayer actions.",
        risk,
        requiresAuthorization,
        requiresHumanApproval,
      };
    }

    if (new Date(grant.expiresAt).getTime() <= new Date(now).getTime()) {
      return {
        allowed: false,
        reason: "Authorization grant is expired.",
        risk,
        requiresAuthorization,
        requiresHumanApproval,
      };
    }

    if (grant.incidentId !== intent.incidentId) {
      return {
        allowed: false,
        reason: "Authorization incident does not match action intent.",
        risk,
        requiresAuthorization,
        requiresHumanApproval,
      };
    }

    if (grant.action !== intent.action) {
      return {
        allowed: false,
        reason: "Authorization action does not match action intent.",
        risk,
        requiresAuthorization,
        requiresHumanApproval,
      };
    }

    if (grant.scope !== intent.scope || grant.targetId !== intent.targetId) {
      return {
        allowed: false,
        reason: "Authorization scope/target does not match action intent.",
        risk,
        requiresAuthorization,
        requiresHumanApproval,
      };
    }

    if (!["GUARDIAN", "HUMAN_AUTHORITY"].includes(grant.authorizedRole)) {
      return {
        allowed: false,
        reason: "Only Guardian or Human Authority may authorize Slayer enforcement.",
        risk,
        requiresAuthorization,
        requiresHumanApproval,
      };
    }

    if (
      (grant.authorizedRole === "GUARDIAN" && !grant.authorizedBy.startsWith("guardian_")) ||
      (grant.authorizedRole === "HUMAN_AUTHORITY" && !grant.authorizedBy.startsWith("human_"))
    ) {
      return {
        allowed: false,
        reason: "Authorization identity does not match its declared authority role.",
        risk,
        requiresAuthorization,
        requiresHumanApproval,
      };
    }

    if (requiresHumanApproval && grant.authorizedRole !== "HUMAN_AUTHORITY") {
      return {
        allowed: false,
        reason: intent.action + " requires Human Authority authorization.",
        risk,
        requiresAuthorization,
        requiresHumanApproval,
      };
    }

    if (SCOPE_ORDER.indexOf(intent.scope) < 0) {
      return {
        allowed: false,
        reason: "Unknown enforcement scope.",
        risk,
        requiresAuthorization,
        requiresHumanApproval,
      };
    }

    return {
      allowed: true,
      reason:
        "Authorization accepted for " +
        intent.action +
        " at " +
        intent.scope +
        " scope.",
      risk,
      requiresAuthorization,
      requiresHumanApproval,
    };
  }

  isEscalation(scope: SlayerPrimeScope, requestedScope: SlayerPrimeScope): boolean {
    return SCOPE_ORDER.indexOf(requestedScope) > SCOPE_ORDER.indexOf(scope);
  }

  smallestEffectiveScope(scope: SlayerPrimeScope): SlayerPrimeScope {
    return scope;
  }
}
