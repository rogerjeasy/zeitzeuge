# Outputs consumed by the environment root module.
# Every cross-module reference goes through an explicit output — no remote-state
# lookups between modules inside the same environment.

output "vpc_id" {
  value = aws_vpc.this.id
}

output "vpc_cidr_block" {
  value = aws_vpc.this.cidr_block
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Fargate tasks, internal ALB, interface endpoints."
  value       = aws_subnet.private[*].id
}

output "data_subnet_ids" {
  description = "Aurora subnet group. No internet route."
  value       = aws_subnet.data[*].id
}

output "nat_public_ip" {
  description = "The single egress IP — give it to any external API that allowlists callers."
  value       = aws_eip.nat.public_ip
}

output "web_sg_id" {
  value = aws_security_group.web.id
}

output "alb_sg_id" {
  value = aws_security_group.alb.id
}

output "api_sg_id" {
  value = aws_security_group.api.id
}

output "agents_sg_id" {
  value = aws_security_group.agents.id
}

output "db_sg_id" {
  value = aws_security_group.db.id
}

output "endpoints_sg_id" {
  value = aws_security_group.endpoints.id
}
