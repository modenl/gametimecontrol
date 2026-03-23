param(
  [switch]$RestoreExplorerShell,
  [switch]$RemoveStartup
)

$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$winlogonKey = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'

if ($RemoveStartup -and (Get-ItemProperty -Path $runKey -Name 'GameTimeControl' -ErrorAction SilentlyContinue)) {
  Remove-ItemProperty -Path $runKey -Name 'GameTimeControl'
}

if ($RestoreExplorerShell) {
  Set-ItemProperty -Path $winlogonKey -Name 'Shell' -Value 'explorer.exe'
}

Write-Host 'Shell/startup configuration restored.'
