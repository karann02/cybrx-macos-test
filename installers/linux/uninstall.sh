#!/bin/bash
echo "🗑 Uninstalling AudixAgent..."

# Stop and remove systemd service
systemctl stop audixagent.service 2>/dev/null
systemctl disable audixagent.service 2>/dev/null
rm -f /etc/systemd/system/audixagent.service
rm -rf /opt/audixagent

echo "✅ AudixAgent fully removed."
