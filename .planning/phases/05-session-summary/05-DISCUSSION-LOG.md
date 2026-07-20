# Phase 5: Session Summary - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-21
**Phase:** 5-Session Summary
**Areas discussed:** Strengths derivation, Expansion metrics tracking, Queue health display, Historical persistence

---

## Strengths Derivation

| Option | Description | Selected |
|--------|-------------|----------|
| Rating timestamps in session window | Query ReviewItems where updatedAt falls between session start and end | |
| SessionId on ReviewItem | Add optional sessionId FK to ReviewItem | |
| LLM analysis of conversation | Ask the high-tier model to analyze conversation and identify 3 areas | ✓ |
| Existing high-tier CONVERSATION_MODEL | Reuse gpt-4o-mini that drives conversation | ✓ |
| High-tier model (GPT-4o / Claude) | More insightful but adds cost per session | |
| 3 summary sentences | 1-2 sentences per strength | |
| Specific terms + explanation | Extract actual vocabulary or grammar terms | ✓ |
| At /summary time | Single LLM call when user runs /summary | ✓ |
| Progressive during conversation | Builds up strengths accumulator as conversation proceeds | |
| New strengths field on Session | Add JSON field to Session model | |
| Compute on-the-fly | No schema change, strengths shown at display time only | ✓ |

**User's choice:** LLM analysis of conversation using CONVERSATION_MODEL, output specific terms + explanation, run at /summary time, compute on-the-fly

---

## Expansion Metrics Tracking

| Option | Description | Selected |
|--------|-------------|----------|
| createdAt within session range | Query ReviewItems where createdAt falls between session start and end | |
| extractionSessionId FK | Add optional sessionId FK on ReviewItem | ✓ |
| Just count ReviewItems created | Accept overlap with /add-item for v1 | |

**User's choice:** Add optional sessionId FK on ReviewItem. User raised concern about concurrent sessions causing overwrite — checked extraction worker code and confirmed dedup exists (findFirst on userId+source+type). sessionId only set at creation time, not overwritten. User accepted this approach.

---

## Queue Health Display

| Option | Description | Selected |
|--------|-------------|----------|
| Raw count | "5 items due in the next 24 hours" | ✓ |
| Count + qualitative label | light/moderate/heavy | |
| Breakdown by type | "3 vocabulary, 2 grammar" | |
| 📚 Queue: X due in 24h | Label with book icon | ✓ |
| 📅 Review queue: X items | Calendar icon | |
| ⏰ Due for review: X | Alarm clock icon | |

**User's choice:** Raw count — 📚 Queue: X due in 24h

---

## Historical Persistence

| Option | Description | Selected |
|--------|-------------|----------|
| Add structured fields to Session | Add strengths, expandedCount, queueHealth to Session model | |
| Create SessionSummary model | Separate model with FK to Session | ✓ |
| Store as JSON in summary field | JSON string in existing summary text field | |
| 1:1 relation to Session | One summary per session, unique FK | ✓ |
| 1:N relation | Multiple summaries per session | |
| Carry forward existing summary text | Include LLM conversation summary in SessionSummary | ✓ |
| Keep existing summary on Session only | SessionSummary only for new fields | |
| Minimal fields (strengths, queueHealth, expandedCount) | Only new structured fields | ✓ |
| Full fields (all current summary fields + new) | Self-contained record | |

**User's choice:** Create SessionSummary model with 1:1 relation to Session, minimal fields (strengths, queueHealth, expandedCount), carry forward existing LLM summary text.

---

## the agent's Discretion

- Exact SessionSummary field ordering, defaults, and column attributes
- LLM prompt for strength analysis
- SessionSummary creation timing (transaction vs separate)
- Embed layout for enhanced summary
- Whether to add getQueueHealth() to FSRS service or query inline

## Deferred Ideas

None.
