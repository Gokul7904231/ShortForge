/**
 * FactoryOS — Authority Registry Runtime Engine
 * 
 * Promotes .okf/architecture/authority-registry.json from a static CI artifact
 * to a first-class runtime dependency enforcing the canonical charter laws (L1–L13).
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface SovereignAuthority {
  id: string;
  ordinal: number;
  name: string;
  scope: "factory" | "floor";
  primaryVerb: string;
  reportsTo: string;
  perFloor: boolean;
  contract: string;
  vetoes: string[];
  doesNotOwn: string[];
  enforcementTests: string[];
  discretionaryCommander?: string;
  requiredCapability?: string;
  independentOf?: string[];
}

export interface SubsystemAuthority {
  id: string;
  name: string;
  sovereign: boolean;
  kind: string;
  parent: string;
  scope: "factory" | "floor";
  mode: string;
  contract: string;
  coGovernor?: string;
  replaceableBy?: string[];
}

export interface AuthorityRegistryData {
  schemaVersion: string;
  charter: {
    path: string;
    version: string;
    sha256: string;
  };
  supremeAuthority: {
    id: string;
    name: string;
    sovereign: boolean;
    scope: string;
    powers: string[];
  };
  floorSet: string[];
  parallelBranches: string[][];
  convergenceFloor: string;
  laws: Array<{ id: string; text: string }>;
  sovereigns: SovereignAuthority[];
  subsystems: SubsystemAuthority[];
  commandPaths: Record<string, string[]>;
  meta: {
    sovereignCount: number;
    accretionPolicy: string;
    driftTest: string;
  };
}

export class AuthorityViolationError extends Error {
  constructor(public code: string, message: string) {
    super(`[AUTHORITY_VIOLATION:${code}] ${message}`);
    this.name = "AuthorityViolationError";
  }
}

export class AuthorityRegistryRuntime {
  private static instance: AuthorityRegistryRuntime | null = null;
  private registry: AuthorityRegistryData;
  private registryPath: string;

  private constructor() {
    this.registryPath = this.resolveRegistryPath();
    this.registry = this.loadAndVerify();
  }

  public static getInstance(): AuthorityRegistryRuntime {
    if (!this.instance) {
      this.instance = new AuthorityRegistryRuntime();
    }
    return this.instance;
  }

  private resolveRegistryPath(): string {
    const candidates = [
      path.resolve(process.cwd(), ".okf/architecture/authority-registry.json"),
      path.resolve(process.cwd(), "../../.okf/architecture/authority-registry.json"),
      path.resolve(__dirname, "../../../../../.okf/architecture/authority-registry.json"),
    ];

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        return cand;
      }
    }
    throw new Error("[AuthorityRegistryRuntime] Unable to locate .okf/architecture/authority-registry.json");
  }

  private loadAndVerify(): AuthorityRegistryData {
    const raw = fs.readFileSync(this.registryPath, "utf-8");
    const data = JSON.parse(raw) as AuthorityRegistryData;

    if (data.schemaVersion !== "2.0.0-charter") {
      throw new AuthorityViolationError("SCHEMA_MISMATCH", `Expected schema 2.0.0-charter, got ${data.schemaVersion}`);
    }

    if (data.sovereigns.length !== 10) {
      throw new AuthorityViolationError(
        "SOVEREIGN_COUNT_DRIFT",
        `Canonical charter mandates exactly 10 sovereigns, found ${data.sovereigns.length}`
      );
    }

    return data;
  }

  public getRegistry(): AuthorityRegistryData {
    return this.registry;
  }

  public getSovereign(id: string): SovereignAuthority | undefined {
    return this.registry.sovereigns.find((s) => s.id === id);
  }

  public getSubsystem(id: string): SubsystemAuthority | undefined {
    return this.registry.subsystems.find((s) => s.id === id);
  }

  /**
   * Enforces Law L2 & L7: Command vs Authorization vs Spend.
   */
  public assertCanCommand(actorId: string): void {
    const sovereign = this.getSovereign(actorId);
    if (!sovereign) {
      throw new AuthorityViolationError("UNREGISTERED_ACTOR", `Actor '${actorId}' is not an authorized sovereign`);
    }
    if (!["command", "command-floor"].includes(sovereign.primaryVerb)) {
      throw new AuthorityViolationError("NOT_COMMAND_AUTHORITY", `Actor '${actorId}' does not possess command authority`);
    }
  }

  /**
   * Enforces Law L5 & Single Commit Path:
   * Only F07 (release boundary) or Guardian through F07 compliance can commit a final video.
   * Direct workers or unverified scripts are strictly forbidden from writing 'completed' status.
   */
  public assertCanCommitCompletion(actorId: string, hasPhysicalVerificationReceipt: boolean): void {
    if (actorId === "worker") {
      throw new AuthorityViolationError(
        "WORKER_DIRECT_COMMIT_FORBIDDEN",
        "Workers execute only. Direct completion status writing is strictly forbidden by Charter Law L2 & L11."
      );
    }

    if (!hasPhysicalVerificationReceipt) {
      throw new AuthorityViolationError(
        "CLAIM_WITHOUT_EVIDENCE",
        "Cannot commit completed status without physical artifact verification receipt (Charter Law L13)."
      );
    }

    const sovereign = this.getSovereign(actorId);
    const subsystem = this.getSubsystem(actorId);
    const isAuthorized =
      actorId === "f07" ||
      (sovereign && sovereign.id === "guardian") ||
      (subsystem && subsystem.id === "f07");

    if (!isAuthorized) {
      throw new AuthorityViolationError(
        "UNAUTHORIZED_COMMIT_PATH",
        `Actor '${actorId}' cannot commit final artifact completion. Only F07 release boundary holds this authority.`
      );
    }
  }

  /**
   * Enforces Law L7: Treasurer discretionary commands.
   */
  public assertTreasurerCommand(commanderId: string): void {
    const treasurer = this.getSovereign("treasurer");
    if (!treasurer) {
      throw new AuthorityViolationError("TREASURER_NOT_FOUND", "Treasurer sovereign missing from registry");
    }
    if (commanderId !== treasurer.discretionaryCommander) {
      throw new AuthorityViolationError(
        "TREASURER_DISCRETIONARY_VIOLATION",
        `Treasurer obeys only '${treasurer.discretionaryCommander}' for discretionary commands, got '${commanderId}' (Law L7)`
      );
    }
  }
}
