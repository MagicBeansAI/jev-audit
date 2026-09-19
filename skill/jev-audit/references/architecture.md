# Target architecture patterns

The governing principle is a three-layer split, each layer doing only what it is good at:

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1 — Code (deterministic)                         │
│  if / regex / schema validation. Free, exact, testable. │
├─────────────────────────────────────────────────────────┤
│  Layer 2 — Jev (decisions)                              │
│  classify, route, score, verify. Typed, calibrated,     │
│  ~100ms, $0.042/M input, output free.                   │
├─────────────────────────────────────────────────────────┤
│  Layer 3 — LLM (generation)                             │
│  write prose/code only when prose/code is the product.  │
└─────────────────────────────────────────────────────────┘
```

An if-statement that costs nothing beats a model call that can be wrong; a Jev decision beats an LLM call whenever the output is consumed by code rather than read by a human. Cost savings = (share of calls that are decisions) × (price delta on those calls) — so report savings only against calls that actually move.

## Pattern 1 — Confidence-gated routing

Every Jev answer carries `confidence` (and Choice gives the full probability distribution). Route on it:

```
noul ≥ 0.9            → act autonomously
0.5 ≤ noul < 0.9      → cheap LLM double-check or template path
noul < 0.5            → human review queue
```

Thresholds are product decisions, not defaults — set them per question in one reviewable config file, and tune with real traffic. This is how you get "zero hallucination" in practice: low confidence never reaches automation.

## Pattern 2 — Hybrid pipeline (Jev decides, LLM writes)

Classic support-flow replacement:

```
ticket in ──▶ Jev: department(choice) + urgency(noul) + frustration(score)
                 │
                 ├─ billing + urgent + frustrated ──▶ LLM drafts empathetic reply (only here)
                 ├─ technical                      ──▶ template + KB link (no model at all)
                 └─ low confidence                 ──▶ human queue
```

The LLM call now happens on a fraction of tickets, and the decision calls cost ~nothing. Same shape applies to content moderation, lead handling, and agent tool-selection (Jev picks the tool; the LLM fills arguments only when needed).

## Pattern 3 — Speculative fan-out

Questions in one request run in parallel and in isolation — ask everything that *might* matter, even if some answers go unused on a given input. Latency stays ~flat; cost is input tokens only (output is free). A TypeSafe cookbook batched 13 questions in one call for a reported 12.2× cost cut vs sequential calls. So: one call per request context, all atomic questions together.

## Pattern 4 — Composite scoring with code-owned weights

Never ask Jev one blobby "rate this". Decompose into atomic `score`s (each a judgment a knowledgeable person makes in seconds), then combine in code:

```ts
const pitchScore =
  0.4 * normalize(answers.market_size.score) +
  0.35 * normalize(answers.feasibility.score) +
  0.25 * normalize(answers.differentiation.score);
```

When priorities shift, change a coefficient — no prompt rewrite, no re-eval of everything else.

## Pattern 5 — Extraction as selection

Jev picks, it doesn't recall. Pipeline: regex/parser/cheap-LLM produces candidate values → Jev `choice` selects the right one (with confidence). Use for entity alignment, field extraction from messy text, picking which of N retrieved passages answers a query (cookbooks show BM25 shortlist + Jev rerank lifting top-1 accuracy meaningfully).

## Pattern 6 — Verify what the LLM generates

Keep generation on the LLM; add a Jev verification pass: each factual claim → `noul` "is this supported by `source`?" or output class → `choice` safe/unsafe. Low-confidence claims get flagged or stripped before the user sees them. This converts "LLM output, hopefully fine" into "LLM output with a calibrated check" — usually the easiest sell to whoever owns reliability.

## Migration sequencing

1. **Inventory + label** (this audit's report).
2. **Adapter seam**: put decisions behind an interface so implementations are swappable and the LLM stays as fallback:

```ts
interface Triager {
  triage(ticket: Ticket): Promise<{ dept: Dept; urgent: boolean; confidence: number }>;
}
// JevTriager (primary) — LlmTriager (existing behavior, kept as fallback)
```

3. **Shadow mode**: route real traffic through both, log disagreements, tune thresholds/criteria wording offline.
4. **Canary cutover** on the leaf classification calls first (lowest blast radius), then verification passes, then routing (which changes downstream behavior most).
5. **Rollback** = flip the adapter back. Keep the LLM path until Jev has weeks of clean production data.

## What the report's architecture section must contain

- Mermaid diagram of current flow with each LLM call marked by tier.
- Same diagram for the target three-layer flow, using the repo's real module names.
- The draft Jev question set for top candidates (exact JSON).
- Confidence thresholds and what each band does (act / verify / human).
- The adapter seam location (file + interface name) and the shadow-mode plan.
