import type { MissionReport } from "../MissionReport";

export class JSONSerializer {
  public static serialize(report: MissionReport, pretty: boolean = true): string {
    return JSON.stringify(report, null, pretty ? 2 : undefined);
  }
}
