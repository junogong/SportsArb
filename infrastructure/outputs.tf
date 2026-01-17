output "infrastructure_status" {
  description = "Current infrastructure state"
  value       = var.paused ? "⏸️  PAUSED - Resources stopped/deleted" : "🟢 RUNNING"
}

output "ec2_state" {
  description = "EC2 instance state"
  value       = module.ec2.instance_state
}

output "redis_endpoint" {
  description = "Redis endpoint (empty when paused)"
  value       = var.paused ? "N/A (paused)" : try(module.elasticache.redis_endpoint, "pending")
}

output "redis_ssm_parameter" {
  description = "SSM parameter path for Redis endpoint"
  value       = module.ssm.redis_endpoint_parameter
}
