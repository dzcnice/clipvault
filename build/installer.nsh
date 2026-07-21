; ClipVault NSIS hooks (electron-builder `nsis.include`)
;
; Policy:
; - Same appId upgrades are handled by NSIS overwrite (preferred).
; - Never delete %APPDATA%\clipvault here.
; - Keep hooks light so builds stay reliable across electron-builder versions.

!macro customInstall
  DetailPrint "ClipVault installed. User data stays in %APPDATA%\\clipvault"
!macroend

!macro customUnInstall
  ; deleteAppDataOnUninstall: false — do not wipe vault DB by default
  DetailPrint "Program files removed. Vault data in AppData is preserved."
!macroend
