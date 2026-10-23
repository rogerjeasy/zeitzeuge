# `cicd`

The keyless deploy path: GitHub OIDC trust plus the roles CI assumes. No long-lived AWS keys exist anywhere.

## Resources

- IAM OIDC provider for token.actions.githubusercontent.com (created in bootstrap/, referenced here)
- IAM role `zeitzeuge-prod-github-deploy` with a trust policy scoped to `repo:<owner>/<repo>:ref:refs/heads/main` and audience `sts.amazonaws.com`
- permission policies rendered from ../../policies/github-deploy.json
- No CI role for tests: the RLS leak suite runs against a Postgres service container in `checks.yml`, with no AWS access at all
- No CI role for Terraform: infrastructure is applied by the builder, with MFA, after a reviewed plan
## Notes

Scope the trust policy `sub` condition to a specific ref or environment. A trust policy that accepts `repo:<owner>/<repo>:*` lets any branch in the repo — including a fork's PR branch if workflows run on it — assume a deploy role. This is the "no long-lived keys" talking point in 10.5, and it is only true if the condition is tight.
