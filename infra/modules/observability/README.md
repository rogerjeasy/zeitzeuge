# `observability`

| Piece | Detail |
|---|---|
| Alerts topic | SNS, `logs` CMK, email subscription — **confirm the subscription mail** |
| Failed investigations | EventBridge rule on FAILED / TIMED_OUT / ABORTED → the topic, with the execution ARN |
| Alarms | unhealthy targets (api, web), ALB 5xx, investigations failed, Lambda throttles and errors, Bedrock throttles, Aurora at its ACU ceiling, falsifier 5xx (when it exists) |
| Dashboard | `zeitzeuge-prod-live` — the one on stage next to the Agent Theater |
| X-Ray | every investigation sampled (`zeitzeuge-prod*`, rate 1.0) |

The §10.6 product metrics — `evidence_items_per_run`, `abstention_rate`,
`falsifier_refutations`, `human_override_rate`, `cost_per_image`,
`p95_latency` — are emitted by the API and agents in **CloudWatch Embedded
Metric Format** under the `ZEITZEUGE` namespace. They become metrics straight
from structured log lines, with no metric filter to keep in sync, and the
dashboard reads them from there. `human_override_rate` is the true north.
