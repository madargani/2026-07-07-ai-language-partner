---
status: partial
phase: 03-fsrs-spaced-repetition-bank
source: 03-01-SUMMARY.md
started: 2026-07-09T08:12:22.460Z
updated: 2026-07-09T08:12:22.460Z
---

## Current Test

[testing paused — 2 items blocked by server]

## Tests

### 1. Cold Start — FSRS defaults via ts-fsrs
expected: Run /add-item source=hola type=vocabulary. Item created with ts-fsrs default params. Verify via Prisma Studio.
result: blocked
blocked_by: server
reason: "Discord says the bot is offline"

### 2. /add-item Slash Command
expected: /add-item source=hola type=vocabulary creates item and replies with confirmation in Discord. /add-item source=ser type=grammar also works.
result: blocked
blocked_by: server
reason: "Discord says the bot is offline"

### 3. Vocabulary items stored with full FSRS fields
expected: createItem() stores vocabulary items with stability, difficulty, state, due, elapsedDays, scheduledDays, reps, lapses
result: pass
source: automated
coverage_id: D1

### 4. Grammar items stored with same FSRS fields
expected: createItem() stores grammar items with same FSRS fields when type=grammar
result: pass
source: automated
coverage_id: D2

### 5. ts-fsrs updates scheduling on review via rateItem()
expected: rateItem() with Good rating updates scheduling fields correctly via ts-fsrs algorithm
result: pass
source: automated
coverage_id: D3

### 6. 14-day interval cap for items < 3 months old
expected: rateItem() caps scheduled_days and due to 14 days for items < 3 months old
result: pass
source: automated
coverage_id: D4

### 7. getDueItems() returns items due <= now for user, ordered ASC
expected: getDueItems() returns only items where due <= now for the requesting user, ordered by due ascending
result: pass
source: automated
coverage_id: D7

## Summary

total: 7
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 2

## Gaps

[none yet]
