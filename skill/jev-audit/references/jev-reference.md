# Jev reference — API, primitives, limits, pricing

Facts only; verify against https://docs.typesafe.ai before finalizing generated integration code — early-access details move fast.

## Mental model

Jev is TypeSafe AI's System One model. You send a `state` (the context: string, object, or array) plus typed `questions`; it returns decisions your code branches on. It does not generate text. Every question in a request is evaluated independently and in parallel against the shared state — batching does not change answers.

## Primitives

| Type | Question | Answer fields |
|---|---|---|
| `noul` | Is this true? | `noul`: P(true), 0–1 |
| `choice` | Which option? | `choice`, `probabilities` (full distribution), `confidence` |
| `score` | Which level on an ordered rubric? | `score` (probability-weighted mean over levels), `legend`, `probabilities`, `confidence` |

`confidence` is the model's self-assessed reliability — distinct from `probability`, and the signal you gate autonomous action on.

## HTTP API

```
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer $TYPESAFE_API_KEY
Content-Type: application/json
```

Models: `jev-latest`, `jev-preview`, and pinned versions like `jev-1.13.0` (responses echo the exact model that answered — pin versions when you tune thresholds). Key: https://console.typesafe.ai/keys

### Request

```json
{
  "model": "jev-latest",
  "state": { "message": "Hi, I've been trying to connect my Stripe account for 3 days..." },
  "questions": {
    "department": {
      "type": "choice",
      "instructions": "Which team should handle this",
      "criteria": {
        "billing": "Payment or subscription issues",
        "technical": "Bugs or integration problems",
        "sales": "Pricing or account questions"
      }
    },
    "frustration": {
      "type": "score",
      "instructions": "How frustrated the customer appears",
      "criteria": [
        "Calm, just stating facts",
        "Frustrated but civil",
        "Very angry, strong language"
      ]
    },
    "is_urgent": {
      "type": "noul",
      "instructions": "The message conveys urgency or time-sensitivity"
    }
  }
}
```

Backtick a state path inside `instructions` (e.g. "Does `message` mention a duplicate charge?") to pin the question to a field.

### Response

```json
{
  "model": "jev-latest",
  "answers": {
    "department": {
      "type": "choice",
      "choice": "billing",
      "probabilities": { "billing": 0.84, "technical": 0.159, "sales": 0.001 },
      "confidence": 0.596
    },
    "frustration": {
      "type": "score",
      "score": 1.035,
      "legend": { "0": "Calm, just stating facts", "1": "Frustrated but civil", "2": "Very angry, strong language" },
      "probabilities": { "0": 0.05, "1": 0.88, "2": 0.07 },
      "confidence": 0.842
    },
    "is_urgent": { "type": "noul", "noul": 0.999 }
  },
  "usage": { "input_tokens": 312, "output_tokens": 48 }
}
```

Structural guarantee: Jev cannot invent a fourth choice option — type-error rate on the label is 0 by construction.

## SDKs

**Python** (≥3.10): `pip install typesafe-sdk`

```python
from typesafe_sdk import Choice, Noul, Score, TypeSafeClient

client = TypeSafeClient()  # reads TYPESAFE_API_KEY
r = client.system_one(
    state=ticket_text,
    questions={
        "is_urgent": Noul(instructions="The message conveys urgency"),
        "department": Choice(instructions="Which team should handle this",
                             criteria={"billing": "...", "technical": "...", "sales": "..."}),
        "frustration": Score(instructions="How frustrated the customer appears",
                             criteria=["Calm, just stating facts", "Frustrated but civil", "Very angry"]),
    },
)
r.answers["department"].choice      # "billing"
r.answers["frustration"].score      # 1.035
r.answers["is_urgent"].noul         # 0.999
```

**JavaScript/TypeScript** (Node ≥20): `npm install @typesafe-ai/sdk` — `TypeSafeClient` plus `noul()` / `choice()` / `score()` helpers; Choice labels infer as TypeScript literal unions.

**Vercel AI SDK ≥7.0.105**: provider `@ai-sdk/typesafe-ai` (or gateway `typesafe-ai/jev`) via `experimental_evaluate`; vocabulary differs — "boolean" instead of noul, answer field is `probability`, confidence lives in `providerMetadata.typesafe.confidence`.

## Limits and errors

- State + questions ≤ ~64K tokens; state + longest question ≤ ~32K tokens (~150K chars).
- Choice: up to 255 options. Score: 2–10 levels. Text input only — no images/audio/video.
- Errors: 401 bad key, 422 validation, 429/529 → retry with backoff. Early-access rate limits: ~250K tokens/sec, ~1,200 req/min.
- Rate limits and version pins matter for threshold-tuned code — re-check the docs when generating final integration code.

## Pricing and latency (as of 2026-09, early access)

- Input: **$0.042 per million tokens**. Output tokens: **free**.
- 70–500 ms end-to-end, ~100 ms typical, roughly flat in number of questions.
- Vendor headline vs frontier LLMs on decision workloads: ~193× faster, ~444× cheaper (their ceiling numbers — treat as directional).
- For savings math, price the incumbent LLM at its real list price (e.g. ~$3–15/M input, ~$15–75/M output depending on model class), not at Jev's marketing comparison.

## Known jagged edges — never move these to Jev

- Text generation of any kind: summaries, drafts, code, translations.
- Arithmetic, counting, exact comparison (fails things like hex-color similarity).
- Date/time reasoning (treats dates as text).
- Interpolating a Score of 1.4 as "40% between levels" — use scores for thresholds and ranking only.
- Extraction by free recall: Jev picks from candidates, it doesn't name them. Find candidates with regex/LLM, let Jev choose.
