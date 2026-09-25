/**
 * Service Registry Initialization
 *
 * Binds singleton managers to the ServiceRegistry container upon import.
 * Engine registration is handled automatically by EngineDiscovery.
 */

import { ServiceRegistry } from "./ServiceRegistry";
import { Logger } from "../logger";
import { HealthManager } from "../health-manager";
import { VersionRegistry } from "../version-registry";
import { RateLimiter } from "../rate-limiter/index";
import { AuditLogger } from "../audit-logger";
import { RecommendationEngine } from "../recommendation-engine";
import { EngineDiscovery } from "./EngineDiscovery";

ServiceRegistry.register("logger", Logger);
ServiceRegistry.register("health", HealthManager);
ServiceRegistry.register("version", VersionRegistry);
ServiceRegistry.register("rateLimiter", RateLimiter);
ServiceRegistry.register("audit", AuditLogger);
ServiceRegistry.register("recommendation", RecommendationEngine);

import { SQLiteRenderQueue } from "./SQLiteRenderQueue";
ServiceRegistry.register("renderQueue", new SQLiteRenderQueue());

// Auto-discover and register all content engines
EngineDiscovery.discoverAll().catch((err) =>
  console.error("[ServiceRegistryInit] Engine discovery failed:", err)
);

// Dynamically load custom AI providers on startup
import { db } from "../firebase-admin";
import { UniversalProviderSDK } from "../providers/UniversalProviderSDK";

db.collection("providers").get()
  .then((snapshot) => {
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.enabled !== false) {
        UniversalProviderSDK.register({
          id: doc.id,
          name: data.name,
          apiKey: data.apiKey,
          baseUrl: data.baseUrl,
          modelEndpoint: data.modelEndpoint,
          optionalHeaders: data.optionalHeaders,
        }).catch((err) =>
          console.warn(`[ServiceRegistryInit] Custom provider "${doc.id}" failed to initialize:`, err.message)
        );
      }
    });
  })
  .catch((err) =>
    console.warn("[ServiceRegistryInit] Custom provider boot sync skipped:", err.message)
  );

console.log("[ServiceRegistryInit] Core services successfully bound.");

// Boot AIDoctor startup diagnosis on-demand (disabled on production boot to keep startup lightweight)
if (process.env.ENABLE_STARTUP_DIAGNOSIS === "true") {
  const { AIDoctor } = require("./AIDoctor");
  AIDoctor.runDiagnosis().catch((err: any) =>
    console.error("[ServiceRegistryInit] AIDoctor startup diagnosis failed:", err)
  );
}

// Legacy SQLite queue processing is opt-in only. FactoryOS is the default production execution authority.
import { QueueProcessor } from "./RenderQueueProcessor";

const executionAuthority = (process.env.EXECUTION_AUTHORITY || "factoryos").toLowerCase();
const legacyQueueEnabled = process.env.ENABLE_LEGACY_QUEUE_PROCESSOR === "true";

if (executionAuthority === "factoryos" && !legacyQueueEnabled) {
  console.log("[ServiceRegistryInit] FactoryOS is authoritative; legacy RenderQueueProcessor disabled.");
} else {
  QueueProcessor.start();
}
