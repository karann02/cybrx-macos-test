import axios from "axios";
import https from "https";
import * as storageService from "./storageService.js";
import { getConfig } from "./configService.js";
import { encryptData } from "./encryptionService.js";
import { evaluateAgentVersionPolicy } from "./agentVersionPolicyService.js";
import { handleUpgradeSignal } from "./agentUpgradeSignalService.js";
import { writeLog } from "./logService.js";

function getAgentHeaders() {
  const agentContext = global.__AGENT_CONTEXT__ || {};

  return {
    "X-Agent-Version": agentContext.version || "unknown",
    "X-Agent-Install-Id": agentContext.installId || "unknown",
  };
}

// 🔐 Load CA certificate from decrypted config
// const caCertificate = getConfig("caCertificateData");

let API_BASE_URL = null;
let companyToken = null;

function ensureApiConfig() {

  if (API_BASE_URL && companyToken) {
    return;
  }

  const serverUrl = getConfig("serverUrl");

  if (!serverUrl) {
    throw new Error("serverUrl missing in decrypted config");
  }

  API_BASE_URL = serverUrl.endsWith("/")
    ? serverUrl
    : serverUrl + "/";

  companyToken = getConfig("companyToken");

  if (!companyToken) {
    throw new Error("companyToken missing in decrypted config");
  }

}

// Create HTTPS agent with CA pinning
const httpsAgent = new https.Agent({
  // ca: caCertificate,
  rejectUnauthorized: true,
});
// -------------------- Company Certificates --------------------

// -------------------- SYSTEM DATA --------------------

export const sendSystemData = async (systemData) => {

  ensureApiConfig();
  try {
    const encryptedsystemdata = encryptData(systemData);
    if (!encryptedsystemdata) {
      writeLog("ERROR", "Encryption failed for system data");
      return null;
    }
    writeLog("DEBUG", "Sending encrypted system data");

    const response = await axios.post(
      `${API_BASE_URL}api/agent`,
      encryptedsystemdata,
      {
        httpsAgent,
        headers: { "Content-Type": "application/json", ...getAgentHeaders() },
      },
    );
    console.log("responsedata", `${API_BASE_URL}api/agent`)
    console.log("responsedata", response.data)
    return response.data;
  } catch (error) {
    writeLog("ERROR", "Failed to send system data", {
      error: error?.message,
      response: error?.response?.data,
    });
    return null;
  }
};

// -------------------- REGISTER AGENT --------------------

export const registerAgentBasicInfo = async (basicData) => {
  ensureApiConfig(); 
  try {

    const encryptedData = encryptData(basicData);

    if (!encryptedData) {
      writeLog("ERROR", "Encryption failed for agent registration");
      return null;
    }

    writeLog("DEBUG", "Sending agent basic registration data");

    const response = await axios.post(
      `${API_BASE_URL}api/agent`,
      encryptedData,
      {
        httpsAgent,
        headers: { "Content-Type": "application/json", ...getAgentHeaders() },
      }
    );

    return response.data;

  } catch (error) {

    writeLog("ERROR", "Failed to register agent basic info", {
      error: error?.message,
      response: error?.response?.data,
    });

    return null;
  }
};
// -------------------- PROCESS DATA --------------------

export const sendProcessData = async (taskManagerData) => {
  ensureApiConfig();
  try {
    const encryptedtaskmanager = encryptData(taskManagerData);

    if (!encryptedtaskmanager) {
      writeLog("ERROR", "Encryption failed for taskmanager data");
      return null;
    }
    writeLog("DEBUG", "Sending encrypted process data");
    const response = await axios.post(
      `${API_BASE_URL}api/proccess/agent/processmanager`,
      encryptedtaskmanager,
      {
        httpsAgent,
        headers: { "Content-Type": "application/json", ...getAgentHeaders() },
      },
    );
    return response.data;
  } catch (error) {
    writeLog("ERROR", "Failed to send process data", {
      error: error?.message,
      response: error?.response?.data,
    });
    return null;
  }
};

// -------------------- FETCH SCHEDULE --------------------

export const fetchSchedule = async () => {
  ensureApiConfig();
  try {
    // const companyToken = storageService.getCompanyToken();
    const response = await axios.get(
      `${API_BASE_URL}api/proccess/agent/taskfrequency/${companyToken}`,
      {
        httpsAgent,
        headers: getAgentHeaders()
      },
    );

    if (!response.data) {
      writeLog("WARN", "Schedule API returned empty response");
      return null;
    }

    // 🔑 Always normalize to ONE rule object
    const rule = {
      ...response.data,
      times: response.data.times || ["09:00"],
      timezone: response.data.timezone || "Asia/Kolkata",
      minAgentVersion: response.data.minAgentVersion || "1.0.0",
    };
    evaluateAgentVersionPolicy(response.data);
    handleUpgradeSignal(response.data);
    writeLog("INFO", "Schedule normalized", { rule });

    // 🚨 IMPORTANT: return OBJECT, not array
    return rule;
  } catch (error) {
    writeLog("ERROR", "Failed to fetch schedule", {
      error: error?.message,
      response: error?.response?.data,
    });
    return null;
  }
};

// -------------------- FETCH COMMANDS --------------------

export const fetchPendingCommands = async (assetId, limit = 1) => {
  ensureApiConfig();
  try {
    const url = `${API_BASE_URL}api/agent/commands/fetch`;
    const resp = await axios.get(url, {
      httpsAgent,
      params: { assetId, limit },
      headers: getAgentHeaders(),
    });

    if (Array.isArray(resp.data) && resp.data.length > 0) {
    }
    return resp.data || [];
  } catch (error) {
    writeLog("ERROR", "Failed to fetch commands", {
      error: error?.message,
      response: error?.response?.data,
    });
    return [];
  }
};

// -------------------- UPDATE COMMANDS --------------------

export const updateCommandStatus = async (
  cmdId,
  status,
  message = "",
  meta = {},
) => {
  ensureApiConfig();
  try {
    const payload = {
      commandId: cmdId,
      status, // normalize to what your backend example shows (e.g., "Completed")
      message,
      meta,
    };

    const url = `${API_BASE_URL}api/agent/commands/update-status`;
    const response = await axios.put(url, payload, {
      httpsAgent,
      headers: getAgentHeaders(),
    });
    return response.data;
  } catch (error) {
    // if backend expects POST instead of PUT, attempt fallback (graceful)
    if (error && error.response && error.response.status === 404) {
      try {
        const fallbackUrl = `${API_BASE_URL}api/agent/commands/update-status`;
        const resp2 = await axios.post(
          fallbackUrl,
          {
            commandId: cmdId,
            status,
            message,
            meta,
          },
          { httpsAgent, headers: getAgentHeaders() },
        );
        return resp2.data;
      } catch (err2) {
        writeLog("ERROR", "Fallback command status update failed", {
          error: err2?.message,
          response: err2?.response?.data,
        });
      }
    }
    writeLog("ERROR", "Failed to update command status", {
      error: error?.message,
      response: error?.response?.data,
    });
    return null;
  }
};

// -------------------- HEARTBEAT COMMANDS --------------------

export const sendHeartbeat = async () => {
  ensureApiConfig();
  try {
    const assetId = storageService.getAssetId();
    if (!assetId) {
      writeLog("WARN", "Heartbeat skipped - missing assetId");
      return null;
    }

    const url = `${API_BASE_URL}api/agent/heartbeat`;
    const agentContext = global.__AGENT_CONTEXT__ || {};
    const payload = {
      assetId,
      timestamp: new Date().toISOString(),
      agent: {
        version: agentContext.version,
        installId: agentContext.installId,
      },
    };

    const resp = await axios.post(url, payload, {
      httpsAgent,
      headers: {
        "Content-Type": "application/json",
        ...getAgentHeaders(),
      },
    });

    writeLog("INFO", "Heartbeat sent", { assetId });
    return resp.data;
  } catch (error) {
    writeLog("ERROR", "Failed to send heartbeat", {
      error: error?.message,
      response: error?.response?.data,
    });
    return null;
  }
};
