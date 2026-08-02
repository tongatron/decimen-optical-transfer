[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$registryPath = "Software\Classes\*\shell\Decimen.Send"
$installDirectory = Join-Path $env:LOCALAPPDATA "Decimen"
$launcher = Join-Path $installDirectory "send-with-decimen.ps1"

[Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($registryPath, $false)
if (Test-Path -LiteralPath $launcher) {
  Remove-Item -LiteralPath $launcher -Force
}
if ((Test-Path -LiteralPath $installDirectory) -and
    -not (Get-ChildItem -LiteralPath $installDirectory -Force | Select-Object -First 1)) {
  Remove-Item -LiteralPath $installDirectory -Force
}

Write-Host "Removed File Explorer action: Send with Decimen"
