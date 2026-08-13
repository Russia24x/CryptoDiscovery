"use client";

import { useCallback, useEffect, useState } from "react";

const DB_NAME = "crypto-discovery-db";
const DB_VERSION = 1;

export type StoreName = "watchlist" | "recentlyViewed" | "scanCache";

interface StoredItem {
  id: string;
  data: unknown;
  timestamp: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("watchlist")) {
        db.createObjectStore("watchlist", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("recentlyViewed")) {
        db.createObjectStore("recentlyViewed", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("scanCache")) {
        db.createObjectStore("scanCache", { keyPath: "id" });
      }
    };
  });
}

async function dbGetAll(store: StoreName): Promise<StoredItem[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result as StoredItem[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function dbPut(store: StoreName, id: string, data: unknown): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put({ id, data, timestamp: Date.now() } as StoredItem);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

async function dbDelete(store: StoreName, id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

async function dbClear(store: StoreName): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

// Hook for managing a set of IDs (like watchlist) with IndexedDB
export function useIndexedDBSet(store: StoreName) {
  const [items, setItems] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  // Load all items on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await dbGetAll(store);
      if (!cancelled) {
        setItems(new Set(all.map((item) => item.id)));
        setLoaded(true);
        // Migrate from localStorage if IndexedDB is empty
        if (all.length === 0) {
          const lsKey = store === "watchlist" ? "crypto-watchlist" : store === "recentlyViewed" ? "crypto-recent" : null;
          if (lsKey) {
            try {
              const stored = localStorage.getItem(lsKey);
              if (stored) {
                const ids = JSON.parse(stored) as string[];
                for (const id of ids) {
                  await dbPut(store, id, { migrated: true });
                }
                if (!cancelled) {
                  setItems(new Set(ids));
                }
              }
            } catch {}
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store]);

  const add = useCallback(async (id: string) => {
    await dbPut(store, id, { added: Date.now() });
    setItems((prev) => new Set(prev).add(id));
  }, [store]);

  const remove = useCallback(async (id: string) => {
    await dbDelete(store, id);
    setItems((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [store]);

  const toggle = useCallback(async (id: string) => {
    if (items.has(id)) {
      await remove(id);
    } else {
      await add(id);
    }
  }, [items, add, remove]);

  const has = useCallback((id: string) => items.has(id), [items]);

  const clear = useCallback(async () => {
    await dbClear(store);
    setItems(new Set());
  }, [store]);

  return { items, loaded, add, remove, toggle, has, clear };
}

// Hook for managing an ordered list (like recently viewed) with IndexedDB
export function useIndexedDBList(store: StoreName, maxItems: number = 5) {
  const [items, setItems] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await dbGetAll(store);
      if (!cancelled) {
        // Sort by timestamp descending (most recent first)
        all.sort((a, b) => b.timestamp - a.timestamp);
        setItems(all.map((item) => item.id).slice(0, maxItems));
        setLoaded(true);
        // Migrate from localStorage
        if (all.length === 0) {
          const lsKey = store === "recentlyViewed" ? "crypto-recent" : null;
          if (lsKey) {
            try {
              const stored = localStorage.getItem(lsKey);
              if (stored) {
                const ids = JSON.parse(stored) as string[];
                for (let i = 0; i < ids.length; i++) {
                  await dbPut(store, ids[i], { order: i });
                }
                if (!cancelled) {
                  setItems(ids.slice(0, maxItems));
                }
              }
            } catch {}
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, maxItems]);

  const add = useCallback(async (id: string) => {
    await dbPut(store, id, { added: Date.now() });
    setItems((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, maxItems);
      return next;
    });
  }, [store, maxItems]);

  const remove = useCallback(async (id: string) => {
    await dbDelete(store, id);
    setItems((prev) => prev.filter((x) => x !== id));
  }, [store]);

  return { items, loaded, add, remove };
}
