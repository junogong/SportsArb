#!/bin/bash
# pause.sh - Stop all AWS resources to minimize costs
# Usage: ./pause.sh

set -e

echo "⏸️  Pausing Stakt infrastructure..."
echo ""
echo "This will:"
echo "  - Stop the EC2 instance (immediate)"
echo "  - Delete the ElastiCache cluster (takes ~5 min)"
echo ""


# Change directory to the infrastructure folder
cd "$(dirname "$0")"

# Check if terraform.tfvars exists
if [ ! -f "terraform.tfvars" ]; then
    echo "❌ Error: terraform.tfvars not found!"
    echo "   Copy terraform.tfvars.example to terraform.tfvars and fill in your values."
    exit 1
fi

terraform apply -var="paused=true" -auto-approve

echo ""
echo "✅ Infrastructure paused!"
echo ""
echo "💰 Cost savings:"
echo "   - EC2: $0 (stopped)"
echo "   - ElastiCache: $0 (deleted)"
echo "   - You're now paying ~$1/month (EBS storage only)"
