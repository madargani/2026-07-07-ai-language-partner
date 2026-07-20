---
phase: 04
slug: extraction-review
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-20
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | EXTR-06 | — | N/A — queue is server-side infra | unit | `npx vitest run src/__tests__/extraction.test.ts -t "enqueue"` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | EXTR-02, EXTR-03, EXTR-04 | T-04-01 | Zod schema validates output; LLM prompt treats content as data | unit | `npx vitest run src/__tests__/extraction.test.ts -t "schema"` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | EXTR-05 | — | Worker calls createItem for each detectedItem | unit | `npx vitest run src/__tests__/extraction.test.ts -t "worker"` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 2 | REVW-01, REVW-03, REVW-04 | T-04-02 | All ReviewItem queries filter by userId (Discord auth) | unit | `npx vitest run src/__tests__/review.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 2 | REVW-02, REVW-05 | — | Prompt type rotation cycles correctly; exit button terminates flow | unit | `npx vitest run src/__tests__/review.test.ts -t "flow"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/extraction.test.ts` — Extraction service unit tests (Zod schema validation, worker processor with mocked OpenAI + Prisma)
- [ ] `src/__tests__/review.test.ts` — Review command unit tests (button flow with mocked Prisma, FSRS rateItem)
- [ ] Update `src/__tests__/setup.ts` — add queue mocks to mockPrisma if needed, or mock `src/lib/queue.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Extraction fires after conversation response completes | EXTR-01 | Requires live Redis + Discord | Run a conversation session, check extraction queue processes the job |
| Review button interaction in Discord | REVW-05 | Requires live Discord client | Run `/review`, click through all rating buttons, verify next card shows |
| Graceful shutdown closes BullMQ connections | — | Requires live Redis | Send SIGTERM, check logs for "Extraction worker closed" |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
