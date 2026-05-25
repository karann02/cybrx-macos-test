import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
const platform = os.platform();
import { writeLog } from "../services/logService.js";

export const isRestrictedDirectory = (dirPath) => {
  if (platform !== "win32") {
    const restrictedDirs = ["/System", "/proc", "/dev", "/run", "/Volumes"];
    return restrictedDirs.some((restricted) => dirPath.startsWith(restricted));
  } else if (platform === "win32") {
    const restrictedDirs = [
      "C:\\Windows",
      "C:\\ProgramData",
      "C:\\System Volume Information",
      "C:\\$Recycle.Bin",
      "C:\\Recovery",
      "C:\\pagefile.sys",
      "C:\\hiberfil.sys",
    ];
    const normalized = path.normalize(dirPath).toLowerCase();
    return restrictedDirs.some((restricted) =>
      normalized.startsWith(path.normalize(restricted).toLowerCase())
    );
  }
};

export const getInstalledSoftwareFromRegistry = async () => {
  let installedSoftware = [];


  try {
    if (platform === "win32") {
      const registryPaths = [
        "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        "HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
      ];

      registryPaths.forEach((path) => {
        try {
          const result = execSync(`reg query "${path}" /s`).toString();
          const softwareEntries = result.split("\r\n\r\n").filter((entry) => entry.includes("DisplayName"));

          softwareEntries.forEach((entry) => {
            const lines = entry.split("\r\n").map((line) => line.trim());
            let softwareName = "Unknown";
            let softwareVersion = "Unknown";
            let softwareLocation = "Unknown";
            let publisher = "Unknown";
            lines.forEach((line) => {
              if (line.startsWith("DisplayName")) {
                softwareName = line.split("    ").pop();
              }
              if (line.startsWith("DisplayVersion")) {
                softwareVersion = line.split("    ").pop();
              }
              if (line.startsWith("InstallLocation")) {
                softwareLocation = line.split("    ").pop();
              }
              if (line.startsWith("Publisher")) {
                publisher = line.split("    ").pop();
              }
            });

            if (softwareName !== "Unknown") {
              installedSoftware.push({
                applicationName: softwareName,
                version: softwareVersion,
                softwareLocation,
                softwareType: detectSoftwareType(softwareName, publisher),
                manufacturer: publisher,
                installDate: formatInstallDate("Unknown"),
                expiryDate: getWindowsExpiry(softwareName),
                licenseType: detectLicenseType(softwareName, "")
              });
            }
          });
        } catch { }
      });
    } else if (platform === "darwin") {
      const result = execSync("system_profiler SPApplicationsDataType -json").toString();
      const jsonData = JSON.parse(result);

      if (jsonData.SPApplicationsDataType) {
        jsonData.SPApplicationsDataType.forEach((app) => {
          const appName = app._name || "Unknown";
          installedSoftware.push({
            applicationName: appName,
            version: app.version || "Unknown",
            softwareLocation: app.path || "Unknown",
            softwareType: detectSoftwareType(appName, app.info || ""),
            manufacturer: app.info || "Unknown",
            installDate: formatInstallDate("Unknown"),
            expiryDate: "N/A",
            licenseType: detectLicenseType(appName, "")
          });
        });
      }
    } else if (platform === "linux") {
      // ── Package manager discovery (priority order) ──────────────────────
      // Each entry: { check, cmd, parse } — first match wins.
      const packageManagers = [
        {
          // Debian / Ubuntu / Mint / Pop!_OS / Kali
          name: "dpkg",
          check: () => fs.existsSync("/usr/bin/dpkg-query"),
          cmd: "dpkg-query -W -f='${Package}\t${Version}\t${Maintainer}\n'",
          parse: (line) => {
            const [name, version, maintainer] = line.trim().split("\t");
            if (!name) return null;
            return { applicationName: name, version: version || "Unknown", manufacturer: maintainer || "Unknown" };
          }
        },
        {
          // RHEL / Rocky / CentOS / Fedora / AlmaLinux / openSUSE
          name: "rpm",
          check: () => fs.existsSync("/usr/bin/rpm") || fs.existsSync("/bin/rpm"),
          cmd: "rpm -qa --queryformat '%{NAME}\t%{VERSION}-%{RELEASE}\t%{VENDOR}\n'",
          parse: (line) => {
            const [name, version, vendor] = line.trim().split("\t");
            if (!name) return null;
            return { applicationName: name, version: version || "Unknown", manufacturer: vendor || "Unknown" };
          }
        },
        {
          // Arch Linux / Manjaro / EndeavourOS
          name: "pacman",
          check: () => fs.existsSync("/usr/bin/pacman"),
          cmd: "pacman -Q",
          parse: (line) => {
            const parts = line.trim().split(" ");
            if (!parts[0]) return null;
            return { applicationName: parts[0], version: parts[1] || "Unknown", manufacturer: "Unknown" };
          }
        },
        {
          // Alpine Linux
          name: "apk",
          check: () => fs.existsSync("/sbin/apk"),
          cmd: "apk info -v",
          parse: (line) => {
            const trimmed = line.trim();
            if (!trimmed) return null;
            // apk prints: name-version-release  e.g. musl-1.2.3-r4
            const lastDash = trimmed.lastIndexOf("-");
            const secondDash = trimmed.lastIndexOf("-", lastDash - 1);
            const name = trimmed.substring(0, secondDash) || trimmed;
            const version = secondDash > -1 ? trimmed.substring(secondDash + 1) : "Unknown";
            return { applicationName: name, version, manufacturer: "Unknown" };
          }
        },
        {
          // Void Linux
          name: "xbps",
          check: () => fs.existsSync("/usr/bin/xbps-query"),
          cmd: "xbps-query -l",
          parse: (line) => {
            // Output: ii name-version_revision Description
            const parts = line.trim().split(/\s+/);
            if (parts.length < 2 || parts[0] !== "ii") return null;
            const pkgFull = parts[1];
            const sepIdx = pkgFull.lastIndexOf("-");
            const name = pkgFull.substring(0, sepIdx) || pkgFull;
            const version = pkgFull.substring(sepIdx + 1);
            return { applicationName: name, version, manufacturer: "Unknown" };
          }
        },
      ];

      // Run the first available package manager
      const pm = packageManagers.find((p) => p.check());
      if (pm) {
        try {
          const raw = execSync(pm.cmd, { encoding: "utf8", timeout: 30_000 });
          raw.split("\n").forEach((line) => {
            const parsed = pm.parse(line);
            if (parsed?.applicationName) {
              installedSoftware.push({
                softwareLocation: "N/A",
                installDate: "Unknown",
                expiryDate: "N/A",
                softwareType: detectSoftwareType(parsed.applicationName, parsed.manufacturer),
                licenseType: detectLicenseType(parsed.applicationName, ""),
                ...parsed
              });
            }
          });
        } catch (err) {
          writeLog("ERROR", `${pm.name} query failed`, { error: err?.message });
        }
      } else {
        writeLog("WARN", "No known package manager found on this Linux system");
      }

      // ── Supplementary: Flatpak (cross-distro) ───────────────────────────
      if (fs.existsSync("/usr/bin/flatpak")) {
        try {
          const raw = execSync("flatpak list --app --columns=name,version,origin", { encoding: "utf8", timeout: 10_000 });
          raw.split("\n").forEach((line) => {
            const [name, version, origin] = line.trim().split("\t");
            if (name) {
              installedSoftware.push({
                applicationName: name,
                version: version || "Unknown",
                softwareLocation: "Flatpak",
                softwareType: detectSoftwareType(name, ""),
                manufacturer: origin || "Unknown",
                installDate: "Unknown",
                expiryDate: "N/A",
                licenseType: detectLicenseType(name, "")
              });
            }
          });
        } catch { /* Flatpak installed but no apps, or not configured */ }
      }

      // ── Supplementary: Snap (Ubuntu / derivatives) ───────────────────────
      if (fs.existsSync("/usr/bin/snap")) {
        try {
          const raw = execSync("snap list --color=never", { encoding: "utf8", timeout: 10_000 });
          raw.split("\n").slice(1).forEach((line) => { // skip header row
            const parts = line.trim().split(/\s+/);
            const [name, version, , , publisher] = parts;
            if (name) {
              installedSoftware.push({
                applicationName: name,
                version: version || "Unknown",
                softwareLocation: "Snap",
                softwareType: detectSoftwareType(name, ""),
                manufacturer: publisher || "Unknown",
                installDate: "Unknown",
                expiryDate: "N/A",
                licenseType: detectLicenseType(name, "")
              });
            }
          });
        } catch { /* Snap not configured or no snaps installed */ }
      }
    }
  } catch (err) {
    writeLog("ERROR", "Installed software discovery failed", { error: err?.message || err });
  }
  return installedSoftware;
};


function detectSoftwareType(name = "", manufacturer = "") {
  const n = name.toLowerCase();
  const m = manufacturer.toLowerCase();

  if (n.includes("driver") || n.includes("runtime") || n.includes("update")) return "System";
  if (n.includes("sql") || n.includes("mongodb") || n.includes("oracle")) return "Database";
  if (n.includes("adobe") || n.includes("office") || n.includes("visual studio")) return "Application";
  if (n.includes("git") || n.includes("node.js") || n.includes("python")) return "Developer Tool";
  if (n.includes("vlc") || n.includes("media") || n.includes("video")) return "Multimedia";
  if (n.includes("7-zip") || n.includes("notepad") || n.includes("utility")) return "Utility";

  return "Application";
}



function formatInstallDate(installDate) {
  if (!installDate || installDate.length !== 8) return "Unknown";

  const year = installDate.substring(0, 4);
  const month = installDate.substring(4, 6);
  const day = installDate.substring(6, 8);

  return `${year}-${month}-${day}`;  // Output: YYYY-MM-DD
}

function getWindowsExpiry(softwareName) {
  try {
    if (softwareName.includes("Microsoft Office")) {
      const output = execSync(
        `cscript "C:\\Program Files\\Microsoft Office\\Office16\\OSPP.VBS" /dstatus`,
        { encoding: "utf-8" }
      );
      const match = output.match(/Expiration\sDate:\s(.+)/);
      return match ? match[1].trim() : "Unknown";
    }
    else if (softwareName.includes("Adobe")) {
      // You must ensure 'adobe' CLI tool is installed and accessible
      try {
        const output = execSync(`adobe --check-license`, { encoding: "utf-8" });
        const dateMatch = output.match(/\b\d{4}-\d{2}-\d{2}\b/); // e.g. 2025-12-31
        return dateMatch ? dateMatch[0] : "Unknown";
      } catch {
        return "Unknown";
      }
    }
    else if (
      softwareName.toLowerCase().includes("antivirus") ||
      softwareName.toLowerCase().includes("mcafee") ||
      softwareName.toLowerCase().includes("kaspersky")
    ) {
      return "Unknown";
    }

    return "Unknown";
  } catch {
    return "Unknown";
  }
}



function detectLicenseType(name = "", publisher = "") {
  const n = name.toLowerCase();
  const p = publisher.toLowerCase();

  const freeNames = [
    "vscode", "visual studio code", "python", "firefox", "7-zip", "notepad++", "vlc",
    "gimp", "blender", "inkscape", "audacity", "putty", "winscp", "node.js", "git"
  ];
  const freePublishers = [
    "python software foundation", "mozilla", "videolan", "gnu", "free software",
    "open source", "apache", "openai", "fsf"
  ];

  if (freeNames.some(term => n.includes(term)) || freePublishers.some(term => p.includes(term))) {
    return "Free";
  }

  if (n.includes("trial") || n.includes("evaluation") || n.includes("demo")) return "Trial";

  if (p.includes("microsoft")) {
    if (n.includes("sql server") || n.includes("office")) return "Licensed";
    if (n.includes("visual studio")) return n.includes("community") ? "Free" : "Licensed";
  }

  if (p.includes("adobe")) return "Licensed";

  if (n.includes("mcafee") || n.includes("kaspersky") || n.includes("norton") || p.includes("symantec")) {
    return "Licensed";
  }

  return "Unknown";
}