#!/usr/bin/env bash
# Point a service at a task-definition revision and prove the rollout landed.
#
#   ecs-deploy-service.sh <cluster> <service> <task-definition-arn>
#
# Prints `running=<n>` on success. `aws ecs wait services-stable` also succeeds
# when the circuit breaker has *rolled back* — the service is stable, just on
# the old revision — so this checks which revision ended up primary, and fails
# if it is not the one deployed.
set -euo pipefail

cluster=${1:?cluster}
service=${2:?service}
task_definition=${3:?task definition}

aws ecs update-service --cluster "$cluster" --service "$service" \
  --task-definition "$task_definition" >/dev/null
aws ecs wait services-stable --cluster "$cluster" --services "$service"

# `services-stable` returns once the running count is right, which can be while
# the old task is still draining (open SSE streams hold it until the target
# group's deregistration delay ends) and the rollout still reads IN_PROGRESS.
# Wait for a final rollout state, up to ten minutes.
for _ in $(seq 1 60); do
  # shellcheck disable=SC2016  # the backticks are JMESPath literals, not shell
  read -r primary rollout desired < <(aws ecs describe-services \
    --cluster "$cluster" --services "$service" \
    --query 'services[0].[deployments[?status==`PRIMARY`]|[0].taskDefinition, deployments[?status==`PRIMARY`]|[0].rolloutState, desiredCount]' \
    --output text)
  [ "$rollout" = "IN_PROGRESS" ] || break
  sleep 10
done

if [ "$primary" != "$task_definition" ]; then
  echo "::error::$service rolled back: primary is $primary, not $task_definition" >&2
  exit 1
fi
if [ "$desired" != "0" ] && [ "$rollout" != "COMPLETED" ]; then
  echo "::error::$service rollout is $rollout" >&2
  exit 1
fi
echo "running=$desired"
