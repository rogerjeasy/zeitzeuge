# `bedrock`

| Resource | What it guarantees |
|---|---|
| Guardrail (+ published version) | content and prompt-attack filters; PII anonymised; contextual grounding ≥ 0.7; a **denied topic for identifying people** — §17's "face detection, never recognition", enforced by the model layer |
| Invocation logging | every prompt/completion with model id and version → CloudWatch (logs CMK); payloads > 100 KB → S3. Images are not copied into logs |
| Application inference profiles | `reasoning` (Opus 5.5), `balanced` (Sonnet 5), `fast` (Haiku 4.5), each a copy of an `eu.*` profile: EU-only routing, and tagged so Bedrock spend is attributable in billing |

`model_tiers` refuses anything that is not `eu.*`.

Model access is an account entitlement, not Terraform; this account has it
(`make preflight` lists the models).
