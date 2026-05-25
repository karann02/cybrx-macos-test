#!/usr/bin/env bash
# =============================================================================
#  CybrxAgent RPM Install Script
#  Configures the system service account, license, and systemd unit.
#  Called automatically by the RPM postInst hook.
# =============================================================================
set -euo pipefail

APP_NAME="CybrxAgent"
SERVICE_NAME="cybrxagent"
SERVICE_USER="cybrxagent"          # dedicated non-root system account
INSTALL_DIR="/opt/$APP_NAME"
VAR_DIR="/var/lib/$SERVICE_NAME"   # FHS-compliant runtime/data directory

CONFIG_FILE=""
USER_INSTALL=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config|-c)    CONFIG_FILE="$2"; shift 2 ;;
    --user-install) USER_INSTALL=true;  shift ;;
    *) echo "[ERROR] Unknown argument: $1" >&2; exit 1 ;;
  esac
done

[[ -z "$CONFIG_FILE" ]] && { echo "[ERROR] --config <path> is required" >&2; exit 1; }
[[ ! -f "$CONFIG_FILE" ]] && { echo "[ERROR] Config file not found: $CONFIG_FILE" >&2; exit 1; }

# ── Auto-detect binary (electron-builder may lowercase the name) ─────────────
BINARY=""
for candidate in \
  "$INSTALL_DIR/$APP_NAME" \
  "$INSTALL_DIR/${APP_NAME,,}" \
  "$INSTALL_DIR/cybrx-agent"
do
  [[ -f "$candidate" ]] && { BINARY="$(realpath "$candidate")"; break; }
done
# Last resort: first executable in the install dir
[[ -z "$BINARY" ]] && \
  BINARY=$(find "$INSTALL_DIR" -maxdepth 1 -type f -executable ! -name "*.so*" 2>/dev/null | sort | head -1)
if [[ -z "$BINARY" ]]; then
  echo "[ERROR] No executable found in $INSTALL_DIR" >&2
  echo "        Found: $(ls "$INSTALL_DIR" 2>/dev/null | tr '\n' ' ')" >&2
  exit 1
fi

# ── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo "======================================================"
echo "  $APP_NAME — Production RPM Installer"
echo "======================================================"
echo "  Binary     : $BINARY"
echo "  Install dir: $INSTALL_DIR"
echo "  Mode       : $([ "$USER_INSTALL" == true ] && echo 'user (systemd --user)' || echo 'system (systemd)')"
echo "  CONFIG_FILE:  $CONFIG_FILE"
echo "======================================================"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
#  USER INSTALL MODE (no root, systemd --user session)
# ═══════════════════════════════════════════════════════════════════════════════
if [[ "$USER_INSTALL" == true ]]; then
  CONFIG_DIR="$HOME/.cybrxagent"
  SERVICE_DIR="$HOME/.config/systemd/user"
  mkdir -p "$CONFIG_DIR" "$SERVICE_DIR"

  echo "[1/3] Copying configuration..."
  install -m 600 "$CONFIG_FILE" "$CONFIG_DIR/license.conf"
  cat > "$CONFIG_DIR/install_info.conf" <<EOF
{
  "installMode": "user-rpm",
  "installDir": "$INSTALL_DIR",
  "binary": "$BINARY",
  "runUser": "$USER",
  "installedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

  chmod +x "$BINARY"
  echo "[2/3] Writing systemd user unit..."
  cat > "$SERVICE_DIR/$SERVICE_NAME.service" <<EOF
[Unit]
Description=CybrxAgent Monitoring Agent
Documentation=https://cybrx.ai
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$BINARY --no-sandbox --ozone-platform=headless --disable-gpu --disable-software-rasterizer --disable-dev-shm-usage
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=10
TimeoutStartSec=30
TimeoutStopSec=30
KillMode=control-group
KillSignal=SIGTERM
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME
Environment="NODE_ENV=production"
Environment="DISPLAY="
Environment="DBUS_SESSION_BUS_ADDRESS=disabled:"
Environment="ELECTRON_NO_ATTACH_CONSOLE=1"
Environment="GTK_A11Y=none"

[Install]
WantedBy=default.target
EOF

  systemctl --user daemon-reload
  systemctl --user enable  "$SERVICE_NAME"
  systemctl --user restart "$SERVICE_NAME"
  echo "[3/3] Service enabled and started."
  echo ""
  echo "  Status : systemctl --user status $SERVICE_NAME"
  echo "  Logs   : journalctl --user -t $SERVICE_NAME -f"

# ═══════════════════════════════════════════════════════════════════════════════
#  SYSTEM INSTALL MODE (root — agent runs as root, no dedicated service user)
# ═══════════════════════════════════════════════════════════════════════════════
else
  [[ "$EUID" -ne 0 ]] && { echo "[ERROR] System install requires root." >&2; exit 1; }

  # ── [1/3] Directories and config ─────────────────────────────────────────
  echo "[1/3] Setting up directories and config..."
  install -d -m 700 "$VAR_DIR"
  install -d -m 700 "$VAR_DIR/.cybrxagent"

  # License file — root-only read
  install -m 600 "$CONFIG_FILE" "$VAR_DIR/.cybrxagent/license.conf"

  # Install metadata
  cat > "$VAR_DIR/.cybrxagent/install_info.conf" <<EOF
{
  "installMode": "system-rpm",
  "installDir": "$INSTALL_DIR",
  "binary": "$BINARY",
  "varDir": "$VAR_DIR",
  "runUser": "root",
  "installedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

  # App binary permissions
  chmod +x "$BINARY"
  chmod -R o-rwx "$INSTALL_DIR"   # no world access

  # ── [2/3] Skipping optional hardware tools dynamically ───────────────────
  echo "[2/3] Hardware tools (pciutils, usbutils, sysstat) should be provided by package dependencies."

  # ── [3/3] Write and start the systemd system unit ────────────────────────
  echo "[3/3] Writing systemd system unit..."
  cat > "/etc/systemd/system/$SERVICE_NAME.service" <<EOF
[Unit]
Description=CybrxAgent Monitoring Agent
Documentation=https://cybrx.ai
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR

ExecStart=$BINARY \\
    --no-sandbox \\
    --ozone-platform=headless \\
    --disable-gpu \\
    --disable-software-rasterizer \\
    --disable-dev-shm-usage

ExecReload=/bin/kill -HUP \$MAINPID

Restart=always
RestartSec=10
TimeoutStartSec=30
TimeoutStopSec=30
KillMode=control-group
KillSignal=SIGTERM

StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

Environment="NODE_ENV=production"
Environment="HOME=$VAR_DIR"
Environment="DISPLAY="
Environment="DBUS_SESSION_BUS_ADDRESS=disabled:"
Environment="ELECTRON_NO_ATTACH_CONSOLE=1"
Environment="GTK_A11Y=none"

LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
EOF

  # ── Enable and start ──────────────────────────────────────────────────────
  echo ""
  echo "  Enabling and starting service..."
  systemctl daemon-reload
  systemctl enable  "$SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"

  echo ""
  echo "  Status : systemctl status $SERVICE_NAME"
  echo "  Logs   : journalctl -t $SERVICE_NAME -f"
  echo "  Config : $VAR_DIR/.cybrxagent/license.conf"
fi

echo ""
echo "======================================================"
echo "  $APP_NAME installed successfully."
echo "======================================================"
echo ""
