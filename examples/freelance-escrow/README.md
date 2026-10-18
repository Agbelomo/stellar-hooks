# Freelance escrow example

Milestone payments with `useSorobanContract`, `useSorobanRead` and
`useCreateClaimableBalance`.

Flow: the client **funds** a milestone, **approves** it when the work is
accepted, and the freelancer **releases** the payment. A refund balance can be
locked as a claimable balance for the client.

> `useEscrow` (issue #924) is not in the library yet, so this example uses the
> building blocks that exist. When `useEscrow` lands, the refund step is the
> part it would replace.

## Escrow contract ABI

The example talks to any Soroban contract exposing:

| Function | Who | Effect |
| --- | --- | --- |
| `fund_milestone(client, freelancer, id: u32, amount: i128)` | client | Locks funds for a milestone |
| `approve_milestone(client, id: u32)` | client | Marks it approved |
| `release_milestone(freelancer, id: u32)` | freelancer | Pays out an approved milestone |
| `get_milestone(id: u32) -> { amount: i128, status: u32 }` | anyone | `0` none, `1` funded, `2` approved, `3` released |

This repository does not ship that contract; deploy your own and paste its ID.

## Run

```bash
cd examples/freelance-escrow
npm install
npm run dev
```

This example has not been run against a deployed contract.
