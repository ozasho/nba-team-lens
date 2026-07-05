$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$existing = Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue
if (-not $existing) {
  Start-Process -FilePath node -ArgumentList "server.mjs" -WorkingDirectory $root -WindowStyle Hidden | Out-Null
  Start-Sleep -Seconds 2
}

Start-Process "http://localhost:4173"
Write-Host "NBA Team Lens: http://localhost:4173"
