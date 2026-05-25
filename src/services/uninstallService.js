// -------------------- UNINSTALL LOGIC --------------------
import { execFileSync, execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { clearAllStores } from "./storageService.js";
import { clearAgentState } from "./versionService.js";


// ──────────────────────────────────────────────────────────
// Shared logger (writes to a platform-appropriate location)
// ──────────────────────────────────────────────────────────
function getLogFile() {
  const platform = os.platform();
  if (platform === "win32") {
    const dir = path.join(process.env.PROGRAMDATA || "C:\\ProgramData", "CybrxAgent");
    if (!fs.existsSync(dir)) { try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { } }
    return path.join(dir, "uninstall.log");
  }
  // Linux / macOS — write next to config dir
  const dir = _getConfigDir();
  if (!fs.existsSync(dir)) { try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { } }
  return path.join(dir, "uninstall.log");
}

function logUninstallStep(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(String).join(" ")}\n`;
  try { fs.appendFileSync(getLogFile(), line); } catch (e) { }
  console.log(line.trim());
}

// ──────────────────────────────────────────────────────────
// Cross-platform helpers
// ──────────────────────────────────────────────────────────

/** Returns the per-user config directory for CybrxAgent on the current OS */
function _getConfigDir() {
  const platform = os.platform();
  if (platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "CybrxAgent");
  }
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "CybrxAgent");
  }
  // linux
  return path.join(os.homedir(), ".cybrxagent");
}

/** Safely parse a JSON file; returns null on any error */
function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    let content = fs.readFileSync(filePath, "utf-8").trim();
    // Fix stray single backslashes in Windows paths
    content = content.replace(/\\(?!["\\\/bfnrtu])/g, "\\\\");
    return JSON.parse(content);
  } catch (err) {
    logUninstallStep(`⚠️ JSON read error from ${filePath}:`, err.message);
    return null;
  }
}

// ──────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────

export async function uninstallAgent() {
  const platform = os.platform();
  logUninstallStep(`🧹 Starting CybrxAgent uninstall on platform: ${platform}`);

  // ── Clear runtime state FIRST (before any file removal) ──────────────────
  // clearAllStores()  → wipes electron-store (assetId, schedule, companyToken,
  //                     firstInstallCompleted) so a reinstall is a clean slate.
  // clearAgentState() → removes agent_state.json so the next install is treated
  //                     as a first install and registerAgentBasicInfo() is called.
  logUninstallStep("Clearing electron stores and agent state...");
  clearAllStores();
  clearAgentState();

  if (platform === "win32") {
    return await _uninstallWindows();
  } else if (platform === "linux") {
    return await _uninstallLinux();
  } else if (platform === "darwin") {
    return await _uninstallMac();
  } else {
    throw new Error(`Unsupported platform for uninstall: ${platform}`);
  }
}


// ──────────────────────────────────────────────────────────
// Windows uninstall (original logic — unchanged)
// ──────────────────────────────────────────────────────────
async function _uninstallWindows() {
  // --- STEP 1: Remove Windows Service ---
  try {
    logUninstallStep("🛠 Stopping Windows service (CybrxAgent)...");
    let retries = 3;
    while (retries > 0) {
      try {
        execSync("sc stop CybrxAgent", { stdio: "ignore" });
        logUninstallStep("✅ Service stopped.");
        break;
      } catch (e) {
        logUninstallStep("ℹ️ Service stop failed, retrying...");
        retries--;
        if (retries === 0) {
          logUninstallStep("❌ Service stop failed after 3 retries.");
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  } catch (e) {
    logUninstallStep("ℹ️ Service stop skipped:", e.message);
  }

  try {
    execSync("sc delete CybrxAgent", { stdio: "ignore" });
    logUninstallStep("✅ Windows service deleted.");
  } catch (e) {
    logUninstallStep("ℹ️ Service delete skipped:", e.message);
  }

  // --- STEP 2: Locate installer info ---
  const CONFIG_DIR = _getConfigDir();
  const CONFIG_PATH = path.join(CONFIG_DIR, "install_info.conf");

  let installDir = "";
  const installInfo = safeReadJson(CONFIG_PATH);
  if (installInfo && installInfo.installDir) {
    installDir = installInfo.installDir.replace(/\\\\/g, "\\");
    logUninstallStep(`📁 Found install_info.conf, installDir = ${installDir}`);
  } else {
    logUninstallStep("⚠️ install_info.conf not found or invalid.");
  }

  // --- STEP 3: Try uninstaller exe ---
  const guesses = [
    installDir && path.join(installDir, "Uninstall CybrxAgent.exe"),
    path.join("C:", "Program Files", "CybrxAgent", "Uninstall CybrxAgent.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "CybrxAgent", "Uninstall CybrxAgent.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "CybrxAgent", "Uninstall CybrxAgent.exe"),
  ].filter(Boolean);

  const uninstaller = guesses.find((p) => fs.existsSync(p));

  if (uninstaller) {
    logUninstallStep("🧩 Found uninstaller:", uninstaller);
    try {
      execFileSync(uninstaller, ["/S"], { stdio: "ignore", windowsHide: true });
      logUninstallStep("✅ Uninstalled via uninstaller exe (silent).");

      try {
        execSync(`reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\CybrxAgent" /f`, { stdio: "ignore" });
      } catch { }
      try {
        execSync(`reg delete "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\CybrxAgent" /f`, { stdio: "ignore" });
      } catch { }
      logUninstallStep("✅ Registry uninstall entry removed.");

      try {
        fs.rmSync(CONFIG_DIR, { recursive: true, force: true });
        logUninstallStep("🧹 Cleaned up %APPDATA%\\CybrxAgent folder.");
      } catch (e) {
        logUninstallStep("⚠️ Failed to clean %APPDATA%\\CybrxAgent folder:", e.message);
      }

      return true;
    } catch (err) {
      logUninstallStep("❌ Uninstaller exe failed:", err?.message || err);
    }
  } else {
    logUninstallStep("⚠️ No uninstaller exe found.");
  }

  // --- STEP 4: Registry-based fallback ---
  try {
    logUninstallStep("🔎 Attempting registry-based fallback uninstall...");
    let uninstallCmd = null;

    try {
      const regQuery = execSync(
        `reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\CybrxAgent" /v UninstallString`,
        { encoding: "utf8" }
      );
      const match = regQuery.match(/UninstallString\s+REG_SZ\s+(.+)/);
      if (match) uninstallCmd = match[1].trim();
    } catch { }

    // Try HKCU (fallback)
    if (!uninstallCmd) {
      try {
        const regQuery = execSync(
          `reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\CybrxAgent" /v UninstallString`,
          { encoding: "utf8" }
        );
        const match = regQuery.match(/UninstallString\s+REG_SZ\s+(.+)/);
        if (match) uninstallCmd = match[1].trim();
      } catch { }
    }

    if (uninstallCmd) {
      if (!uninstallCmd.includes("/S")) uninstallCmd += " /S";
      execSync(uninstallCmd, { stdio: "ignore", windowsHide: true });

      try { execSync(`reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\CybrxAgent" /f`, { stdio: "ignore" }); } catch { }
      try { execSync(`reg delete "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\CybrxAgent" /f`, { stdio: "ignore" }); } catch { }

      logUninstallStep("✅ Registry cleaned after fallback uninstall.");
      return true;
    }
  } catch (fallbackErr) {
    logUninstallStep("⚠️ Registry fallback failed:", fallbackErr?.message || fallbackErr);
  }

  // --- STEP 5: PowerShell fallback ---
  try {
    logUninstallStep("Attempting PowerShell fallback uninstall...");
    const ps = `Get-WmiObject -Class Win32_Product | Where-Object { $_.Name -like 'CybrxAgent*' } | ForEach-Object { $_.Uninstall() }`;
    execSync(`powershell -NoProfile -NonInteractive -Command "${ps}"`, { stdio: "ignore", windowsHide: true });
    logUninstallStep("✅ PowerShell uninstall attempted.");

    try { execSync(`reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\CybrxAgent" /f`, { stdio: "ignore" }); } catch { }
    try { execSync(`reg delete "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\CybrxAgent" /f`, { stdio: "ignore" }); } catch { }
    logUninstallStep("✅ Registry uninstall entry removed (fallback).");

    return true;
  } catch (psErr) {
    logUninstallStep("⚠️ PowerShell fallback failed:", psErr?.message || psErr);
  }

  logUninstallStep("❌ All Windows uninstall attempts failed.");
  throw new Error("Uninstall failed");
}

// ──────────────────────────────────────────────────────────
// Linux uninstall
// ──────────────────────────────────────────────────────────
async function _uninstallLinux() {
  logUninstallStep("Triggering background uninstall...");

  const SERVICE_NAME = "cybrxagent";
  const VAR_DIR = `/var/lib/${SERVICE_NAME}`;
  const CONFIG_DIR = _getConfigDir();

  const installInfoPath = path.join(CONFIG_DIR, "install_info.conf");
  const installInfo = safeReadJson(installInfoPath)
    || safeReadJson(path.join(VAR_DIR, ".cybrxagent", "install_info.conf"));
  const installDir = installInfo?.installDir || "/opt/CybrxAgent";
  logUninstallStep(`Using installDir: ${installDir}`);
  console.log(`Using installDir: ${installDir}`);

  // Since the Node.js process IS the CybrxAgent service, running `systemctl stop`
  // or `dnf remove` synchronously will kill the process mid-execution. 
  // We write a wrapper script to /tmp and spawn it completely detached so it 
  // can outlive the Node.js process and cleanly uninstall the agent.
  const tmpScript = "/tmp/cybrxagent_uninstall_trigger.sh";

  const scriptContent = `#!/bin/bash
# Wait for the API to return a 200 OK response to the frontend
sleep 2

# Redirect all output to the log file and enable bash debugging (set -x)
exec >/var/log/cybrxagent_uninstall.log 2>&1
set -x
echo "[$(date)] Starting background uninstall..."

# Try the official DEB script first if dpkg knows about cybrxagent
if command -v dpkg >/dev/null && dpkg -l cybrxagent 2>/dev/null | grep -q "^ii"; then
  echo "Using official DEB uninstaller..."
  "${installDir}/resources/linux/deb/uninstall.sh"
  
# Try the official RPM script if rpm knows about CybrxAgent
elif command -v rpm >/dev/null && rpm -q CybrxAgent >/dev/null 2>&1; then
  echo "Using official RPM uninstaller..."
  "${installDir}/resources/linux/rpm/uninstall.sh"
  
# Fallback manual purge if not found in any package manager
else
  echo "Using fallback emergency purge..."
  systemctl stop cybrxagent || true
  systemctl disable cybrxagent || true
  rm -f /etc/systemd/system/cybrxagent.service
  systemctl daemon-reload || true
  systemctl reset-failed cybrxagent || true
  
  if command -v rpm >/dev/null; then
    rpm -e CybrxAgent 2>/dev/null || true
  elif command -v dpkg >/dev/null; then
    dpkg -r cybrxagent 2>/dev/null || true
  fi
  
  rm -rf "${installDir}"
  rm -rf /var/lib/cybrxagent
  rm -rf /root/.cybrxagent
  rm -f /etc/udev/rules.d/99-cybrxagent-dmi.rules
  udevadm control --reload-rules || true
fi

# Clean up self
rm -f "${tmpScript}"
echo "[$(date)] Uninstall complete."
`;

  try {
    fs.writeFileSync(tmpScript, scriptContent, { mode: 0o755 });
    logUninstallStep(`Written detached background uninstaller to ${tmpScript}`);
  } catch (err) {
    logUninstallStep(`❌ Failed to write wrapper script: ${err.message}`);
    throw err;
  }

  try {
    // Spawn detached and unref so Node.js doesn't wait for it
    const { spawn } = await import("child_process");
    let child;
    try {
      // Escape the systemd cgroup! 
      // If we don't do this, systemd kills the background script mid-execution 
      // the moment the script runs `systemctl stop cybrxagent`.
      execSync("command -v systemd-run", { stdio: "ignore" });
      child = spawn("systemd-run", [
        "--unit=cybrxagent-uninstaller",
        "--description=CybrxAgent Uninstaller",
        "/bin/bash", tmpScript
      ], { detached: true, stdio: "ignore" });
      logUninstallStep("✅ Spawned background uninstaller via systemd-run.");
    } catch {
      // Fallback if systemd-run is somehow missing
      child = spawn(tmpScript, [], { detached: true, stdio: "ignore" });
      logUninstallStep("✅ Spawned background uninstaller via standard fork.");
    }
    child.unref();
  } catch (err) {
    logUninstallStep(`❌ Failed to spawn background process: ${err.message}`);
    throw err;
  }

  logUninstallStep("Linux uninstall initiated. Process will terminate shortly.");
  return true;
}



// ──────────────────────────────────────────────────────────
// macOS uninstall
// ──────────────────────────────────────────────────────────
async function _uninstallMac() {
  const PLIST = path.join(os.homedir(), "Library", "LaunchAgents", "com.cybrx.agent.plist");
  const CONFIG_DIR = _getConfigDir();  // ~/Library/Application Support/CybrxAgent
  const DEFAULT_APP_DIR = "/Applications/CybrxAgent.app";

  // Read install_info to find actual install dir
  const installInfoPath = path.join(CONFIG_DIR, "install_info.conf");
  const installInfo = safeReadJson(installInfoPath);
  const installDir = installInfo?.installDir || DEFAULT_APP_DIR;
  logUninstallStep(`📁 Install dir: ${installDir}`);

  // --- STEP 1: Stop and fully remove the LaunchAgent ---
  logUninstallStep("Stopping LaunchAgent...");

  const LABEL = "com.cybrx.agent";
  const UID = (() => { try { return execSync("id -u", { encoding: "utf8" }).trim(); } catch { return ""; } })();

  // Disable first — prevents launchd from auto-respawning after unload
  try {
    execSync(`launchctl disable "gui/${UID}/${LABEL}"`, { stdio: "ignore", shell: "/bin/bash" });
    logUninstallStep("LaunchAgent disabled.");
  } catch { /* macOS < 10.10 — ignore */ }

  // bootout (macOS 10.15+ / Catalina+) — cleanly removes from launchd's database
  let unloaded = false;
  try {
    execSync(`launchctl bootout "gui/${UID}/${LABEL}"`, { stdio: "ignore", shell: "/bin/bash" });
    logUninstallStep("LaunchAgent removed via bootout.");
    unloaded = true;
  } catch { /* not running or macOS < 10.15 */ }

  // unload fallback (macOS < 10.15 / if bootout fails)
  if (!unloaded) {
    try {
      execSync(`launchctl unload - w "${PLIST}"`, { stdio: "ignore" });
      logUninstallStep("LaunchAgent unloaded (legacy unload).");
    } catch (e) {
      logUninstallStep("LaunchAgent unload skipped:", e.message);
    }
  }

  // Remove the plist file
  try {
    fs.rmSync(PLIST, { force: true });
    logUninstallStep("Plist file removed.");
  } catch (e) {
    logUninstallStep("Plist removal failed:", e.message);
  }

  // --- STEP 2: Remove app bundle ---
  logUninstallStep(`🗑 Removing app bundle: ${installDir}`);
  try {
    if (fs.existsSync(installDir)) {
      fs.rmSync(installDir, { recursive: true, force: true });
      logUninstallStep("✅ App bundle removed.");
    } else {
      logUninstallStep("ℹ️ App bundle not found — skipping.");
    }
  } catch (e) {
    logUninstallStep("⚠️ Failed to remove app bundle:", e.message);
  }

  // --- STEP 3: Remove config/support directory ---
  logUninstallStep(`🗑 Removing support directory: ${CONFIG_DIR}`);
  try {
    if (fs.existsSync(CONFIG_DIR)) {
      fs.rmSync(CONFIG_DIR, { recursive: true, force: true });
      logUninstallStep("✅ Support directory removed.");
    } else {
      logUninstallStep("ℹ️ Support directory not found — skipping.");
    }
  } catch (e) {
    logUninstallStep("⚠️ Failed to remove support directory:", e.message);
  }

  logUninstallStep("✅ macOS uninstall complete.");
  return true;
}
