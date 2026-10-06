/**
 * CLM context-policy shadow adapter.
 *
 * This adapter is a typed seam only. It is not wired into production by
 * default, does not own context state, and can only return ContextEdit
 * proposals to ContextFabric for deterministic validation.
 */

import type {
  CLMContextProposal,
  CLMContextProposalPort,
  CLMContextProposalRequest,
  ContextEdit,
} from "../../core/cognitive/context/ContextFabricContracts";
