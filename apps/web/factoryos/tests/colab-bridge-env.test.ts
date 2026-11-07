import { describe, test, expect } from "vitest";
import { colabBridgeEnv } from "../core/compute/notebooks/ColabNotebookAdapter";

describe("Colab bridge child environment", () => {
  test("never forwards server secrets to the bridge subprocess", () => {
    process.env.INTERNAL_API_SECRET_KEY = "internal-secret";
    process.env.RENDER_WORKER_SECRET = "worker-secret";
    process.env.FIREBASE_PRIVATE_KEY = "firebase-private";
    process.env.GEMINI_API_KEY = "gemini-key";
    try {
      const env = colabBridgeEnv("https://colab.example", "runtime-token", "Y29kZQ==", 1000);

      expect(env).not.toHaveProperty("INTERNAL_API_SECRET_KEY");
      expect(env).not.toHaveProperty("RENDER_WORKER_SECRET");
      expect(env).not.toHaveProperty("FIREBASE_PRIVATE_KEY");
      expect(env).not.toHaveProperty("GEMINI_API_KEY");
      expect(Object.values(env)).not.toContain("internal-secret");
      expect(Object.values(env)).not.toContain("worker-secret");
    } finally {
      delete process.env.INTERNAL_API_SECRET_KEY;
      delete process.env.RENDER_WORKER_SECRET;
      delete process.env.FIREBASE_PRIVATE_KEY;
      delete process.env.GEMINI_API_KEY;
    }
  });

  test("still supplies what the bridge actually reads", () => {
    const env = colabBridgeEnv("https://colab.example", "runtime-token", "Y29kZQ==", 1234);

    expect(env.SHORTFORGE_COLAB_BASE_URL).toBe("https://colab.example");
    expect(env.SHORTFORGE_COLAB_RUNTIME_TOKEN).toBe("runtime-token");
    expect(env.SHORTFORGE_COLAB_CODE_B64).toBe("Y29kZQ==");
    expect(env.SHORTFORGE_COLAB_TIMEOUT_MS).toBe("1234");
  });

  test("keeps the interpreter lookup path so the child can be spawned", () => {
    process.env.PATH = "/usr/bin:/bin";
    try {
      expect(colabBridgeEnv("u", "t", "c", 1).PATH).toBe("/usr/bin:/bin");
    } finally {
      delete process.env.PATH;
    }
  });
});
