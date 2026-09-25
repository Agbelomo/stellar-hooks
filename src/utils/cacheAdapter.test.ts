import { describe, it, expect, vi } from "vitest";
import { createMemoryCacheAdapter, CacheAdapter } from "./cacheAdapter";

describe("CacheAdapter", () => {
  it("stores and retrieves cached values within TTL", async () => {
    const adapter = createMemoryCacheAdapter();
    const key = "test:account:1";
    const data = { sequence: "123", balance: "100" };

    expect(await adapter.get(key)).toBeNull();

    await adapter.set(key, data, 5000);
    expect(await adapter.get(key)).toEqual(data);

    await adapter.delete(key);
    expect(await adapter.get(key)).toBeNull();
  });

  it("supports custom external cache adapter implementation", async () => {
    const externalStore = new Map<string, unknown>();

    const customAdapter: CacheAdapter = {
      get: vi.fn(async (key: string) => (externalStore.get(key) as unknown) ?? null),
      set: vi.fn(async (key: string, data: unknown) => {
        externalStore.set(key, data);
      }),
      delete: vi.fn(async (key: string) => {
        externalStore.delete(key);
      }),
      clear: vi.fn(async () => {
        externalStore.clear();
      }),
    };

    await customAdapter.set("key1", { value: 42 });
    expect(customAdapter.set).toHaveBeenCalledWith("key1", { value: 42 });

    const val = await customAdapter.get("key1");
    expect(val).toEqual({ value: 42 });

    await customAdapter.delete("key1");
    expect(await customAdapter.get("key1")).toBeNull();
  });
});
