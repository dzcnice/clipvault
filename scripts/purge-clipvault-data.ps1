$errors = @()

$userData = Join-Path $env:APPDATA 'clipvault'
if (Test-Path $userData) {
  try {
    Remove-Item -Path $userData -Recurse -Force -ErrorAction Stop
    Write-Output ('deleted: ' + $userData)
  } catch {
    $errors += ('userData - ' + $_.Exception.Message)
  }
} else {
  Write-Output ('skip: ' + $userData + ' (missing)')
}

$localData = Join-Path $env:LOCALAPPDATA 'clipvault'
if (Test-Path $localData) {
  try {
    Remove-Item -Path $localData -Recurse -Force -ErrorAction Stop
    Write-Output ('deleted: ' + $localData)
  } catch {
    $errors += ('localData - ' + $_.Exception.Message)
  }
}

$tempMatches = Get-ChildItem -Path $env:TEMP -Filter 'clipvault*' -Force -ErrorAction SilentlyContinue
foreach ($item in $tempMatches) {
  try {
    Remove-Item -Path $item.FullName -Recurse -Force -ErrorAction Stop
    Write-Output ('deleted: ' + $item.FullName)
  } catch {
    $errors += ('temp ' + $item.Name + ' - ' + $_.Exception.Message)
  }
}

$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
foreach ($name in @('ClipVault', 'electron')) {
  $prop = Get-ItemProperty -Path $runKey -Name $name -ErrorAction SilentlyContinue
  if ($prop -and $prop.$name) {
    try {
      Remove-ItemProperty -Path $runKey -Name $name -ErrorAction Stop
      Write-Output ('registry cleared: ' + $name + ' = ' + $prop.$name)
    } catch {
      $errors += ('registry ' + $name + ' - ' + $_.Exception.Message)
    }
  }
}

Write-Output '---'
if ($errors.Count -eq 0) {
  Write-Output 'ALL CLEAN'
} else {
  Write-Output 'ERRORS:'
  $errors | ForEach-Object { Write-Output ('  ' + $_) }
}
