# Course dossier alignment

This document maps the ASE running-project Case Design Dossier to the version-controlled Tribunal implementation. The preserved source is [`docs/reference/tribunal-running-project-info-package.txt`](reference/tribunal-running-project-info-package.txt).

## Canonical Case

- The server-owned fixture is `fixtures/charge-sheets/t-001-the-realm-v-jon-snow.md`.
- It preserves Case T-001, the accused, deceased, alleged act, background, agreed factual record, question for judgment, and scope language from the dossier.
- The homepage creates a fresh durable Case from that fixture; the browser cannot replace the charge-sheet text.

## Representatives

The four procedural seats are version-controlled under `lib/ai/profiles/`:

- Jon Snow — Defense 1
- Tyrion Lannister — Defense 2
- Daenerys Targaryen — Prosecution 1
- Grey Worm — Prosecution 2

The instructor simulation rule is preserved: a seat fixes the procedural role only and does not predetermine an opinion, inference, argument, or conclusion. Runtime prompts include the rule and keep model assignment separate from character/profile configuration.

## Judges

The three judicial-method profiles are version-controlled under `lib/ai/profiles/`:

- Aaron Barak — Judge 1
- Menachem Elon — Judge 2
- Meir Shamgar — Judge 3

The fictional-proceeding qualification is preserved. The profiles adapt documented judicial methods; they do not impersonate the judges or predict a real court. The dossier's research record and public source links remain provenance and are not injected into runtime prompts.

## Runtime realization

- One reusable Tribunal engine executes both `SAME_MODEL` and `MIXED_MODELS`.
- Each Run executes four Advocates before three Judges.
- All Advocate and Judge outputs must pass centralized Zod contracts.
- The two Runs remain independent; a failure in one does not erase a valid sibling result.
- Every actual model attempt is audited with model identity, primary/fallback source, recovery cycle, status, duration, usage, cost, and a safe failure classification.
- Persisted Cases can be reopened without executing models again.

## Verification evidence

Automated verification covers the canonical fixture, seven role/profile mappings, simulation rules, prompt boundaries, response contracts, model assignment invariants, retries, fallback recovery, stage ordering, majority calculation, persistence, accounting, and read-only result reconstruction. The repository verification gate is `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.
