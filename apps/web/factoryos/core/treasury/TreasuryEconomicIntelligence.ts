/**
 * ShortForge / FactoryOS — Treasury Economic Intelligence
 *
 * Read-only economic intelligence. It observes Treasury's durable ledger and
 * produces measurements, anomaly signals, and bounded recommendations.
 *
 * IMPORTANT:
 * - This class cannot reserve, settle, release, freeze, unfreeze, or mutate pricing.
 * - Recommendations are advisory inputs for routing/Overseer/Ascalon.
 * - The Treasury Constitutional Kernel remains the only economic authority.
 * - Forecasts are descriptive extrapolations, never admission limits.
 */

import type {
  TreasuryLedgerEvent,
  TreasuryReport,
} from "./TreasuryContracts";
import type { TreasuryService } from "./TreasuryService";
