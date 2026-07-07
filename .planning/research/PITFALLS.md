# Domain Pitfalls: AI Language Learning Discord Bot

**Domain:** AI conversational language tutor (Discord bot with FSRS)
**Researched:** 2026-07-07
**Overall confidence:** HIGH (cross-validated across multiple production post-mortems and academic papers)

## Critical Pitfalls

Mistakes that cause rewrites or complete product failure.

### Pitfall 1: Over-correction Destroys Engagement

**What goes wrong:** The bot corrects every detected error, turning natural conversation into a nerve-wracking exam. Users stop talking because speaking becomes punishing.

**Why it happens:** The naive implementation prompts the LLM to "correct all errors." The model obliges enthusiastically. Every turn becomes a grammar lecture.

**Evidence:** Multiple production systems confirm this. Promova's AI Tutor found continuous correction made their product "unusable" — users described the tutor as "judgmental" even when the actual fault was latency. Research on Krashen's input hypothesis confirms immediate constant correction is psychologically harmful: it creates anxiety and suppresses output (the "affective filter" hypothesis).

**Consequences:** Users abandon after 1-2 sessions. Retention collapses. The product feels like a test, not a conversation partner.

**Prevention:**
- Implement a **correction budget**: max 2 major errors corrected per message (already in PROJECT.md — good)
- Use **recasts** (repeating the correct form naturally) rather than explicit metalinguistic error flagging
- Make correction behavior conditional on **learner level**: beginners need fewer corrections to keep them talking; advanced learners want more precision
- Suppress corrections during free-flow conversation; save detailed analysis for summary/review mode
- Never interrupt the user's turn to correct — wait for a natural pause

**Detection:** If session length averages < 3 turns or users frequently end sessions early, you are over-correcting.

---

### Pitfall 2: LLM Output Inconsistency (The "Different Every Time" Problem)

**What goes wrong:** The same prompt produces responses that differ wildly in length, tone, formatting, difficulty level, and quality across turns. Learners get confused when the bot oscillates between simple and complex language, or between terse and verbose responses.

**Why it happens:** LLMs are probabilistic. Without structural enforcement, every generation samples from the full distribution. The model does not automatically maintain a consistent persona, level, or interaction pattern across turns.

**Evidence:** Mocko.ai's post-mortem calls this their "biggest technical challenge." They invested heavily in prompt design, output validation, response formatting, and quality evaluation to tame inconsistency. Pocket Linguist found the raw model produces "flawless, complex sentences that immediately overwhelm an A2 learner" — the engineering challenge is getting it to "speak badly on purpose."

**Consequences:** Learners can't trust the experience. The bot feels unreliable. Advanced users get bored by overly simple responses; beginners get overwhelmed by complex ones.

**Prevention:**
- Use a **session state machine** (not free-form prompting) that tracks current mode (free conversation / correction / review)
- Pass the **learner's CEFR level** and **recent interaction history** in every system prompt
- Generate → validate → rewrite pipeline: generate a response, check it against level constraints, regenerate if necessary
- Pin model versions per mode and run weekly evals to catch regression

**Detection:** Record response length/readability metrics per session. If variance > 30% across turns for the same user, consistency is broken.

---

### Pitfall 3: 3-Second Discord Interaction Timeout + LLM Latency = Silent Failure

**What goes wrong:** Slash commands time out after 3 seconds. LLM calls take 2-8 seconds. The user sees "This interaction failed" or gets no response, then assumes the bot is broken.

**Why it happens:** Developers call `await callLLM(prompt)` directly inside the interaction handler without deferring first. Discord shows the failure to the user after exactly 3 seconds.

**Evidence:** Every major Discord bot deployment guide flags this. The vibebot.gg article calls it "the single most common reason a 'working' bot doesn't work." The discord.js guide explicitly warns: "If you call any awaited DB query, third-party API, or LLM before .reply(), you'll lose that race."

**Consequences:** Bot appears broken. Users leave the server. For a language learning bot where every interaction involves an LLM call, this is not an edge case — it is every command.

**Prevention:**
- ALWAYS call `interaction.deferReply()` immediately in every slash command handler — this buys you 15 minutes instead of 3 seconds
- Then `await callLLM(prompt)` and `interaction.editReply(result)` after
- Consider showing a "thinking..." state with an ephemeral follow-up

**Detection:** Monitor Discord API errors for code 10062 (Unknown Interaction). If > 1% of interactions hit this, your deferral pattern is broken.

---

### Pitfall 4: Free-Tier Hosting Kills Persistent Bot Processes

**What goes wrong:** The bot goes offline silently after 15-30 minutes. Users see the bot as "offline" or commands stop responding. The platform shows the process as "running" because the HTTP health check still responds, but the Discord WebSocket is dead.

**Why it happens:** Discord bots maintain a persistent WebSocket connection to Discord's gateway. Free hosting tiers (Render, Fly.io free tier) sleep idle services that don't receive HTTP traffic. A Discord bot has no inbound HTTP by default — the platform sees "no traffic" and kills the process.

**Evidence:** Belmo's write-up: "It worked on my laptop. It worked for the first 14 minutes after deploy. Then Render's free tier put the service to sleep... Render killed it." When the bot reconnects, Discord sees two sessions and disconnects the old one, causing duplicate message handling.

**Consequences:** Duplicate command processing, missed messages, user confusion, "the bot is broken" reports. In a language tutor, a mid-conversation disconnect loses session state and the learner's train of thought.

**Prevention:**
- Use a hosting platform that supports persistent **worker processes** (not just web services)
- Run the Discord gateway connection as a **separate worker process** that never sleeps
- Use a health check with a keep-alive endpoint on a separate port
- Implement graceful SIGTERM handling: close the WebSocket, flush pending writes
- PROJECT.md says Docker Compose — ensure your deployment distinguishes between "web" and "worker" process types

**Detection:** If users report "bot doesn't respond" but `docker ps` shows the container running, check the WebSocket connection status. If the bot has been up for < 15 minutes since last restart, the platform is likely sleeping the process.

---

### Pitfall 5: Treating FSRS as a Magic Black Box

**What goes wrong:** Data is stored incorrectly (only latest state, not history), parameters are never optimized, and the SRS queue mixes learning-state cards with review-state cards. The algorithm produces nonsensical intervals and users abandon the system.

**Why it happens:** FSRS is a statistical model with ~17 parameters that need to be fitted per-user from review history. Developers integrate the ts-fsrs library without understanding its data requirements. They store only the current card state, not the review log.

**Evidence:** The KasusKnacker post-mortem: they had to retrain all parameters when FSRS-4 → FSRS-5 came out because they hadn't stored raw review events. The FSRS deployment guide explicitly warns: "FSRS needs ~50 reviews per user before its parameter estimates stabilize." The Anki FSRS tutorial confirms: "At least 400 reviews are required for optimization" (in older versions).

**Consequences:** New users get default-parameter garbage intervals. Interval oscillation: cards get 1 day, then 47 days, then 1 day again. Users quit because the review experience feels random.

**Prevention:**
- **Store every review event** (not just latest state) — schema matters more than the algorithm
- Seed new users with **population-level parameters** (from a pre-trained model) to avoid cold start
- Implement a separate **learning phase** for brand-new cards (1m, 10m, 1d intervals) before mixing into FSRS review queue
- **Cap intervals** at 14 days for the first 3 months of use, then let the algorithm breathe
- Run parameter optimization periodically (after every ~500 reviews)
- Validate all ts-fsrs inputs at the application boundary with Zod

**Detection:** If users report "cards never show up" or "intervals make no sense," you likely have a data persistence or parameter initialization bug. Check: are review events logged? Are intervals clamped? Is the learning/review state correctly tracked?

---

### Pitfall 6: LLM Hallucinations in Educational Content Undermine Trust

**What goes wrong:** The bot generates incorrect grammar explanations, mistranslates words, or gives wrong language rules. Learners trust the bot and learn incorrect patterns. When they discover the error, trust is destroyed.

**Why it happens:** LLMs hallucinate. In educational contexts, learners are particularly bad at detecting errors — research shows only 14-25% of factual errors in pedagogical chatbots are identified by learners. And when errors go undetected, learning is harmed with large effect sizes.

**Evidence:** Multiple academic papers confirm this. The "Confirming Correct, Missing the Rest" paper (ACL 2026) found LLMs systematically over-validated incorrect solutions precisely where adaptive tutoring matters most. The chatbot error study (Li et al., 2025) found learners detected only ~20% of factual errors, and undetected errors had large negative effects on learning outcomes. The Yaya project found "the AI-generated content included occasional grammatical mistakes and awkward phrasing" that turned off intermediate learners.

**Consequences:** Users learn incorrect language patterns. Advanced users notice and churn. Beginners learn wrong rules that take longer to unlearn. Legal exposure if the bot gives confidently wrong information about high-stakes content.

**Prevention:**
- **Never present LLM output as authoritative** — frame corrections as suggestions ("it might be more natural to say...")
- Implement **output validation**: run grammaticality checks, flag contradictory statements, cross-reference against known language rules
- Use a **two-model pipeline**: one high-tier model generates, a cheaper model validates
- Log all corrections and review flagged content periodically
- For vocabulary lookups, use a dictionary API as the primary source and LLM as fallback
- From PROJECT.md: correction-light, flow-focused persona is the right instinct — minimize the surface area for hallucination

**Detection:** Track "correction rejected" user feedback. If users dispute corrections > 5% of the time, content quality is likely degraded.

---

### Pitfall 7: No State Machine for Conversation Mode — Intent Classification Fails

**What goes wrong:** The bot cannot distinguish between "I'm just chatting" and "I want a grammar explanation" and "I'm testing myself." It tries to infer intent from message content alone and gets it wrong 30% of the time. The session derails.

**Why it happens:** A message like "how do you say 'dog'?" could be a translation request, a vocabulary drill question, or a free conversation turn where the user forgot a word. Without explicit mode context, the LLM guesses — and guesses wrong frequently enough to frustrate users.

**Evidence:** Pocket Linguist's post-mortem: "I initially tried to detect intent from the user's message alone. This worked about 70% of the time and failed spectacularly the other 30%." The fix was a session state machine that only transitions on explicit user signals.

**Consequences:** User asks a vocabulary question, bot responds with a grammar lecture. User is practicing conversation, bot suddenly quizzes them. User gives up.

**Prevention:**
- Implement a **session state machine** from day one (not retrofitted)
- Define explicit modes: `FREE_CONVERSATION`, `CORRECTION`, `REVIEW`, `VOCAB_LOOKUP`, `TRANSLATION`
- Only transition modes based on **explicit user signals** (slash commands, button clicks) or **unambiguous intent patterns** (>90% confidence heuristics)
- Display the current mode to the user so they understand bot behavior
- PROJECT.md already specifies manual session management — good, but ensure explicit mode toggles exist

**Detection:** If users frequently say "no, I meant..." or the bot gives irrelevant responses, the intent classification is guessing wrong.

---

### Pitfall 8: Shipping Without Content QA Pipeline

**What goes wrong:** AI-generated learning content (vocabulary lists, example sentences, corrections, explanations) contains 2% actual errors and ~18% "not quite right" content. Scale amplifies this: 30,000 items means 600 broken exercises and 5,400 confusing ones.

**Why it happens:** LLMs generate content that looks plausible but is subtly wrong. Without automated validation, these errors reach users. The KasusKnacker project found 2% of generated exercises had actual errors and 18% needed improvements.

**Evidence:** KasusKnacker post-mortem: "Around 2% of generated exercises contained actual errors... around 18% of exercises needed improvements." Their solution: "use AI against itself" — run review passes that validate content and request corrections. The arXiv tutoring paper confirms: 25-47% of GPT-3.5-generated hints were discarded by human experts; 14% of GPT-4's self-verified hints were still inaccurate.

**Consequences:** Users learn wrong information. Manual QA becomes the bottleneck. The bot ships with embarrassing errors that erode trust.

**Prevention:**
- Implement a **self-verification pipeline**: generate content → have a second model review it → reject/regenerate low-confidence output
- Log all generated content with generation params so bad content can be traced and fixed
- Start with a small curated content seed and use AI for expansion, not the initial corpus
- Surface a "report incorrect" button on every correction/explanation

**Detection:** High "report incorrect" rate or user complaints about specific language patterns. Run periodic random audits of generated content.

## Moderate Pitfalls

### Pitfall 1: Ignoring Gateway Intent Configuration

**What goes wrong:** The bot connects, shows as online, registers commands, but never reads message content. Every message handler fires with empty content strings. No obvious error — just silence.

**Why it happens:** Discord API v10+ requires explicit Gateway Intent flags. `GuildMessages` and `MessageContent` intents must be enabled in both the Discord Developer Portal and in code. If either is missing, `message.content` arrives as an empty string.

**Evidence:** The vibebot.gg article calls this "brutal because there's no error." The bot appears functional but can't read anything.

**Prevention:**
- Double-check intents are enabled in Discord Developer Portal (under Bot settings)
- Set both `GatewayIntentBits.GuildMessages` and `GatewayIntentBits.MessageContent` in client constructor
- Add a startup validation check: query a known channel and confirm message content is non-empty

**Detection:** Bot shows as online, responds to slash commands, but never processes message content. No errors in logs.

---

### Pitfall 2: Hot/Cold FSRS Intervals Destroy User Trust

**What goes wrong:** A card gets 1-day interval, then after a "Good" rating it jumps to 47 days, then after "Again" it drops back to 1 day. Users feel the algorithm is broken or the bot forgot about them.

**Why it happens:** FSRS optimizes for theoretical retrievability, not user experience. The theoretically optimal schedule sometimes produces intervals that feel wrong to users. Without capping, early intervals oscillate wildly.

**Evidence:** The FSRS deployment guide: "The 'theoretically optimal' review schedule sometimes wants users to wait 47 days before seeing a card again. Users hate this — it feels like the app forgot about them." The ts-fsrs validation issue also shows that FSRS implementations frequently have bugs in interval calculation (e.g., clamping stability to max instead of min).

**Prevention:**
- Cap intervals at 14 days for the first 3 months of a user's history
- Clamp stability to a **minimum** (not a maximum) — this is a common implementation bug
- Use `hardInterval` and `easyInterval` multipliers to smooth transitions
- Show users their review queue health so they understand the schedule
- Test interval progression with a simulation before shipping

**Detection:** User reports of "this card never shows up" or "I keep seeing the same card over and over." Check interval logs for extreme oscillations.

---

### Pitfall 3: Session State Lost on Bot Restart

**What goes wrong:** The bot crashes or deploys a new version. All in-memory conversation context disappears. Users return to find the bot has no memory of their last session, their level, or what they were practicing.

**Why it happens:** Conversation state is stored in memory (a JavaScript object, a Map, a variable). Process restart wipes it. This is the #1 state management error in Discord bots.

**Evidence:** The Belmo architecture article: "I tried 'just use a JSON file' for v0. Workers restart, files vanish, members lost their launch history once. Two days later I wired Postgres." Every production Discord bot guide echoes this.

**Prevention:**
- **Use PostgreSQL from day one** for all persistent state (sessions, user progress, conversation history) — PROJECT.md already specifies this
- Persist session state after every meaningful interaction turn
- Implement session recovery: on startup, check for active sessions and restore context
- For conversation continuity, store compressed conversation summaries (not raw logs) for long-term memory

**Detection:** Users report the bot "doesn't remember me" or starts every session from scratch.

---

### Pitfall 4: Code-Switching Noise in Extraction Pipeline

**What goes wrong:** The background extraction pipeline that logs vocabulary/grammar items from chat mistakes native-language chatter for target-language errors, or extracts low-value items (common words, proper nouns, filler words) into the FSRS queue.

**Why it happens:** The LLM-based extraction pipeline receives raw chat text. Without clear boundaries on what constitutes a "learning item," it extracts everything unfamiliar-looking. PRoject.md mentions "code-switching auto-extracts native terms into FSRS bank as new items" but without a quality gate, this floods the review queue with junk.

**Consequences:** FSRS queue fills with non-useful items. Users get frustrated reviewing "the" and "hello" in their native language. The signal-to-noise ratio makes the SRS system useless.

**Prevention:**
- Implement a **two-stage extraction**: first classify whether an item is worth extracting (relevance + difficulty), then format it for the FSRS bank
- Use a **minimum frequency threshold**: only extract items that appear 2+ times before adding to the queue
- Let users review and reject extracted items before they enter the review rotation
- Filter out `stop words`, common proper nouns, and items at or below the user's established level

**Detection:** If the FSRS queue contains items the user would never need to learn (basic vocabulary in their native language, proper names), the extraction filter is too permissive.

---

### Pitfall 5: Slash Command Registration Hell (Global vs. Guild)

**What goes wrong:** During development, commands are registered globally. It takes up to 1 hour for changes to propagate. Developers test, find bugs, fix, redeploy — and wait another hour. Development velocity collapses.

**Why it happens:** Discord has two scopes for command registration. Global commands propagate slowly (up to 1 hour). Guild commands are instant. Developers ship to global without knowing the difference.

**Evidence:** The APIScout guide explicitly warns: "Global deployment can take up to one hour to propagate across Discord's infrastructure, which makes the iteration loop painful." The fix: use guild commands during dev, switch to global only for production.

**Prevention:**
- Use **guild-scoped commands** during development (instant propagation)
- Switch to **global commands** in production deployment (handle the propagation delay)
- Build a command registration script that detects `NODE_ENV` and switches scope automatically
- Run `bot.tree.sync()` with proper scope in the `on_ready` event

**Detection:** Deploy a new command, type `/` in Discord, and the command doesn't appear. Check your registration scope.

---

### Pitfall 6: LLM Cost Explosion from Unbounded Extraction

**What goes wrong:** Every user message triggers an LLM call for extraction, correction, and response generation. With 100 users sending 20 messages each per session, costs hit $50+/day. There is no cost monitoring, no rate limiting, no caching.

**Why it happens:** The extraction pipeline fires on every message. There's no deduplication, no caching of common corrections, no distinction between "extract" and "don't extract" messages. LLM costs scale linearly with chat volume.

**Evidence:** The KasusKnacker post-mortem found AI-generated solutions "tend to generate... naïve implementations around security and costs." After optimizing, they reduced hosting costs by 95%. The key insight: AI won't protect you from billing abuse — it increases exposure by making it easy to ship expensive patterns.

**Prevention:**
- Implement **extraction throttling**: only run the extraction pipeline every N messages, not every message
- **Cache common corrections**: same mistake → same correction → skip LLM call (use a hash of the user's message as cache key)
- Use a cheap model (GPT-4o-mini) for extraction and a premium model (GPT-4o) for conversation — PROJECT.md already specifies this
- Set a **daily usage budget per user** to prevent runaway costs
- Log every LLM call with token count and cost; alert if daily cost exceeds threshold
- Respect the correction budget from PROJECT.md: max 2 major corrections per message directly limits LLM calls

**Detection:** Monitor daily LLM API costs. If costs rise faster than active users, extraction or generation is running too frequently.

## Minor Pitfalls

### Pitfall 1: Ignoring Discord's Rate Limit Events

**What goes wrong:** The bot silently hits rate limits (429s). Some commands start failing with no visible error in the main logs. The bot appears "slow" or "unreliable."

**Prevention:** Log the `rateLimited` event from discord.js from day one. It's a free monitoring signal.

### Pitfall 2: Hardcoding Channel/Server IDs

**What goes wrong:** A command works on the dev server but crashes on production. A scheduled post targets a channel ID that doesn't exist in the new guild. The bot requires redeployment per server.

**Prevention:** Store guild-specific configuration in the database. Never hardcode IDs.

### Pitfall 3: Blocking the Event Loop in Message Handlers

**What goes wrong:** A synchronous operation (e.g., `JSON.parse` on a large object, a regex on a long string, file I/O) blocks the Node.js event loop. Discord's heartbeat times out. The bot disconnects with "heartbeat blocked for more than 10 seconds."

**Prevention:** All I/O and computation in message handlers must be async. Offload heavy processing to worker threads or separate processes.

### Pitfall 4: No Graceful Shutdown

**What goes wrong:** A container restart mid-conversation kills the process immediately. Discord's gateway session stays alive on their end. New deployment can't connect because the session limit is hit. At worst, duplicate bot instances post duplicate responses.

**Prevention:** Handle `SIGTERM` to close the WebSocket gracefully, flush pending state to the database, and signal readiness for shutdown.

### Pitfall 5: One-Size-Fits-All Desired Retention

**What goes wrong:** All users get the same FSRS retention target (e.g., 0.90). Advanced learners find reviews too frequent and boring; beginners forget cards too often and get discouraged.

**Prevention:** Let users configure their desired retention. Default to 0.90, but allow 0.85-0.93 range. The FSRS guide notes that per-preset retention targets are supported.

### Pitfall 6: No "Why" Behind Corrections

**What goes wrong:** The bot corrects "I go to store" → "I go to the store" without explaining *why* the article is needed. The user makes the same mistake next turn because they learned the correction but not the rule.

**Prevention:** Every correction should include a brief explanation of the rule being applied (1 sentence max). PROJECT.md's correction-light approach is correct, but when you do correct, teach the rule.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| **Phase 1: Conversation Sessions** | Over-correction (Pitfall #1) kills engagement from day one | Implement correction budget before first user test |
| | 3-second interaction timeout (Pitfall #3) on every command | `deferReply()` must be in the first command handler written |
| **Phase 2: FSRS Integration** | Cold start garbage intervals (Pitfall #5) for new users | Seed with population parameters; cap intervals at 14 days |
| | Storing only latest state instead of review log | Design the ReviewEvent schema before writing the FSRS adapter |
| **Phase 3: Extraction Pipeline** | Code-switching noise (Pitfall #4) flooding the FSRS queue | Build extraction quality gate before connecting to FSRS |
| | LLM cost explosion (Pitfall #6) from unbounded extraction | Implement throttling and caching before the first user test |
| **Phase 4: Review Flow** | Hot/cold intervals (Pitfall #2) destroy user trust | Simulation-test interval progression before shipping review UI |
| **Phase 5: Session Summary** | LLM cost explosion (Pitfall #6) from summary generation | Run summary generation asynchronously after session ends |
| **Phase 6: /setup Command** | Guild-vs-global command registration (Pitfall #5) slowing iteration | Use guild-scoped commands during development |
| **Phase 7: Multi-language Support** | Language-specific tokenization costs (Linguist post-mortem: Japanese took 3x longer than Spanish) | Budget extra time for CJK/Arabic/RTL languages |
| **Deployment** | Free-tier hosting kills WebSocket (Pitfall #4) | Use a platform with worker process support from day one |
| | No graceful shutdown — session state lost on restart (Pitfall #3) | Handle SIGTERM before shipping to production |
| **Cross-cutting** | LLM hallucinations in educational content (Pitfall #6) | Never present LLM output as authoritative; implement validation pipeline |

## Sources

| Source | Type | Confidence | Key Claims |
|--------|------|------------|------------|
| Promova AI Tutor post-mortem (dev.to, Jul 2026) | Production post-mortem | HIGH | Over-correction kills usability; latency is a UX requirement; correction is a policy problem |
| Mocko.ai lessons (dev.to, Jul 2026) | Production post-mortem | HIGH | LLM inconsistency is the biggest technical challenge; AI should guide, not replace |
| Pocket Linguist post-mortem (dev.to, Feb 2026) | Production post-mortem | HIGH | Intent classification fails 30% without state machine; correction via recasts; language-specific tokenization costs |
| Yaya post-mortem (pscoleman.me, Mar 2024) | Production post-mortem | MEDIUM | AI content has grammar errors; SRS in context is hard; product-market fit challenges |
| KasusKnacker post-mortem (asanchez.dev, Jan 2026) | Production post-mortem | HIGH | 2% error rate in AI content; 18% needs improvement; security/cost blind spots; AI duplicates code |
| vibrbot.gg discord.js gotchas (May 2026) | Discord production guide | HIGH | 3-second interaction race; intent flags are silent killers; rate-limited events; permission hierarchy |
| "Confirming Correct, Missing the Rest" (ACL 2026) | Academic paper | HIGH | LLMs over-validate incorrect solutions; accurate diagnosis ≠ pedagogically effective feedback |
| LLM Chatbot Errors study (Li et al., 2025) | Academic paper | HIGH | Learners detect only ~20% of chatbot errors; undetected errors harm learning with large effect |
| FSRS deployment guide (dev.to, May 2026) | Production guide | MEDIUM | FSRS cold start needs 50 reviews; learning ≠ reviewing; cap intervals for UX; store all review events |
| ts-fsrs documentation | Official docs | HIGH | API reference; parameter validation; interval calculation patterns |
| FSRS Kotlin audit (GitHub) | Code audit | HIGH | 11 confirmed defects in FSRS implementations; forgetting curve form wrong; stability clamp direction wrong |
| Rethinking Scaffolding in LLM Tutors (arXiv, 2026) | Academic paper | HIGH | Students bypass scaffolding in open-ended chat; mismatch between benchmarks and real-world deployment |
| Belmo 3-Process Architecture (belmo.io, May 2026) | Discord architecture guide | HIGH | Free tiers sleep WebSocket processes; separate gateway worker from web service; graceful shutdown |
| APIScout Discord bot guide (Apr 2026) | Discord development guide | HIGH | Guild vs global command registration; 3-second timeout; intent flags |
| Anki FSRS tutorial (GitHub) | Official documentation | HIGH | 400+ reviews needed for optimization; Hard is not Again; desired retention range |
