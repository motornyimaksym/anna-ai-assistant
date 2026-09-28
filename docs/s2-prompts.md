# Unified assistant prompts

SPEC section 62 defines the current flow: S2 Assistant drafts every automatic client response, then S1 Handoff assesses the exact outgoing text and current conversation. No router, boolean approval, separate planner or server-authored booking messages remain.

Assistant combines conversational and booking guidance. Read-only tools provide service data, owned appointments and fresh schedule/Calendar evidence; the model interprets dates, collects missing details and writes natural summaries. Calendar finalization belongs to a human. Custom prompts cannot enable booking mutation tools or make legacy pending actions executable.

Handoff returns a number from 0 to 1 for knowledge gaps, bot-like wording or explicit booking confirmation. Explicit confirmation requires exactly 1. Score 1 always pauses; other scores pause only above threshold. Failures pause without sending a fallback message. Withheld drafts remain unsent.

New editable IDs are `assistant` and `handoff`, with independent new override documents. Old overrides are inactive. The debug tester uses synthetic confirmation context for Handoff and displays Assistant tool requests without executing them.

Evaluation cases: normal factual questions; missing service/duration; dates supported only by fresh schedule and Calendar; unrelated questions; unsupported business facts; robotic drafts; direct confirmation of a delivered appointment summary; conditional agreement or changed details; stale source data; invalid provider output. Automated tests verify contracts and orchestration; model wording still requires qualitative evaluation.
