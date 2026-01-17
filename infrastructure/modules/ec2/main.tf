# EC2 Instance State Module
# Controls stop/start of an existing EC2 instance

variable "instance_id" {
  description = "EC2 instance ID to manage"
  type        = string
}

variable "paused" {
  description = "When true, stop the instance"
  type        = bool
}

# This resource manages only the STATE of an existing instance
# It does not create or destroy the instance itself
resource "aws_ec2_instance_state" "backend" {
  instance_id = var.instance_id
  state       = var.paused ? "stopped" : "running"
}

output "instance_state" {
  description = "Current state of the EC2 instance"
  value       = aws_ec2_instance_state.backend.state
}
