#!/usr/bin/env bash
set -e

APP_NAME="CybrxAgent"
SUPPORT_DIR="$HOME/Library/Application Support/$APP_NAME"
PLIST="$HOME/Library/LaunchAgents/com.cybrx.agent.plist"

# Read actual install dir from install_info if present
INSTALL_DIR="/Applications/$APP_NAME.app"
if [ -f "$SUPPORT_DIR/install_info.conf" ]; then
  if command -v python3 &>/dev/null; then
    PARSED=$(python3 -c "
import json
d = json.load(open('$SUPPORT_DIR/install_info.conf'))
print(d.get('installDir', '/Applications/$APP_NAME.app'))
" 2>/dev/null || echo "/Applications/$APP_NAME.app")
    INSTALL_DIR="$PARSED"
  fi
fi

echo "======================================================"
echo "  $APP_NAME macOS Uninstaller"
echo "======================================================"
echo "  Install dir : $INSTALL_DIR"
echo "  Support dir : $SUPPORT_DIR"
echo ""

echo "[1/3] Unloading LaunchAgent..."
launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "  LaunchAgent removed."

echo "[2/3] Removing application bundle..."
if [ -d "$INSTALL_DIR" ]; then
  rm -rf "$INSTALL_DIR"
  echo "  Removed: $INSTALL_DIR"
else
  echo "  App bundle not found — skipping."
fi

echo "[3/3] Removing support directory..."
if [ -d "$SUPPORT_DIR" ]; then
  rm -rf "$SUPPORT_DIR"
  echo "  Removed: $SUPPORT_DIR"
else
  echo "  Support dir not found — skipping."
fi

osascript -e 'tell application "System Events" to display dialog "CybrxAgent has been completely uninstalled." buttons {"OK"} with title "Uninstallation Complete"' 2>/dev/null || true

echo ""
echo "✅ $APP_NAME successfully uninstalled."
