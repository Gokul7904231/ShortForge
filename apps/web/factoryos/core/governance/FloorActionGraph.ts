import type {
  ActionTransition,
  FloorActionContract,
  FloorGovernanceState,
} from "./FloorGovernanceContracts";

export class FloorActionGraph {
  private readonly actions = new Map<string, FloorActionContract>();
  private readonly transitions: ActionTransition[] = [];

  registerAction(action: FloorActionContract): void {
    if (this.actions.has(action.actionName)) {
      throw new Error(`Action already registered: ${action.actionName}`);
    }
    if (!action.requiredCapability) {
      throw new Error(`Action ${action.actionName} must declare a capability`);
    }
    if (action.preconditions.length === 0) {
      throw new Error(`Action ${action.actionName} must declare at least one precondition`);
    }
    this.actions.set(action.actionName, action);
  }

  registerTransition(transition: ActionTransition): void {
    if (!this.actions.has(transition.from) && transition.from !== "START") {
      throw new Error(`Unknown transition source action: ${transition.from}`);
    }
    if (!this.actions.has(transition.to)) {
      throw new Error(`Unknown transition target action: ${transition.to}`);
    }
    this.transitions.push(transition);
  }

  getAction(actionName: string): FloorActionContract | undefined {
    return this.actions.get(actionName);
  }

  getAllActions(): FloorActionContract[] {
    return Array.from(this.actions.values());
  }

  getNextActions(
    currentAction: string | "START",
    outcome?: ActionTransition["on"]
  ): FloorActionContract[] {
    const edges = this.transitions.filter(
      (t) => t.from === currentAction && (!outcome || t.on === outcome)
    );
    return edges
      .map((edge) => this.actions.get(edge.to))
      .filter((action): action is FloorActionContract => Boolean(action));
  }

  canTransition(
    currentAction: string | "START",
    nextAction: string,
    outcome?: ActionTransition["on"]
  ): boolean {
    return this.getNextActions(currentAction, outcome).some(
      (action) => action.actionName === nextAction
    );
  }

  getInitialActions(): FloorActionContract[] {
    return this.getNextActions("START");
  }

  validateStateTransition(
    _state: FloorGovernanceState,
    currentAction: string | "START",
    nextAction: string
  ): boolean {
    // State is part of the runtime snapshot; the action graph controls which
    // action may follow. This keeps dynamic cognition bounded to known actions.
    return this.canTransition(currentAction, nextAction);
  }
}
