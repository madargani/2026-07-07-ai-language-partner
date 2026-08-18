---
status: complete
phase: 04-extraction-review
source:
  - 04-01-SUMMARY.md
  - 04-02-SUMMARY.md
started: 2026-07-20T12:00:00Z
updated: 2026-07-20T12:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server. Start the application from scratch. Server boots without errors, BullMQ extraction queue initializes, and a primary query returns live data.
result: pass

### 2. Background Extraction After Conversation
expected: Run `/new` to start a session, send a few messages in target language. After each response completes, the extraction job is enqueued and processed by the GPT-4o-mini worker. New FSRS cards appear in the database.
result: pass

### 3. /review Shows Due Cards
expected: Run `/review`. First due card appears with its source text and a structured prompt (use-in-sentence, fill-in-blank, or native-translation). Four FSRS rating buttons (Again/Hard/Good/Easy) and an Exit button are visible.
result: pass

### 4. Rate a Card — Next Card Appears
expected: Click any rating button (Again, Hard, Good, or Easy). The current card is dismissed and the next due card appears with its own prompt and rating buttons.
result: pass

### 5. Exit Review — Progress Summary
expected: Click the Exit button during the review flow. An ephemeral message shows progress summary: "X of Y items reviewed."
result: pass

### 6. Complete All Reviews — Celebration
expected: Rate through all due cards until the queue is empty. A completion celebration message is shown instead of a next card.
result: pass

### 7. Extraction Dedup
expected: Send the same vocabulary-rich message twice in a conversation. The second occurrence does not create a duplicate FSRS card — the extraction worker's dedup check prevents it.
result: pass

### 8. Graceful Shutdown — BullMQ Worker Closes
expected: Send SIGTERM to the bot process. The extraction worker and queue close cleanly (log line: "Extraction worker closed" or similar).
result: pass

### 9. Unconfigured User Guard
expected: Run `/review` as a user who has not completed `/setup`. The bot responds with an ephemeral message directing them to run `/setup` first.
result: pass

### 10. Idle Timeout During Review
expected: Start a `/review` session. Wait 2 minutes without interacting. The session expires and an expired message is shown.
result: pass

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
