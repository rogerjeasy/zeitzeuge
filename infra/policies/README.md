# IAM policy documents

Policy JSON lives here rather than inline in HCL, for three reasons: it is
lintable by `aws accessanalyzer validate-policy`, it diffs readably in review,
and it is the artefact a security-minded judge can actually read.

Each file is rendered with `templatefile()` from `modules/security` or
`modules/cicd`, with `${account_id}`, `${region}`, `${project}` and `${env}`
substituted.

| File | Attached to | Principle |
|---|---|---|
| `builder-user.json` | `ZeitzeugeBuilder`, the human builder (root-managed) | builds everything in home regions; IAM writes only on `zeitzeuge-*` under the boundary; cannot raise its own permissions |
| `boundary.json` | `ZeitzeugeBoundary`, on **every** `zeitzeuge-*` role (root-managed) | the ceiling no role can exceed, whatever is attached later |
| `github-deploy.json` | `zeitzeuge-prod-github-deploy`, via OIDC | push images, run the migrate task, roll services, update agent code — no IAM, no deletes |
| `ecs-task-execution.json` | ECS agent for every task | pull `zeitzeuge/*` images, write own logs, inject `zeitzeuge/prod/*` secrets |
| `ecs-task-api.json` | FastAPI tasks | Cognito admin calls on its one pool, presign assets, avatars, start investigations, session state |
| `ecs-task-migrate.json` | one-off migrate/seed task | read the RDS-managed master secret — the only role that can |
| `lambda-agent.json` | Lambda agents and deep-agent tasks | EU-only Bedrock through the guardrail, Data API with the RLS-bound credential, no S3 delete |
| `sfn-orchestrator.json` | Step Functions | invoke exactly the agent functions, the falsifier, and child executions |
| `sagemaker-exec.json` | the falsifier endpoint | pull its image, read model artefacts and the DEM cache |
| `cognito-pre-token.json` | the pre-token hook | its own log group, nothing else |
| `bedrock-logging.json` | Bedrock invocation logging | its own log group, nothing else |

KMS access in every runtime policy is by tag (`Project=zeitzeuge`, `Env=prod`),
never by key list, so no role can use another project's keys.

The rule these all follow: **a runtime role never gets `iam:*`, and a deploy
role never gets `s3:DeleteBucket` or `rds:DeleteDBCluster`.** A compromised CI
token should not be able to destroy the archive.

And the rule that makes the first one hold: **the builder can create a role only
if it carries `ZeitzeugeBoundary`, and nobody but root can remove or edit it.**
IAM writes are scoped to `zeitzeuge-*`, so other projects in the account are out
of reach.
