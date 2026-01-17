@echo off
REM pause.bat - Stop all AWS resources to minimize costs (Windows)
REM Usage: pause.bat

echo.
echo Pausing Stakt infrastructure...
echo.
echo This will:
echo   - Stop the EC2 instance (immediate)
echo   - Delete the ElastiCache cluster (takes ~5 min)
echo.


cd /d "%~dp0"

if not exist "terraform.tfvars" (
    echo ERROR: terraform.tfvars not found!
    echo    Copy terraform.tfvars.example to terraform.tfvars and fill in your values.
    exit /b 1
)

terraform apply -var="paused=true" -auto-approve

echo.
echo Infrastructure paused!
echo.
echo Cost savings:
echo    - EC2: $0 (stopped)
echo    - ElastiCache: $0 (deleted)
echo    - You're now paying ~$1/month (EBS storage only)
