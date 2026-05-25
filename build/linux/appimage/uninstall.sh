#!/usr/bin/env bash
set -euo pipefail
# CybrxAgent AppImage Uninstaller
APP_NAME="CybrxAgent"; SERVICE_NAME="cybrxagent"
USER_INSTALL=false
while [[ $# -gt 0 ]]; do
  case "$1" in --user-install) USER_INSTALL=true; shift ;; *) echo "[ERROR] Unknown: $1" >&2; exit 1 ;; esac
done
[[ "$USER_INSTALL" == false && "$EUID" -ne 0 ]] && { echo "[ERROR] Requires root. Use sudo." >&2; exit 1; }
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(getent passwd "$REAL_USER" | cut -d: -f6 2>/dev/null || echo "/root")
CONFIG_DIR="$REAL_HOME/.cybrxagent"
echo ""; echo "  $APP_NAME AppImage Uninstaller"; echo ""
echo "[1/3] Stopping systemd service..."
if [[ "$USER_INSTALL" == true ]]; then
  systemctl --user stop "$SERVICE_NAME" 2>/dev/null || true
  systemctl --user disable "$SERVICE_NAME" 2>/dev/null || true
  rm -f "$HOME/.config/systemd/user/$SERVICE_NAME.service"
  systemctl --user daemon-reload 2>/dev/null || true
else
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  systemctl disable "$SERVICE_NAME" 2>/dev/null || true
  rm -f "/etc/systemd/system/$SERVICE_NAME.service"
  systemctl daemon-reload 2>/dev/null || true
fi
echo "  Service removed. ✓"
echo "[2/3] Removing AppImage + install dir..."
[[ -d "/opt/$APP_NAME" ]] && { rm -rf "/opt/$APP_NAME"; echo "  Removed /opt/$APP_NAME"; } || echo "  Not found."
echo "[3/3] Removing config..."
[[ -d "$CONFIG_DIR" ]] && { rm -rf "$CONFIG_DIR"; echo "  Removed $CONFIG_DIR"; } || echo "  Not found."
echo ""; echo "  $APP_NAME (AppImage) uninstalled."; echo ""
