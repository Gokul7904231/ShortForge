/**
 * FactoryOS v1 / Frontier v3 — Graph Navigation State
 * Manages deterministic semantic navigation across graph projections (Overview, Drilldown,
 * Forensic, Delta, SituationRecord) while retaining canonical subject context.
 * Maintains navigation stack and breadcrumbs without leaking sensitive secrets in state.
 */

import { BrowserRedactor } from "../../runtime/BrowserRedactor";
import type { PresentationViewType } from "./PresentationIR";
import type { CanonicalId } from "./InteractionIR";

export interface NavigationFrame {
  readonly viewType: PresentationViewType;
  readonly subjectId?: CanonicalId;
  readonly selectedNodeId?: CanonicalId;
  readonly selectedEdgeId?: CanonicalId;
  readonly parentView?: PresentationViewType;
  readonly selectionReason: string;
  readonly timestamp: string;
}

export class GraphNavigationState {
  private readonly stack: NavigationFrame[] = [];

  constructor(initialFrame?: Partial<NavigationFrame>) {
    const frame: NavigationFrame = {
      viewType: initialFrame?.viewType ?? "MISSION_OVERVIEW",
      subjectId: initialFrame?.subjectId,
      selectedNodeId: initialFrame?.selectedNodeId,
      selectedEdgeId: initialFrame?.selectedEdgeId,
      parentView: initialFrame?.parentView,
      selectionReason: initialFrame?.selectionReason ?? "Initial entry",
      timestamp: initialFrame?.timestamp ?? new Date().toISOString(),
    };
    this.stack.push(frame);
  }

  public push(frame: Omit<NavigationFrame, "timestamp">): NavigationFrame {
    const current = this.current();
    const newFrame: NavigationFrame = {
      ...frame,
      parentView: frame.parentView ?? current.viewType,
      timestamp: new Date().toISOString(),
    };
    this.stack.push(newFrame);
    return newFrame;
  }

  public pop(): NavigationFrame | undefined {
    if (this.stack.length <= 1) {
      return undefined; // Don't pop initial frame
    }
    return this.stack.pop();
  }

  public current(): NavigationFrame {
    return this.stack[this.stack.length - 1];
  }

  public depth(): number {
    return this.stack.length;
  }

  public canGoBack(): boolean {
    return this.stack.length > 1;
  }

  public getBreadcrumbs(): string[] {
    return this.stack.map((frame) => {
      const subject = frame.subjectId ? ` [${frame.subjectId}]` : "";
      return `${frame.viewType}${subject}`;
    });
  }

  public toSafeQuery(): Record<string, string> {
    const curr = this.current();
    const safeSubject = curr.subjectId ? BrowserRedactor.redactText(curr.subjectId) : undefined;
    const query: Record<string, string> = {
      view: curr.viewType,
    };
    if (safeSubject) query.subject = safeSubject;
    if (curr.selectedNodeId) query.node = BrowserRedactor.redactText(curr.selectedNodeId);
    if (curr.selectedEdgeId) query.edge = BrowserRedactor.redactText(curr.selectedEdgeId);
    return query;
  }
}
