ENV ?= prod
TF  := terraform -chdir=envs/$(ENV)

.PHONY: help preflight verify-iam db-role bootstrap init fmt validate lint plan apply output destroy graph cost

help:
	@grep -E '^[a-z-]+:.*?##' $(MAKEFILE_LIST) | sed 's/:.*##/\t/' | expand -t24

preflight:  ## Check the account is usable (region, Bedrock, quotas, credit)
	@./scripts/00-preflight.sh

verify-iam:  ## Prove the builder guardrails with the IAM policy simulator
	@./scripts/04-verify-builder-iam.sh

db-role:    ## Create/re-sync the RLS-bound zeitzeuge_app role (before the first migration)
	@./scripts/05-create-app-db-role.sh

bootstrap:  ## One-off: create the state backend and GitHub OIDC provider
	@./scripts/01-bootstrap.sh

models:     ## Show Bedrock model availability and the access-request checklist
	@./scripts/02-enable-bedrock-models.sh

init:       ## terraform init for ENV (default: prod)
	$(TF) init -upgrade

fmt:        ## Format every .tf file in the tree
	terraform fmt -recursive .

validate:   ## Validate ENV
	$(TF) validate

lint:       ## tflint across modules (needs tflint installed)
	tflint --recursive --config=$(PWD)/.tflint.hcl

plan:       ## Plan ENV
	$(TF) plan -out=tfplan

apply:      ## Plan then apply ENV, with confirmation
	@./scripts/03-apply.sh $(ENV)

output:     ## Show ENV outputs (app URL, API endpoint, pool ids)
	$(TF) output

graph:      ## Render the dependency graph to docs/graph.svg
	$(TF) graph | dot -Tsvg > docs/graph.svg && echo "wrote docs/graph.svg"

destroy:    ## Tear ENV down after the event
	@./scripts/99-teardown.sh $(ENV)
