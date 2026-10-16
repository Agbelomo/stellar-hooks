/**
 * @file useStellarAccount.ts
 * @description Vue 3 composable for fetching Stellar account data using @stellar-hooks/core.
 * @package @stellar-hooks/vue
 * @license MIT
 */

import { ref, computed, watch, onScopeDispose, type Ref, type ComputedRef } from "vue";
import {
  fetchAccount,
  NETWORK_CONFIGS,
  type StellarAccountData,
  type NetworkConfig,
} from "@stellar-hooks/core";

export interface UseStellarAccountOptions {
  /** Custom network configuration or defaults to testnet */
  config?: NetworkConfig;
  /** Explicit Horizon URL override */
  horizonUrl?: string;
  /** Whether the composable should automatically fetch. Default: true */
  enabled?: boolean | Ref<boolean>;
  /** Polling interval in ms (0 to disable). Default: 0 */
  refetchInterval?: number;
}

export interface UseStellarAccountReturn {
  data: Ref<StellarAccountData | null>;
  isLoading: Ref<boolean>;
  error: Ref<Error | null>;
  lastFetchedAt: Ref<Date | null>;
  refetch: () => Promise<void>;
  balances: ComputedRef<StellarAccountData["balances"]>;
  xlmBalance: ComputedRef<string | null>;
}

/**
 * Vue 3 composable to load account details from Stellar Horizon.
 *
 * @param publicKey - Reactive ref, getter, or plain string of account public key (G...)
 * @param options - Configuration options
 */
export function useStellarAccount(
  publicKey: Ref<string | null | undefined> | string | null | undefined,
  options: UseStellarAccountOptions = {}
): UseStellarAccountReturn {
  const data = ref<StellarAccountData | null>(null);
  const isLoading = ref<boolean>(false);
  const error = ref<Error | null>(null);
  const lastFetchedAt = ref<Date | null>(null);

  const netConfig = options.config ?? NETWORK_CONFIGS.testnet;
  const horizonUrl = options.horizonUrl ?? netConfig.horizonUrl;

  const getPublicKey = () => (typeof publicKey === "object" && publicKey !== null && "value" in publicKey ? publicKey.value : publicKey);
  const isEnabled = () => (typeof options.enabled === "object" && options.enabled !== null && "value" in options.enabled ? options.enabled.value : options.enabled ?? true);

  let timer: ReturnType<typeof setInterval> | null = null;

  const executeFetch = async () => {
    const key = getPublicKey();
    if (!isEnabled() || !key) {
      data.value = null;
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      const result = await fetchAccount(horizonUrl, key);
      data.value = result;
      lastFetchedAt.value = new Date();
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err));
    } finally {
      isLoading.value = false;
    }
  };

  if (typeof publicKey === "object" && publicKey !== null && "value" in publicKey) {
    watch(publicKey, () => {
      void executeFetch();
    }, { immediate: true });
  } else {
    void executeFetch();
  }

  if (options.refetchInterval && options.refetchInterval > 0) {
    timer = setInterval(() => {
      void executeFetch();
    }, options.refetchInterval);
  }

  onScopeDispose(() => {
    if (timer) clearInterval(timer);
  });

  const balances = computed(() => data.value?.balances ?? []);
  const xlmBalance = computed(() => {
    const native = data.value?.balances.find((b) => b.isNative);
    return native ? native.balance : null;
  });

  return {
    data,
    isLoading,
    error,
    lastFetchedAt,
    refetch: executeFetch,
    balances,
    xlmBalance,
  };
}
