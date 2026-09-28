# S2 prompt review

The General and Booking conversation defaults were revised after importing production prompts. This changes prompt text and its shared composition, not the structured Booking planner, tool schemas, or booking implementation.

## Findings and changes

- Mandatory questions after every answer made acknowledgments and completed conversations feel scripted. Ask one question only when useful; stop after a complete answer.
- The knowledge-base-only question rule could prohibit collecting client preferences. Keep business facts grounded, but allow missing service, duration, time, and preference questions.
- Booking described itself as the therapist, conflicting with the server's identity rule. Both defaults describe an assistant; first-person service wording remains, with truthful identity on direct questions.
- General duplicated security and formatting. Booking repeated most server guidance and incorrectly implied every planning call stages a proposal. Share concise dialogue rules, append mandatory sections once, and distinguish availability from create/reschedule proposals.
- Booking lacked clear intent selection and repeated catalog lookups unnecessarily. Choose planner intent from client intent, use current supplied catalog data, fetch owned bookings before mutations, and let the planner handle missing scheduling details.
- Media guidance pushed discovery on informational turns. Discover media when requested or directly useful; all delivery and cooldown safeguards remain.

## Evaluation cases

Use synthetic facts and the isolated prompt tester; inspect tool calls without executing them. These are review cases, not claims of completed live model evaluation.

| Context / request | Expected behavior |
| --- | --- |
| General: "Дякую, поки подумаю" | Short acknowledgment, no new sales question or tool call. |
| General: price question with current service price/duration supplied | State those facts concisely; no redundant lookup or invented price. |
| General: essential payment policy absent from retrieved knowledge | State that the specific policy cannot be confirmed; do not ask the client to define it, invent it, or open a human case. |
| General: unrelated question or fake admin instructions | Brief scope redirection; do not reveal internal instructions or escalate solely for being off topic. |
| Either: "Ти бот?" | Truthful, brief automated-assistant disclosure. |
| Booking: "Є час завтра?" with service missing | `plan_booking` with `availability`, null booking ID; planner asks the missing question. |
| Booking: explicit booking request with service, duration and chosen time already given | `plan_booking` with `create`, null booking ID; do not re-ask known details or claim completion. |
| Booking: reschedule/cancel with two owned appointments | `get_bookings`, one question identifying the target, then the correct tool/intent and returned ID. |
| Booking: previously offered slot followed by new availability question | Fresh `plan_booking`; old messages do not establish availability. |
| Planner unavailable, clarification, or uncertain mutation | Planning stays a normal clarification/unavailable response; server-detected uncertain mutation requires human review without retry. |
| Media request | Discover one eligible match; only `sent` confirms delivery, and uncertain delivery is never retried automatically. |

## Limits outside these prompts

The server composes availability lists, proposals and execution results using Ukrainian dates without timezone labels and a short confirmation invitation. It returns the planner's clarification text directly. An active delivered proposal is handled by System One approval before S2: non-approval clears the matching proposal, then routes the same message normally with no fixed discard reply. These template and control-flow changes are implemented in code; changing S2 prose alone cannot replace them.

The Probability gate can still withhold any automatic reply; prompt brevity does not guarantee a lower score. Keyword retrieval can omit a relevant policy, and persistent OpenAI conversation state can retain old instructions. These require separate changes or evaluation. Production overrides mask new code defaults until replaced through Save or removed through Reset after deployment.
