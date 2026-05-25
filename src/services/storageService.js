import Store from "electron-store";
// import { generateUniqueID } from "../helperFunctions/getOrCreateAssetID.js";
import * as apiService from "../services/apiService.js";
import cron from "node-cron";
import { writeLog } from "./logService.js";
 

const schema = {
  assetId: { type: "string" },
  companyToken: { type: "string" },

  schedule: {
    type: "object",
    properties: {
      type: { type: "string" },

      // ✅ OLD (cron-based schedules)
      tasks: {
        type: "array",
        items: { type: "string" },
      },

      // ✅ NEW (rule-based schedules from API)
      rules: {
        type: "array",
        items: { type: "object" },
      },
    },
  },
};

const systemInfoStore = new Store({ name: "system-info" });
const taskManagerStore = new Store({
  name: "task-manager",
});

const store = new Store({ schema, name: "config" });

export const getCompanyToken = () => store.get("companyToken");
export const getAssetId = () => store.get("assetId");
export const getSchedule = () => store.get("schedule") || {};
export const getTaskManagerInfo = () => taskManagerStore.store;
export const getSystemInfo = () => systemInfoStore.store;


// -------------------- INITIALIZE STORE --------------------
export async function initializeStore() {
  // 1️⃣ Ensure company token
  if (!store.has("companyToken")) {
    store.set("companyToken");
  }

  // // 2️⃣ Ensure asset ID
  // if (!store.has("assetId")) {
  //   const newAssetId = await generateUniqueID();
  //   store.set("assetId", newAssetId);
  // }

  // 3️⃣ Fetch schedule from API
  try {
    const apiResponse = await apiService.fetchSchedule();

    if (!apiResponse) {
      writeLog("WARN", "No schedule received from API");
      store.delete("schedule");
      return;
    }

    if (apiResponse.repeatType) {
      writeLog("INFO", "Rule-based schedule received — saving rules");
      store.set("schedule", {
        type: "UserDefined",
        rules: [apiResponse],
      });
      return;
    }

    /**
     * 🟨 BACKWARD COMPATIBILITY (cron-based schedule)
     */
    const { type = "Default", schedule: tasks = [] } = apiResponse;

    if (
      Array.isArray(tasks) &&
      tasks.length &&
      tasks.every((c) => cron.validate(c))
    ) {
      writeLog("INFO", "Cron-based schedule received — saving tasks");
      store.set("schedule", { type, tasks });
    } else {
      writeLog("WARN", "Invalid or empty schedule — clearing local schedule");
      store.delete("schedule");
    }
  } catch (error) {
    writeLog("ERROR", "Failed to fetch schedule from API", {
  error: error?.message || error,
});
    store.delete("schedule");
  }
}

export const setAssetId = (id) => {
  if (!id) return;
  store.set("assetId", id);
};
// -------------------- SAVE SCHEDULE (MANUAL UPDATE) --------------------
export const saveSchedule = (newSchedule) => {
  if (!newSchedule || typeof newSchedule !== "object") return false;

  // Cron-based
  if (Array.isArray(newSchedule.tasks)) {
    store.set("schedule", newSchedule);
    return true;
  }

  // Rule-based
  if (Array.isArray(newSchedule.rules)) {
    store.set("schedule", newSchedule);
    return true;
  }

  return false;
};

// -------------------- SAVE COMPANY TOKEN --------------------
export const saveCompanyToken = (token) => {
  if (token && token !== "DEFAULT") { 
    console.log("saveCompanyToken ::saveCompanyToken:::>", token);
    store.set("companyToken", token);
    return true;
  }
  return false;
};

// -------------------- SAVE SYSTEM INFO --------------------
export const saveSystemInfo = (data) => {
  systemInfoStore.set(data);
  writeLog("INFO", "System info saved");
};

// -------------------- SAVE TASK MANAGER INFO --------------------
export const saveTaskManagerInfo = (data) => {
  taskManagerStore.set(data);
  writeLog("INFO", "Task manager info saved");
};

export function isFirstInstall() {
  return !store.get("firstInstallCompleted");
}

export function markFirstInstallDone() {
  store.set("firstInstallCompleted", true);
}

/**
 * Wipes all electron-store data (config, system-info, task-manager, agent-state).
 * Called during uninstall so assetId, schedule, companyToken, firstInstallCompleted,
 * and installId do not persist to confuse a future reinstall.
 */
export function clearAllStores() {
  try {
    store.clear();
    systemInfoStore.clear();
    taskManagerStore.clear();
    console.log("[storageService] All electron stores cleared.");
  } catch (err) {
    console.error("[storageService] Failed to clear stores:", err.message);
  }
}



