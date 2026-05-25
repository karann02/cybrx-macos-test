import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);


export const getWindowsExpiry = async (softwareName) => {
  try {
    if (softwareName.includes("Microsoft Office")) {
      const output = execSync(
        `cscript "C:\\Program Files\\Microsoft Office\\Office16\\OSPP.VBS" /dstatus`,
        { encoding: "utf-8" }
      );
      const match = output.match(/Expiration\sDate:\s(.+)/);
      return match ? match[1] : "Unknown";
    } 

    else if (softwareName.includes("Adobe")) {
      return execSync(`adobe --check-license`, { encoding: "utf-8" }).trim();
    } 

    else if (
      softwareName.includes("Antivirus") ||
      softwareName.includes("McAfee") ||
      softwareName.includes("Kaspersky")
    ) {

      const { stdout } = await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "
        Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct |
        Select-Object displayName, productState |
        ConvertTo-Json
        "`,
        { encoding: "utf-8" }
      );

      if (!stdout.trim()) return "Unknown";

      const data = JSON.parse(stdout);
      return Array.isArray(data) ? data : [data];
    }

    return "Unknown";
  } catch {
    return "Unknown";
  }
};

export const getMacSoftwareExpiry = async (appPath) => {
  try {
    if (appPath.includes("Adobe")) {
      return execSync(`/usr/local/bin/adobe-licensing --check`, {
        encoding: "utf-8",
      }).trim();
    }
    return "Unknown";
  } catch {
    return "Unknown";
  }
};

export const getLinuxSoftwareExpiry = async (softwareName) => {
  try {
    if (softwareName.includes("Adobe")) {
      return execSync(`adobe-license-cli --check`, {
        encoding: "utf-8",
      }).trim();
    }
    return "Unknown";
  } catch {
    return "Unknown";
  }
};

export const getMacInstallDate = async (appPath) => {
  try {
    return execSync(`stat -f "%Sm" -t "%Y-%m-%d" "${appPath}"`, {
      encoding: "utf-8",
    }).trim();
  } catch {
    return "Unknown";
  }
};


export const detectLicenseType = async (name , publisher) => {
  try {
    const n = name.toLowerCase();
  const p = publisher.toLowerCase();

  const freeNames = ["vscode", "visual studio code", "python", "vlc", "7-zip", "notepad++", "git"];
  const freePublishers = ["open source", "free software", "gnu", "videolan", "python software foundation"];

  if (freeNames.some(term => n.includes(term)) || freePublishers.some(term => p.includes(term))) {
    return "Free";
  }
  if (n.includes("trial") || n.includes("evaluation") || n.includes("demo")) return "Trial";
  if (p.includes("microsoft") || p.includes("adobe") || p.includes("oracle")) return "Licensed";

  return "Unknown";
  } catch {
    return "Unknown";
  }
};
