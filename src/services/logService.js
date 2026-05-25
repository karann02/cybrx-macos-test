import os from "os";
import fs from "fs";
import path from "path";

// -------------------- PATH SETUP --------------------
const baseDir =
  process.platform === "win32"
    ? path.join(os.homedir(), "AppData", "Roaming", "CybrxAgent")
    : path.join(os.homedir(), ".cybrxagent");

if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

const logFilePath = path.join(baseDir, "agent.log");
const lastRunPath = path.join(baseDir, "last-run.json");
const startupFilePath = path.join(baseDir, "startup.json");

// -------------------- LOG WRITER --------------------
export function writeLog(type, message, extra = {}) {
  const entry = {
    time: new Date().toISOString(),
    type: type.toUpperCase(),
    message,
    ...extra,
  };

  // Attach agent context (version + installId) if available
  const agentContext = global.__AGENT_CONTEXT__ || {};

  entry.agent = {
    version: agentContext.version,
    installId: agentContext.installId,
  };


  try {
    // Rotate log if larger than 100KB
    if (fs.existsSync(logFilePath)) {
      const { size } = fs.statSync(logFilePath);
      if (size > 100 * 1024) {
        const rotatedPath = logFilePath.replace(
          ".log",
          `-${new Date().toISOString().replace(/[:.]/g, "-")}.log`
        );
        try {
      fs.renameSync(logFilePath, rotatedPath);
    } catch (e) {
      // ignore rotation errors
    }
      }
    }

    fs.appendFileSync(logFilePath, JSON.stringify(entry) + "\n");
  } catch (err) {
  }
}

// -------------------- LAST RUN TRACKING --------------------
export function updateLastRun(success = true) {
  const now = new Date().toISOString();
  let data = { history: [] };

  try {
    if (fs.existsSync(lastRunPath)) {
      const raw = fs.readFileSync(lastRunPath, "utf8");
      data = JSON.parse(raw);
      if (!Array.isArray(data.history)) data.history = [];
    }
  } catch {
    data = { history: [] };
  }

  const runEntry = { time: now, success };
  data.lastRun = runEntry;
  data.history.push(runEntry);

  // Keep only last 10 runs
  data.history = data.history.slice(-10);

  try {
    fs.writeFileSync(lastRunPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("⚠️ Failed to write last-run file:", err.message);
  }
}

export function getLastRun() {
  try {
    if (!fs.existsSync(lastRunPath)) return null;
    const data = JSON.parse(fs.readFileSync(lastRunPath, "utf8"));
    return data.lastRun || null;
  } catch {
    return null;
  }
}

// -------------------- STARTUP INFO --------------------
export function recordStartup() {
  const startupData = {
    startedAt: new Date().toISOString(),
    pid: process.pid,
    platform: process.platform,
  };

  try {
    fs.writeFileSync(startupFilePath, JSON.stringify(startupData, null, 2));
    writeLog("INFO", "Agent started successfully", startupData);
  } catch (err) {
    console.error("⚠️ Failed to record startup info:", err.message);
  }
}

export function getStartupInfo() {
  try {
    if (!fs.existsSync(startupFilePath)) return null;
    return JSON.parse(fs.readFileSync(startupFilePath, "utf8"));
  } catch {
    return null;
  }
}

// -------------------- UTILITIES --------------------
export function readLogs(limit = 50) {
  try {
    if (!fs.existsSync(logFilePath)) return [];
    const lines = fs.readFileSync(logFilePath, "utf8").trim().split("\n");
    return lines
      .slice(-limit)
      .map((line) => JSON.parse(line))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function clearLogs() {
  try {
    if (fs.existsSync(logFilePath)) fs.unlinkSync(logFilePath);
    writeLog("INFO", "Log file cleared");
  } catch (err) {
    console.error("⚠️ Failed to clear log file:", err.message);
  }
}

export function getLogFilePaths() {
  return { baseDir, logFilePath, lastRunPath, startupFilePath };
}
