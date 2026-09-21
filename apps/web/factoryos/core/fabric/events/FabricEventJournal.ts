/**
 * FactoryOS Render Fabric — CloudEvents 1.0 Event Journal
 * Append-only immutable historical record of all state transitions and operational actions.
 */

import { FabricEvent } from "../contracts/RenderFabricContracts";
import * as crypto from "node:crypto";

export class FabricEventJournal {
  private static instance?: FabricEventJournal;
  private events: FabricEvent[] = [];

  public static getInstance(): FabricEventJournal {
    if (!FabricEventJournal.instance) {
      FabricEventJournal.instance = new FabricEventJournal();
    }
    return FabricEventJournal.instance;
  }

  public record(params: {
    type: string;
    subject: string;
    data: Record<string, any>;
    source?: string;
  }): FabricEvent {
    const event: FabricEvent = {
      specversion: "1.0",
      id: `evt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      source: params.source || "factoryos.renderfabric",
      type: params.type,
      time: new Date().toISOString(),
      subject: params.subject,
      data: Object.freeze({ ...params.data }),
    };

    this.events.push(Object.freeze(event));
    return event;
  }

  public getEventsBySubject(subjectPrefix: string): FabricEvent[] {
    return this.events.filter((e) => e.subject.startsWith(subjectPrefix));
  }

  public getEventsByType(type: string): FabricEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  public getAllEvents(): FabricEvent[] {
    return [...this.events];
  }

  public clear(): void {
    this.events = [];
  }
}
