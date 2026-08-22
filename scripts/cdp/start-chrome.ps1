param(
  [ValidateRange(1, 65535)]
  [int]$DebugPort = 9222,

  [ValidateRange(1, 65535)]
  [int]$BridgePort = 9223,

  [Parameter(Mandatory = $true)]
  [string]$GameUrl
)

$ErrorActionPreference = "Stop"

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) {
  throw "Google Chrome was not found."
}

# CDP has full control of the browser. Keep profiling isolated from personal
# browsing data, cookies, and signed-in accounts.
$profile = Join-Path $env:TEMP "afterleaf-codex-profile"

Start-Process -FilePath $chrome -ArgumentList @(
  "--user-data-dir=`"$profile`""
  "--remote-debugging-port=$DebugPort"
  "--no-first-run"
  "--no-default-browser-check"
  "--disable-background-timer-throttling"
  "--disable-renderer-backgrounding"
  "--disable-backgrounding-occluded-windows"
  # Native occlusion tracking marks tabs hidden behind the caller's back
  # (including when the workstation locks), which silences compositing even
  # though the throttling flags above are set. Intensive wake-up throttling
  # would otherwise clamp background timers to one wakeup per minute after
  # five hidden minutes.
  "--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling"
  "--new-window"
  $GameUrl
)

$endpoint = "http://127.0.0.1:$DebugPort/json/version"
$deadline = [DateTime]::UtcNow.AddSeconds(10)
$version = $null
while ([DateTime]::UtcNow -lt $deadline) {
  try {
    $version = Invoke-RestMethod -Uri $endpoint -TimeoutSec 1
    break
  } catch {
    Start-Sleep -Milliseconds 250
  }
}

if ($null -eq $version) {
  throw "Chrome started, but its DevTools endpoint did not respond at $endpoint."
}

Write-Host "Chrome DevTools is ready on local port $DebugPort." -ForegroundColor Green
Write-Host "Browser: $($version.Browser)"
Write-Host "Game: $GameUrl"
Write-Host "Profile: $profile"
Write-Host "WSL bridge after setup: http://<windows-host-ip>:$BridgePort"
Write-Host "Keep this dedicated window visible and focused for representative measurements."
