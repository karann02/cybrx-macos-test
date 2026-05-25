import { compareVersions } from "../utils/versionUtils.js";
import { writeLog } from "./logService.js";

export function evaluateAgentVersionPolicy(apiResponseData) {
  const minVersion = apiResponseData?.minAgentVersion;
  if (!minVersion) return;

  const agentContext = global.__AGENT_CONTEXT__;
  if (!agentContext?.version) return;

  const result = compareVersions(agentContext.version, minVersion);

  if (result < 0) {
    writeLog("WARN", "Agent upgrade available", {
      currentVersion: agentContext.version,
      latestVersion: upgrade.latestVersion,
      message: upgrade.message,
    });
  }
}
