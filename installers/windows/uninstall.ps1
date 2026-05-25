Write-Host "🗑 Uninstalling CybrxAgent..."

# Stop and delete service
sc stop CybrxAgent 2>$null
sc delete CybrxAgent 2>$null

# Remove program files
$installPath = "C:\Program Files\CybrxAgent"
if (Test-Path $installPath) {
    Remove-Item -Recurse -Force $installPath
}

# Remove Control Panel entry (if MSI used)
$uninstallKey = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall"
Get-ChildItem $uninstallKey | ForEach-Object {
    $displayName = (Get-ItemProperty $_.PsPath).DisplayName
    if ($displayName -like "CybrxAgent*") {
        Remove-Item $_.PsPath -Recurse -Force
    }
}

Write-Host "✅ CybrxAgent fully removed."
