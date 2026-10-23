# Outputs consumed by the environment root module.
# Every cross-module reference goes through an explicit output — no remote-state
# lookups between modules inside the same environment.

output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "cluster_arn" {
  value = aws_ecs_cluster.this.arn
}

output "alb_arn" {
  value = aws_lb.this.arn
}

output "alb_arn_suffix" {
  value = aws_lb.this.arn_suffix
}

output "alb_dns_name" {
  value = aws_lb.this.dns_name
}

output "target_group_arn_suffixes" {
  value = {
    api = aws_lb_target_group.api.arn_suffix
    web = aws_lb_target_group.web.arn_suffix
  }
}

output "service_names" {
  value = { for k, v in aws_ecs_service.this : k => v.name }
}

output "migrate_task_definition_family" {
  value = aws_ecs_task_definition.migrate.family
}

output "seed_task_definition_family" {
  value = aws_ecs_task_definition.seed.family
}

output "migrate_network_configuration" {
  description = "Paste into the GitHub variable ECS_MIGRATE_NETWORK_CONFIG."
  value = jsonencode({
    awsvpcConfiguration = {
      subnets        = var.private_subnet_ids
      securityGroups = [var.api_sg_id]
      assignPublicIp = "DISABLED"
    }
  })
}
