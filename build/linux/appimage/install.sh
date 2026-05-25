#!/usr/bin/env bash
set -euo pipefail
# CybrxAgent AppImage Installer
APP_NAME="CybrxAgent"; SERVICE_NAME="cybrxagent"
DEFAULT_INSTALL_DIR="/opt/$APP_NAME"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE=""; INSTALL_DIR="$DEFAULT_INSTALL_DIR"; USER_INSTALL=false; APPIMAGE_PATH=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --config|-c)      CONFIG_FILE="$2"; shift 2 ;;
    --appimage|-a)    APPIMAGE_PATH="$2"; shift 2 ;;
    --install-dir|-d) INSTALL_DIR="$2"; shift 2 ;;
    --user-install)   USER_INSTALL=true; shift ;;
    *) echo "[ERROR] Unknown: $1" >&2; exit 1 ;;
  esac
done
[[ -z "$CONFIG_FILE" ]] && { echo "[ERROR] --config required" >&2; exit 1; }
# Locate AppImage
if [[ -z "$APPIMAGE_PATH" ]]; then
  for c in "$SCRIPT_DIR/${APP_NAME}-"*.AppImage "$SCRIPT_DIR/${APP_NAME}.AppImage" "$SCRIPT_DIR/../../dist/${APP_NAME}.AppImage"; do
    [[ -f "$c" ]] && { APPIMAGE_PATH="$(realpath "$c")"; break; }
  done
fi
[[ -z "$APPIMAGE_PATH" || ! -f "$APPIMAGE_PATH" ]] && { echo "[ERROR] AppImage not found. Pass --appimage <path>" >&2; exit 1; }
if [[ "$USER_INSTALL" == true ]]; then
  CONFIG_DIR="$HOME/.cybrxagent"; RUN_USER="$USER"; REAL_HOME="$HOME"
else
  [[ "$EUID" -ne 0 ]] && { echo "[ERROR] System install requires root." >&2; exit 1; }
  REAL_USER="${SUDO_USER:-$USER}"
  REAL_HOME=$(getent passwd "$REAL_USER" | cut -d: -f6)
  CONFIG_DIR="$REAL_HOME/.cybrxagent"; RUN_USER="$REAL_USER"
fi
echo ""; echo "  $APP_NAME AppImage Installer"; echo ""
echo "  AppImage   : $APPIMAGE_PATH"; echo "  Install dir: $INSTALL_DIR"; echo ""
echo "[1/4] Creating directories..."; mkdir -p "$CONFIG_DIR" "$INSTALL_DIR"
echo "[2/4] Copying config..."
cp "$CONFIG_FILE" "$CONFIG_DIR/license.conf"; chmod 600 "$CONFIG_DIR/license.conf"
chown "$RUN_USER":"$RUN_USER" "$CONFIG_DIR/license.conf" 2>/dev/null || true
echo "[3/4] Installing AppImage..."
cp "$APPIMAGE_PATH" "$INSTALL_DIR/$APP_NAME.AppImage"; chmod +x "$INSTALL_DIR/$APP_NAME.AppImage"
chown "$RUN_USER":"$RUN_USER" "$INSTALL_DIR/$APP_NAME.AppImage" 2>/dev/null || true
cat > "$CONFIG_DIR/install_info.conf" <<EOF
{"installMode":"appimage","installDir":"$INSTALL_DIR","binary":"$INSTALL_DIR/$APP_NAME.AppImage","runUser":"$RUN_USER","installedAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
chown "$RUN_USER":"$RUN_USER" "$CONFIG_DIR/install_info.conf" 2>/dev/null || true
EXEC_CMD="$INSTALL_DIR/$APP_NAME.AppImage --no-sandbox --ozone-platform=headless --disable-gpu --disable-software-rasterizer"
echo "[4/4] Creating systemd service..."
if [[ "$USER_INSTALL" == true ]]; then
  DIR="$HOME/.config/systemd/user"; mkdir -p "$DIR"
  cat > "$DIR/$SERVICE_NAME.service" <<EOF
[Unit]
Description=CybrxAgent Monitoring Service
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=120
StartLimitBurst=5
[Service]
Type=simple
ExecStart=$EXEC_CMD
Restart=always
RestartSec=10s
Environment=DISPLAY=
[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload; systemctl --user enable "$SERVICE_NAME"; systemctl --user restart "$SERVICE_NAME"
  echo "  Manage: systemctl --user status $SERVICE_NAME"
  echo "  Logs:   journalctl --user -u $SERVICE_NAME -f"
else
  cat > "/etc/systemd/system/$SERVICE_NAME.service" <<EOF
[Unit]
Description=CybrxAgent Monitoring Service
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=120
StartLimitBurst=5
[Service]
Type=simple
User=$RUN_USER
ExecStart=$EXEC_CMD
Restart=always
RestartSec=10s
Environment=HOME=$REAL_HOME
Environment=DISPLAY=
[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload; systemctl enable "$SERVICE_NAME"; systemctl restart "$SERVICE_NAME"
  echo "  Manage: systemctl status $SERVICE_NAME"
  echo "  Logs:   journalctl -u $SERVICE_NAME -f"
fi
echo ""; echo "  $APP_NAME (AppImage) installed successfully."; echo ""
