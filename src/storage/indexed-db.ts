import type { SerializedDocument } from '../core/types';
import type { StoragePort } from '../core/ports';
import type { StorageConfig } from '../core/config';

export class IndexedDBStorage implements StoragePort {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private config: StorageConfig) {}

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(this.config.dbName, this.config.dbVersion);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
        if (!db.objectStoreNames.contains('chunkCrops')) db.createObjectStore('chunkCrops');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  async saveDocument(doc: SerializedDocument): Promise<void> {
    const db = await this.getDB();
    await this.tx(db, 'documents', 'readwrite', (s) => s.put(doc));
  }

  async loadDocument(id: string): Promise<SerializedDocument | undefined> {
    const db = await this.getDB();
    return this.tx<SerializedDocument | undefined>(db, 'documents', 'readonly', (s) => s.get(id));
  }

  async listDocuments(): Promise<SerializedDocument[]> {
    const db = await this.getDB();
    return this.tx<SerializedDocument[]>(db, 'documents', 'readonly', (s) => s.getAll());
  }

  async deleteDocument(id: string): Promise<void> {
    const db = await this.getDB();
    await this.tx(db, 'documents', 'readwrite', (s) => s.delete(id));
  }

  async saveImage(id: string, blob: Blob): Promise<void> {
    const db = await this.getDB();
    await this.tx(db, 'images', 'readwrite', (s) => s.put(blob, id));
  }

  async loadImage(id: string): Promise<Blob | undefined> {
    const db = await this.getDB();
    return this.tx<Blob | undefined>(db, 'images', 'readonly', (s) => s.get(id));
  }

  async saveChunkCrop(chunkId: string, blob: Blob): Promise<void> {
    const db = await this.getDB();
    await this.tx(db, 'chunkCrops', 'readwrite', (s) => s.put(blob, chunkId));
  }

  async loadChunkCrop(chunkId: string): Promise<Blob | undefined> {
    const db = await this.getDB();
    return this.tx<Blob | undefined>(db, 'chunkCrops', 'readonly', (s) => s.get(chunkId));
  }

  async saveChunkCropsBatch(entries: Array<{ id: string; blob: Blob }>): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction('chunkCrops', 'readwrite');
    const store = tx.objectStore('chunkCrops');
    for (const e of entries) store.put(e.blob, e.id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  private tx<T>(db: IDBDatabase, storeName: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const req = fn(store);
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  }
}

export class InMemoryStorage implements StoragePort {
  private docs = new Map<string, SerializedDocument>();
  private images = new Map<string, Blob>();
  private crops = new Map<string, Blob>();

  async saveDocument(doc: SerializedDocument): Promise<void> {
    this.docs.set(doc.id, structuredClone(doc));
  }
  async loadDocument(id: string): Promise<SerializedDocument | undefined> {
    const d = this.docs.get(id);
    return d ? structuredClone(d) : undefined;
  }
  async listDocuments(): Promise<SerializedDocument[]> {
    return [...this.docs.values()].map((d) => structuredClone(d));
  }
  async deleteDocument(id: string): Promise<void> {
    this.docs.delete(id);
  }
  async saveImage(id: string, blob: Blob): Promise<void> {
    this.images.set(id, blob);
  }
  async loadImage(id: string): Promise<Blob | undefined> {
    return this.images.get(id);
  }
  async saveChunkCrop(id: string, blob: Blob): Promise<void> {
    this.crops.set(id, blob);
  }
  async loadChunkCrop(id: string): Promise<Blob | undefined> {
    return this.crops.get(id);
  }
  async saveChunkCropsBatch(entries: Array<{ id: string; blob: Blob }>): Promise<void> {
    for (const e of entries) this.crops.set(e.id, e.blob);
  }
}
