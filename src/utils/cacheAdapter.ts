/**
 * @file cacheAdapter.ts
 * @description Pluggable cache adapter interface for deduplication and caching across hook instances.
 * @package stellar-hooks
 * @license MIT
 */

import { getCache, setCache, clearCache } from "./index";

/**
 * Opt-in adapter interface allowing consumers to plug in custom cache layers
 * (e.g. React Query cache, SWR cache, Redis, or local in-memory storage)
 * to dedupe and cache RPC/Horizon queries across hook instances.
 */
export interface CacheAdapter {
  get<T>(key: string): T | null | Promise<T | null>;
  set<T>(key: string, data: T, ttlMs?: number): void | Promise<void>;
  delete(key: string): void | Promise<void>;
  clear?(): void | Promise<void>;
}

/**
 * Creates an in-memory CacheAdapter backed by the default stellar-hooks TTL cache.
 */
export function createMemoryCacheAdapter(): CacheAdapter {
  return {
    get: <T>(key: string) => getCache<T>(key),
    set: <T>(key: string, data: T, ttlMs?: number) => setCache<T>(key, data, ttlMs ?? 5000),
    delete: (key: string) => clearCache(key),
    clear: () => clearCache(),
  };
}

export const defaultCacheAdapter: CacheAdapter = createMemoryCacheAdapter();
