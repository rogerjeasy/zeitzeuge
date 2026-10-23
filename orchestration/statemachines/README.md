# State machine definitions

Amazon States Language, kept as files rather than HCL strings so they can be
linted, diffed, and pasted into the Step Functions console for a dry run.
`modules/orchestration` renders them with `templatefile()`, substituting the
`${...}` ARNs.

| File | Purpose |
|---|---|
| `investigation.asl.json` | one photograph, end to end, including archivist sign-off |
| `bulk.asl.json` | Distributed Map over an S3 inventory — the backlog story |

The reason the flow lives here and not in Python: tool output and verso
transcriptions are untrusted text. If the control flow is a state machine, a
prompt-injection attempt in a transcription can change a *value*, never a
*next step*. That is the answer in PROPOSED_SOLUTION §10.5, and it is only true
while this file is the source of truth for the flow.
