/**
 * @file useSorobanTokenBalance.ts
 * @description Vue 3 composable for reading Soroban/SAC token balances.
 * @package @stellar-hooks/vue
 * @license MIT
 */

import { ref, computed, watch, onScopeDispose, type Ref, type ComputedRef } from "vue";
import {
  fetchSorobanTokenBalance,
  NETWORK_CONFIGS,
  type NetworkConfig,
} from "@stellar-hooks/core";

export interface UseSorobanTokenBalanceOptions {
  config?: NetworkConfig;
  sorobanRpcUrl?: string;
  networkPassphrase?: string;
  decimals?: number;
  enabled?: boolean | Ref<boolean>;
  refetchInterval?: number;
}

export interface UseSorobanTokenBalanceReturn {
  balance: Ref<bigint | null>;
  formatted: ComputedRef<string | null>;
  isLoading: Ref<boolean>;
  error: Ref<Error | null>;
  lastFetchedAt: Ref<Date | null>;
  refetch: () => Promise<void>;
}

function formatBalance(raw: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const fraction = raw % divisor;
  const fractionStr = fraction.toString().padStart(decimals, "0");
  return `${whole}.${fractionStr}`;
}

/**
 * Vue 3 composable to query Soroban SAC token balance.
 *
 * @param contractId - Token contract address (C...)
 * @param accountAddress - Account address (G...)
 * @param options - Composable configuration options
 */
export function useSorobanTokenBalance(
  contractId: Ref<string | null | undefined> | string | null | undefined,
  accountAddress: Ref<string | null | undefined> | string | null | undefined,
  options: UseSorobanTokenBalanceOptions = {}
): UseSorobanTokenBalanceReturn {
  const balance = ref<bigint | null>(null);
  const isLoading = ref<boolean>(false);
  const error = ref<Error | null>(null);
  const lastFetchedAt = ref<Date | null>(null);

  const netConfig = options.config ?? NETWORK_CONFIGS.testnet;
  const rpcUrl = options.sorobanRpcUrl ?? netConfig.sorobanRpcUrl;
  const passphrase = options.networkPassphrase ?? netConfig.networkPassphrase;
  const decimals = options.decimals ?? 7;

  const getContractId = () => (typeof contractId === "object" && contractId !== null && "value" in contractId ? contractId.value : contractId);
  const getAccountAddress = () => (typeof accountAddress === "object" && accountAddress !== null && "value" in accountAddress ? accountAddress.value : accountAddress);
  const isEnabled = () => (typeof options.enabled === "object" && options.enabled !== null && "value" in options.enabled ? options.enabled.value : options.enabled ?? true);

  let timer: ReturnType<typeof setInterval> | null = null;

  const executeFetch = async () => {
    const cId = getContractId();
    const addr = getAccountAddress();

    if (!isEnabled() || !cId || !addr) {
      balance.value = null;
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      const raw = await fetchSorobanTokenBalance(rpcUrl, passphrase, cId, addr);
      balance.value = raw;
      lastFetchedAt.value = new Date();
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err));
    } finally {
      isLoading.value = false;
    }
  };

  const watchTargets = [];
  if (typeof contractId === "object" && contractId !== null && "value" in contractId) watchTargets.push(contractId);
  if (typeof accountAddress === "object" && accountAddress !== null && "value" in accountAddress) watchTargets.push(accountAddress);

  if (watchTargets.length > 0) {
    watch(watchTargets, () => {
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

  const formatted = computed(() => (balance.value !== null ? formatBalance(balance.value, decimals) : null));

  return {
    balance,
    formatted,
    isLoading,
    error,
    lastFetchedAt,
    refetch: executeFetch,
  };
}
