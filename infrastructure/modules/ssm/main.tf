# SSM Parameter Store Module
# Stores Redis connection info for auto-discovery by the application

variable "redis_endpoint" {
  description = "Redis endpoint to store"
  type        = string
}

variable "redis_port" {
  description = "Redis port"
  type        = number
}

# Store Redis endpoint in SSM for application auto-discovery
resource "aws_ssm_parameter" "redis_host" {
  name        = "/stakt/redis/host"
  description = "Redis host endpoint - updated by Terraform"
  type        = "String"
  value       = var.redis_endpoint
  overwrite   = true

  tags = {
    ManagedBy = "terraform"
  }
}

resource "aws_ssm_parameter" "redis_port" {
  name        = "/stakt/redis/port"
  description = "Redis port - updated by Terraform"
  type        = "String"
  value       = tostring(var.redis_port)
  overwrite   = true

  tags = {
    ManagedBy = "terraform"
  }
}

output "redis_endpoint_parameter" {
  description = "SSM parameter path for Redis endpoint"
  value       = aws_ssm_parameter.redis_host.name
}
