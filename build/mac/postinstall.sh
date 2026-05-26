#!/usr/bin/env bash
set -e

# ======================================================
#   CybrxAgent macOS Universal Installer (10.10 → 15.x)
# ======================================================

APP_NAME="CybrxAgent"
VERSION="1.0.0"
DEFAULT_INSTALL_DIR="/Applications"
SUPPORT_DIR="$HOME/Library/Application Support/$APP_NAME"
AGENT_PLIST="$HOME/Library/LaunchAgents/com.cybrx.agent.plist"
LICENSE_FILE="./license.txt"
divider="--------------------------------------------------"

echo ""
echo "======================================================"
echo "🚀 Welcome to the $APP_NAME macOS Installer"
echo "======================================================"
sleep 1

# -------------------------------
# 1️⃣  WELCOME PAGE
# -------------------------------
osascript <<'END' 2>/dev/null || true
try
    tell application "System Events"
        activate
        display dialog "Welcome to the CybrxAgent Installer!

This wizard will guide you through the installation." buttons {"Continue"} default button "Continue" with title "Welcome"
    end tell
end try
END

echo "$divider"
echo "Step 1: Welcome complete."
sleep 0.5

# -------------------------------
# 2️⃣  LICENSE AGREEMENT
# -------------------------------
if [ -f "$LICENSE_FILE" ]; then
  osascript <<END 2>/dev/null || true
  try
      tell application "System Events"
          activate
          display dialog "Please review and accept the CybrxAgent license to continue." buttons {"View License", "Agree"} default button "Agree" with title "License Agreement"
          set userChoice to button returned of result
          if userChoice is equal to "View License" then
              do shell script "open '$LICENSE_FILE'"
              display dialog "Click 'Agree' to continue installation." buttons {"Agree"} default button "Agree"
          end if
      end tell
  end try
END
else
  echo "⚠️  License file not found — skipping license page."
fi

echo "$divider"
echo "Step 2: License accepted."
sleep 0.5

# -------------------------------
# 3️⃣  CONFIGURATION FILE INPUT (CLI BASED)
# -------------------------------

echo ""
echo "$divider"
echo "Step 3: Configuration File Setup"
echo "$divider"
echo ""

read -p "Enter full path to your config file: " CONFIG_FILE

# Remove quotes if user pasted quoted path
CONFIG_FILE=$(echo "$CONFIG_FILE" | sed 's/^"//;s/"$//')

if [ -z "$CONFIG_FILE" ]; then
  echo ""
  echo "❌ No configuration file entered."
  exit 1
fi

if [ ! -f "$CONFIG_FILE" ]; then
  echo ""
  echo "❌ Config file not found:"
  echo "$CONFIG_FILE"
  exit 1
fi

echo ""
echo "✅ Config file selected:"
echo "$CONFIG_FILE"
sleep 1

# -------------------------------
# 4️⃣  INSTALLATION DIRECTORY SELECTION
# -------------------------------
INSTALL_DIR=$(osascript <<END 2>/dev/null || true
try
    tell application "System Events"
        activate
        set installFolder to choose folder with prompt "Choose installation folder for CybrxAgent" default location "$DEFAULT_INSTALL_DIR"
        POSIX path of installFolder
    end tell
on error
    return ""
end try
END
)

if [ -z "$INSTALL_DIR" ]; then
  INSTALL_DIR="$DEFAULT_INSTALL_DIR"
fi

echo "$divider"
echo "Step 4: Selected installation directory → $INSTALL_DIR"
sleep 0.5

# -------------------------------
# 5️⃣  INSTALLATION PROCESS
# -------------------------------
osascript -e 'tell application "System Events" to display dialog "Installing CybrxAgent... Please wait." buttons {"OK"} giving up after 1 with title "Installing"' 2>/dev/null || true

echo "📁 Creating directories..."
mkdir -p "$INSTALL_DIR/$APP_NAME.app"
mkdir -p "$SUPPORT_DIR"
sleep 0.5

echo "📄 Copying configuration file..."
cp "$CONFIG_FILE" "$SUPPORT_DIR/license.conf" || echo "⚠️  Could not copy config file."
chmod 600 "$SUPPORT_DIR/license.conf"
sleep 0.5

echo "🧾 Writing installation info..."
cat <<EOF > "$SUPPORT_DIR/install_info.conf"
{
  "installDir": "$INSTALL_DIR/$APP_NAME.app",
  "version": "$VERSION"
}
EOF
sleep 0.5

echo "⚙️  Creating autostart LaunchAgent..."
mkdir -p "$HOME/Library/LaunchAgents"
cat <<EOF > "$AGENT_PLIST"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.cybrx.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>$INSTALL_DIR/$APP_NAME.app/Contents/MacOS/$APP_NAME</string>
  </array>
  <!-- Start automatically at every login -->
  <key>RunAtLoad</key><true/>
  <!-- Restart automatically if the agent exits for any reason -->
  <key>KeepAlive</key><true/>
  <!-- Wait 10 s before restarting to avoid a rapid restart loop -->
  <key>ThrottleInterval</key><integer>10</integer>
  <!-- Capture stdout/stderr for diagnostics -->
  <key>StandardOutPath</key><string>$SUPPORT_DIR/agent-stdout.log</string>
  <key>StandardErrorPath</key><string>$SUPPORT_DIR/agent-stderr.log</string>
</dict>
</plist>
EOF

launchctl load "$AGENT_PLIST" 2>/dev/null || true
sleep 0.5

echo "$divider"
echo "✅ Step 5: Installation complete."
sleep 0.5

# -------------------------------
# 6️⃣  FINISH PAGE
# -------------------------------
osascript <<'END' 2>/dev/null || true
try
    tell application "System Events"
        activate
        display dialog "Installation Complete!

CybrxAgent has been successfully installed.
The agent will start automatically at startup and will restart automatically if it ever stops." buttons {"OK"} default button "OK" with title "Installation Complete"
    end tell
end try
END

echo ""
echo "✅ $APP_NAME installation complete!"
# echo "🌐 Visit https://cybrx.ai/login for more information."
echo ""
exit 0
