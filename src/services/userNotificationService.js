import { app, Notification } from "electron";
import { writeLog } from "./logService.js";
/**
 * Show upgrade notification to the user (safe, non-blocking)
 */
export function notifyUpgradeAvailable({ currentVersion, latestVersion, message }) {
  try {
    writeLog("WARN", "Upgrade available for user", {
      currentVersion,
      latestVersion,
      message,
    });

    // Desktop notification (only if supported)
    if (Notification.isSupported()) {
      new Notification({
        title: "CybrxAgent Update Available",
        body: `Current version: ${currentVersion}\nLatest version: ${latestVersion}\n\n${message}`,
        silent: false,
      }).show();
    }
  } catch (error) {
    // Never crash agent for notification issues
    writeLog("ERROR", "Failed to show upgrade notification", {
      error: error?.message || error,
    });
  }
}
