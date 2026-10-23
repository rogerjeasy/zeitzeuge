#!/usr/bin/env bash
# Verify the account is usable before the clock starts. Run this the moment the
# IAM user exists — every failure here costs an hour if you find it at 02:00.
set -euo pipefail

REGION="${REGION:-eu-central-2}"
PROJECT="${PROJECT:-zeitzeuge}"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

step "Who am I"
aws sts get-caller-identity --output table

step "Is the home region enabled? ($REGION)"
aws ec2 describe-availability-zones --region "$REGION" \
  --query 'AvailabilityZones[].ZoneName' --output text

step "Is Bedrock present in $REGION, and which models does it offer?"
aws bedrock list-foundation-models --region "$REGION" \
  --query 'modelSummaries[?contains(modelId, `claude`) || contains(modelId, `nova`) || contains(modelId, `titan`)].[modelId,modelLifecycle.status]' \
  --output table || echo "  Bedrock not reachable in $REGION — see 02-enable-bedrock-models.sh"

step "Aurora Serverless v2 available in $REGION?"
aws rds describe-orderable-db-instance-options --region "$REGION" \
  --engine aurora-postgresql --db-instance-class db.serverless \
  --query 'length(OrderableDBInstanceOptions)' --output text 2>/dev/null \
  || echo "  none — Aurora Serverless v2 may not be offered here; fall back to eu-central-1"

step "OpenSearch Serverless available?"
aws opensearchserverless list-collections --region "$REGION" >/dev/null 2>&1 \
  && echo "  yes" || echo "  NOT available in $REGION — cut modules/search, use pgvector only"

step "Service quotas that actually bite"
aws service-quotas get-service-quota --region "$REGION" \
  --service-code fargate --quota-code L-3032A538 \
  --query 'Quota.[QuotaName,Value]' --output text 2>/dev/null || true
aws service-quotas get-service-quota --region "$REGION" \
  --service-code vpc --quota-code L-F678F1CE \
  --query 'Quota.[QuotaName,Value]' --output text 2>/dev/null || true

step "Credit and spend so far"
aws ce get-cost-and-usage --region us-east-1 \
  --time-period "Start=$(date -v-7d +%Y-%m-%d 2>/dev/null || date -d '7 days ago' +%Y-%m-%d),End=$(date +%Y-%m-%d)" \
  --granularity MONTHLY --metrics UnblendedCost \
  --query 'ResultsByTime[].Total.UnblendedCost.Amount' --output text 2>/dev/null \
  || echo "  Cost Explorer not enabled or not permitted — enable it in the console, it takes 24h to populate"

printf '\n\033[1mPreflight done.\033[0m Anything marked NOT available changes the plan — decide now, not at 03:00.\n'
