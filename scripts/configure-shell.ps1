param(
  [Parameter(Mandatory = $true)]
  [string]$ChildUserName,
  [string]$AppPath = "$env:LOCALAPPDATA\Programs\Game Time Control\Game Time Control.exe",
  [switch]$EnableShellReplacement,
  [switch]$EnableStartup
)

$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$winlogonKey = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'

if (-not (Test-Path $AppPath)) {
  throw "App executable not found at $AppPath"
}

if ($EnableStartup) {
  New-Item -Path $runKey -Force | Out-Null
  Set-ItemProperty -Path $runKey -Name 'GameTimeControl' -Value ('"' + $AppPath + '"')
}

if ($EnableShellReplacement) {
  Write-Host "Replacing shell requires an elevated PowerShell and affects the selected child account operationally."
  Set-ItemProperty -Path $winlogonKey -Name 'Shell' -Value ('"' + $AppPath + '"')
}

Write-Host "Configuration written. Child account recorded: $ChildUserName"
