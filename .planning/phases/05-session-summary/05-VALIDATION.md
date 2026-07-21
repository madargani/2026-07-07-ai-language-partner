---
phase: 05
slug: session-summary
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-21
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.10 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose src/__tests__/commands/summary.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit` (type check) + relevant test file
- **After every plan wave:** Run `npm test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | SUMM-01, SUMM-05 | T-05-01 | Zod validation before createItem; sessionId from validated payload | unit | `npx prisma validate && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | SUMM-03, SUMM-04 | T-05-01 | sessionId optional passthrough in createItem | unit | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 05-01-03 | 01 | 1 | SUMM-03 | T-05-01 | Extraction payload sessionId stamped at creation, not on dedup | unit | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 05-02-01 | 02 | 2 | SUMM-02 | T-05-03 | response_format + try/catch for JSON parsing | unit | `npx vitest run src/__tests__/commands/summary.test.ts -t "strengths"` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 2 | SUMM-01, SUMM-03, SUMM-04, SUMM-05 | T-05-04, T-05-05 | Session status guard, thread archive after transaction | integration | `npx vitest run src/__tests__/commands/summary.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-03 | 02 | 2 | SUMM-01, SUMM-02, SUMM-03, SUMM-04 | T-05-04 | Embed shows all 6 sections; empty state handled | integration | `npx vitest run src/__tests__/commands/summary.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/commands/summary.test.ts` — test stubs for SUMM-01 through SUMM-05
- [ ] `src/__tests__/setup.ts` — add reviewItem.count mock, sessionSummary mock, $transaction mock

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Summary embed visual layout | SUMM-02, SUMM-03, SUMM-04 | embeds rendered by Discord client — snapshot tests possible but Discord embed rendering is visual | Start session, send messages, run /summary, verify embed shows all sections in correct order |
| Concurrent /summary race condition | SUMM-01 | Race condition requires timing-sensitive testing | Run /summary twice rapidly from two clients; second call should respond "don't have an active session" |
| SessionSummary created atomically with session end | SUMM-05 | Requires controlled database failure scenario | Stop PostgreSQL between getSessionSummary and endSession; session should remain active |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
