import { writeLog } from "./logService.js";

export function handleUpgradeSignal(apiResponseData) {
  const upgrade = apiResponseData?.upgrade;
  if (!upgrade?.available) return;

  const agentContext = global.__AGENT_CONTEXT__ || {};

  writeLog("WARN", "Agent upgrade available", {
    currentVersion: agentContext.version,
    latestVersion: upgrade.latestVersion,
    message: upgrade.message,
  });
}
