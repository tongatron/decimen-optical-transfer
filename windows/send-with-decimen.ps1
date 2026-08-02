[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$FilePath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) {
  throw "File not found: $FilePath"
}

$decimen = Get-Command decimen -CommandType Application, ExternalScript -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($null -eq $decimen) {
  throw "The decimen command is not installed or is not available in PATH."
}

& $decimen.Source send $FilePath
