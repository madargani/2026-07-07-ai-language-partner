# Phase 2: AI Conversation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-07
**Phase:** 2-AI Conversation
**Areas discussed:** LLM Provider, Session threading, Correction format, Context management, Bot persona, Session data model

---

## LLM Provider

| Option | Description | Selected |
|--------|-------------|----------|
| OpenAI (GPT-4o) | OpenAI SDK v6. Industry standard, strong multilingual. | ✓ |
| Anthropic (Claude 3.5 Sonnet) | @anthropic-ai/sdk. Excellent nuanced correction. | |
| You decide — agent picks | Let researcher/planner decide. | |

**User's choice:** OpenAI (GPT-4o)
**Notes:** The stack research mentioned both, user chose OpenAI for the conversation model.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded prompt template | Single system prompt in code with placeholders. | |
| Template file in prompts/ directory | YAML/JSON files loaded at startup. | ✓ |
| You decide | Agent discretion. | |

**User's choice:** Template file in prompts/ directory
**Notes:** Easier to iterate without code changes, aligns with maintainability.

---

| Option | Description | Selected |
|--------|-------------|----------|
| gpt-4o (standard) | Full GPT-4o. Best quality, higher cost. | |
| gpt-4o-mini | Cheaper, less capable for nuanced tutoring. | ✓ |
| You decide | Let research find best tradeoff. | |

**User's choice:** gpt-4o-mini
**Notes:** Pragmatic cost choice for a single-user personal bot. The stack called this "low-tier" but it's the sole conversation model for Phase 2.

---

## Session Threading

| Option | Description | Selected |
|--------|-------------|----------|
| Same channel, reply tracking | Bot uses Discord reply chain to track session. | |
| Discord threads | /new creates a private thread per session. | ✓ |
| You decide | Let planner decide based on Discord API limits. | |

**User's choice:** Discord threads
**Notes:** Clean isolation, clear message-to-session mapping.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Private thread | Only user and bot see it. | ✓ |
| Public thread | Visible to other server members. | |

**User's choice:** Private thread
**Notes:** Personal practice, no need for public visibility.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Numbered sessions | session-1, session-2 per user. | |
| Date-based | language-practice-2026-07-07. | |
| Custom name from /new | User provides session_name in /new. | ✓ |

**User's choice:** Custom name, default to date-based if no name provided
**Notes:** CONV-01 already specifies /new [session_name]. Date fallback works when name omitted.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Archive thread on end | Set thread to archived state on session close. | ✓ |
| Leave thread open | Thread stays active. | |

**User's choice:** Archive thread on end
**Notes:** Keeps channel clean while preserving history.

---

## Correction Format

| Option | Description | Selected |
|--------|-------------|----------|
| Bulleted list per error | Each correction as a bullet. Original + correction. | |
| Inline annotated reply | Bot repeats user message with inline corrections. | ✓ |
| You decide | Agent discretion. | |

**User's choice:** Inline annotated reply
**Notes:** Bot shows user's message with corrections marked inline.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Single embed with sections | Natural response + correction block, one message. | ✓ |
| Two separate messages | Natural message + correction follow-up. | |

**User's choice:** Correction block on top, natural response below with divider
**Notes:** Learning-first: corrections before response, but all in one message.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Omit correction block entirely | Only show natural response on clean messages. | |
| Show "No errors found!" | Include positive reinforcement block. | ✓ |

**User's choice:** Show "No errors found!"
**Notes:** Positive reinforcement on clean messages.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Grammar + vocabulary only | Focus on structural errors and wrong word choice. | |
| All types incl. style/naturalness | Grammar, vocab, AND unnatural phrasing. | ✓ |
| You decide | Agent discretion. | |

**User's choice:** All types incl. style/naturalness (budget-2 caps)
**Notes:** Budget naturally limits what's shown to the most important errors. Style feedback is valuable for language learning.

---

## Context Management

| Option | Description | Selected |
|--------|-------------|----------|
| Progressive summarization | Running summary every N turns, discard old messages. | ✓ |
| Full history always | Pass all messages as context. | |
| Sliding window | Keep last ~20 messages, drop oldest. | |

**User's choice:** Progressive summarization
**Notes:** Most cost-effective. GPT-4o-mini does the summarization.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Summarize every 10 turns | Fixed interval approach. | |
| Summarize at 20 exactly | As specified in CONV-06. | |
| Dynamic — token threshold | Summarize when context approaches cost limit. | ✓ |

**User's choice:** Dynamic (token threshold), keep last few messages verbatim
**Notes:** Adaptive to message length. Recent messages kept exact for current reply context.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Session model field in PostgreSQL | summary text field in Session model. | ✓ |
| Redis cache | Faster but needs persistence for CONV-08. | |
| You decide | Agent discretion. | |

**User's choice:** Session model field in PostgreSQL
**Notes:** Aligns with CONV-08 persistence requirement.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Store all messages | Full message persistence. | ✓ |
| Store only recent + summary | Only summary + last N messages persist. | |
| You decide | Agent discretion. | |

**User's choice:** Store full content in Message table
**Notes:** DB stores everything for rehydration/analysis. LLM context window gets only summary + recent (separate concern).

---

## Bot Persona

| Option | Description | Selected |
|--------|-------------|----------|
| Friendly language tutor | Encouraging, patient, teacherly. | |
| Native conversation partner | Casual, natural, correction-light. | ✓ |
| You decide | Agent discretion. | |

**User's choice:** Native conversation partner
**Notes:** Correction-light, flow-focused. Natural speaker, not a teacher.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Implicit adaptation only | LLM infers level from conversation quality. | ✓ |
| Explicit skill field + implicit | User model has skill_level field. | |
| You decide | Agent discretion. | |

**User's choice:** Implicit adaptation only (no explicit field)
**Notes:** No friction onboarding. LLM naturally adjusts complexity. SETUP-04.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Simple directive | "Hi! Let's practice Spanish." Direct. | |
| Target-language immersion | Greeting entirely in target language. | ✓ |
| You decide | Agent discretion. | |

**User's choice:** Target-language immersion
**Notes:** Sets the tone for practice immediately.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Flag as recurring pattern | Note "You've made this error before" in corrections. | |
| Treat each occurrence independently | Correct naturally without special treatment. | ✓ |

**User's choice:** Treat each occurrence independently
**Notes:** Pressure-free practice, natural flow. No flagging of repeat errors.

---

## Session Data Model

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: user, thread, status | Basic session fields. Messages separate. | |
| Session with summary embed | Above plus summary, message count, correction count. | ✓ |
| You decide | Agent discretion. | |

**User's choice:** You decide — agent discretion
**Notes:** Planner determines exact model based on requirements and Prisma conventions.
Recommended: id, userId, discordThreadId, status, summary, messageCount, correctionCount, createdAt, endedAt.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Store full content | Every message persisted. Full rehydration. | ✓ |
| Store only recent + summary | Trimmed when summarized. Storage-efficient. | |

**User's choice:** Store full content in Message table
**Notes:** Enables full rehydration and historical analysis.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Keep User minimal, extend Session | Skill metadata per-session, not on User. | ✓ |
| Extend User with skill fields | skillLevel, totalSessions on User model. | |

**User's choice:** Keep User minimal, extend Session with metadata
**Notes:** Phase 1 D-09 deferred skill fields. Confirmed they stay off User model.

---

## the agent's Discretion

- Session model exact field ordering and defaults
- Message storage pruning policy (retention, cleanup)
- Prompts directory structure (e.g., `prompts/conversation/system.md`)
- Exact token threshold for summarization trigger

## Deferred Ideas

None — discussion stayed within phase scope.
