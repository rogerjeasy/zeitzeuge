#!/usr/bin/env bash
# Register a new revision of a task-definition family, pinned to one image.
#
#   ecs-pin-revision.sh <family> <image-uri>      → prints the new revision's ARN
#
# Terraform owns the family's shape (roles, environment, sizes) and registers
# it on `:latest`. This copies the newest ACTIVE revision verbatim — so a
# Terraform change is picked up by the next deploy — and swaps in the commit's
# immutable `:<sha>` image. A service pointed at that revision can then be
# rolled back to a *different* image, which `:latest` never allows.
set -euo pipefail

family=${1:?family}
image=${2:?image uri}

described=$(aws ecs describe-task-definition --task-definition "$family" --include TAGS --output json)

# Every container gets the image: each family here has exactly one container,
# and a sidecar added later should fail review, not silently keep `:latest`.
definition=$(jq -c --arg image "$image" '
  .taskDefinition
  | .containerDefinitions |= map(.image = $image)
  | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities,
        .registeredAt, .registeredBy, .deregisteredAt)
' <<<"$described")

tags=$(jq -c '.tags // []' <<<"$described")
args=(--cli-input-json "$definition")
if [ "$(jq 'length' <<<"$tags")" -gt 0 ]; then
  args+=(--tags "$tags")
fi

aws ecs register-task-definition "${args[@]}" \
  --query 'taskDefinition.taskDefinitionArn' --output text
