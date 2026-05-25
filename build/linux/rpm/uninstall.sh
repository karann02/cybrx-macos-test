#!/usr/bin/env bash
# =============================================================================
#  CybrxAgent RPM Uninstaller
#  Removes: package DB entry, systemd unit, binary, all data dirs, udev rules.
#  Agent runs as root — no dedicated service user to remove.
# =============================================================================
set -euo pipefail

APP_NAME="CybrxAgent"
SERVICE_NAME="cybrxagent"
SERVICE_USER="cybrxagent"
PKG_NAME="CybrxAgent"
INSTALL_DIR="/opt/$APP_NAME"
VAR_DIR="/var/lib/$SERVICE_NAME"          # production data dir (system install)
UDEV_RULE="/etc/udev/rules.d/99-cybrxagent-dmi.rules"

USER_INSTALL=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --user-install) USER_INSTALL=true; shift ;;
    *) echo "[ERROR] Unknown: $1" >&2; exit 1 ;;
  esac
done

[[ "$USER_INSTALL" == false && "$EUID" -ne 0 ]] && { echo "[ERROR] Requires root. Use sudo." >&2; exit 1; }

echo ""
echo "======================================================"
echo "  $APP_NAME RPM Uninstaller"
echo "======================================================"

# ── [0] Remove from RPM package database ─────────────────────────────────────
echo "[0/5] Removing from RPM database..."
if command -v dnf &>/dev/null && dnf list installed "$PKG_NAME" &>/dev/null 2>&1; then
  dnf remove -y "$PKG_NAME" && echo "  Removed via dnf." || true
elif command -v rpm &>/dev/null && rpm -q "$PKG_NAME" &>/dev/null 2>&1; then
  rpm -e "$PKG_NAME" && echo "  Removed via rpm -e." || true
else
  echo "  Not found in RPM DB — skipping."
fi

# ── [1] Stop, disable, and fully purge the systemd unit ──────────────────────
echo "[1/5] Stopping and purging systemd service..."
if [[ "$USER_INSTALL" == true ]]; then
  systemctl --user stop    "$SERVICE_NAME" 2>/dev/null || true
  systemctl --user disable "$SERVICE_NAME" 2>/dev/null || true
  rm -f "$HOME/.config/systemd/user/$SERVICE_NAME.service"
  systemctl --user daemon-reload 2>/dev/null || true
  systemctl --user reset-failed "$SERVICE_NAME" 2>/dev/null || true
else
  systemctl stop    "$SERVICE_NAME" 2>/dev/null || true
  systemctl disable "$SERVICE_NAME" 2>/dev/null || true
  rm -f "/etc/systemd/system/$SERVICE_NAME.service"
  systemctl daemon-reload 2>/dev/null || true
  # Clears the unit from systemd's runtime memory so 'systemctl status' shows
  # 'Unit not found' instead of lingering as inactive/failed after removal.
  systemctl reset-failed "$SERVICE_NAME" 2>/dev/null || true
fi
echo "  Service removed."

# ── [2] Remove application binary ────────────────────────────────────────────
echo "[2/5] Removing application directory: $INSTALL_DIR"
if [[ -d "$INSTALL_DIR" ]]; then
  rm -rf "$INSTALL_DIR"
  echo "  Removed $INSTALL_DIR."
else
  echo "  Not found — skipping."
fi

# ── [3] Remove all data and config directories ───────────────────────────────
echo "[3/5] Removing data and config directories..."

# Production system install: /var/lib/cybrxagent/ (owns .cybrxagent/, .config/, etc.)
if [[ -d "$VAR_DIR" ]]; then
  rm -rf "$VAR_DIR"
  echo "  Removed $VAR_DIR."
else
  echo "  $VAR_DIR not found — skipping."
fi

# Legacy / user install: ~/.cybrxagent
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(getent passwd "$REAL_USER" | cut -d: -f6 2>/dev/null || echo "/root")
LEGACY_CONFIG="$REAL_HOME/.cybrxagent"
if [[ -d "$LEGACY_CONFIG" ]]; then
  rm -rf "$LEGACY_CONFIG"
  echo "  Removed $LEGACY_CONFIG."
fi

# electron-store files under the calling user's home (user installs)
ELECTRON_STORE_DIR="$REAL_HOME/.config/CybrxAgent"
if [[ -d "$ELECTRON_STORE_DIR" ]]; then
  rm -rf "$ELECTRON_STORE_DIR"
  echo "  Removed $ELECTRON_STORE_DIR."
fi

# ── [4] Remove udev rule (backward compat with old installs) ─────────────────
echo "[4/4] Removing udev rule..."
rm -f "$UDEV_RULE" && udevadm control --reload-rules 2>/dev/null || true
echo "  Udev rule: done."

echo ""
echo "======================================================"
echo "  $APP_NAME (rpm) uninstalled successfully."
echo "======================================================"
echo ""
