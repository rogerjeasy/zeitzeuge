# `orchestration`

The spine (PROPOSED_SOLUTION §10.2).

| State machine | Type | What |
|---|---|---|
| `zeitzeuge-prod-investigation` | Standard | one photograph, intake → archivist sign-off (`.waitForTaskToken`, may wait days) → learn |
| `zeitzeuge-prod-bulk` | Standard | Distributed Map over the daily S3 inventory of `originals`: 20 concurrent, 5 % tolerated failures, results to S3 |

- ASL in `orchestration/statemachines/*.asl.json`, rendered with `templatefile()`
  — agent ARNs and the falsifier endpoint name are the only placeholders.
- Execution history encrypted with the `assets` CMK; logs at ALL with execution
  data (the investigation's audit trail, 90 days) and X-Ray tracing.
- Step Functions owns the control flow, so no tool output can change which step
  runs next — the structural answer to prompt injection.
- The falsifier is called through the AWS SDK integration
  (`aws-sdk:sagemakerruntime:invokeEndpoint`); any failure falls through to the
  cached-horizon agent, so the demo never depends on a warm endpoint.
