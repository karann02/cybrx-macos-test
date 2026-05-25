
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "FileFunc.nsh"

RequestExecutionLevel user
!define MUI_ABORTWARNING

Var ConfigFilePath
Var SelectedConfigFile
Var CustomFolderPath

; ------------------
; PAGE ORDER
; ------------------
!insertmacro MUI_PAGE_WELCOME
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE LicensePage_Leave
!insertmacro MUI_PAGE_LICENSE "${BUILD_RESOURCES_DIR}\license.txt"
Page custom SelectConfigFilePage SelectConfigFilePage_Leave
Page custom DummyPage DummyPage_Leave   ; invisible page to make config page show "Next"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH


; ------------------
; MAIN SECTION
; ------------------
Section "MainSection" SEC01
  DetailPrint "Installing CybrxAgent..."
  Sleep 300
  DetailPrint "Installation complete."
SectionEnd


; ------------------
; UNINSTALL SECTION
; ------------------
Section "Uninstall"
  SetShellVarContext current
  RMDir /r "$APPDATA\CybrxAgent"
  RMDir /r "$INSTDIR"
SectionEnd


; ------------------
; LICENSE PAGE LEAVE
; ------------------
Function LicensePage_Leave
    SetShellVarContext current
    StrCpy $CustomFolderPath "$APPDATA\CybrxAgent"

    DetailPrint "Trying to create folder (first attempt): $CustomFolderPath"

    ; Simulate first failure for demo
    Sleep 500

    ; Try again - real folder creation
    CreateDirectory "$CustomFolderPath"

    ${If} ${Errors}
        Abort
    ${Else}
    ${EndIf}
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
    ${EndIf}
FunctionEnd


; ------------------
; CONFIG FILE PAGE LEAVE
; ------------------
Function SelectConfigFilePage_Leave
    ${NSD_GetText} $ConfigFilePath $SelectedConfigFile

    ${If} $SelectedConfigFile == ""
        MessageBox MB_ICONSTOP "Please select a configuration file before continuing."
        Abort
    ${EndIf}

    StrCpy $CustomFolderPath "$APPDATA\CybrxAgent"

    ; Verify target folder exists
    IfFileExists "$CustomFolderPath\*" FolderExists FolderMissing

FolderMissing:
        MessageBox MB_ICONSTOP "❌ The target folder does not exist. Please restart installation."
        Abort

FolderExists:
        DetailPrint "Copying configuration file..."
        IfFileExists "$SelectedConfigFile" 0 FileNotFound

        CopyFiles /SILENT "$SelectedConfigFile" "$CustomFolderPath\"
        ${If} ${Errors}
            Abort
        ${Else}
        ${EndIf}
        Goto CopyDone

FileNotFound:
    MessageBox MB_ICONSTOP "❌ The selected configuration file no longer exists. Please select again."
    Abort

CopyDone:
FunctionEnd


; ------------------
; DUMMY PAGE (Invisible, to fix Next/Install button)
; ------------------
Function DummyPage
    nsDialogs::Create 1018
    Pop $0
    nsDialogs::Show
FunctionEnd

Function DummyPage_Leave
FunctionEnd