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

  constructor() {
    this.readyPromise = this.init();
  }

  private init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
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
    // Don't store blob URLs in DB
    const { imageUrl, audioUrl, ...nodeData } = node; 
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
    const blob = await this.getAssetBlob(id);
    if (blob) {
      return URL.createObjectURL(blob);
    }
    return null;
  }

  // --- Export/Import ---

  async exportStoryLine(): Promise<StoryLine> {
    await this.waitForReady();
    const nodes = await this.getAllNodes();
    const profile = await this.getSystemData<PsychProfile>('psychProfile');
    const memory = await this.getSystemData<MetaMemory>('metaMemory') || { deathCount: 0, endingsReached: [], narrativeThreads: [] };

    return {
      version: 1,
      timestamp: Date.now(),
      profile,
      memory,
      nodes
    };
  }

  async importStoryLine(data: StoryLine) {
    await this.waitForReady();
    await this.clearAll(); // Wipe current session for clean import

    if (data.profile) await this.saveSystemData('psychProfile', data.profile);
    await this.saveSystemData('metaMemory', data.memory);

    const tx = this.db!.transaction([STORES.NODES], 'readwrite');
    const store = tx.objectStore(STORES.NODES);
    
    for (const node of data.nodes) {
      store.put(node);
    }
    
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clearAll() {
    await this.waitForReady();
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
