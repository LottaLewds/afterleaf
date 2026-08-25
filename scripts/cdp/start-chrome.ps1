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

# A fresh launch that shares a profile directory with a running chrome.exe
# joins that instance and silently drops --remote-debugging-port. Stop stale
# instances of this exact profile first so the debug flag always applies.
$stale = Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" |
  Where-Object { $_.CommandLine -like "*afterleaf-codex-profile*" }
foreach ($instance in $stale) {
  Stop-Process -Id $instance.ProcessId -Force -ErrorAction SilentlyContinue
}
if ($stale) { Start-Sleep -Milliseconds 750 }

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

# Under WSL mirrored networking, a browser listening inside WSL on the same
# loopback port can answer this readiness check in place of Windows Chrome.
# A headless answerer would silently invalidate every later measurement.
if ($version.Browser -match "Headless" -or $version."User-Agent" -match "Headless") {
  throw @"
Port $DebugPort answered with $($version.Browser), not real Windows Chrome.
A headless browser (often a WSL-side instance under mirrored networking) is
shadowing the DevTools port. Stop it or choose another AFTERLEAF_CHROME_DEBUG_PORT.
"@
}

Write-Host "Chrome DevTools is ready on local port $DebugPort." -ForegroundColor Green
Write-Host "Browser: $($version.Browser)"
Write-Host "Game: $GameUrl"
Write-Host "Profile: $profile"
Write-Host "WSL bridge after setup: http://<windows-host-ip>:$BridgePort"
Write-Host "Keep this dedicated window visible and focused for representative measurements."
