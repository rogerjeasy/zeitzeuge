# Day-one IAM setup

What to click on the *Set permissions* step, and why this is the shape that
holds up when a judge asks about it.

## The model

Two kinds of identity, and they get permissions in completely different ways.

| Identity | What it is | How it gets permissions |
|---|---|---|
| **You** (`zeitzeuge-builder`) | one human, running Terraform and the AWS CLI from a laptop for 24 hours | broad — you are building the account from nothing |
| **CI** (`zeitzeuge-prod-github-deploy`) | GitHub Actions, assumed via OIDC | narrow, scoped to one repo and one ref, no IAM writes |
| **Runtimes** (task / function / state-machine roles) | the application itself | narrow, per component, deny-listed off the archive |

Only the first one is an IAM *user*. The other two are *roles*, created by
Terraform, and that is the whole security argument: the human has a key for one
day; nothing else in the system ever has one.

## Step 2 — Set permissions

**Choose: `Add user to group`.** Then *Create group*:

- Group name: `zeitzeuge-builders`
- Attach: **`ZeitzeugeBuilder`**, the custom policy from
  `../policies/builder-user.json` (create it first under *Policies → Create
  policy → JSON*). The reasoning is under *If you want least privilege properly*
  below; `AdministratorAccess` is the break-glass fallback, not the default.

Add the user to it. That is the entire step.

**Before this, as root:** enable the Zurich region (*Account → AWS Regions →
Europe (Zurich) → Enable*). `eu-central-2` is an opt-in region, and
`ZeitzeugeBuilder` denies `account:*`, so the builder can't enable it later.

`Attach policies directly` works and is faster by one click, but permissions
then live on the user instead of on a job function, which is exactly the thing
the console warns about — and it is the answer you do not want to give when
asked how access is managed.

## Why admin, and not a curated list

Terraform on day one has to create IAM roles, KMS keys, a VPC, Aurora, Cognito,
Step Functions, Bedrock guardrails, SageMaker endpoints, CloudFront, WAF, ACM
in a second region, and budgets. Assembled from AWS managed policies that is
roughly:

```
IAMFullAccess · AmazonVPCFullAccess · AmazonS3FullAccess · AmazonRDSFullAccess
AmazonDynamoDBFullAccess · AmazonOpenSearchServiceFullAccess · AmazonBedrockFullAccess
AWSStepFunctionsFullAccess · AmazonECS_FullAccess · AmazonEC2ContainerRegistryFullAccess
AWSLambda_FullAccess · AmazonAPIGatewayAdministrator · AmazonCognitoPowerUser
AmazonSageMakerFullAccess · CloudFrontFullAccess · AWSWAFConsoleFullAccess
AWSCertificateManagerFullAccess · ElasticLoadBalancingFullAccess
SecretsManagerReadWrite · AWSKeyManagementServicePowerUser · CloudWatchFullAccess
AWSXrayFullAccess · AmazonEventBridgeFullAccess · AmazonSQSFullAccess
AmazonSNSFullAccess · AmazonTextractFullAccess · AmazonRekognitionFullAccess
TranslateFullAccess · AmazonRoute53FullAccess · AWSBillingReadOnlyAccess
```

Thirty-one policies. **An IAM identity accepts at most 10 attached managed
policies** (a quota, raisable to 20 — `L-0DA4ABF3`). So the curated-managed-policy
path is not merely tedious, it does not fit. The options that actually exist are
`AdministratorAccess`, or one custom policy.

### If you want the middle ground

Two managed policies instead of one: **`PowerUserAccess` + `IAMFullAccess`**.
PowerUser covers every service but IAM and Organizations; IAMFullAccess restores
the role creation Terraform needs. Add **`AWSBillingReadOnlyAccess`** if you
want `make preflight` to read spend. Three policies, well inside the quota, and
you keep the account-level surface (Organizations, account settings, CloudTrail
deletion) out of reach.

### If you want least privilege properly

`../policies/builder-user.json` is a single custom policy: allow everything
*except* a deny-list of account-level and destructive actions, and only in
`eu-central-2`, `eu-central-1` and `us-east-1`. Create it under *Create policy →
JSON*, name it `ZeitzeugeBuilder`, attach it to the group instead of
`AdministratorAccess`. Region-scoping a builder policy is the part that pays
off: it makes an accidental `us-west-2` apply impossible, which is a real
failure mode when copy-pasting Terraform.

> One caveat if you go this route: `aws:RequestedRegion` does not apply to
> global services (IAM, CloudFront, Route 53, S3 bucket creation), which is why
> those sit under a separate statement. If an apply fails with a confusing
> `AccessDenied` at 02:00, switch the group to `AdministratorAccess` and move
> on — debugging your own policy is not what the 24 hours are for.

## The permissions boundary (root, once)

A builder who can create IAM roles can otherwise create an admin role that
trusts itself and assume it. `ZeitzeugeBoundary` (`../policies/boundary.json`)
closes that: `ZeitzeugeBuilder` allows `iam:CreateRole` only when the new role
carries the boundary, denies removing it, and denies editing either policy.
Every role is then capped by the boundary, whatever gets attached to it later.

Create it as root, under *Policies → Create policy → JSON*, named exactly
`ZeitzeugeBoundary`. All IAM writes are limited to `zeitzeuge-*` roles and
policies, so the builder cannot touch other projects' roles in the account.

## Then, before you leave the console

1. **MFA on this user, and on the root account.** Root then goes unused for the
   rest of the project.
2. **No access key.** The CLI signs in with the console credentials instead
   (`aws login`, AWS CLI ≥ 2.32) and gets short-lived, auto-refreshed session
   credentials. `ZeitzeugeBuilder` denies `iam:CreateAccessKey`, so this is
   enforced, not a convention:
   ```bash
   aws login --profile zeitzeuge          # opens the browser, MFA, done
   aws configure set region eu-central-2 --profile zeitzeuge
   export AWS_PROFILE=zeitzeuge
   ```
   That makes the stage sentence below true for the human too, not just for CI
   and the runtimes.
3. **Nothing to revoke at the end** — sessions expire on their own. Deleting the
   user sits in the teardown checklist next to `make destroy`.
4. **Bedrock model access** — a separate entitlement, not IAM. `make models`
   prints what is available in Zurich and the console link. Request it in hour
   one; not every model family is granted instantly.
5. **Enable Cost Explorer** (console, one click). It takes ~24h to populate, so
   enabling it on day one is the only way it is useful during the event.

## What Terraform creates from here

Everything else. `modules/security` creates the runtime roles from
`policies/*.json`; `modules/cicd` creates the OIDC deploy roles with a trust
policy pinned to `repo:<owner>/<repo>:ref:refs/heads/main`. The sentence this
buys you on stage:

> *"No long-lived AWS credential exists in this system. CI authenticates with a
> short-lived OIDC token scoped to one branch, and every agent runs under its
> own role that is explicitly denied delete on the archive."*

That is only true because of the `Deny` blocks in `github-deploy.json` and
`lambda-agent.json`. Keep them.
