# `search`

OpenSearch Serverless, VECTORSEARCH collection, German BM25 + kNN hybrid.

**Off by default.** The smallest collection (0.5 + 0.5 OCU, no standby) costs
USD 0.304/OCU-hour in Zurich — ~USD 222/month, the largest fixed cost in the
stack. Aurora already covers vector recall (pgvector) and German full-text
search (`to_tsvector('german', …)`). Set `enabled = true` when ranking quality
on a large corpus justifies it.

When on: `search` CMK encryption, IAM-only data access limited to the API and
agent roles. The endpoint is public-with-SigV4 rather than VPC-only because the
Lambda agents run outside the VPC by design.
