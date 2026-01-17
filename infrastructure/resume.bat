@echo off
REM resume.bat - Restart all AWS resources (Windows)
REM Usage: resume.bat

echo.
echo Resuming Stakt infrastructure...
echo.
echo This will:
echo   - Start the EC2 instance (takes ~1 min)
echo   - Create a new ElastiCache cluster (takes ~15-20 min)
echo.


cd /d "%~dp0"

if not exist "terraform.tfvars" (
    echo ERROR: terraform.tfvars not found!
    echo    Copy terraform.tfvars.example to terraform.tfvars and fill in your values.
    exit /b 1
)

terraform apply -var="paused=false" -auto-approve

echo.
echo Infrastructure is starting up...
echo.
echo Next steps:
echo   1. Wait ~15-20 min for ElastiCache to be available
echo   2. SSH into your EC2 instance
echo   3. Start your Node.js server: npm run start
echo.
echo   The Redis endpoint is stored in SSM at /stakt/redis/host
echo   Your app can fetch it on startup using AWS SDK.
