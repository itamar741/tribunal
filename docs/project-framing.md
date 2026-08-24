# Project framing — AI Tribunal

## Problem statement

A human reviewer needs a structured way to examine a single uploaded charge sheet through two parallel AI Tribunal analyses: one where all agents share the same model, and one where each agent uses a different model. Both analyses must follow the same tribunal procedure so differences can be attributed to model configuration rather than workflow divergence.

## Primary user

A human reviewer who uploads exactly one charge sheet file and later reviews the two Tribunal run majority verdicts.

## Stakeholders

- Course instructor (provides each agent’s character/profile)
- Human reviewer (primary end user of the application)
- Development team implementing the modular monolith

## Definition of done

For the overall MVP (across phases), done means:

- A reviewer can upload a Markdown (`.md`) charge sheet file as the sole user input.
- Every successful upload creates a new Case with a unique ID and stores the original file name; identical uploads create separate Cases and there is no MVP deduplication.
- The system creates a case and executes two Tribunal runs in parallel: `SAME_MODEL` and `MIXED_MODELS`.
- Both runs use one reusable Tribunal engine; differences are configuration only.
- Each run completes advocate stage then judge stage, then produces its own majority verdict (`JUSTIFIED` if at least two of three judges vote `JUSTIFIED`; `NOT_JUSTIFIED` if at least two vote `NOT_JUSTIFIED`).
- That majority is the final verdict of the run. A Case produces two final AI outputs: the `SAME_MODEL` majority and the `MIXED_MODELS` majority.
- Advocate and judge outputs conform to centralized response contracts and are validated at runtime.
- Every actual model attempt is individually audited for its Case, Tribunal Run, stage, agent role, attempt number, model, token usage, cost, duration, and success/failure.
- Token usage and cost use OpenRouter-reported values and can be totaled per agent, per stage, per Tribunal Run, and across the complete Case from the individual call records.
- Failures never silently become valid verdicts.
- Results of both runs are shown to the human reviewer.
- A persisted Case can be retrieved later by its unique Case ID without rerunning the Tribunal.

Charge-sheet upload validation and Case persistence are done when a reviewer can submit one `.md` file, the server authoritatively validates UTF-8 Markdown of 1 MB or less, a new unique Case is stored with the original file name and validated text, and the UI reports the Case ID or an explicit failure — without Tribunal orchestration or AI.

## Out of scope

The following are out of scope for the MVP unless explicitly required later:

- Authentication and authorization
- Admin panels
- User-editable agent profiles or prompts
- Client-side model selectors
- Multi-round debates
- A human-recorded final verdict or approval decision
- Speculative features beyond the charge-sheet → two Tribunal runs → review flow

## Known open decisions

Internal design work still required (not instructor-owned):

- Exact advocate and judge response-contract fields
- Concrete OpenRouter model IDs for `SAME_MODEL` and `MIXED_MODELS`
- Runtime prompt composition details
- Retry/attempt policy for failed model calls (must be settled before multi-agent execution)
- Past-case listing, authentication, and public/private access beyond retrieval by known Case ID
- Retention/privacy rules for persisted validated Markdown text
- Deployment topology details beyond “Next.js app + PostgreSQL (Supabase preferred)”

Still waiting on instructor input:

- Character/profile content for each of the seven agents
- The exact Markdown charge-sheet structural contract, so later structural parsing can be implemented without inventing the layout
