; Ferme automatiquement le launcher (toutes versions) avant d'installer la mise à jour
!macro customInit
  nsExec::Exec 'taskkill /F /T /IM "Kannibal Launcher.exe"'
  nsExec::Exec 'taskkill /F /T /IM "Anomia Launcher.exe"'
  nsExec::Exec 'taskkill /F /T /IM "B2 Launcher.exe"'
  nsExec::Exec 'taskkill /F /T /IM "Anomia.exe"'
  Sleep 1200
!macroend

!macro customUnInit
  nsExec::Exec 'taskkill /F /T /IM "Kannibal Launcher.exe"'
  Sleep 800
!macroend
