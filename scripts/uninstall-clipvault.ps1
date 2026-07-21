$uninstaller = Join-Path $env:LOCALAPPDATA 'Programs\clipvault\Uninstall ClipVault.exe'
if (-not (Test-Path $uninstaller)) {
  Write-Output 'not-installed'
  exit 0
}
$p = Start-Process -FilePath $uninstaller -ArgumentList '/S' -PassThru
$p.WaitForExit()
Write-Output "exit:$($p.ExitCode)"
Start-Sleep -Seconds 2
$installDir = Join-Path $env:LOCALAPPDATA 'Programs\clipvault'
if (Test-Path $installDir) {
  Write-Output "leftover-dir-exists"
  Get-ChildItem $installDir | Select-Object -ExpandProperty Name
} else {
  Write-Output "install-dir-removed"
}
