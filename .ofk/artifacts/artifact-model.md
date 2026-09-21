# Artifacts: The FactoryOS Artifact Model

> **Status**: OPERATIONAL  
> **Schema**: `apps/web/lib/jobs-history.ts` (`VideoJob`)  

---

## 1. The Canonical Job Manifest

Every video artifact synthesized by FactoryOS is represented by an immutable manifest entity (`VideoJob`) in Firestore and local storage:

```typescript
export interface VideoJob {
  id?: string;
  userId: string;
  tier?: "FREE" | "BASIC" | "PRO" | "ENTERPRISE" | "ADMIN";
  topic: string;
  style: string;
  script?: string;
  scenes?: Array<{
    id?: number;
    contactText: string;
    imagePrompt?: string;
  }>;
  status: "queued" | "processing" | "completed" | "failed";
  videoUrl?: string;
  downloadUrl?: string;
  error?: string;
  renderDurationSeconds?: number;
  videoSizeMb?: number;
  createdAt: string;
  completedAt?: string;
  executionToken?: string;
  executionAuthority?: "factoryos" | "legacy";
  missionId?: string;
}
```
