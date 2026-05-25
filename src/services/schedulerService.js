import cron from "node-cron";
//  import cronParser from "cron-parser";

// const parseExpression = cronParser.parseExpression;
// ✅ cron-parser compatibility shim (v5.4.0+) :: important note

import cronParserPkg from "cron-parser";
const cronParser = cronParserPkg.default || cronParserPkg;
const { parseExpression } = cronParser;

import * as storageService from "./storageService.js";
import * as apiService from "./apiService.js";
import * as systemInfoService from "./systemInfoService.js";
import * as taskManagerService from "./taskmanagerService.js";
import { isSameSchedule } from "../helperFunctions/compareSchedules.js";
import { acquireRunLock, releaseRunLock } from "./runLock.js";
import { uninstallAgent } from "./uninstallService.js";
import fs from "fs";
import {
  getStartupInfo,
  writeLog,
  updateLastRun,
  getLastRun,
} from "./logService.js";

let activeJobs = [];
let agentDisabled = false;
let pollingInProgress = false;
let isUninstalling = false;

function hardStopAllJobs() {
  writeLog("WARN", "Hard stopping all scheduler jobs (uninstall)");

  activeJobs.forEach((job) => {
    try {
      job.stop();
    } catch (err) {

      writeLog("WARN", "Failed stopping job", { error: err?.message || err });
    }
  });

  activeJobs = [];
}

function logSchedulerDecision(type, data) {
  writeLog("SCHEDULER", type, data);
}

// -------------------- TIME HELPERS --------------------
function toLocalTime(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(date);

  const map = {};
  parts.forEach((p) => (map[p.type] = p.value));

  return new Date(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
}

function sameMinute(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate() &&
    a.getHours() === b.getHours() &&
    a.getMinutes() === b.getMinutes()
  );
}

function diffInDays(a, b) {
  return Math.floor((a - b) / (1000 * 60 * 60 * 24));
}

function diffInWeeks(a, b) {
  return Math.floor(diffInDays(a, b) / 7);
}

function diffInMonths(a, b) {
  return (
    a.getFullYear() * 12 + a.getMonth() - (b.getFullYear() * 12 + b.getMonth())
  );
}

// -------------------- RULE ENGINE --------------------
function shouldRunRule(rule, nowUtc) {

  if (process.env.DEBUG_SCHEDULER === "true") {

    logSchedulerDecision("RULE_CHECK", {
      ruleId: rule._id,
      repeatType: rule.repeatType,
      times: rule.times,
      timezone: rule.timezone,
      nowUtc: nowUtc.toISOString(),
    });
  }
  const timezone = rule.timezone || "UTC";
  const now = toLocalTime(nowUtc, timezone);

  // ⛔ End-date check
  if (rule.ends?.type === "onDate") {
    const endDate = toLocalTime(new Date(rule.ends.date), timezone);
    endDate.setHours(23, 59, 59, 999);
    if (now > endDate) return false;
  }

  // ⏰ Time match (HH:mm)
  // ⏰ Time match (supports multiple times per day)
  const times = Array.isArray(rule.times)
    ? rule.times
    : rule.time
      ? [rule.time] // backward compatibility
      : [];

  if (!times.length) return false;

  const timeMatched = times.some((t) => {
    const [h, m] = t.split(":").map(Number);
    return now.getHours() === h && now.getMinutes() === m;
  });

  if (!timeMatched) return false;

  const startDate = toLocalTime(
    new Date(rule.createdAt || rule.startDate || nowUtc),
    timezone,
  );
  writeLog("DEBUG", "Rule evaluation", {
    repeatType: rule.repeatType,
    now: now.toISOString(),
    times,
  });

  switch (rule.repeatType) {
    case "Once": {
      return sameMinute(now, startDate);
    }

    case "Daily": {
      const days = diffInDays(now, startDate);
      return days >= 0 && days % rule.repeatEvery === 0;
    }

    case "Weekly": {
      const weeks = diffInWeeks(now, startDate);
      const day = now
        .toLocaleDateString("en-US", { weekday: "short" })
        .toLowerCase();

      return (
        weeks >= 0 &&
        weeks % rule.repeatEvery === 0 &&
        rule.repeatOn?.map((d) => d.toLowerCase()).includes(day)
      );
    }

    case "Monthly": {
      const months = diffInMonths(now, startDate);
      if (months < 0 || months % rule.repeatEvery !== 0) return false;

      if (rule.monthlyRepeat?.option === "dayOfMonth") {
        return now.getDate() === rule.monthlyRepeat.dayNumber;
      }

      return false;
    }

    default:
      return false;
  }
}

// -------------------- MAIN SCAN --------------------
export const performSystemScan = async (forceRun = false) => {
  writeLog("INFO", "System scan triggered");
  if (isUninstalling) return;

  if (!acquireRunLock()) {
    writeLog("INFO", "Scan already running — skipping new request");
    return;
  }

  try {
    writeLog("INFO", `System scan started (forceRun=${forceRun})`);

    let shouldRun = false;

    if (forceRun) {
      shouldRun = true;
    } else {
      const schedule = storageService.getSchedule();
      const rules = schedule?.rules || [];

      const now = new Date();
      shouldRun = rules.some((rule) => shouldRunRule(rule, now));

      // fallback for old cron logic
      if (!rules.length && schedule?.tasks?.length) {
        shouldRun = shouldRunAfterRestart();
      }
    }

    writeLog("DEBUG", `Final shouldRun decision: ${shouldRun}`);

    if (shouldRun) {
      const runNow = new Date();

      writeLog("INFO", "🟢 AGENT SCAN TRIGGERED", {
        date: runNow.toISOString().split("T")[0], // YYYY-MM-DD
        time: runNow.toTimeString().split(" ")[0], // HH:mm:ss
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        reason: forceRun ? "MANUAL_RUN (scan_now API)" : "SCHEDULED_RUN",
      });
      writeLog(
        "INFO",
        "Missed or failed schedule detected after restart. Running system scan...",
      );
      const [systemData, taskData] = await Promise.all([
        systemInfoService.gatherSystemInfo(),
        taskManagerService.gatherTaskmangerInfo(),
      ]);

      if (systemData) {
        await apiService.sendSystemData(systemData);
        storageService.saveSystemInfo(systemData);
      }

      if (taskData) {
        await apiService.sendProcessData(taskData);
        storageService.saveTaskManagerInfo(taskData);
      }
      writeLog("SUCCESS", "System scan completed successfully");

      updateLastRun(true);
    } else {
      writeLog(
        "INFO",
        "No missed schedule detected after restart. Skipping startup scan.",
      );
    }
  } catch (error) {
    writeLog("ERROR", "System scan failed", { error: error.message });
    updateLastRun(false);
  } finally {
    releaseRunLock();
  }
};

// -------------------- SCHEDULE SYNC --------------------
const updateScheduleFromAPI = async () => {
  const { type = "Default", schedule: tasks = [] } =
    (await apiService.fetchSchedule()) || {};

  if (!tasks.length || !tasks.every((c) => cron.validate(c))) {
    writeLog("WARN", "Invalid or empty schedule received from API");
    return;
  }

  const currentSchedule = storageService.getSchedule();
  if (!isSameSchedule(tasks, currentSchedule.tasks)) {
    storageService.saveSchedule({ type, tasks });
    startAllJobs();
  } else {
    writeLog("INFO", "Schedule already up to date");
  }
};

// -------------------- COMMAND POLLER --------------------
export const pollForCommands = async () => {
  if (pollingInProgress || isUninstalling) return;
  pollingInProgress = true;

  try {
    const assetId = storageService.getAssetId();
    if (!assetId) return;

    const [cmd] = await apiService.fetchPendingCommands(assetId, 1);

    if (!cmd) return;

    switch (cmd.type) {
      case "RUN_SCAN":
        await handleRunScan(cmd);
        break;
      case "DISABLE_AGENT":
        await handleDisableAgent(cmd);
        break;
      case "ENABLE_AGENT":
        await handleEnableAgent(cmd);
        break;
      case "UNINSTALL_AGENT":
        await handleUninstallAgent(cmd);
        break;
      default:
        writeLog("WARN", "Unknown command type", { type: cmd.type });
    }
  } catch (err) {
    writeLog("ERROR", "Command poller error", { error: err?.message || err });
  } finally {
    pollingInProgress = false;
  }
};

// -------------------- COMMAND HANDLERS --------------------
const handleRunScan = async (cmd) => {
  try {
    await apiService.updateCommandStatus(cmd.id, "Running", "Running scan...");
    await performSystemScan(true);
    await apiService.updateCommandStatus(
      cmd.id,
      "Completed",
      "Scan finished.",
      {
        scanAt: new Date().toISOString(),
      },
    );
  } catch (err) {
    await apiService.updateCommandStatus(
      cmd.id,
      "Failed",
      err?.message || "Scan failed.",
    );
  }
};

const handleDisableAgent = async (cmd) => {
  try {
    await apiService.updateCommandStatus(
      cmd.id,
      "Running",
      "Disabling agent...",
    );
    stopAllJobs();
    agentDisabled = true;
    await apiService.updateCommandStatus(
      cmd.id,
      "Completed",
      "Agent disabled.",
    );
  } catch (err) {
    await apiService.updateCommandStatus(
      cmd.id,
      "Failed",
      err?.message || "Disable failed.",
    );
  }
};

const handleEnableAgent = async (cmd) => {
  try {
    await apiService.updateCommandStatus(
      cmd.id,
      "Running",
      "Enabling agent...",
    );
    agentDisabled = false;
    startAllJobs();
    await apiService.updateCommandStatus(cmd.id, "Completed", "Agent enabled.");
  } catch (err) {
    await apiService.updateCommandStatus(
      cmd.id,
      "Failed",
      err?.message || "Enable failed.",
    );
  }
};

const handleUninstallAgent = async (cmd) => {
  try {
    isUninstalling = true;

    // 2️⃣ Stop EVERYTHING instantly
    hardStopAllJobs();

    await apiService.updateCommandStatus(
      cmd.id,
      "Running",
      "Uninstalling agent...",
    );

    await uninstallAgent();
    await apiService.updateCommandStatus(
      cmd.id,
      "Completed",
      "Agent uninstalled successfully.",
    );
    // stopAllJobs();
    process.exit(0);
  } catch (err) {
    await apiService.updateCommandStatus(
      cmd.id,
      "Failed",
      err?.message || "Uninstall failed.",
    );
    writeLog("ERROR", "Agent uninstall failed", { error: err?.message || err });
  }
};

// -------------------- JOB MANAGER --------------------
export const startAllJobs = () => {
  if (agentDisabled) {
    return;
  }


  // 1️⃣ Stop old jobs before starting new
  stopAllJobs();

  // 2️⃣ Start poller (always active)
  const pollerJob = cron.schedule("*/10 * * * * *", pollForCommands);
  pollerJob.name = "poller";
  activeJobs.push(pollerJob);

  // 3️⃣ Rule-based scheduler tick (EVERY MINUTE)
  const ruleSchedulerJob = cron.schedule("* * * * *", () => {

    if (isUninstalling) return;
    // 👇 THIS is what actually evaluates rules
    performSystemScan(false);
  });

  ruleSchedulerJob.name = "ruleScheduler";
  activeJobs.push(ruleSchedulerJob);

  // 3️⃣ Schedule system scan jobs
  const scheduleConfig = storageService.getSchedule();
  if (scheduleConfig?.tasks?.length) {
    scheduleConfig.tasks.forEach((schedule) => {
      if (cron.validate(schedule)) {
        const job = cron.schedule(schedule, performSystemScan);
        activeJobs.push(job);
      } else {
        writeLog("WARN", "Invalid cron schedule", { schedule });
      }
    });
  }

  // 4️⃣ Daily schedule update (12 PM)
  const dailyJob1 = cron.schedule("0 12 * * *", updateScheduleFromAPI);
  const dailyJob2 = cron.schedule("0 18 * * *", updateScheduleFromAPI);
  dailyJob1.name = "dailySync12";
  dailyJob2.name = "dailySync18";
  activeJobs.push(dailyJob1, dailyJob2);

  // 5️⃣ Heartbeat job (runs every 30 seconds)
  const heartbeatJob = cron.schedule("*/30 * * * * *", () => {
    if (isUninstalling || agentDisabled) return;

    apiService.sendHeartbeat();
  });
  heartbeatJob.name = "heartbeat";
  activeJobs.push(heartbeatJob);

  // 6️⃣ Start uninstall watcher
  // startUninstallWatcher();
};

// -------------------- DISABLED MODE HANDLER --------------------
export const startAllJobsWhenDisabled = () => {
  // not needed anymore - poller always kept alive
};

// -------------------- STOP JOBS (keep poller) --------------------
export const stopAllJobs = () => {
  if (activeJobs.length === 0) {
    return;
  }


  const remainingJobs = [];

  activeJobs.forEach((job) => {
    if (job.name === "poller" || job.name === "heartbeat") {
      remainingJobs.push(job); // keep poller and heartbeat alive
    } else {
      job.stop();
    }
  });

  activeJobs = remainingJobs;
};

// -------------------- UNINSTALL WATCHER --------------------
const uninstallFlagPath = "C:\\ProgramData\\CybrxAgent\\uninstall.flag";
const uninstallLogPath = "C:\\ProgramData\\CybrxAgent\\uninstall.log";

function logUninstall(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(uninstallLogPath, line);
}

async function checkUninstallFlag() {
  try {
    if (fs.existsSync(uninstallFlagPath)) {
      logUninstall("🧩 Uninstall flag detected. Running uninstall...");
      await uninstallAgent();
      logUninstall("✅ Uninstall completed by service.");
      fs.unlinkSync(uninstallFlagPath);
      process.exit(0);
    }
  } catch (err) {
    logUninstall("❌ Uninstall watcher error: " + err.message);
  }
}

export function startUninstallWatcher() {
  setInterval(checkUninstallFlag, 30000);
  logUninstall("🧭 Uninstall watcher started.");
}

export function shouldRunAfterRestart() {
  writeLog("DEBUG", "shouldRunAfterRestart() called at agent startup");

  const lastRun = getLastRun();
  const scheduleConfig = storageService.getSchedule();
  const startupInfo = getStartupInfo();

  const now = new Date();
  const lastRunTime = lastRun?.time ? new Date(lastRun.time) : null;
  const startupTime = startupInfo?.startedAt
    ? new Date(startupInfo.startedAt)
    : now;

  // 🆕 If no lastRun record → run immediately (first install)
  if (!lastRunTime) {
    writeLog("INFO", "First install detected — running initial scan");
    writeLog("INFO", "First install — triggering initial scan");
    return true;
  }

  // 🕓 Check each cron expression for missed runs
  let shouldRun = false;
  for (const cronExp of scheduleConfig?.tasks || []) {
    try {
      const cronObj = parseExpression(cronExp, { currentDate: now });

      const prev =
        typeof cronObj.getPrev === "function"
          ? cronObj.getPrev().toDate()
          : cronObj.prev().toDate();

      const next =
        typeof cronObj.getNext === "function"
          ? cronObj.getNext().toDate()
          : cronObj.next().toDate();

      // 1️⃣ Missed schedule detection
      if (prev < now && prev > lastRunTime && prev < startupTime) {
        writeLog("INFO", "Missed schedule detected", { cron: cronExp });
        shouldRun = true;
        break;
      }

      // 2️⃣ Near-time trigger (within 1 min)
      const diff = Math.abs(now - prev);
      if (diff <= 60000) {
        writeLog("INFO", "Startup cron match detected", { cron: cronExp });
        writeLog("INFO", `Startup match for schedule: ${cronExp}`);
        shouldRun = true;
        break;
      }
    } catch (err) {
      writeLog("ERROR", "Invalid cron expression", { cron: cronExp, error: err?.message || err });
    }
  }

  if (shouldRun) {
    writeLog(
      "INFO",
      "✅ Startup scan will run (missed or matching schedule detected)",
    );
  } else {
    writeLog(
      "INFO",
      "⏸ No missed or matching schedules — skipping startup scan",
    );
  }

  return shouldRun;
}

export function decideStartupScan() {
  const schedule = storageService.getSchedule();
  const rules = schedule?.rules || [];

  // 1️⃣ First install → run
  if (storageService.isFirstInstall()) {
    return {
      shouldRun: true,
      reason: "FIRST_INSTALL",
    };
  }

  // 2️⃣ Missed schedule → run
  if (rules.length) {
    const lastRun = getLastRun();
    const startupInfo = getStartupInfo();

    const lastRunTime = lastRun?.time ? new Date(lastRun.time) : null;
    const startupTime = startupInfo?.startedAt
      ? new Date(startupInfo.startedAt)
      : new Date();

    // If never ran before, first-install logic already handled
    if (lastRunTime) {
      const missed = rules.some((rule) => {
        const timezone = rule.timezone || "UTC";

        // check each scheduled minute between lastRun and startup
        let cursor = new Date(lastRunTime);
        cursor.setSeconds(0, 0);

        while (cursor < startupTime) {
          if (shouldRunRule(rule, cursor)) {
            return true;
          }
          cursor = new Date(cursor.getTime() + 60_000); // +1 minute
        }

        return false;
      });

      if (missed) {
        return {
          shouldRun: true,
          reason: "MISSED_SCHEDULE",
        };
      }
    }
  }

  // 3️⃣ Default → do not run
  return {
    shouldRun: false,
    reason: "NO_MATCH",
  };
}
