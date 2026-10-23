# Outputs consumed by the environment root module.
# Every cross-module reference goes through an explicit output — no remote-state
# lookups between modules inside the same environment.

output "account_budget_name" {
  value = aws_budgets_budget.account.name
}
