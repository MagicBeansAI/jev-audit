# Examples

Real audits of real public projects, produced with `npx jev-audit` + the jev-audit agent skill. Each folder pins the exact commit analyzed.

| Project | What it is | The finding |
|---|---|---|
| [promptfoo](promptfoo/JEV_AUDIT.md) | LLM eval & red-teaming framework | Its model-graded assertions (factuality, classification, RAG relevance, moderation) are decisions wearing a generator's clothes — ~5 grader call sites map directly onto Jev `choice`/`noul`/`score` at ~$0.025 vs $0.14–$2.30 per 1K grading calls |

Want your project here? Run `npx jev-audit`, ask your agent to "audit this repo with jev-audit", and PR the resulting `JEV_AUDIT.md`.
