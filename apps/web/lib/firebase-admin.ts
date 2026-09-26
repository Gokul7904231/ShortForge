import * as admin from "firebase-admin";

const hasCredentials = !!(
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_PRIVATE_KEY
);

if (!admin.apps.length && hasCredentials) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Replace escaped newline characters and strip surrounding quotes to parse properly in cloud environments
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/^"|"$/g, "").replace(/\\n/g, "\n"),
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  } catch (error: any) {
    console.error("Firebase admin initialization error:", error.message);
  }
}

// Helper to manage dynamic mock database in memory when Firebase is not available
const getMockCollectionMap = (name: string) => {
  const g = globalThis as any;
  if (!g.__mock_firestore) g.__mock_firestore = {};
  if (!g.__mock_firestore[name]) g.__mock_firestore[name] = new Map();
  return g.__mock_firestore[name];
};

class MockDocRef {
  constructor(private collName: string, private id: string) {}

  async set(data: any, options?: { merge?: boolean }) {
    const map = getMockCollectionMap(this.collName);
    const existing = map.get(this.id) || {};
    const newData = options?.merge ? { ...existing, ...data } : data;
    map.set(this.id, { ...newData, updatedAt: new Date().toISOString() });
  }

  async create(data: any) {
    const map = getMockCollectionMap(this.collName);
    if (map.has(this.id)) {
      throw new Error(`Document already exists: ${this.id}`);
    }
    map.set(this.id, { ...data, updatedAt: new Date().toISOString() });
  }

  async update(data: any) {
    const map = getMockCollectionMap(this.collName);
    const existing = map.get(this.id) || {};
    map.set(this.id, { ...existing, ...data, updatedAt: new Date().toISOString() });
  }

  async get() {
    const map = getMockCollectionMap(this.collName);
    const exists = map.has(this.id);
    const data = map.get(this.id) || null;
    return {
      exists,
      id: this.id,
      data: () => data,
    };
  }

  async delete() {
    const map = getMockCollectionMap(this.collName);
    map.delete(this.id);
  }
}

class MockQuery {
  private filters: Array<(doc: any) => boolean> = [];
  private sortField?: string;
  private sortDir: "asc" | "desc" = "asc";
  private limitCount?: number;

  constructor(private collName: string) {}

  where(field: string, op: string, val: any) {
    this.filters.push((doc) => {
      if (!doc || doc[field] === undefined) return false;
      if (op === "==") return doc[field] === val;
      if (op === ">") return doc[field] > val;
      if (op === "<") return doc[field] < val;
      return true;
    });
    return this;
  }

  orderBy(field: string, dir: "asc" | "desc" = "asc") {
    this.sortField = field;
    this.sortDir = dir;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  async get() {
    const map = getMockCollectionMap(this.collName);
    let docs: Array<{ id: string; data: any }> = Array.from(map.entries()).map((entry: any) => ({
      id: String(entry[0]),
      data: entry[1] as any,
    }));

    // Apply filters
    for (const filter of this.filters) {
      docs = docs.filter((d: { id: string; data: any }) => filter(d.data));
    }

    // Apply sort
    if (this.sortField) {
      const field = this.sortField;
      const dir = this.sortDir === "desc" ? -1 : 1;
      docs.sort((a: { id: string; data: any }, b: { id: string; data: any }) => {
        const valA = a.data[field];
        const valB = b.data[field];
        if (valA === undefined) return 1;
        if (valB === undefined) return -1;
        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
      });
    }

    // Apply limit
    if (this.limitCount !== undefined) {
      docs = docs.slice(0, this.limitCount);
    }

    const queryDocs = docs.map((d: { id: string; data: any }) => ({
      id: d.id,
      data: () => d.data,
    }));

    return {
      empty: queryDocs.length === 0,
      docs: queryDocs,
      forEach: (cb: any) => queryDocs.forEach(cb),
    };
  }
}

const mockCollection = (name: string) => {
  return {
    doc: (id: string) => new MockDocRef(name, id),
    where: (field: string, op: string, val: any) => new MockQuery(name).where(field, op, val),
    orderBy: (field: string, dir?: "asc" | "desc") => new MockQuery(name).orderBy(field, dir),
    limit: (count: number) => new MockQuery(name).limit(count),
    get: () => new MockQuery(name).get(),
  };
};

let mockTransactionQueue: Promise<any> = Promise.resolve();

export const db = (admin.apps.length
  ? admin.firestore()
  : {
      collection: (name: string) => mockCollection(name),
      batch: () => ({
        update: () => {},
        commit: async () => {},
      }),
      runTransaction: async (updateFunction: (transaction: any) => Promise<any>) => {
        const prev = mockTransactionQueue;
        let resolveNext: (value?: any) => void;
        mockTransactionQueue = new Promise((resolve) => {
          resolveNext = resolve;
        });

        await prev;
        try {
          const transaction = {
            get: async (docRef: any) => docRef.get(),
            set: (docRef: any, data: any, options?: any) => docRef.set(data, options),
            update: (docRef: any, data: any) => docRef.set(data, { merge: true }),
            delete: (docRef: any) => docRef.delete(),
          };
          return await updateFunction(transaction);
        } finally {
          resolveNext!();
        }
      },
    }) as unknown as admin.firestore.Firestore;

export const bucket = (admin.apps.length
  ? admin.storage().bucket()
  : {
      file: () => ({
        exists: async () => [false],
        delete: async () => {},
      }),
    }) as unknown as any;
