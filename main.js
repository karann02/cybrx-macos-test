import { app } from "electron";
import os from "os";

// ── Headless Linux support ────────────────────────────────────────────────────
// On UI-less servers (no X11/Wayland), Electron crashes at startup trying to
// initialise the display platform. We switch to ozone headless mode so the
// agent runs as a pure background process with no display dependency.
if (os.platform() === "linux") {
  app.commandLine.appendSwitch("no-sandbox");
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    app.commandLine.appendSwitch("ozone-platform", "headless");
    app.commandLine.appendSwitch("disable-gpu");
    app.commandLine.appendSwitch("disable-software-rasterizer");
  }
}
import AutoLaunch from "auto-launch";
import { fatalError } from "./src/services/errorService.js";
import { getAgentBasicInfo } from "./src/services/systemInfoService.js";
import { registerAgentBasicInfo } from "./src/services/apiService.js";
import { saveBasicInfoToState } from "./src/services/versionService.js";
import {
  startAllJobs,
  performSystemScan,
  decideStartupScan,
} from "./src/services/schedulerService.js";
import * as storageService from "./src/services/storageService.js";
import * as apiService from "./src/services/apiService.js"; // also needed for fetchSchedule()
import {
  recordStartup,
  writeLog,
  updateLastRun,
} from "./src/services/logService.js";
import { getConfig, loadConfig } from "./src/services/configService.js";
import { initializeVersioning } from "./src/services/versionService.js";
import { validateCompanyToken } from "./src/helperFunctions/validateCompanyToken.js";
import path from "path";

import { fileURLToPath } from "url";
import { setAssetId } from "./src/services/storageService.js";
// Global crash protection
process.on("uncaughtException", (err) => {
  writeLog("FATAL", "Uncaught Exception", {
    error: err?.message || err,
  });

  fatalError(
    "Agent Error",
    "Unexpected error occurred. Please reinstall the agent.",
    err
  );
});

process.on("unhandledRejection", (err) => {
  writeLog("FATAL", "Unhandled Promise Rejection", {
    error: err?.message || err,
  });

  fatalError(
    "Agent Error",
    "Unexpected error occurred. Please reinstall the agent.",
    err
  );
});

const appPath = process.execPath;


recordStartup();
writeLog("INFO", "Agent initialization started"); // 🟩 add logging entry


// Auto-launch settings (cross-platform)
const myAppAutoLauncher = new AutoLaunch({
  name: "Agent",
  path: appPath,
  isHidden: true,
});

// Enable auto-launch
myAppAutoLauncher
  .enable()
  .then(() => writeLog("INFO", "Auto-launch enabled successfully"))
  .catch((err) =>
    writeLog("ERROR", "Failed to enable auto-launch", { error: err.message })
  );


app.whenReady().then(async () => {

  try {

    // 🔐 Load configuration AFTER Electron is ready
    loadConfig();

  } catch (err) {

    fatalError(
      "Configuration Error",
      "Agent configuration is invalid.\n\nPlease reinstall the agent.",
      err
    );

    return;
  }

  const companyToken = getConfig("companyToken");

  writeLog("INFO", "Config validation", {
    serverUrl: getConfig("serverUrl"),
    companyTokenPresent: !!companyToken,
    hasPublicKey: !!getConfig("publicKey"),
  });



  // Call token validator
  if (!companyToken) {
    writeLog("WARN", "Company token not available yet — skipping validation");
  } else {
    try {
      await validateCompanyToken();
    
      writeLog("INFO", "Company token validated successfully");
    } catch (err) {
      fatalError(
        "Authentication Failed",
        "Invalid company token. Please contact administrator.",
        err
      );
    }
  }

  writeLog("INFO", "App is running in background");
  const versionInfo = initializeVersioning();
  console.log("[main] versionInfo:", JSON.stringify({ isFirstInstall: versionInfo.isFirstInstall, version: versionInfo.version, installId: versionInfo.installId }));

  global.__AGENT_CONTEXT__ = {
    version: versionInfo.version,
    installId: versionInfo.installId,
  };

  try {
    // 1️⃣ Initialize local storage
    await storageService.initializeStore();
    console.log("[main] store initialized. schedule:", JSON.stringify(storageService.getSchedule()));
    writeLog("INFO", "Local store initialized successfully");

    if (versionInfo.isFirstInstall) {
      console.log("[main] FIRST INSTALL → calling registerAgentBasicInfo");

      writeLog("INFO", "First install detected - sending basic device info");

      try {

        const basicInfo = await getAgentBasicInfo();

        if (basicInfo) {
          console.log("basicinfo is available agent in install first time perfectly sending a data in api.....")
          saveBasicInfoToState(basicInfo);
          const response = await registerAgentBasicInfo(basicInfo);
          console.log("[main] registerAgentBasicInfo response:", JSON.stringify(response));
          // ✅ VALIDATE RESPONSE
          if (!response || !response.assetID) {
            throw new Error("❌ assetID not received from server");
          }

          // ✅ STORE assetID (IMPORTANT)
          setAssetId(response.assetID);

          writeLog("INFO", "AssetID stored successfully", {
            assetId: response.assetID
          });
        }

      } catch (error) {

        writeLog("ERROR", "Agent basic registration failed", {
          error: error.message
        });

      }

    }
    // 2️⃣ Ensure schedule is loaded before scan
    let scheduleData = storageService.getSchedule();
    if (!scheduleData?.tasks?.length) {
      writeLog("INFO", "No local schedule found — fetching from API...");
      const { type = "Default", schedule: tasks = [] } = (await apiService.fetchSchedule()) || {};

      if (tasks.length) {
        storageService.saveSchedule({ type, tasks });
        writeLog("INFO", "Schedule fetched and saved successfully.");
      } else {
        writeLog("WARN", "No schedule found from API. Skipping startup scan.");
      }
      scheduleData = storageService.getSchedule();
    }

    // 3️⃣ Start background jobs
    startAllJobs();
    writeLog("INFO", "All scheduled jobs started successfully");

    const startupDecision = decideStartupScan();
    console.log("[main] startupDecision:", JSON.stringify(startupDecision));
    writeLog("INFO", "Startup scan decision", startupDecision);

    if (startupDecision.shouldRun) {
      console.log("[main] Running startup scan...");
      await performSystemScan(true);
      updateLastRun(true);

      if (startupDecision.reason === "FIRST_INSTALL") {
        storageService.markFirstInstallDone();
      }
    }





  } catch (err) {
    updateLastRun(false);
    writeLog("ERROR", "Startup process failed", {
      error: err?.message || err,
    });
  }
});

// 🟨 Graceful shutdown logging
app.on("before-quit", () => writeLog("INFO", "Agent shutting down..."));
