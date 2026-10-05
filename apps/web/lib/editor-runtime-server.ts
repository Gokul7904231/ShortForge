import * as path from "node:path";
import { MongoDBClient } from "@/factoryos/core/database/MongoDBClient";
import { MongoEditorRevisionStore, DiskEditorRevisionStore } from "@/factoryos/core/editor/EditorRevisionStore";
import { DurableEditor } from "@/factoryos/core/editor/DurableEditor";
import { EditorRuntime } from "@/factoryos/core/editor/EditorRuntime";

let runtimePromise: Promise<EditorRuntime> | null = null;
let mongoClient: MongoDBClient | null = null;

export async function getEditorRuntime(): Promise<EditorRuntime> {
  if (runtimePromise) return runtimePromise;

  runtimePromise = (async () => {
    const production = process.env.NODE_ENV === "production";
    const mongoUri =
      process.env.FACTORYOS_MONGO_URI ||
      process.env.MONGODB_URI ||
      "";

    if (production || mongoUri) {
      mongoClient = new MongoDBClient(
        mongoUri || "mongodb://127.0.0.1:27017",
        process.env.FACTORYOS_MONGO_DB_NAME || "factoryos",
      );
      const connected = await mongoClient.connect();
      if (!connected || !mongoClient.getDb()) {
        if (production) {
          throw new Error("EDITOR_RUNTIME_PERSISTENCE_UNAVAILABLE");
        }
      } else {
        return new EditorRuntime(new DurableEditor(new MongoEditorRevisionStore(mongoClient.getDb()!)));
      }
    }

    const diskPath = path.join(process.cwd(), "apps", "web", "data", "editor-runtime");
    return new EditorRuntime(new DurableEditor(new DiskEditorRevisionStore(diskPath)));
  })();

  try {
    return await runtimePromise;
  } catch (error) {
    runtimePromise = null;
    throw error;
  }
}
