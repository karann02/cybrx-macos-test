import { exec } from "child_process";
import path from "path";
import os from "os";
import { writeLog } from "./logService.js";

// This module triggers the NSIS silent uninstaller on Windows only.
// On Linux and macOS, uninstallation is handled by the platform shell scripts
// (linux-uninstall.sh / uninstall.sh) or by uninstallService.js directly.

if (os.platform() === "win32") {
  const uninstallExe = "C:\\Program Files\\CybrxAgent\\Uninstall CybrxAgent.exe";

  // Run NSIS uninstaller silently (/S flag)
  exec(`"${uninstallExe}" /S`, (error, stdout, stderr) => {
    if (error) {
      writeLog("ERROR", "Uninstall failed", {
        error: error?.message || error,
      });
      return;
    }
    if (stderr) {
      writeLog("ERROR", "⚠️ Uninstall stderr", { stderr });
    }
    writeLog("INFO", "✅ CybrxAgent uninstalled successfully (silent).");
  });
} else {
  writeLog("INFO", `serviceUninstaller: skipped on platform "${os.platform()}" — use uninstallService.js instead.`);
}
