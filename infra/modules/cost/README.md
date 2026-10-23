# `cost`

Three independent trip wires against the USD 2000 credit.

| Wire | Detail |
|---|---|
| Account budget | gross monthly cost: 25 / 50 / 75 / 90 % actual, 100 % forecast. Account-wide on purpose — the credit is shared with the other projects here |
| Bedrock budget | USD 600/month: 50 / 80 / 100 % |
| Billing alarm | CloudWatch `EstimatedCharges` > USD 1500 (us-east-1) |

**Budgets exclude credits.** By default AWS Budgets subtract them, and with a
credit absorbing every charge a default budget sees USD 0 and never fires.

Two one-time console steps (root, Billing preferences):

1. **Receive CloudWatch billing alerts** — without it `EstimatedCharges` is never published.
2. After ~24 h of tagged usage, set `activate_cost_allocation_tags = true` so
   Cost Explorer can split ZEITZEUGE from other projects.
