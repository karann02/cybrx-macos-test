#!/bin/bash
echo "🗑 Uninstalling AudixAgent..."

# Stop and remove launchd service
launchctl unload /Library/LaunchDaemons/com.audixagent.plist 2>/dev/null
rm -f /Library/LaunchDaemons/com.audixagent.plist
rm -rf /Applications/AudixAgent.app

echo "✅ AudixAgent fully removed."
