import type { OKFPolicyContext } from "../../governance/OKFPolicyContext";
import type { EpistemicContext } from "./EpistemicContracts";

export interface AERPolicyContextLink {
  readonly okf: OKFPolicyContext;
  readonly epistemicContextFingerprint: string;
  readonly authority: "MODEL_ADVISORY";
  readonly executionAuthorization: "NONE";
}

export function linkOKFToEpistemicContext(okf: OKFPolicyContext, epistemic: EpistemicContext): AERPolicyContextLink {
  return { okf, epistemicContextFingerprint: epistemic.contextFingerprint, authority: "MODEL_ADVISORY", executionAuthorization: "NONE" };
}
