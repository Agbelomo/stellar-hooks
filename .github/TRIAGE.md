# Stellar Hooks Issue Triage & Labeling Guide

This guide defines the standardized issue triage workflow, label taxonomy, and response guidelines for maintainers and contributors of **Stellar Hooks**.

Consistent triage ensures that bugs are verified quickly, feature requests are properly scoped, and community contributors know where they can jump in.

---

## 1. Triage Workflow

Every new issue should be triaged by a maintainer within **48 hours** following this 5-step process:

```
[ New Issue Created ]
        │
        ▼
1. Initial Check ────────► Incomplete / Missing details? ──► Apply `needs-info` or `needs-repro`
        │                                                     (Ask author using canned response)
        ▼ Valid & Complete
2. Classify Type ────────► Apply ONE Type label: `bug`, `enhancement`, `documentation`, `chore`, `question`, `rfc`
        │
        ▼
3. Classify Area ────────► Apply AT LEAST ONE Area label: `area:wallets`, `area:soroban`, `area:horizon`, etc.
        │
        ▼
4. Set Priority  ────────► If bug or critical fix: Assign `priority:critical`, `priority:high`, `priority:medium`, or `priority:low`
        │
        ▼
5. Route / Assign ───────► If beginner-friendly: add `good first issue`
                           If help is welcome: add `help wanted`
                           If ready for development: remove `needs-triage`
```

### Step 1: Initial Check & Sanity
- **Does it follow the issue template?**
  - Bug reports must include Stellar SDK version, browser/wallet environment, reproducible steps, and expected vs. actual behavior.
  - Feature requests must describe the problem, proposed hook API, and alternatives considered.
- **Is it a duplicate?**
  - Search open and closed issues. If already tracked, link the original issue and apply `duplicate`.
- **Is it a support question rather than a bug/feature?**
  - If it is asking how to use an existing hook or how Stellar/Soroban works, apply `question` and gently redirect to GitHub Discussions.

### Step 2: Reproduction & Verification (Bugs)
- Try to reproduce the issue using the reproduction repository or minimal code snippet provided.
- If unable to reproduce or missing essential information:
  - Add label: `needs-repro` or `needs-info`.
  - Leave a polite comment requesting the missing details.
  - *Policy:* Issues with `needs-info` or `needs-repro` and no activity after 14 days may be closed.

### Step 3: Classification & Labeling
- Assign **exactly one** Type label.
- Assign **at least one** Area label.
- Assign a **Priority** label if it is a bug or scheduled enhancement.

### Step 4: Community Onboarding
- If the issue has a clear solution and doesn't require deep architectural knowledge, label it `good first issue`.
- If maintainers welcome community PRs, label it `help wanted`.

---

## 2. Label Taxonomy & Definitions

### Type Labels (Choose exactly one)
| Label | Description | When to use |
|---|---|---|
| `bug` | An unintended failure or broken behavior in existing code | Hook crashes, unexpected return shape, regression, memory leak, incorrect calculation |
| `enhancement` | A new feature, new hook, or improvement to existing functionality | Adding new hook, supporting another wallet adapter, adding locale formatting helper |
| `documentation` | Changes solely to documentation, JSDoc, examples, or guides | Fixing typos, adding code examples, updating README, writing troubleshooting tips |
| `chore` | Maintenance tasks, tooling, CI/CD, or dependency upgrades | Updating devDependencies, vitest config, release scripts, lint rules |
| `question` | Inquiries regarding usage, design rationale, or support | "How do I use useFreighter with testnet?", "Is Soroban RPC supported on Futurenet?" |
| `rfc` | Request for Comments / architectural proposals requiring discussion | Large breaking API redesign, new provider architecture proposal |

---

### Area Labels (`area:*`) (Choose at least one)
| Label | Description | Subsystems / Files |
|---|---|---|
| `area:wallets` | Wallet adapters, connection lifecycle, and wallet signing | `src/wallets/*`, `useFreighter`, `useAlbedo`, `useXBull`, `useLobstr`, `useRabet`, `useWallet` |
| `area:soroban` | Soroban smart contract interaction, events, specs, and RPC simulation | `useSorobanContract`, `useSorobanRead`, `useSorobanEvents`, `useContractDeploy`, `useWasmUpload` |
| `area:horizon` | Horizon RPC queries, streams, balances, payments, trades, operations | `useStellarAccount`, `useStellarBalance`, `useAssetBalance`, `usePayment`, `useOffers`, `useHorizonStream` |
| `area:devtools` | DevTools overlay, debugging tools, browser extension panel, logger | `src/devtools/*`, `HookActivityOverlay`, `DevToolsPanel`, `src/utils/logger` |
| `area:cache` | Caching layer, adapters (SWR, TanStack Query, memory cache) | `src/utils/cacheAdapter.ts`, `packages/query`, `packages/swr` |
| `area:types` | TypeScript type declarations, branded types, validation | `src/types/*`, `src/utils/validation.ts`, StrKey guards |
| `area:i18n` | Internationalization, locale formatting, error strings | `src/utils/errorStrings.ts`, `src/utils/formatAmount.ts` |

---

### Status & Lifecycle Labels
| Label | Description | Action Required |
|---|---|---|
| `needs-triage` | Applied by default to new issues | Maintainer needs to review and classify the issue |
| `needs-repro` | Cannot reproduce the bug with provided information | Author must provide a minimal reproduction |
| `needs-info` | Awaiting clarification or details from the author | Author needs to respond to maintainer questions |
| `in-progress` | Contributor or maintainer is actively writing code | Work is actively underway (prevents duplicated effort) |
| `blocked` | Blocked on upstream SDK, browser extension release, or dependency | Wait for external resolution before continuing |
| `ready-for-review`| Associated PR is complete and awaiting review | Maintainers review code and CI results |

---

### Resolution Labels
| Label | Description | Notes |
|---|---|---|
| `duplicate` | Duplicate of another existing issue or PR | Always link the original issue number in closing comment |
| `wontfix` | Working as intended, out of project scope, or declined | Explain the reasoning respectfully before closing |
| `invalid` | Spam, incorrect repository, or unverified report | Close immediately |

---

### Priority Labels (`priority:*`)
| Label | Impact & Urgency | Target Resolution SLA |
|---|---|---|
| `priority:critical` | Security vulnerability, data loss, runtime crash affecting all users, build break | Fix within 24–48 hours (immediate patch release) |
| `priority:high` | Major feature or hook broken with no reasonable workaround | Fix in the next scheduled patch or minor release |
| `priority:medium` | Standard bug with workaround available, or valuable feature | Fix in normal development cycle |
| `priority:low` | Minor cosmetic issue, non-blocking edge case, low-urgency improvement | Addressed when bandwidth allows |

---

### Contributor Onboarding Labels
| Label | Criteria |
|---|---|
| `good first issue` | Well-scoped, isolated task with clear reproduction and solution. Ideal for contributors new to the codebase. Maintainer should leave brief pointers to relevant files. |
| `help wanted` | Tasks the core team welcomes external pull requests for. Issue description must define clear acceptance criteria. |

---

## 3. Canned Responses for Maintainers

### Requesting Reproduction Steps
```markdown
Hi @{author}, thanks for reporting this!

To help us investigate and resolve this quickly, could you please provide a minimal reproducible example (e.g. a code snippet, StackBlitz link, or GitHub repo)?

Please also confirm:
1. Version of `@stellar/stellar-sdk` and `stellar-hooks`
2. Browser and wallet extension version
3. Stellar network (e.g. Testnet, Mainnet, Futurenet)

Applying the `needs-repro` label in the meantime. Thank you!
```

### Redirecting Questions to Discussions
```markdown
Hi @{author}, thank you for reaching out!

This issue tracker is reserved for bug reports and feature requests. For questions, usage advice, and general troubleshooting, please start a discussion in our [GitHub Discussions forum](https://github.com/dark-princezz/stellar-hooks/discussions).

Closing this issue, but feel free to continue the conversation there!
```

### Marking as Duplicate
```markdown
Hi @{author}, thanks for the report.

This appears to be a duplicate of #{issue_number}. We are tracking this issue and consolidating discussion there.

Closing as duplicate.
```
