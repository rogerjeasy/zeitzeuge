# Outputs consumed by the environment root module.
# Every cross-module reference goes through an explicit output — no remote-state
# lookups between modules inside the same environment.

output "investigation_state_machine_arn" {
  value = aws_sfn_state_machine.investigation.arn
}

output "bulk_state_machine_arn" {
  value = aws_sfn_state_machine.bulk.arn
}

output "state_machine_arns" {
  value = [aws_sfn_state_machine.investigation.arn, aws_sfn_state_machine.bulk.arn]
}

output "bulk_dlq_arn" {
  value = aws_sqs_queue.bulk_dlq.arn
}
