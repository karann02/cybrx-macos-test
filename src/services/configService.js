// services/configService.js
import fs, { write } from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import { writeLog } from "./logService.js";
import { fatalError } from "./errorService.js";

import { dirname } from "path";
import { fileURLToPath } from "url";
// Get the current directory path using import.meta.url
// javascript-obfuscator:disable
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// javascript-obfuscator:enable

function getLicenseConfPath() {
  const platform = os.platform();
  if (platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "CybrxAgent", "license.conf");
  }
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "CybrxAgent", "license.conf");
  }
  // linux and all other unix
  return path.join(os.homedir(), ".cybrxagent", "license.conf");
}

const configPath = getLicenseConfPath();

// decrypted config cache
let configCache = null;

const agentRequestDecryptPrivateKeyPath = path.resolve(
  __dirname,
  "..",
  "..",
  "build",
  "agent_config_encryption_public_key.pem"
);

/**
 * Verify license signature
 */
function verifyLicenseOld(licenseBlob) {
  try {
    const publicKey = fs.readFileSync(
      agentRequestDecryptPrivateKeyPath,
      "utf8",
    );

    const decoded = JSON.parse(
      Buffer.from(licenseBlob, "base64").toString("utf8"),
    );

    const verify = crypto.createVerify("SHA256");
    verify.update(JSON.stringify(decoded.data));
    verify.end();
    console.log("publicKey", publicKey);
    console.log("decoded.data", decoded.data);
    const isValid = verify.verify(publicKey, decoded.signature, "base64");
    console.log("isValid", isValid);
    return isValid ? decoded.data : null;
  } catch (err) {
    writeLog("ERROR", "License verification failed", {
      error: err.message,
    });
    return null;
  }
}
function verifyLicense(licenseBlob) {
  try {
    const publicKey = fs.readFileSync(
      agentRequestDecryptPrivateKeyPath,
      "utf8",
    );
    const decoded = JSON.parse(
      Buffer.from(licenseBlob, "base64").toString("utf8"),
    );

    const verifier = crypto.createVerify("SHA256");
    verifier.update(decoded.data); // 🔥 EXACT SAME STRING
    verifier.end();

    const isValid = verifier.verify(publicKey, decoded.signature, "base64");
    console.log("isValid", isValid);
    if (!isValid) return false;

    // ✅ Only parse AFTER verification
    return JSON.parse(decoded.data);
  } catch (err) {
    console.error("Verification failed:", err.message);
    return false;
  }
}

/**
 * Validate required fields
 */
function validateConfig(config) {
  if (!config || typeof config !== "object") {
    console.error("Failed not foud config as object::config::>");
    throw new Error("Invalid configuration object");
  }

  const requiredFields = ["serverUrl", "companyToken", "AccountID"];
  console.log("validateConfig::config::>", config);
  writeLog("karan", config);
  for (const field of requiredFields) {
    if (!config[field]) {
      throw new Error(`Missing required config field: ${field}`);
    }
  }
}

/**
 * Load and verify license.conf
 */
export function loadConfig() {
  try {

    // writeLog("INFO", "loading license from configPath:::>", configPath);
    console.log("loadConfig ::loading license from configPath:::>", configPath);
    if (!fs.existsSync(configPath)) {
      throw new Error("license.conf not found");
    }

    const raw = fs.readFileSync(configPath, "utf8");
    const licenseDoc = JSON.parse(raw);

    console.log("licenseDoc ::licenseDoc:::>", licenseDoc);
    // ✅ VERIFY LICENSE
    const verifiedData = verifyLicense(licenseDoc.licenseBlob);

    console.log("Verified Data ::::>", verifiedData)

    if (!verifiedData) {
      throw new Error("License is invalid or tampered");
    }

    // ✅ VALIDATE STRUCTURE
    validateConfig(verifiedData);

    configCache = verifiedData;
    Object.freeze(configCache);

    writeLog("INFO", "License verified and configuration loaded");
  } catch (err) {
    writeLog("FATAL", "Failed to load license.conf", {
      error: err?.message || err,
    });

    fatalError(
      "CybrxAgent License Error",
      "License is invalid or corrupted.\n\nPlease reinstall or contact support.",
      err,
    );
  }
}

/**
 * Get config value
 */
export function getConfig(key, defaultValue = null) {
  if (!configCache) loadConfig();

  if (!configCache) {
    fatalError(
      "CybrxAgent Configuration Error",
      "Configuration could not be loaded.",
    );
    return defaultValue;
  }

  return configCache[key] ?? defaultValue;
}