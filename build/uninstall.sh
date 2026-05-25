#!/usr/bin/env bash
set -e
APP_NAME="CybrxAgent"
SUPPORT_DIR="$HOME/Library/Application Support/$APP_NAME"
PLIST="$HOME/Library/LaunchAgents/com.cybrx.agent.plist"
INSTALL_DIR="/Applications/$APP_NAME.app"

launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
rm -rf "$SUPPORT_DIR"
rm -rf "$INSTALL_DIR"

osascript -e 'tell application "System Events" to display dialog "CybrxAgent has been completely uninstalled." buttons {"OK"} with title "Uninstallation Complete"' 2>/dev/null || true
echo "✅ $APP_NAME successfully uninstalled."
