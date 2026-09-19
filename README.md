# jev-audit

[![npm version](https://img.shields.io/npm/v/jev-audit.svg)](https://www.npmjs.com/package/jev-audit)
[![npm downloads](https://img.shields.io/npm/dm/jev-audit.svg)](https://www.npmjs.com/package/jev-audit)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A516-green.svg)](package.json)
[![dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)
[![bundle size](https://img.shields.io/bundlephobia/minzip/jev-audit.svg)](https://bundlephobia.com/package/jev-audit)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-ff69b4.svg)](https://github.com/MagicBeansAI/jev-audit/pulls)

**Your LLM bill is full of decisions pretending to be generations.**

`jev-audit` finds every LLM call in your codebase that is really a *decision* — classify, route, score, verify — and shows you exactly what it looks like on [Jev](https://docs.typesafe.ai), TypeSafe AI's System One decision model.

```text
              frontier LLM          Jev
output        free text             typed decision + calibrated confidence
latency       1–10 s                ~100 ms
input cost    $3–15 / M tokens      $0.042 / M tokens
output cost   $15–75 / M tokens     free
hallucination whenever it wants     structurally impossible (fixed option set)
```

No API key. No network. Nothing leaves your machine.

## The 30-second version

```bash
npx jev-audit
```

```text
jev-audit scan — ~/acme-support
files scanned: 214    llm touchpoints: 37    decision-shaped: 11

hottest files:
    9  src/triage.js
    6  src/moderation.py
    4  src/router.ts

decision-shaped call sites (prime Jev candidates):
  src/triage.js:42      [chat-completion]  const dept = await openai.chat.completions.create({
  src/moderation.py:17  [chain-class]      classifier = ChatOpenAI(model="gpt-4o-mini")
  src/router.ts:88      [message-create]   const res = await anthropic.messages.create({
  ...

→ full inventory: jev-scan.json
```

Eleven of those 37 calls are decisions wearing a generator's clothes. That's usually where most of the spend and most of the latency lives.

## Then let your agent write the report

```bash
npm install -g jev-audit          # or keep using npx
jev-audit install claude          # claude | codex | cursor | grok | agy | pi | zcode | agents
                                  # anything else: jev-audit install --dir <skills-dir>
```

Ask your agent:

```text
> audit this repo with jev-audit
```

You get a **`JEV_AUDIT.md`** in the repo root:

```markdown
# Jev Audit — acme-support

- 37 LLM call sites · 11 Replace · 3 Hybrid · 19 Keep LLM · 4 Pure code
- Estimated saving on the Replace set: $212 per 1,000 calls (math in §5)
- Best quick win: src/triage.js:42 — leaf classification, lowest blast radius

| # | Location            | Job of the call                     | Tier                          |
|---|---------------------|-------------------------------------|-------------------------------|
| 1 | src/triage.js:42    | department + urgency + frustration  | Replace → choice + noul + score |
| 2 | src/moderation.py:17| safe / unsafe / borderline          | Replace → choice               |
| 3 | src/router.ts:88    | query → specialist agent            | Replace → choice + noul        |
| 4 | src/draft.js:12     | write the customer-facing reply     | Keep LLM (real generation)     |

…plus the draft Jev question JSON, confidence thresholds, target
architecture diagram, and a shadow-mode migration plan.
```

### What a replacement looks like

**Before** — 1.4 s, ~$0.003/call, JSON-parse roulette:

```js
const res = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'system', content: 'Classify this ticket. Reply with JSON…' }, …],
});
const { department, urgent } = JSON.parse(res.choices[0].message.content);
```

**After** — ~100 ms, ~$0.0000004/call, typed:

```js
const r = await client.systemOne({
  state: ticket,
  questions: {
    department: choice({ instructions: 'Which team should handle this',
                         criteria: { billing: '…', technical: '…', sales: '…' } }),
    is_urgent: noul({ instructions: 'The message conveys urgency' }),
    frustration: score({ instructions: 'How frustrated the customer appears',
                         criteria: ['Calm', 'Frustrated but civil', 'Very angry'] }),
  },
});

r.answers.department.choice     // "billing" — it cannot be anything else
r.answers.department.confidence // 0.84 → gate automation on this
```

## See it on a real project

We ran it on [promptfoo](https://github.com/promptfoo/promptfoo) — the popular LLM eval framework. The punchline: **the eval framework's own graders are decisions wearing a generator's clothes.** Its factuality check prompts an LLM, JSON-parses the reply back into a 5-option verdict, and keeps a regex fallback for when the parse fails — a Jev `choice` does this natively, at ~$0.025 vs $0.14–$2.30 per 1,000 grading calls and ~100 ms instead of seconds.

→ **[Read the full promptfoo audit](examples/promptfoo/JEV_AUDIT.md)** · [raw scanner output](examples/promptfoo/scan-output.txt) · [all examples](examples/README.md)

## The one table that matters

| Job at the call site | Verdict |
|---|---|
| Yes/no judgment on text (spam, urgent, jailbreak) | **Replace** → Jev `noul` |
| Pick one of N (intent, routing, category, moderation) | **Replace** → Jev `choice` |
| Level on a rubric (severity, quality, priority) | **Replace** → Jev `score` |
| Decide, then write | **Hybrid** — Jev decides, LLM writes |
| LLM output that needs checking against rules/sources | **Hybrid** — LLM writes, Jev verifies |
| Prose, summaries, code, translation | **Keep LLM** |
| Counting, dates, exact matching | **Pure code** — not even Jev |

## How it works

1. **Local scanner** — zero dependencies, zero network. Regex-inventories SDK imports (`openai`, `@anthropic-ai/sdk`, `langchain`, `@ai-sdk`, …), raw endpoints, env keys, and call shapes, and flags *decision-shaped* lines as prime candidates.
2. **Agent skill** — `skill/jev-audit/SKILL.md` makes your coding agent read each call site, apply the tiering table, show the savings math, and write `JEV_AUDIT.md` with the target architecture (`code → Jev → LLM`) mapped onto your modules.

Works with any SKILL.md-compatible harness: Claude Code, Codex, Cursor, Grok, Agy, Pi, ZCode, …

```bash
# GitHub install (skills.sh-compatible layout):
npx skills add MagicBeansAI/jev-audit --skill jev-audit
```

## FAQ

**Does it send my code anywhere?** No. The scanner is local regex; the analysis runs in your own agent session. The audit never calls Jev — it only tells you where *you* should.

**Is it affiliated with TypeSafe AI?** No — independent community tool by [MagicBeansAI](https://github.com/MagicBeansAI). Jev pricing/limits are quoted from the public docs; verify before budgeting.

**Why "decision-shaped"?** If downstream code branches on the output instead of a human reading it, a typed decision beats a generation: cheaper, faster, and structurally incapable of inventing a fourth option.

**I already use structured output / JSON mode. Why change?** Structured output still pays generation prices and generation latency for a decision, still drifts outside the schema often enough to need retries, and gives you no calibrated confidence to gate automation on.

## Contributing

Pattern misses (an SDK we don't spot, a call shape that escapes us) are the highest-value PRs — they live in one file: [`skill/jev-audit/scripts/scan.js`](skill/jev-audit/scripts/scan.js). Report false positives/negatives as issues with the offending line.

## License

[MIT](LICENSE) © MagicBeansAI
