---
phase: 2
slug: ai-conversation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-07
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run --reporter=verbose --changed` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose --changed`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | CONV-01, CONV-02 | T-2-01 | Thread creation with validated name | unit | `npx vitest run src/__tests__/commands/new.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | CONV-03, CONV-04, CONV-05 | T-2-01 | LLM response with max 2 corrections | unit | `npx vitest run src/__tests__/conversation.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | CONV-06, CONV-08 | T-2-02 | Summarization triggers at token threshold | unit | `npx vitest run src/__tests__/session-rehydration.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 1 | CONV-07, CONV-08 | T-2-03 | Graceful shutdown saves session state | unit | `npx vitest run src/__tests__/commands/end.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-05 | 01 | 1 | INFRA-03 | T-2-01 | OPENAI_API_KEY validated in env config | unit | `npx vitest run` (config tests) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/conversation.test.ts` — conversation service tests (mock OpenAI, Discord, Prisma)
- [ ] `src/__tests__/session-rehydration.test.ts` — session rehydration from DB
- [ ] `src/__tests__/commands/new.test.ts` — `/new` command handler with thread creation
- [ ] `src/__tests__/commands/end.test.ts` — `/end` command handler
- [ ] Update `src/__tests__/walking-skeleton.test.ts` — config tests for OPENAI_API_KEY

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Discord thread creation and messaging | CONV-01, CONV-03 | Requires live Discord API | Run `/new` in dev server, verify thread created, send messages, verify responses |
| Correction embed appearance | CONV-05 | Visual formatting verification | Send messages with intentional errors, verify embed has correction block + divider + response |
| Session rehydration after restart | CONV-08 | Full integration test across process boundary | Start bot, create session, send messages, restart bot, verify conversation can resume |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency &lt; 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
