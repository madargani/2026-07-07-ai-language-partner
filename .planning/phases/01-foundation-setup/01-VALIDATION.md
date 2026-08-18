---
phase: 1
slug: foundation-setup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-07
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (Wave 0 creates) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose --coverage` |
| **Estimated runtime** | ~10 seconds |

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
| 01-01-01 | 01 | 1 | INFRA-02, INFRA-04 | — | N/A | unit | `npx vitest run` (failing tests expected) | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | SETUP-01, SETUP-02, SETUP-03, INFRA-02, INFRA-04, INFRA-05 | — | N/A | unit+integration | `npx vitest run && npx tsc --noEmit && npx prisma validate && npx biome check src/` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | INFRA-01, INFRA-05, SETUP-02 | — | N/A | manual+integration | checkpoint:human-verify | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — vitest configuration
- [ ] `src/__tests__/walking-skeleton.test.ts` — consolidated stubs for all phase requirements
- [ ] `npx vitest run --reporter=verbose` — verifies framework works (tests fail initially per TDD)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| /setup user flow | SETUP-01, SETUP-02 | Requires Discord interaction | Run bot, invoke /setup in Discord, verify language selection persists |
| Docker Compose startup | INFRA-01 | Requires Docker daemon | Run `docker compose up -d`, verify all 3 containers healthy |
| Graceful shutdown | INFRA-05 | Requires signal sending | `docker compose stop --timeout=10 bot`, check logs for cleanup |
| /new triggers setup prompt | SETUP-03 | Requires unconfigured user in Discord | Invoke /new without running /setup first, verify error response |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
