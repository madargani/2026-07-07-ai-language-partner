# Plan 04-01 SUMMARY

**Phase:** 04 (extraction-review)
**Plan:** 01
**Status:** Complete
**Date:** 2026-07-20

## What Was Built

Background extraction pipeline that converts conversation messages into FSRS cards via GPT-4o-mini + BullMQ/Redis:

- **`src/types/extraction.ts`** — Zod schemas for `ExtractionJobPayload` (job queue input) and `ExtractionResult` (LLM structured output)
- **`src/lib/queue.ts`** — BullMQ `Queue`, `Worker`, and dead-letter queue (`extraction-dlq`) with exponential backoff, concurrency=1, error handlers
- **`src/services/extraction.ts`** — Worker processor: loads system prompt, calls `openai.chat.completions.parse()` with `zodResponseFormat`, dedup check, partial failure handling
- **`src/prompts/extraction/system.md`** — System prompt template with 8 extraction rules (cognitive vs mechanical, code-switching, vocabulary/grammar)
- **`src/events/messageCreate.ts`** (modified) — Enqueues extraction job after `handleConversationMessage` completes (fire-and-forget)
- **`src/index.ts`** (modified) — Worker shutdown before session save, startup logging
- **`src/__tests__/setup.ts`** (modified) — BullMQ/ioredis/OpenAI mocks
- **`src/__tests__/extraction.test.ts`** — 9 tests (schema validation, worker logic, null response, dedup, partial failure)

## Test Results

```
✓ extraction.test.ts — 9/9 passing
✓ Full suite — 46/46 passing
✓ npx tsc --noEmit — clean
```

## Key Decisions Preserved

- D-01: GPT-4o-mini via `EXTRACTION_MODEL` env var
- D-02: Post-response enqueue (fire-and-forget)
- D-03: Concurrency=1
- D-05: 3 retries, exponential backoff, DLQ
- D-06/D-07: Zod schema for structured output with `zodResponseFormat`
- D-08/D-09: LLM-driven semantic filtering and code-switching detection
