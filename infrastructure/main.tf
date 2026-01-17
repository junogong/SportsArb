terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# EC2 Module - Stop/Start existing instance
module "ec2" {
  source      = "./modules/ec2"
  instance_id = var.ec2_instance_id
  paused      = var.paused
}

# ElastiCache Module - Delete when paused, recreate when resumed
module "elasticache" {
  source            = "./modules/elasticache"
  paused            = var.paused
  cluster_id        = var.elasticache_cluster_id
  node_type         = var.elasticache_node_type
  subnet_group_name = var.elasticache_subnet_group
  security_group_id = var.elasticache_security_group_id
}

# SSM Module - Store connection info for auto-discovery
module "ssm" {
  source         = "./modules/ssm"
  redis_endpoint = var.paused ? "PAUSED" : try(module.elasticache.redis_endpoint, "PENDING")
  redis_port     = var.elasticache_port
}
