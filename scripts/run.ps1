# Запуск и остановка проекта на Windows: вызывается из start.bat / stop.bat.
# Совместим с Windows PowerShell 5.1 (есть в каждой Windows 10/11).
param(
  [ValidateSet('start', 'stop')]
  [string]$Action = 'start'
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Split-Path -Parent $PSScriptRoot
$Server = Join-Path $Root 'server'
$State = Join-Path $Root '.run'
$PidFile = Join-Path $State 'server.pid'
$PortFile = Join-Path $State 'server.port'
$DepsHashFile = Join-Path $State 'deps.hash'
$MinNodeMajor = 20
$TotalSteps = 7

function Step([int]$n, [string]$text) {
  Write-Host ''
  Write-Host "[$n/$TotalSteps] $text" -ForegroundColor Cyan
}
function Ok([string]$text = 'OK') { Write-Host "      $text" -ForegroundColor Green }
function Info([string]$text) { Write-Host "      $text" -ForegroundColor Gray }
function Warn([string]$text) { Write-Host "      $text" -ForegroundColor Yellow }
function Fail([string]$text) {
  Write-Host ''
  Write-Host "ОШИБКА: $text" -ForegroundColor Red
  exit 1
}

# Запускает npm и прерывает скрипт при ненулевом коде выхода
function Invoke-Npm([string[]]$NpmArgs, [string]$What) {
  Info "npm $($NpmArgs -join ' ')"
  & npm.cmd @NpmArgs
  if ($LASTEXITCODE -ne 0) { Fail "$What завершилось с ошибкой (код $LASTEXITCODE). Подробности — выше." }
}

function Get-NodeMajor {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return 0 }
  $version = (& node -v) -replace '^v', ''
  return [int]($version.Split('.')[0])
}

# Подхватывает PATH, изменённый установщиком, без перезапуска консоли
function Update-PathFromSystem {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
    [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Get-RunningServer {
  if (-not (Test-Path $PidFile)) { return $null }
  $procId = [int](Get-Content $PidFile -Raw)
  $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if ($proc) { return $proc }
  Remove-Item $PidFile, $PortFile -ErrorAction SilentlyContinue
  return $null
}

function Test-Bind([System.Net.IPAddress]$address, [int]$port) {
  try {
    $listener = New-Object System.Net.Sockets.TcpListener($address, $port)
    $listener.Start()
    $listener.Stop()
    return $true
  } catch {
    return $false
  }
}

function Test-Listening([string]$address, [int]$port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $attempt = $client.BeginConnect($address, $port, $null, $null)
    return $attempt.AsyncWaitHandle.WaitOne(300) -and $client.Connected
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

# Порт свободен, только если его никто не слушает ни по IPv4, ни по IPv6: иначе «localhost»
# (который часто идёт через ::1) приведёт в браузере к чужому приложению. Проверка привязкой
# этого не ловит — Windows разрешает занять порт, который другой процесс слушает неэксклюзивно.
function Test-PortFree([int]$port) {
  if (-not (Test-Bind ([System.Net.IPAddress]::Any) $port)) { return $false }
  if (Test-Listening '127.0.0.1' $port) { return $false }
  if ([System.Net.Sockets.Socket]::OSSupportsIPv6 -and (Test-Listening '::1' $port)) { return $false }
  return $true
}

function Get-NewestWrite([string[]]$paths) {
  $files = Get-ChildItem -Path $paths -Recurse -File -ErrorAction SilentlyContinue
  if (-not $files) { return [datetime]::MinValue }
  return ($files | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
}

# Готов именно наш сервер: отвечает JSON-отчётом должников, а не любой страницей
function Test-ServerReady([int]$port) {
  try {
    $res = Invoke-WebRequest -Uri "http://127.0.0.1:$port/debtors" -UseBasicParsing -TimeoutSec 2
    return $res.StatusCode -eq 200 -and $res.Content -match '"month"'
  } catch {
    return $false
  }
}

# ── stop ──────────────────────────────────────────────────

function Stop-Project {
  Write-Host 'Остановка «Учёт оплат»' -ForegroundColor White
  $proc = Get-RunningServer
  if (-not $proc) {
    Warn 'Сервер не запущен — останавливать нечего.'
    return
  }
  Info "Останавливаю сервер (PID $($proc.Id))..."
  # /T — вместе с дочерним процессом node
  & taskkill.exe /PID $proc.Id /T /F | Out-Null
  Remove-Item $PidFile, $PortFile -ErrorAction SilentlyContinue
  Ok 'Сервер остановлен.'
}

# ── start ─────────────────────────────────────────────────

function Start-Project {
  Write-Host 'Запуск «Учёт оплат учебного центра»' -ForegroundColor White
  Write-Host "Папка проекта: $Root" -ForegroundColor DarkGray
  if (-not (Test-Path (Join-Path $Root 'package.json'))) { Fail 'Не найден package.json — запускайте start.bat из папки проекта.' }
  New-Item -ItemType Directory -Force $State | Out-Null

  $running = Get-RunningServer
  if ($running -and (Test-Path $PortFile)) {
    $port = [int](Get-Content $PortFile -Raw)
    Warn "Сервер уже запущен (PID $($running.Id)) — открываю http://127.0.0.1:$port"
    Start-Process "http://127.0.0.1:$port"
    return
  }

  # 1. Node.js
  Step 1 "Проверка Node.js (нужна версия $MinNodeMajor или новее)"
  $major = Get-NodeMajor
  if ($major -ge $MinNodeMajor) {
    Ok "Найден Node.js $(& node -v)"
  } else {
    if ($major -eq 0) { Warn 'Node.js не найден.' } else { Warn "Установлен Node.js $(& node -v) — слишком старый." }
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
      Fail 'winget недоступен. Установите Node.js LTS вручную: https://nodejs.org — и запустите start.bat снова.'
    }
    $answer = Read-Host '      Установить Node.js LTS через winget? [Y/N]'
    if ($answer -notmatch '^(y|yes|д|да)$') { Fail 'Установка отменена. Без Node.js проект не запустится: https://nodejs.org' }

    Info 'Устанавливаю Node.js LTS (может появиться запрос прав администратора)...'
    & winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) { Fail "winget завершился с кодом $LASTEXITCODE. Установите Node.js вручную: https://nodejs.org" }

    Update-PathFromSystem
    $nodeDir = Join-Path $env:ProgramFiles 'nodejs'
    if ((Test-Path $nodeDir) -and ($env:Path -notlike "*$nodeDir*")) { $env:Path = "$nodeDir;$env:Path" }
    $major = Get-NodeMajor
    if ($major -lt $MinNodeMajor) { Fail 'Node.js установлен, но не виден в этой консоли. Закройте окно и запустите start.bat снова.' }
    Ok "Установлен Node.js $(& node -v)"
  }

  # 2. Настройки
  Step 2 'Файл настроек server\.env'
  $envFile = Join-Path $Server '.env'
  if (Test-Path $envFile) {
    Ok 'Уже есть — пропускаю.'
  } else {
    Copy-Item (Join-Path $Server '.env.example') $envFile
    Ok 'Создан из .env.example.'
  }

  # 3. Зависимости
  Step 3 'Зависимости (npm install)'
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $lockHash = [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes((Join-Path $Root 'package-lock.json'))))
  $savedHash = if (Test-Path $DepsHashFile) { (Get-Content $DepsHashFile -Raw).Trim() } else { '' }
  if ((Test-Path (Join-Path $Root 'node_modules')) -and $savedHash -eq $lockHash) {
    Ok 'Уже установлены и не менялись — пропускаю.'
  } else {
    Info 'Устанавливаю пакеты — первый раз это занимает 1–3 минуты...'
    Push-Location $Root
    try { Invoke-Npm @('install', '--no-fund', '--no-audit') 'Установка зависимостей' } finally { Pop-Location }
    Set-Content -Path $DepsHashFile -Value $lockHash
    Ok 'Зависимости установлены.'
  }

  # 4. База данных
  Step 4 'База данных (миграции и демо-данные)'
  Push-Location $Root
  try {
    Invoke-Npm @('run', 'db:deploy', '-w', 'server', '--silent') 'Применение миграций'
    # Сид сам пропускается, если в базе уже есть ученики
    Invoke-Npm @('run', 'db:seed', '-w', 'server', '--silent') 'Заполнение демо-данными'
  } finally { Pop-Location }
  Ok 'База готова.'

  # 5. Сборка
  Step 5 'Сборка веб-страницы и сервера'
  $webDist = Join-Path $Root 'web\dist\index.html'
  $serverDist = Join-Path $Server 'dist\index.js'
  $sourcesChanged = $true
  if ((Test-Path $webDist) -and (Test-Path $serverDist)) {
    $newestSource = Get-NewestWrite @((Join-Path $Root 'web\src'), (Join-Path $Root 'web\index.html'), (Join-Path $Server 'src'))
    $oldestBuild = @((Get-Item $webDist).LastWriteTime, (Get-Item $serverDist).LastWriteTime) | Sort-Object | Select-Object -First 1
    $sourcesChanged = $newestSource -gt $oldestBuild
  }
  if ($sourcesChanged) {
    Push-Location $Root
    try { Invoke-Npm @('run', 'build', '--silent') 'Сборка' } finally { Pop-Location }
    Ok 'Собрано.'
  } else {
    Ok 'Код не менялся с прошлой сборки — пропускаю.'
  }

  # 6. Порт
  Step 6 'Выбор свободного порта'
  $port = 0
  foreach ($candidate in 3000..3099) {
    if (Test-PortFree $candidate) { $port = $candidate; break }
    Info "Порт $candidate занят."
  }
  if ($port -eq 0) { Fail 'Нет свободного порта в диапазоне 3000–3099.' }
  Ok "Порт $port"

  # 7. Запуск
  Step 7 'Запуск сервера'
  $env:PORT = "$port"
  $proc = Start-Process -FilePath 'cmd.exe' -WorkingDirectory $Server -PassThru `
    -ArgumentList '/k', "title Учёт оплат — сервер :$port (остановить — stop.bat) & node dist\index.js"
  Set-Content -Path $PidFile -Value $proc.Id
  Set-Content -Path $PortFile -Value $port
  Info "Сервер стартует в отдельном окне (PID $($proc.Id)), жду готовности..."

  $ready = $false
  foreach ($i in 1..60) {
    if (Test-ServerReady $port) { $ready = $true; break }
    if ($proc.HasExited) { break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) {
    # Окно сервера не закрываем — в нём текст ошибки
    Fail 'Сервер не ответил за 30 секунд. Причина — в окне сервера; закрыть его можно через stop.bat.'
  }

  $url = "http://127.0.0.1:$port"
  Ok "Готово: $url"
  Write-Host ''
  Write-Host "  Веб-страница:  $url" -ForegroundColor White
  Write-Host "  Swagger (API): $url/docs" -ForegroundColor White
  Write-Host '  Остановить:    stop.bat' -ForegroundColor White
  Start-Process $url
}

if ($Action -eq 'stop') { Stop-Project } else { Start-Project }
exit 0
