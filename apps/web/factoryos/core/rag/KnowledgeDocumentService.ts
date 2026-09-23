/**
 * FactoryOS Frontier v3 — KnowledgeDocumentService
 * Authoritative .okf Knowledge Pack & Persistent Knowledge Document Lookup
 */

import fs from "fs";
import path from "path";
import { EvidenceFactory, EvidenceRecord } from "../contracts/EvidenceRecord";

export interface RetrievedDocument {
  docId: string;
  title: string;
  sourcePath: string;
  contentExcerpt: string;
  relevanceScore: number;
}

export class KnowledgeDocumentService {
  private static instance: KnowledgeDocumentService;

  static getInstance(): KnowledgeDocumentService {
    if (!this.instance) {
      this.instance = new KnowledgeDocumentService();
    }
    return this.instance;
  }

  /**
   * Looks up real .okf / markdown / system documentation from disk.
   */
  async lookupDocument(query: string): Promise<EvidenceRecord<RetrievedDocument | null>> {
    const startTime = Date.now();
    const queryLower = query.toLowerCase();

    try {
      // 1. Search in .okf / .agents / config / docs directory if present
      const candidatePaths = [
        path.resolve(process.cwd(), ".okf"),
        path.resolve(process.cwd(), "config"),
        path.resolve(process.cwd(), "docs"),
        path.resolve(process.cwd(), ".agents"),
        path.resolve(process.cwd(), "factoryos"),
      ];

      for (const dir of candidatePaths) {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir, { recursive: true }) as string[];
          for (const file of files) {
            if (typeof file === "string" && (file.endsWith(".md") || file.endsWith(".json") || file.endsWith(".okf"))) {
              const fullPath = path.join(dir, file);
              try {
                const stat = fs.statSync(fullPath);
                if (stat.isFile() && stat.size < 500000) {
                  const content = fs.readFileSync(fullPath, "utf-8");
                  if (content.toLowerCase().includes(queryLower) || file.toLowerCase().includes(queryLower)) {
                    const snippet = content.slice(0, 400).trim();
                    const docData: RetrievedDocument = {
                      docId: path.basename(file),
                      title: path.basename(file, path.extname(file)),
                      sourcePath: fullPath,
                      contentExcerpt: snippet,
                      relevanceScore: 0.9,
                    };

                    return EvidenceFactory.create<RetrievedDocument>(
                      "DOCUMENT",
                      "KnowledgeDocumentService:LocalOKF",
                      "SUCCESS",
                      docData,
                      {
                        sourceId: docData.docId,
                        claims: [`Retrieved document: ${docData.title} from ${fullPath}`],
                        metadata: { latencyMs: Date.now() - startTime }
                      }
                    );
                  }
                }
              } catch {
                // Continue searching
              }
            }
          }
        }
      }

      // If document was not found, return truthful EMPTY / NOT_FOUND state
      return EvidenceFactory.create<RetrievedDocument | null>(
        "DOCUMENT",
        "KnowledgeDocumentService",
        "EMPTY",
        null,
        {
          error: `No .okf or workspace document matching "${query}" was found.`,
          metadata: { latencyMs: Date.now() - startTime }
        }
      );
    } catch (err: any) {
      return EvidenceFactory.create<RetrievedDocument | null>(
        "DOCUMENT",
        "KnowledgeDocumentService",
        "UNAVAILABLE",
        null,
        {
          error: `Knowledge store query error: ${err.message}`,
          metadata: { latencyMs: Date.now() - startTime }
        }
      );
    }
  }
}
