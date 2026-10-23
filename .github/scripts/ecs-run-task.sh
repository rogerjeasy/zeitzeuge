#!/usr/bin/env bash
# Run a one-off Fargate task to completion and fail unless it exited 0.
#
#   ecs-run-task.sh <cluster> <task-definition-arn> <network-configuration-json>
#
# Used for the migration and the demo seed. `aws ecs wait tasks-stopped` alone
# reports success for a task that crashed, so the container's exit code is
# what decides — and the log stream is printed either way, because "exited 1"
# on its own explains nothing.
set -euo pipefail

cluster=${1:?cluster}
task_definition=${2:?task definition}
network=${3:?network configuration}

# One call, kept whole: re-asking for the failure reasons would start the
# task (a migration!) a second time.
started=$(aws ecs run-task \
  --cluster "$cluster" \
  --task-definition "$task_definition" \
  --launch-type FARGATE \
  --network-configuration "$network" \
  --started-by "github-${GITHUB_RUN_ID:-local}" \
  --output json)
task=$(jq -r '.tasks[0].taskArn // empty' <<<"$started")

if [ -z "$task" ]; then
  echo "::error::ECS did not start a task for $task_definition"
  jq '.failures' <<<"$started"
  exit 1
fi
echo "started $task"

# The default waiter gives up after 10 minutes; a cold Aurora resume plus a
# migration fits comfortably, a hung one should not hold the pipeline longer.
aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$task"

read -r code reason < <(aws ecs describe-tasks --cluster "$cluster" --tasks "$task" \
  --query 'tasks[0].[containers[0].exitCode, stoppedReason]' --output text)

# Print the task's own output, whatever happened.
config=$(aws ecs describe-task-definition --task-definition "$task_definition" \
  --query 'taskDefinition.containerDefinitions[0].logConfiguration.options' --output json)
group=$(jq -r '."awslogs-group"' <<<"$config")
prefix=$(jq -r '."awslogs-stream-prefix"' <<<"$config")
container=$(aws ecs describe-task-definition --task-definition "$task_definition" \
  --query 'taskDefinition.containerDefinitions[0].name' --output text)
echo "::group::log $group"
aws logs get-log-events --log-group-name "$group" \
  --log-stream-name "$prefix/$container/${task##*/}" --start-from-head \
  --query 'events[].message' --output text 2>/dev/null | tr '\t' '\n' || echo "(no log stream)"
echo "::endgroup::"

if [ "$code" != "0" ]; then
  echo "::error::$task_definition exited with ${code} (${reason})"
  exit 1
fi
echo "$task_definition exited 0"
