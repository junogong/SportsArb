# ElastiCache Redis Module (Cluster Mode Enabled)
# Conditionally creates/destroys Redis replication group based on paused state

variable "paused" {
  description = "When true, delete the cluster to save costs"
  type        = bool
}

variable "cluster_id" {
  description = "ElastiCache replication group identifier"
  type        = string
}

variable "node_type" {
  description = "ElastiCache node type"
  type        = string
}

variable "subnet_group_name" {
  description = "ElastiCache subnet group"
  type        = string
}

variable "security_group_id" {
  description = "Security group ID for ElastiCache"
  type        = string
}

# Cluster Mode Enabled requires aws_elasticache_replication_group
resource "aws_elasticache_replication_group" "redis" {
  count = var.paused ? 0 : 1

  replication_group_id          = var.cluster_id
  description                   = "Stakt Redis Cluster"
  node_type                     = var.node_type
  port                          = 6379
  
  # Crucial for Cluster Mode:
  parameter_group_name          = "default.redis7.cluster.on"
  automatic_failover_enabled    = true
  
  num_node_groups         = 1
  replicas_per_node_group = 0  # 1 shard, 0 replicas for cost savings (minimized)

  subnet_group_name  = var.subnet_group_name
  security_group_ids = [var.security_group_id]

  transit_encryption_enabled = true
  at_rest_encryption_enabled = true

  tags = {
    Name        = "stakt-redis"
    Environment = "production"
    ManagedBy   = "terraform"
  }

  lifecycle {
    prevent_destroy = false
  }
}

output "redis_endpoint" {
  description = "Redis configuration endpoint"
  # For Cluster Mode, we want the configuration_endpoint_address
  value       = var.paused ? null : aws_elasticache_replication_group.redis[0].configuration_endpoint_address
}
