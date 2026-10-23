# `compute-agents`

Every agent the investigation state machine calls.

| Runtime | What | Why |
|---|---|---|
| Lambda × 17 | one function per agent in `investigation.asl.json`, arm64, image `zeitzeuge/agents`, handler `zeitzeuge_agents.handlers.<agent>.handler` | outside the VPC: Bedrock/S3/DynamoDB are AWS APIs and Aurora is reached via the Data API — no ENI, no NAT cost, fast cold starts |
| Fargate task `zeitzeuge-prod-agent-deep` | long agent loops, `python -m zeitzeuge_agents.deep` | started by Step Functions (`ecs:RunTask.sync`), never a service |

Every function gets: JSON logs in its own group (logs CMK, 30 days), X-Ray
active tracing, the guardrail id/version, the three ModelRouter profile ARNs,
and table/bucket names.

## Switches

- `agents_image_ready` — functions are created once the image exists. The
  state machine uses deterministic ARNs, so it applies either way.
- `reserved_concurrency` — the per-function cost cap: **50 in prod**. The
  account limit is 1000 (raised from 10 on 25 Sep); 17 × 50 = 850 reserved
  leaves 150 unreserved, above the 100 AWS requires.
- `warm_enabled` — a 5-minute ping of the pitch-path agents; turn on for the
  event window only.

Async DLQs are not configured: Step Functions invokes every agent
synchronously and owns retry and catch, so a DLQ would never receive anything.
