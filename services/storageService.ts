
import { StoryNode, PsychProfile, MetaMemory, AppConfig, StoryLine } from '../types';

const DB_NAME = 'BandersnatchDB';
const DB_VERSION = 1;
const STORES = {
  NODES: 'nodes',
  ASSETS: 'assets',
  SYSTEM: 'system'
};

class BandersnatchStorage {
  private db: IDBDatabase | null = null;
  private readyPromise: Promise<void>;
  private urlCache: Map<string, string> = new Map();

  constructor() {
    this.readyPromise = this.init();
  }

  private init(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        return reject(new Error("IndexedDB not supported in this environment"));
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      // Safety timeout for hanging DB connections
      const timeout = setTimeout(() => {
          reject(new Error("Database initialization timed out."));
      }, 3000);

      request.onerror = () => {
        clearTimeout(timeout);
        console.error("DB Error", request.error);
        reject(request.error);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Story Nodes Store (Key path: id)
        if (!db.objectStoreNames.contains(STORES.NODES)) {
          const nodeStore = db.createObjectStore(STORES.NODES, { keyPath: 'id' });
          nodeStore.createIndex('parentId', 'parentId', { unique: false });
          nodeStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Binary Assets Store (Key path: id)
        if (!db.objectStoreNames.contains(STORES.ASSETS)) {
          db.createObjectStore(STORES.ASSETS, { keyPath: 'id' });
        }

        // System Settings (Key-Value)
        if (!db.objectStoreNames.contains(STORES.SYSTEM)) {
          db.createObjectStore(STORES.SYSTEM, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        clearTimeout(timeout);
        this.db = request.result;
        resolve();
      };
    });
  }

  async waitForReady() {
    await this.readyPromise;
  }

  // --- System Data ---

  async saveSystemData(key: string, value: any) {
    await this.waitForReady();
    return this.put(STORES.SYSTEM, { key, value });
  }

  async getSystemData<T>(key: string): Promise<T | null> {
    await this.waitForReady();
    const result = await this.get(STORES.SYSTEM, key);
    return result ? result.value : null;
  }

  // --- Story Nodes ---

  async saveNode(node: StoryNode) {
    await this.waitForReady();
    // Don't store blob URLs in DB, strictly strip them
    const { imageUrl, audioUrl, prefetched, ...nodeData } = node; 
    return this.put(STORES.NODES, nodeData);
  }

  async getNode(id: string): Promise<StoryNode | null> {
    await this.waitForReady();
    return this.get(STORES.NODES, id);
  }

  async getAllNodes(): Promise<StoryNode[]> {
    await this.waitForReady();
    return this.getAll(STORES.NODES);
  }

  async getAncestors(nodeId: string): Promise<StoryNode[]> {
    await this.waitForReady();
    const ancestors: StoryNode[] = [];
    let currentId: string | null = nodeId;

    while (currentId) {
      const node = await this.getNode(currentId);
      if (node) {
        ancestors.unshift(node);
        currentId = node.parentId;
      } else {
        currentId = null;
      }
    }
    return ancestors;
  }

  // --- Assets (Blobs) ---

  async saveAsset(id: string, blob: Blob, mimeType: string) {
    await this.waitForReady();
    return this.put(STORES.ASSETS, { id, blob, mimeType });
  }

  async getAssetBlob(id: string): Promise<Blob | null> {
    await this.waitForReady();
    const record = await this.get(STORES.ASSETS, id);
    return record ? record.blob : null;
  }

  async getAssetUrl(id: string): Promise<string | null> {
    if (this.urlCache.has(id)) {
      return this.urlCache.get(id)!;
    }

    const blob = await this.getAssetBlob(id);
    if (blob) {
      const url = URL.createObjectURL(blob);
      this.urlCache.set(id, url);
      return url;
    }
    return null;
  }

  revokeAllUrls() {
    this.urlCache.forEach(url => URL.revokeObjectURL(url));
    this.urlCache.clear();
  }

  // --- Export/Import Helpers ---

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64); 
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private async base64ToBlob(base64: string): Promise<Blob> {
    const res = await fetch(base64);
    return await res.blob();
  }

  // --- Export/Import ---

  async exportStoryLine(): Promise<StoryLine> {
    await this.waitForReady();
    const nodes = await this.getAllNodes();
    const profile = await this.getSystemData<PsychProfile>('psychProfile');
    const memory = await this.getSystemData<MetaMemory>('metaMemory') || { deathCount: 0, endingsReached: [], narrativeThreads: [] };

    // Collect all assets referenced by nodes
    const assetsExport: Record<string, { mimeType: string; data: string }> = {};
    
    for (const node of nodes) {
      if (node.imageAssetId) {
        const blob = await this.getAssetBlob(node.imageAssetId);
        if (blob) {
          const b64 = await this.blobToBase64(blob);
          assetsExport[node.imageAssetId] = { mimeType: blob.type, data: b64 };
        }
      }
      if (node.audioAssetId) {
        const blob = await this.getAssetBlob(node.audioAssetId);
        if (blob) {
          const b64 = await this.blobToBase64(blob);
          assetsExport[node.audioAssetId] = { mimeType: blob.type, data: b64 };
        }
      }
    }

    return {
      version: 1,
      timestamp: Date.now(),
      profile,
      memory,
      nodes,
      assets: assetsExport
    };
  }

  async importStoryLine(data: StoryLine) {
    await this.waitForReady();
    await this.clearAll(); // Wipe current session for clean import

    if (data.profile) await this.saveSystemData('psychProfile', data.profile);
    await this.saveSystemData('metaMemory', data.memory);

    const tx = this.db!.transaction([STORES.NODES, STORES.ASSETS], 'readwrite');
    
    // Restore Nodes
    const nodeStore = tx.objectStore(STORES.NODES);
    for (const node of data.nodes) {
      nodeStore.put(node);
    }

    // Restore Assets
    if (data.assets) {
      const assetStore = tx.objectStore(STORES.ASSETS);
      for (const [id, assetData] of Object.entries(data.assets)) {
        // If old format didn't have mimeType in wrapper, fallback
        const mime = assetData.mimeType || 'application/octet-stream'; 
        const blob = await this.base64ToBlob(assetData.data);
        assetStore.put({ id, blob, mimeType: mime });
      }
    }
    
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clearAll() {
    await this.waitForReady();
    this.revokeAllUrls(); // Clean up memory
    
    const tx = this.db!.transaction([STORES.NODES, STORES.ASSETS, STORES.SYSTEM], 'readwrite');
    tx.objectStore(STORES.NODES).clear();
    tx.objectStore(STORES.ASSETS).clear();
    tx.objectStore(STORES.SYSTEM).clear();
    
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Helpers ---

  private put(storeName: string, value: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(value);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private get(storeName: string, key: IDBValidKey): Promise<any> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private getAll(storeName: string): Promise<any[]> {
     return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

export const storageService = new BandersnatchStorage();
