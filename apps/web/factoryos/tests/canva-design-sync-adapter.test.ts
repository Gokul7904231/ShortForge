import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";
import { CanvaDesignSyncAdapter } from "../../lib/canva/CanvaDesignSyncAdapter";
import { CanvaConnectionManager } from "../../lib/canva/CanvaConnectionManager";
import { LocalStorageProvider } from "../../lib/visual-assets/StorageProvider";

describe("CanvaDesignSyncAdapter & Asset Synchronization", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.CANVA_CLIENT_ID = "mock_canva_client_id_test";
    process.env.CANVA_CLIENT_SECRET = "mock_canva_client_secret_test";
    vi.spyOn(CanvaConnectionManager, "getConnection").mockResolvedValue({
      userId: "test_creator",
      accessToken: "test_access_token",
      expiresAt: Date.now() + 3600000,
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "CONNECTED",
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("lists accessible designs from Canva REST API", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "DAG_QUIZ_MASTER_V1",
            title: "Universal Quiz 9:16 Master Frame",
            thumbnail: { url: "https://export.canva.com/thumb.png" },
            urls: { edit_url: "https://canva.com/edit/1" },
            created_at: "2026-11-01T10:00:00Z",
            updated_at: "2026-11-02T12:00:00Z",
          },
        ],
      }),
    });
    global.fetch = mockFetch;

    const adapter = new CanvaDesignSyncAdapter();
    const designs = await adapter.listDesigns();

    expect(designs.length).toBe(1);
    expect(designs[0].id).toBe("DAG_QUIZ_MASTER_V1");
    expect(designs[0].title).toBe("Universal Quiz 9:16 Master Frame");
  });

  it("polls export job and persists asset to storage without relying on temporary URLs", async () => {
    const samplePng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job: { id: "job_export_99", status: "success", urls: ["https://export.canva.com/temp_download_url.png"] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => samplePng.buffer.slice(samplePng.byteOffset, samplePng.byteOffset + samplePng.byteLength),
      });
    global.fetch = mockFetch;

    const mockStorage = new LocalStorageProvider();
    const adapter = new CanvaDesignSyncAdapter(mockStorage);

    const urls = await adapter.pollExportJob("job_export_99");
    expect(urls[0]).toBe("https://export.canva.com/temp_download_url.png");

    const asset = await adapter.persistExportedAsset({
      temporaryUrl: urls[0],
      role: "glass_card_frame",
      packId: "quiz-universal-canva-v1",
      format: "png",
    });

    expect(asset.role).toBe("glass_card_frame");
    expect(asset.sha256).toBeDefined();
    expect(asset.b2Uri).toContain("local://shortsfactory-assets/canva-packs/quiz-universal-canva-v1/glass_card_frame.png");
    expect(asset.fileSizeBytes).toBe(samplePng.length);
  });

  it("gracefully falls back to ShortForge native renderer when Autofill is unavailable", async () => {
    vi.spyOn(CanvaConnectionManager, "probeUserCapabilities").mockResolvedValue({
      raw: {},
      grantedScopes: ["profile:read", "design:content:read"],
      canAutofill: false, // Canva Pro Lite restriction
      canExport: true,
      canReadDesigns: true,
      canWriteAssets: true,
      subscriptionTier: "pro_lite",
      timestamp: new Date().toISOString(),
    });

    const adapter = new CanvaDesignSyncAdapter();
    const result = await adapter.checkAndRunAutofill("DAG_TEMPLATE_1", { question: "Sample question" });

    expect(result.autofillAvailable).toBe(false);
    expect(result.message).toContain("Autofill unavailable on Canva Pro Lite");
    expect(result.message).toContain("native ShortForge");
  });

  it("builds an immutable versioned design-pack manifest with SHA-256 digest", () => {
    const adapter = new CanvaDesignSyncAdapter();
    const manifest = adapter.buildManifest({
      packId: "quiz.canva.cinematic.pack.v1",
      version: "1.0.0",
      sourceDesignId: "DAG_QUIZ_MASTER_V1",
      templateDisplayName: "Universal Cinematic Canva Visual Pack v1.0",
      assets: {
        glass_card_frame: {
          role: "glass_card_frame",
          fileName: "glass_card_frame.png",
          storageKey: "shortsfactory-assets/canva-packs/quiz.canva.cinematic.pack.v1/glass_card_frame.png",
          b2Uri: "b2://shortsfactory/canva-packs/quiz.canva.cinematic.pack.v1/glass_card_frame.png",
          localPath: "assets/canva/packs/quiz.canva.cinematic.pack.v1/glass_card_frame.png",
          sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          format: "png",
          width: 1080,
          height: 1920,
          fileSizeBytes: 1024,
        },
      },
      ownerApprovalStatus: "APPROVED",
    });

    expect(manifest.packId).toBe("quiz.canva.cinematic.pack.v1");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.canvas.width).toBe(1080);
    expect(manifest.canvas.height).toBe(1920);
    expect(manifest.ownerApprovalStatus).toBe("APPROVED");
    expect(manifest.manifestSha256).toBeDefined();
    expect(manifest.manifestSha256?.length).toBe(64);
  });

  it("enforces immutability: rejects overwriting approved pack without version bump", async () => {
    const testPackDir = path.resolve(process.cwd(), "assets", "canva", "packs", "quiz.immutable.test.v1");
    if (fs.existsSync(testPackDir)) fs.rmSync(testPackDir, { recursive: true, force: true });

    try {
      const mockStorage = new LocalStorageProvider();
      const adapter = new CanvaDesignSyncAdapter(mockStorage);

      const manifest1 = adapter.buildManifest({
        packId: "quiz.immutable.test.v1",
        version: "1.0.0",
        sourceDesignId: "DESIGN_A",
        templateDisplayName: "Test Pack",
        assets: {},
        ownerApprovalStatus: "APPROVED",
      });

      // First save succeeds
      const saved = await adapter.saveManifest(manifest1);
      expect(saved.localPath).toBeDefined();

      // Attempting to overwrite the approved pack with different source design throws error
      const manifestTampered = adapter.buildManifest({
        packId: "quiz.immutable.test.v1",
        version: "1.0.0",
        sourceDesignId: "DESIGN_TAMPERED",
        templateDisplayName: "Test Pack Altered",
        assets: {},
        ownerApprovalStatus: "APPROVED",
      });

      await expect(adapter.saveManifest(manifestTampered)).rejects.toThrow("Immutable Design Pack Violation");
    } finally {
      if (fs.existsSync(testPackDir)) fs.rmSync(testPackDir, { recursive: true, force: true });
    }
  });

  it("recovers from 401 Unauthorized via automated token refresh", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      if (url.includes("/designs") && callCount === 1) {
        return new Response(JSON.stringify({ error: "invalid_token" }), { status: 401 });
      }
      if (url.includes("/oauth/token")) {
        return new Response(JSON.stringify({ access_token: "new_refreshed_token", expires_in: 3600 }), { status: 200 });
      }
      return new Response(JSON.stringify({ items: [{ id: "DAG_RECOVERED", title: "Recovered Design" }] }), { status: 200 });
    });
    global.fetch = mockFetch;

    vi.spyOn(CanvaConnectionManager, "getRawStoredRecord").mockResolvedValue({
      userId: "test_creator",
      accessToken: "old_token",
      refreshToken: "valid_refresh_token",
      expiresAt: Date.now() + 100000,
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "CONNECTED",
    });

    const adapter = new CanvaDesignSyncAdapter();
    const designs = await adapter.listDesigns("test_creator");
    expect(designs[0].id).toBe("DAG_RECOVERED");
  });
});
