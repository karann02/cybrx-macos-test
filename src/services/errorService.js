import { dialog, app } from "electron";
import path from "path";
import { writeLog } from "./logService.js";
import { uninstallAgent } from "./uninstallService.js";

let fatalTriggered = false; 
/**
 * Show fatal error to user and stop agent
 */
export async function fatalError(title, message, error = null) {

 if (fatalTriggered) {
    return;
  }

  fatalTriggered = true;
  try {

    writeLog("FATAL", title, {
      message,
      error: error?.message || error,
    });

const iconPath = app.isPackaged
  ? path.join(process.resourcesPath, "build", "audix.ico")
  : path.join(process.cwd(), "build", "audix.ico");

    await dialog.showMessageBox({
      type: "error",
      title: title,
      message: message,
      buttons: ["Close"],
      icon: iconPath,
    });

  } catch (popupError) {

    writeLog("ERROR", "Error dialog failed", {
      error: popupError?.message || popupError,
    });

  }
 try {

    await uninstallAgent();

  } catch (uninstallError) {

    writeLog("ERROR", "Auto uninstall failed", {
      error: uninstallError?.message || uninstallError,
    });

  }

  setTimeout(() => {
    app.quit();
  }, 500);
}

/**
 * Log recoverable error but continue agent
 */
export function logError(context, error) {

  writeLog("ERROR", context, {
    error: error?.message || error,
  });

}