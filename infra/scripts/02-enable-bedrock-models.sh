#!/usr/bin/env bash
# Foundation-model ACCESS is not Terraform-managed — it is a one-time
# entitlement per model per region, granted in the console. Some models are
# approved instantly, some are not. Do this on day one.
set -euo pipefail

REGION="${REGION:-eu-central-2}"

echo "Models currently offered in $REGION:"
aws bedrock list-foundation-models --region "$REGION" \
  --query 'modelSummaries[].[modelId,providerName]' --output table

echo
echo "Access status (empty ACCESS_GRANTED list means nothing is enabled yet):"
aws bedrock list-foundation-models --region "$REGION" \
  --query 'modelSummaries[?modelLifecycle.status==`ACTIVE`].modelId' --output text \
  | tr '\t' '\n' | head -40

cat <<'NOTE'

Grant access here (console, one click per model family):
  https://console.aws.amazon.com/bedrock/home?region=eu-central-2#/modelaccess

Request, in this order of importance to the demo:
  1. Claude Haiku 4.5        — the cascade's first tier, most invocations
  2. Claude Sonnet 5         — the reasoning tier and the Red-Team verifier
  3. Claude Opus 5           — adjudication; degrade to Sonnet if unavailable
  4. Amazon Nova Pro         — the second-opinion model (independence argument)
  5. Titan Multimodal Embeddings — collection memory / similar-photo recall
  6. Cohere Rerank           — gazetteer candidate reranking

If a frontier model is not offered in eu-central-2, use an EU cross-region
inference profile rather than moving the data (PROPOSED_SOLUTION 10.3). The
ModelRouter turns that into a models.yaml edit, not a code change.
NOTE
