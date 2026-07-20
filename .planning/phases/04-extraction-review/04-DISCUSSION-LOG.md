# Phase 4: Extraction & Review - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-20
**Phase:** 4-Extraction & Review
**Areas discussed:** Extraction LLM choice, Extraction trigger & timing, BullMQ job design, Extraction Zod schema, Semantic filtering, Code-switching detection

---

## Extraction LLM Choice

| Option | Description | Selected |
|--------|-------------|----------|
| Use OpenAI gpt-4o-mini | Already have the SDK and API key. EXTRACTION_MODEL env var exists. No new dependencies. | ✓ |
| Use Gemini Flash | Cheaper per-token but needs new SDK install, new API key, and different error handling. | |

**User's choice:** Use OpenAI gpt-4o-mini
**Notes:** Pragmatic choice — existing infra, no new deps.

## Extraction Trigger & Timing

| Option | Description | Selected |
|--------|-------------|----------|
| After conversation response completes | Fire extraction after handleConversationMessage finishes. User already sees response. | ✓ |
| Concurrent with conversation reply | Fire extraction LLM call in parallel with conversation response. More complex. | |

**User's choice:** After conversation response completes
**Notes:** Simple approach, no UX impact.

## BullMQ Job Design

| Option | Description | Selected |
|--------|-------------|----------|
| Message content + context in payload | userId, sessionId, messageContent, targetLanguage, nativeLanguage, recentContext | ✓ |
| Message ID only | Worker queries DB for everything. Cleaner but adds DB queries per job. | |

**User's choice:** Message content + context
**Notes:** Worker has everything needed without extra DB queries.

| Option | Description | Selected |
|--------|-------------|----------|
| Single queue, concurrency 1 | One 'extraction' queue, one worker at a time. Simple. | ✓ |
| Single queue, concurrency 3 | Up to 3 concurrent workers for burst handling. | |

**User's choice:** Single queue, concurrency 1
**Notes:** Suitable for single-user bot.

| Option | Description | Selected |
|--------|-------------|----------|
| 3 retries with exponential backoff | Retry after 1s, 5s, 25s, then dead-letter queue. | ✓ |
| Retry once then discard | Simpler, less overhead. | |

**User's choice:** 3 retries with exponential backoff
**Notes:** Standard pattern, safe for non-critical extraction.

## Extraction Zod Schema

| Option | Description | Selected |
|--------|-------------|----------|
| Source + type only | { source, type: 'vocabulary'|'grammar' }. Matches ReviewItem model. | ✓ |
| Source + type + contextSnippet | Include surrounding conversation context. Not stored on ReviewItem. | |

**User's choice:** Source + type only
**Notes:** Minimal, matches existing model.

| Option | Description | Selected |
|--------|-------------|----------|
| detectedItems + typosIgnored | Structured separation per EXTR-02. | ✓ |
| Only detectedItems | Simpler, typos silently ignored. | |

**User's choice:** detectedItems + typosIgnored
**Notes:** Full schema per requirement.

## Semantic Filtering (EXTR-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Typos ignored, mistakes extracted | Mechanical typos → typosIgnored. Cognitive mistakes → detectedItems. LLM-prompt driven. | ✓ |
| Both go to detectedItems, typos tagged | Everything extracted, typos have isTypo flag. | |

**User's choice:** Typos ignored, mistakes extracted
**Notes:** Clean separation, purely LLM-driven.

## Code-Switching Detection (EXTR-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Target-language equivalent as source | LLM infers intended target term from context. Practice card is in target language. | ✓ |
| Native-language term as source | Store the native term user typed. But ReviewItem has no translation field. | |

**User's choice:** Target-language equivalent as source
**Notes:** Creates useful practice cards in the target language.

| Option | Description | Selected |
|--------|-------------|----------|
| Pass both languages in prompt | nativeLanguage + targetLanguage in job payload and prompt. | ✓ |
| LLM infers from context | No explicit language info in prompt. Less reliable. | |

**User's choice:** Pass both languages in prompt
**Notes:** Explicit language context improves extraction accuracy.

---

## the agent's Discretion

- BullMQ connection setup and worker structure
- Extraction system prompt content
- Error handling within the extraction worker
- Whether to batch pending jobs into one LLM call
- `/review` command UX details (embeds, buttons, prompts, flow)
- Review prompt generation approach

## Deferred Ideas

None — discussion stayed within phase scope.
