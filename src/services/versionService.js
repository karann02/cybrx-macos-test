import Store from "electron-store";
import { v4 as uuidv4 } from "uuid";
import { AGENT_VERSION } from "../constants/version.js";

// ─────────────────────────────────────────────────────────────────────────────
// electron-store automatically resolves the correct platform path:
//   Windows  →  %APPDATA%\CybrxAgent\agent-state.json
//   Linux    →  ~/.config/CybrxAgent/agent-state.json
//   macOS    →  ~/Library/Application Support/CybrxAgent/agent-state.json
// ─────────────────────────────────────────────────────────────────────────────
const agentStateStore = new Store({
  name: "agent-state",
  schema: {
    version: { type: "string" },
    installId: { type: "string" },
    installedAt: { type: "string" },
    basicInfo: { type: "object" },
  },
});

/**
 * Called once at startup.
 * Returns { isFirstInstall, version, installId, installedAt }.
 * On the very first run it writes a new identity; on subsequent runs
 * it reads back the existing identity.
 */
export function initializeVersioning() {
  try {
    const existingInstallId = agentStateStore.get("installId");

    // Normal run — identity already recorded
    if (existingInstallId) {
      return {
        isFirstInstall: false,
        version: agentStateStore.get("version"),
        installId: existingInstallId,
        installedAt: agentStateStore.get("installedAt"),
      };
    }

    // First run — create and persist a new identity
    const identity = {
      version: AGENT_VERSION,
      installId: uuidv4(),
      installedAt: new Date().toISOString(),
    };

    agentStateStore.set(identity);

    return {
      isFirstInstall: true,
      ...identity,
    };
  } catch (error) {
    // Fail open — treat as non-first-install to avoid duplicate registration
    console.error("[versionService] initializeVersioning error:", error.message);
    return {
      isFirstInstall: false,
      version: AGENT_VERSION,
      error: error.message,
    };
  }
}

/**
 * Persists the basic device info returned by getAgentBasicInfo()
 * alongside the existing identity so it survives restarts.
 */
export function saveBasicInfoToState(basicInfo) {
  try {
    agentStateStore.set("basicInfo", basicInfo);
  } catch (error) {
    console.error("[versionService] Failed to save basicInfo:", error.message);
  }
}

/**
 * Wipes the entire agent-state store.
 * Called during uninstall so the next install is treated as a
 * clean first install (registerAgentBasicInfo will be called again).
 */
export function clearAgentState() {
  try {
    agentStateStore.clear();
    console.log("[versionService] Agent state store cleared.");
  } catch (err) {
    console.error("[versionService] Failed to clear agent state:", err.message);
  }
}

