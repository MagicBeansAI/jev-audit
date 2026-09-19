# Jev Audit — <repo name>

> Which LLM calls in this codebase are actually decisions, and what would they look like on Jev?
> Generated <date> · Scanner hits: <N> · Call sites reviewed: <M> · Analysis by the coding agent using **jev-audit**

## 1. Executive summary

- LLM call sites found: **<total>** across <files> files (<sdks>).
- **<n1> can move to Jev now** (Replace), **<n2> split into decide + generate** (Hybrid), **<n3> should stay on the LLM**, **<n4> shouldn't be a model call at all** (pure code).
- Estimated saving on the Replace set: **<$X per 1,000 calls** (assumptions in §5).
- Best quick win: <one sentence — highest confidence, lowest blast radius>.

## 2. Inventory

| # | Location | SDK / model | Job of the call | Calls/day | Tier |
|---|---|---|---|---|---|
| 1 | `src/triage.js:42` | openai / gpt-4o-mini | Classify ticket → department + urgency | ~4,000 | Replace |
| 2 | … | | | | |

Every row must cite `file:line`. `Calls/day` = observed (queue/cron/route) or **assumed** in bold.

## 3. Tier detail

### 3.1 Replace — move to Jev now

For each: the job, why it's a decision not a generation, and the draft Jev question set.

#### <Call site #1 — `src/triage.js:42`>

```json
{
  "model": "jev-latest",
  "state": { "subject": "<from ticket>", "body": "<from ticket>", "plan": "<customer plan>" },
  "questions": {
    "department": {
      "type": "choice",
      "instructions": "Which team should handle this `body`",
      "criteria": { "billing": "…", "technical": "…", "sales": "…" }
    },
    "is_urgent": { "type": "noul", "instructions": "The `body` conveys urgency or time-sensitivity" }
  }
}
```

Confidence plan: ≥0.9 act · 0.5–0.9 template path · <0.5 human queue.

### 3.2 Hybrid — Jev decides, LLM generates

<Which sub-call moves, which stays, and where the seam goes.>

### 3.3 Keep on LLM

<Each with one honest sentence why: output is prose consumed by humans / genuine generation.>

### 3.4 Pure code — stop calling a model

<Schema checks, exact matches, counting — the deterministic call that was always there.>

### 3.5 Needs human judgment

<Couldn't determine from code alone — what to check and how.>

## 4. Target architecture

```mermaid
flowchart LR
  %% current flow with LLM call sites colored by tier, then target three-layer flow
```

<Diagram + narrative: code layer → Jev layer → LLM layer with this repo's real module names; adapter seam location; shadow-mode → canary → rollback plan.>

## 5. Savings estimate

| Call site | Calls/mo | In tok/call | Out tok/call | LLM $/mo | Jev $/mo | Saving |
|---|---|---|---|---|---|---|

Arithmetic shown per row. Assumptions: <blended incumbent price, volumes, token sizes>. **These are estimates from static analysis — validate against real usage logs before budgeting.**

## 6. Migration order

1. <Leaf classification call — lowest blast radius, shadow-mode first>
2. …
3. <Routing change last — biggest downstream impact>

---

*Audit generated with **jev-audit** — find the decisions hiding in your LLM bill: `npx jev-audit`*
