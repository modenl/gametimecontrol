!macro customInstall
  CreateDirectory "$SMPROGRAMS\\Game Time Control"
  CreateShortCut "$SMPROGRAMS\\Game Time Control\\Game Time Control.lnk" "$INSTDIR\\Game Time Control.exe"
  CreateShortCut "$DESKTOP\\Game Time Control.lnk" "$INSTDIR\\Game Time Control.exe"
  DetailPrint "Game Time Control installed."
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\\Game Time Control\\Game Time Control.lnk"
  RMDir "$SMPROGRAMS\\Game Time Control"
  Delete "$DESKTOP\\Game Time Control.lnk"
  DetailPrint "Game Time Control uninstalled."
!macroend