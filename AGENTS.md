# Project workflow

This repository follows Spec Driven Development. `SPEC.md` defines expected product behavior and functional requirements.

All coding agents MUST follow this order for every functional change:

1. Read `SPEC.md` before making functional changes.
2. First update `SPEC.md` when a request changes behavior, API, data model, business rules, UI, integrations, permissions, configuration, or user flows.
3. Update related documentation under `docs/` where needed.
4. Only after the specification reflects the request, modify production code.
5. Update or add tests that verify the specification.
6. Run lint, typecheck, tests, and build.
7. Before finishing, verify `implementation == SPEC.md`.

## Mandatory order

```text
specification
    ↓
tests/contracts if applicable
    ↓
implementation
    ↓
validation
```

Never implement first and document afterward.

## Change discipline

Inspect the current specification before changing API or domain behavior, Firestore schema, Telegram behavior, OpenAI tools, Google Calendar behavior, admin UI, authentication, configuration, or user flows. Persisted-data changes also require `docs/data-model.md` to be updated before code.

## Definition of Done

A functional task is complete only when `SPEC.md`, implementation, and tests agree; and `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.

