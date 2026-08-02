[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$decimen = Get-Command decimen -CommandType Application, ExternalScript -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($null -eq $decimen) {
  throw "Install the decimen command before adding the File Explorer action."
}

$installDirectory = Join-Path $env:LOCALAPPDATA "Decimen"
$launcher = Join-Path $installDirectory "send-with-decimen.ps1"
$sourceLauncher = Join-Path $PSScriptRoot "send-with-decimen.ps1"
$registryPath = "Software\Classes\*\shell\Decimen.Send"

New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
Copy-Item -LiteralPath $sourceLauncher -Destination $launcher -Force

$command = 'powershell.exe -NoLogo -NoProfile -NoExit -ExecutionPolicy Bypass -File "{0}" "%1"' -f $launcher
$shellKey = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($registryPath)
try {
  $shellKey.SetValue("", "Send with Decimen", [Microsoft.Win32.RegistryValueKind]::String)
  $shellKey.SetValue("MultiSelectModel", "Single", [Microsoft.Win32.RegistryValueKind]::String)
  $commandKey = $shellKey.CreateSubKey("command")
  try {
    $commandKey.SetValue("", $command, [Microsoft.Win32.RegistryValueKind]::String)
  }
  finally {
    $commandKey.Close()
  }
}
finally {
  $shellKey.Close()
}

Write-Host "Installed File Explorer action: Send with Decimen"
Write-Host "On Windows 11, right-click one file and choose Show more options > Send with Decimen."
