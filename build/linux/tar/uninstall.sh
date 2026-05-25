#!/usr/bin/env bash
# =============================================================================
#  CybrxAgent Portable Tarball (.tar.gz) Uninstaller
#
#  Usage:
#    sudo /opt/CybrxAgent/resources/linux/tar/uninstall.sh
# =============================================================================
set -euo pipefail

APP_NAME="CybrxAgent"
INSTALL_DIR="/opt/$APP_NAME"

echo ""
echo "======================================================"
echo "  $APP_NAME — Portable Tarball Uninstaller"
echo "======================================================"

if [[ $EUID -ne 0 ]]; then
  echo "[ERROR] This uninstaller must be run as root (use sudo)."
  exit 1
fi

if [[ ! -f "$INSTALL_DIR/resources/linux/rpm/uninstall.sh" ]]; then
  echo "[ERROR] The application does not appear to be installed in $INSTALL_DIR."
  exit 1
fi

echo "[INFO] Handing off to the standard uninstaller to remove services..."

# Run the standard uninstaller which stops the service, deletes users, etc.
bash "$INSTALL_DIR/resources/linux/rpm/uninstall.sh"

echo "[INFO] Removing application files from $INSTALL_DIR..."
rm -rf "$INSTALL_DIR"

echo ""
echo "======================================================"
echo "  [SUCCESS] $APP_NAME has been completely uninstalled."
echo "======================================================"
