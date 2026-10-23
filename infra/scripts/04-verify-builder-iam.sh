#!/usr/bin/env bash
# Prove the builder's guardrails with the IAM policy simulator — against the
# live policies, nothing is executed. Re-run after every ZeitzeugeBuilder or
# ZeitzeugeBoundary change. Exit code is the number of failed expectations.
set -uo pipefail

ACCOUNT="${ACCOUNT:-707938860881}"
A="arn:aws:iam::${ACCOUNT}"; U="${A}:user/zeitzeuge-builder"; B="${A}:policy/ZeitzeugeBoundary"
fail=0

rg() { echo "ContextKeyName=aws:RequestedRegion,ContextKeyValues=$1,ContextKeyType=string"; }
pb="ContextKeyName=iam:PermissionsBoundary,ContextKeyValues=${B},ContextKeyType=string"

# expect <allowed|denied> <label> <action> <resource> [context-entry]
expect() {
  local want=$1 label=$2 act=$3 res=$4 ctx=${5:-}
  local args=(--policy-source-arn "$U" --action-names "$act" --resource-arns "$res")
  [ -n "$ctx" ] && args+=(--context-entries "$ctx")
  local got; got=$(aws iam simulate-principal-policy "${args[@]}" \
    --query 'EvaluationResults[0].EvalDecision' --output text 2>&1)
  local norm=denied; [ "$got" = allowed ] && norm=allowed
  if [ "$norm" = "$want" ]; then printf '  ok    %-50s %s\n' "$label" "$got"
  else printf '  FAIL  %-50s %s (want %s)\n' "$label" "$got" "$want"; fail=$((fail+1)); fi
}

echo "Roles only under the boundary, only zeitzeuge-*"
expect denied  "CreateRole without boundary"            iam:CreateRole "${A}:role/zeitzeuge-x"
expect allowed "CreateRole with boundary"               iam:CreateRole "${A}:role/zeitzeuge-x" "$pb"
expect denied  "CreateRole outside zeitzeuge-*"         iam:CreateRole "${A}:role/other-x" "$pb"
expect denied  "DeleteRolePermissionsBoundary"          iam:DeleteRolePermissionsBoundary "${A}:role/zeitzeuge-x"

echo "Other projects' roles are out of reach"
expect denied  "UpdateAssumeRolePolicy on wick-status"  iam:UpdateAssumeRolePolicy "${A}:role/wick-status"
expect denied  "AttachRolePolicy on wick-status"        iam:AttachRolePolicy "${A}:role/wick-status"
expect denied  "PassRole wick-status"                   iam:PassRole "${A}:role/wick-status"
expect denied  "AssumeRole CDK deploy role"             sts:AssumeRole "${A}:role/cdk-hnb659fds-deploy-role-${ACCOUNT}-us-east-1" "$(rg us-east-1)"
expect denied  "AssumeRole github-actions-wick-deploy"  sts:AssumeRole "${A}:role/github-actions-wick-deploy" "$(rg us-east-1)"
expect allowed "AssumeRole zeitzeuge-x"                 sts:AssumeRole "${A}:role/zeitzeuge-x" "$(rg us-east-1)"

echo "No self-escalation"
expect denied  "Edit ZeitzeugeBoundary"                 iam:CreatePolicyVersion "$B"
expect denied  "Edit ZeitzeugeBuilder"                  iam:CreatePolicyVersion "${A}:policy/ZeitzeugeBuilder"
expect denied  "AttachUserPolicy on self"               iam:AttachUserPolicy "$U"

echo "Data sovereignty"
expect denied  "Bedrock via global.* profile"           bedrock:InvokeModel "arn:aws:bedrock:eu-central-2:${ACCOUNT}:inference-profile/global.anthropic.claude-opus-5-5" "$(rg eu-central-2)"
expect allowed "Bedrock via eu.* profile"               bedrock:InvokeModel "arn:aws:bedrock:eu-central-2:${ACCOUNT}:inference-profile/eu.anthropic.claude-opus-5-5" "$(rg eu-central-2)"
expect allowed "CreateBucket in eu-central-2"           s3:CreateBucket "arn:aws:s3:::zeitzeuge-x" "$(rg eu-central-2)"
expect denied  "CreateBucket in us-west-2"              s3:CreateBucket "arn:aws:s3:::zeitzeuge-x" "$(rg us-west-2)"

echo; [ $fail -eq 0 ] && echo "All guardrails hold." || echo "$fail guardrail(s) broken."
exit $fail
