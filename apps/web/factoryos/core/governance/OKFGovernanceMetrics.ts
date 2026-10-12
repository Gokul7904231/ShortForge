export interface OKFGovernanceMetrics {
  readonly schemaVersion: "1.0";
  readonly generatedAt: string;
  readonly coverage: { active: number; criticalHigh: number; coveredCriticalHigh: number; coveragePercent: number };
  readonly severityCounts: Record<string, number>;
  readonly lifecycleCounts: Record<string, number>;
  readonly controlStates: { sweep: string; drift: string; exceptions: string; attestation: string };
  readonly authority: "OBSERVABILITY_ONLY";
}

export function buildOKFGovernanceMetrics(rules: readonly { status: string; severity: string; verificationRefs?: readonly string[] }[], states?: Partial<OKFGovernanceMetrics["controlStates"]>): OKFGovernanceMetrics {
  const active=rules.filter((r)=>r.status==="ACTIVE");
  const criticalHigh=active.filter((r)=>r.severity==="CRITICAL"||r.severity==="HIGH");
  const covered=criticalHigh.filter((r)=>Array.isArray(r.verificationRefs)&&r.verificationRefs.length>0);
  const severityCounts:Record<string,number>={}; const lifecycleCounts:Record<string,number>={};
  for(const r of rules){ severityCounts[r.severity]=(severityCounts[r.severity]??0)+1; lifecycleCounts[r.status]=(lifecycleCounts[r.status]??0)+1; }
  return { schemaVersion:"1.0", generatedAt:new Date().toISOString(), coverage:{active:active.length,criticalHigh:criticalHigh.length,coveredCriticalHigh:covered.length,coveragePercent:criticalHigh.length?Math.round(covered.length/criticalHigh.length*10000)/100:100}, severityCounts, lifecycleCounts, controlStates:{sweep:states?.sweep??"CI_COMPILED",drift:states?.drift??"CI_GATED",exceptions:states?.exceptions??"CI_GATED",attestation:states?.attestation??"KEY_REQUIRED"}, authority:"OBSERVABILITY_ONLY" };
}
