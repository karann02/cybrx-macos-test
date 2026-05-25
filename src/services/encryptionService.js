// encryptionService.js
import crypto from "crypto";
import { getConfig } from "./configService.js";
import { writeLog } from "./logService.js";

export const encryptData = (dataObject) => {

  try {
    if (!dataObject) {
      writeLog("ERROR", "Encryption failed: empty payload");
      return null;
    }

    const publicKey = getConfig("publicKey");
    if (!publicKey) {
      throw new Error("❌ Public key not found in config file.");
    }

    const jsonData = JSON.stringify(dataObject);

    const aesKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
    let encryptedData = cipher.update(jsonData, "utf8", "base64");
    encryptedData += cipher.final("base64");
    const authTag = cipher.getAuthTag().toString("base64");

    const encryptedKey = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      aesKey,
    );
    writeLog("INFO", "Payload encrypted successfully");

    return {
      encryptedKey: encryptedKey.toString("base64"),
      iv: iv.toString("base64"),
      authTag,
      data: encryptedData,
    };
  } catch (err) {
    writeLog("ERROR", "Encryption process failed", {
      error: err?.message || err,
    });

    return null;
  }
};
