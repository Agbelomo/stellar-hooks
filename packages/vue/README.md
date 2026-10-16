# @stellar-hooks/vue

Vue 3 composables for Stellar and Soroban applications, powered by the framework-agnostic `@stellar-hooks/core` library.

## Overview

`@stellar-hooks/vue` provides reactive Vue 3 composables (`useStellarAccount`, `useSorobanTokenBalance`) mirroring the most-used React hooks from `stellar-hooks`.

## Features

- **Framework-Agnostic Core**: Leverages `@stellar-hooks/core` for RPC, Horizon parsing, network configurations, and error types.
- **Full Vue 3 Reactivity**: Accepts reactive refs or static values for addresses/contracts, updating automatically when dependencies change.
- **Zero React Overhead**: Does not bundle or depend on React.

## Installation

```bash
npm install @stellar-hooks/vue @stellar-hooks/core @stellar/stellar-sdk vue
```

## Usage

### `useStellarAccount`

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useStellarAccount } from "@stellar-hooks/vue";

const publicKey = ref("GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI");
const { data, isLoading, xlmBalance, error } = useStellarAccount(publicKey);
</script>

<template>
  <div v-if="isLoading">Loading...</div>
  <div v-else-if="error">Error: {{ error.message }}</div>
  <div v-else-if="data">
    <p>Account: {{ data.accountId }}</p>
    <p>XLM Balance: {{ xlmBalance }}</p>
  </div>
</template>
```

### `useSorobanTokenBalance`

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useSorobanTokenBalance } from "@stellar-hooks/vue";

const contractId = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const accountAddress = ref("GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI");

const { balance, formatted, isLoading } = useSorobanTokenBalance(
  contractId,
  accountAddress
);
</script>

<template>
  <div>
    <span v-if="isLoading">Loading balance...</span>
    <span v-else>Balance: {{ formatted }}</span>
  </div>
</template>
```

## License

MIT
