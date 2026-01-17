variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "paused" {
  description = "When true, stops EC2 and deletes ElastiCache to minimize costs"
  type        = bool
  default     = false
}

# EC2 Configuration
variable "ec2_instance_id" {
  description = "ID of your existing EC2 instance (e.g., i-0abc123def456)"
  type        = string
}

# ElastiCache Configuration
variable "elasticache_cluster_id" {
  description = "ID for the ElastiCache cluster"
  type        = string
  default     = "stakt-redis"
}

variable "elasticache_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "elasticache_subnet_group" {
  description = "ElastiCache subnet group name"
  type        = string
}

variable "elasticache_security_group_id" {
  description = "Security group ID for ElastiCache"
  type        = string
}

variable "elasticache_port" {
  description = "Redis port"
  type        = number
  default     = 6379
}
