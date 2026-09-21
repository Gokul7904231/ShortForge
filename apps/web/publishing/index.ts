/**
 * Publishing Bootstrap
 *
 * Registers all platform providers with the PublishingRegistry.
 * Import once in your app entry point — identical pattern to storage/index.ts.
 */

import { PublishingRegistry } from "./publishing-registry";
import { YouTubeProvider } from "./providers/youtube";
import { DryRunYouTubeProvider } from "./providers/dryrun-youtube";
import { TikTokProvider, InstagramProvider, XProvider, FacebookProvider } from "./providers/social-platforms";

let initialized = false;

export function initPublishingProviders(): void {
  if (initialized) return;
  initialized = true;

  console.log("[Publishing] Bootstrapping publishing providers...");
  PublishingRegistry.register(YouTubeProvider);
  PublishingRegistry.register(DryRunYouTubeProvider);
  PublishingRegistry.register(TikTokProvider);
  PublishingRegistry.register(InstagramProvider);
  PublishingRegistry.register(XProvider);
  PublishingRegistry.register(FacebookProvider);

  console.log(
    `[Publishing] Registered platforms: ${PublishingRegistry.getProviderIds().join(", ")}`
  );
}

// Auto-initialize on import
initPublishingProviders();

export {
  PublishingRegistry,
  YouTubeProvider,
  DryRunYouTubeProvider,
  TikTokProvider,
  InstagramProvider,
  XProvider,
  FacebookProvider,
};
