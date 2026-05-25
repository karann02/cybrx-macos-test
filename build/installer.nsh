!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "FileFunc.nsh"

; ------------------
; EXECUTION LEVEL
; ------------------
RequestExecutionLevel admin
!define MUI_ABORTWARNING

Var ConfigFilePath
Var SelectedConfigFile
Var CustomFolderPath

Function CheckAlreadyInstalled
  ; Check if CybrxAgent is already installed
  IfFileExists "$APPDATA\CybrxAgent\install_info.conf" AlreadyInstalled NotInstalled

  NotInstalled:
    Return

  AlreadyInstalled:
    MessageBox MB_ICONEXCLAMATION "CybrxAgent is already installed on this system.$\r$\nSetup will now exit."
    Quit  ; Completely exit the installer
FunctionEnd


; ------------------
; MUI CONFIGURATION
; ------------------
!define MUI_FINISHPAGE_NOAUTOCLOSE
!define MUI_FINISHPAGE_RUN "$INSTDIR\CybrxAgent.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch CybrxAgent now"
!define MUI_FINISHPAGE_TITLE "Setup Complete"
!define MUI_FINISHPAGE_TEXT "CybrxAgent has been successfully installed on your system."

; ------------------
; MACRO DEFINITIONS
; ------------------
!macro myDirectoryPage
  !insertmacro MUI_PAGE_DIRECTORY
!macroend

; ------------------
; PAGE ORDER
; ------------------
; ---------------- CUSTOMIZED WELCOME PAGE ----------------
!define MUI_PAGE_CUSTOMFUNCTION_PRE CheckAlreadyInstalled
!define MUI_WELCOMEPAGE_TITLE "Welcome to CybrxAgent Setup"
!define MUI_WELCOMEPAGE_TEXT "This wizard will install CybrxAgent — a secure automation and monitoring agent.$\r$\n$\r$\nBefore continuing, please close all other applications to ensure a smooth installation.$\r$\n$\r$\nClick Next to proceed."
!define MUI_WELCOMEFINISHPAGE_BITMAP "${BUILD_RESOURCES_DIR}\audixbmp.bmp"
!insertmacro MUI_PAGE_WELCOME

!define MUI_PAGE_CUSTOMFUNCTION_LEAVE LicensePage_Leave
!insertmacro MUI_PAGE_LICENSE "${BUILD_RESOURCES_DIR}\license.txt"
Page custom SelectConfigFilePage SelectConfigFilePage_Leave
!insertmacro myDirectoryPage
Page custom DummyPage DummyPage_Leave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; ------------------
; UNINSTALLER UI PAGES
; ------------------
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; ------------------
; INSTALL SECTION
; ------------------
Section "MainSection" SEC01
  SetOutPath "$INSTDIR"

  DetailPrint "Installing CybrxAgent..."
  Sleep 200

  DetailPrint "Creating installation directory..."
  CreateDirectory "$INSTDIR"
  Sleep 400

  DetailPrint "Copying application files..."
  Sleep 700

  DetailPrint "Creating configuration folder..."
  SetShellVarContext current
  CreateDirectory "$APPDATA\CybrxAgent"
  Sleep 500

  DetailPrint "Copying configuration file..."
  CopyFiles /SILENT "$SelectedConfigFile" "$APPDATA\CybrxAgent\license.conf"
  Sleep 500

  ; -------------------------------
  ; CREATE SEPARATE INSTALL INFO FILE
  ; -------------------------------
  DetailPrint "Creating install_info.conf with installation directory..."
  StrCpy $0 "$APPDATA\CybrxAgent\install_info.conf"
  FileOpen $1 $0 w
  FileWrite $1 "{$\r$\n"
FileWrite $1 '  "installDir": "$INSTDIR"$\r$\n'
FileWrite $1 "}$\r$\n"

  FileClose $1
  DetailPrint "✅ install_info.conf created successfully."
  ; -------------------------------

  DetailPrint "Finalizing installation..."
  Sleep 400

  DetailPrint "Installation complete."
  WriteUninstaller "$INSTDIR\Uninstall CybrxAgent.exe"

  SetAutoClose false
SectionEnd

; ------------------
; UNINSTALL SECTION
; ------------------

Section "Uninstall"
  SetShellVarContext current
  DetailPrint "Uninstalling CybrxAgent..."
  Sleep 400
  RMDir /r "$APPDATA\CybrxAgent"
  RMDir /r "$INSTDIR"
  ; -------------------------------
; REMOVE REGISTRY ENTRY
; -------------------------------
DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CybrxAgent"
DetailPrint "Removed registry uninstall entry."

  DetailPrint "Uninstallation complete."
  SetAutoClose false
SectionEnd



; ------------------
; LICENSE PAGE LEAVE
; ------------------
Function LicensePage_Leave
  SetShellVarContext current
  StrCpy $CustomFolderPath "$APPDATA\CybrxAgent"
  CreateDirectory "$CustomFolderPath"
FunctionEnd

; ------------------
; CONFIG FILE SELECTION PAGE
; ------------------
Function SelectConfigFilePage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 10u 100% 12u "Select configuration file (.config or .conf):"
  Pop $1

  ${NSD_CreateText} 0 30u 70% 12u ""
  Pop $ConfigFilePath

  ${NSD_CreateBrowseButton} 72% 30u 25% 12u "Browse..."
  Pop $2
  ${NSD_OnClick} $2 SelectConfigFileBrowse

  ; Disable Next button by default
GetDlgItem $R9 $HWNDPARENT 1
EnableWindow $R9 0

; Detect typing in textbox
${NSD_OnChange} $ConfigFilePath OnConfigTextChanged


  ${If} $SelectedConfigFile != ""
    ${NSD_SetText} $ConfigFilePath $SelectedConfigFile
  ${EndIf}

  nsDialogs::Show
FunctionEnd

; ------------------
; BROWSE BUTTON CLICK HANDLER
; ------------------
Function SelectConfigFileBrowse
  nsDialogs::SelectFileDialog open "" "" "Config Files (*.config;*.conf)|*.config;*.conf|All Files|*.*"
  Pop $3
  ${If} $3 != ""
    ${NSD_SetText} $ConfigFilePath $3
    StrCpy $SelectedConfigFile $3
    ; Enable Next button once file is selected
      GetDlgItem $R9 $HWNDPARENT 1
      EnableWindow $R9 1

  ${EndIf}
FunctionEnd

; Enable or disable Next based on textbox content
Function OnConfigTextChanged
  ${NSD_GetText} $ConfigFilePath $R0
  StrLen $R1 $R0
  GetDlgItem $R9 $HWNDPARENT 1
  ${If} $R1 > 0
    EnableWindow $R9 1
  ${Else}
    EnableWindow $R9 0
  ${EndIf}
FunctionEnd

; ------------------
; CONFIG FILE PAGE LEAVE
; ------------------
Function SelectConfigFilePage_Leave
  ; Always refresh the selected config file path from the UI
  ${NSD_GetText} $ConfigFilePath $R0
  StrCpy $SelectedConfigFile $R0

  ${If} $SelectedConfigFile == ""
    MessageBox MB_ICONSTOP "Please select a configuration file before continuing."
    Abort
  ${EndIf}

  ; --- Ensure APPDATA folder exists ---
  SetShellVarContext current
  StrCpy $CustomFolderPath "$APPDATA\CybrxAgent"

  DetailPrint "Ensuring target folder exists: $CustomFolderPath"
  IfFileExists "$CustomFolderPath\*" +3 0
    CreateDirectory "$CustomFolderPath"
    Sleep 200

  ; --- Confirm source file exists ---
  IfFileExists "$SelectedConfigFile" 0 FileNotFound

  ; --- Copy the file silently ---
  DetailPrint "Copying config file from $SelectedConfigFile to $CustomFolderPath\license.conf"
  ClearErrors
  CopyFiles /SILENT "$SelectedConfigFile" "$CustomFolderPath\license.conf"

  ${If} ${Errors}
    MessageBox MB_ICONSTOP "❌ Failed to copy configuration file. Please try again."
    Abort
  ${EndIf}

  DetailPrint "✅ Configuration file copied successfully."
  Goto CopyDone

FileNotFound:
  MessageBox MB_ICONSTOP "❌ The selected configuration file no longer exists. Please select again."
  Abort

CopyDone:
FunctionEnd


; ------------------
; DUMMY PAGE (with clickable link, NSIS 3.0.4.1 compatible)
; ------------------
Function DummyPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ; --- Title label ---
  ${NSD_CreateLabel} 0 10u 100% 12u "Ready to install CybrxAgent."
  Pop $1

  ; --- Description ---
  ${NSD_CreateLabel} 0 28u 100% 12u "For more information or support, visit our website:"
  Pop $2

  ; --- Clickable label (blue bold, no underline, no background) ---
  ${NSD_CreateLabel} 0 48u 100% 12u "Visit Cybrx Website"
  Pop $3
  ${NSD_OnClick} $3 OnVisitWebsite

  ; Create bold Segoe UI font
  CreateFont $R0 "Segoe UI" 9 700
  SendMessage $3 ${WM_SETFONT} $R0 0

  ; Set blue text (#0000FF reversed to 0xFF0000), transparent background
  SetCtlColors $3 0xCC6600 ""   ; empty background means transparent

  ; Hand cursor on hover
  System::Call 'user32::LoadCursor(i0, i32649) i .r0'         ; IDC_HAND
  System::Call 'user32::SetClassLongPtr(i $3, i -12, i r0)'   ; GCL_HCURSOR

 

  nsDialogs::Show
FunctionEnd

Function OnVisitWebsite
  ExecShell "open" "https://cybrx.ai/login"
FunctionEnd

Function DummyPage_Leave
FunctionEnd
