import os from "os";
import { execSync } from "child_process";
import { app } from "electron";
import {
  getCompanyToken,
  saveCompanyToken,
} from "../services/storageService.js";
import { getConfig } from "../services/configService.js";
import { promptForTokenLinux } from "./promptForTokenLinux.js";
import { writeLog } from "../services/logService.js";

export async function validateCompanyToken() {
  // 1️⃣ Get token from decrypted config (memory only)
  const configToken = getConfig("companyToken");
  console.log("configToken indide validateCompapyToken::>", configToken)
  if (!configToken || configToken === "DEFAULT") {
    writeLog("ERROR", "companyToken missing in decrypted config");
    app.quit();
    return;
  }

  // 2️⃣ Check if already stored
  const storedToken = getCompanyToken();
  console.log("storedToken indide validateCompapyToken::>", storedToken)
  if (storedToken && storedToken !== "DEFAULT") {
    return; // already validated
  }

  // 3️⃣ Platform-specific handling
  if (os.platform() === "win32") {
    saveCompanyToken(configToken);
    return;
  }

  if (os.platform() === "darwin") {
    try {
      execSync(
        `osascript -e 'display dialog "✅ License Verified." buttons {"OK"}'`
      );
      saveCompanyToken(configToken);
    } catch {
      app.quit();
    }
    return;
  }

  if (os.platform() === "linux") {
    console.log("linux os platfrom::configToken::>", configToken)
    // const enteredKey = await promptForTokenLinux();
    saveCompanyToken(configToken);
    return;
  }
}
