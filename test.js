async function _uninstallLinux() {
  const SERVICE_NAME = "cybrxagent";
  const PKG_NAME = "CybrxAgent";
  const VAR_DIR = `/var/lib/${SERVICE_NAME}`;   // production install data dir
  const CONFIG_DIR = _getConfigDir();              // ~/.cybrxagent (user/legacy installs)

  // --- STEP 1: Read install_info (check both production and legacy paths) ---
  const installInfoPath = path.join(CONFIG_DIR, "install_info.conf");
  const installInfo = safeReadJson(installInfoPath)
    || safeReadJson(path.join(VAR_DIR, ".cybrxagent", "install_info.conf"));
  const installDir = installInfo?.installDir || "/opt/CybrxAgent";
  logUninstallStep(`Install dir: ${installDir}`);
  console.log(`Install dir: ${installDir}`)

  // --- STEP 2: Remove from package manager DB ---
  logUninstallStep("Removing package from package manager database...");
  console.log("Removing package from package manager database...");
  try {
    execSync(`dnf list installed ${PKG_NAME} &>/dev/null 2>&1 && dnf remove -y ${PKG_NAME}`,
      { stdio: "ignore", shell: "/bin/bash" });
    logUninstallStep("Package removed via dnf.");
    console.log("Package removed via dnf.");
  } catch {
    try {
      execSync(`rpm -q ${PKG_NAME} &>/dev/null 2>&1 && rpm -e ${PKG_NAME}`,
        { stdio: "ignore", shell: "/bin/bash" });
      logUninstallStep("Package removed via rpm.");
      console.log("Package removed via rpm.::COMMAND:> ", `rpm -q ${PKG_NAME} &>/dev/null 2>&1 && rpm -e ${PKG_NAME}`);
    } catch {
      logUninstallStep("Package not in RPM DB — skipping.");
      console.log("Package not in RPM DB — skipping.");
    }
    try {
      const debPkg = PKG_NAME.toLowerCase();
      execSync(`dpkg -l ${debPkg} 2>/dev/null | grep -q "^ii" && dpkg -r ${debPkg}`,
        { stdio: "ignore", shell: "/bin/bash" });
      logUninstallStep("Package removed via dpkg.");
      console.log("Package removed via dpkg::COMMAND::>", `dpkg -l ${debPkg} 2>/dev/null | grep -q "^ii" && dpkg -r ${debPkg}`);
    } catch {
      logUninstallStep("Package not in DEB DB — skipping.");
      console.log("Package not in DEB DB — skipping");
    }
  }

  // --- STEP 3: Stop, disable, and fully purge the systemd unit ---
  // systemctl reset-failed is the KEY step — without it systemd keeps the unit
  // in its runtime memory and 'systemctl status' still shows it as inactive/failed.
  logUninstallStep("Stopping and purging systemd service...");
  console.log("Stopping and purging systemd service...");

  try {
    execSync(`systemctl stop ${SERVICE_NAME}`, { stdio: "ignore" });
    execSync(`systemctl disable ${SERVICE_NAME}`, { stdio: "ignore" });
    fs.rmSync(`/etc/systemd/system/${SERVICE_NAME}.service`, { force: true });
    execSync("systemctl daemon-reload", { stdio: "ignore" });
    execSync(`systemctl reset-failed ${SERVICE_NAME}`, { stdio: "ignore" });
    logUninstallStep("System-level systemd unit fully purged.");
    console.log("System-level systemd unit fully purged.  COMMANDS::")
    console.log("CMD1: ", `systemctl stop ${SERVICE_NAME}`)
    console.log("CMD2: ", `systemctl disable ${SERVICE_NAME}`)
    console.log("CMD3: ", `fs.rmSync("/etc/systemd/system/${SERVICE_NAME}.service"`)
    console.log("CMD4: ", `systemctl daemon-reload`)
    console.log("CMD5: ", `systemctl reset-failed ${SERVICE_NAME}`)

  } catch (e) {
    logUninstallStep("System service removal skipped (may be user-level):", e.message);
    console.log("System service removal skipped (may be user-level):", e.message);
  }

  const userServiceFile = path.join(os.homedir(), ".config", "systemd", "user", `${SERVICE_NAME}.service`);
  try {
    execSync(`systemctl --user stop    ${SERVICE_NAME}`, { stdio: "ignore" });
    execSync(`systemctl --user disable ${SERVICE_NAME}`, { stdio: "ignore" });
    if (fs.existsSync(userServiceFile)) fs.rmSync(userServiceFile, { force: true });
    execSync("systemctl --user daemon-reload", { stdio: "ignore" });
    execSync(`systemctl --user reset-failed ${SERVICE_NAME}`, { stdio: "ignore" });
    logUninstallStep("User-level systemd unit fully purged.");
    console.log("User-level systemd unit fully purged.  COMMANDS::")
    console.log("User-levelCMD1: ", `systemctl --user stop ${SERVICE_NAME}`)
    console.log("User-levelCMD2: ", `systemctl --user disable ${SERVICE_NAME}`)
    console.log("User-levelCMD3: ", `fs.rmSync("/home/nonroot/.config/systemd/user/${SERVICE_NAME}.service")`)
    console.log("User-levelCMD4: ", `systemctl --user daemon-reload`)
    console.log("User-levelCMD5: ", `systemctl --user reset-failed ${SERVICE_NAME}`)
  } catch (e) {
    logUninstallStep("User service removal skipped:", e.message);
    console.log("User service removal skipped:", e.message);
  }

  // --- STEP 4: Remove application files ---
  logUninstallStep(`Removing application directory: ${installDir}`);
  console.log(`Removing application directory: ${installDir}`);
  try {
    if (fs.existsSync(installDir)) {
      fs.rmSync(installDir, { recursive: true, force: true });
      logUninstallStep("Application directory removed.");
      console.log("Application directory removed. installDir::>", installDir)
    } else {
      logUninstallStep("Application directory not found — skipping.");
      console.log("Application directory not found — skipping. installDir::>", installDir)
    }
  } catch (e) {
    logUninstallStep("Failed to remove application directory:", e.message);
    console.log("Failed to remove application directory:", e.message);
  }

  // --- STEP 5: Remove ALL data and config directories ---
  // Agent runs as root — plain rm -rf works, no sudo needed.
  const UDEV_RULE = "/etc/udev/rules.d/99-cybrxagent-dmi.rules";

  // VAR_DIR: entire production data dir (logs, license, electron-store)
  try {
    execSync(`rm -rf ${VAR_DIR}`, { stdio: "pipe", shell: "/bin/bash" });
    logUninstallStep(`Removed: ${VAR_DIR}`);
    console.log(`Removed VAR_DIR: ${VAR_DIR}`);
  } catch (e) {
    const stderr = e.stderr?.toString().trim() || e.message;
    logUninstallStep(`Could not remove ${VAR_DIR}: ${stderr}`);
    console.log(`Could not remove ${VAR_DIR}: ${stderr}`);
  }

  // Legacy user-space dir (~/.cybrxagent)
  if (CONFIG_DIR) {
    try {
      execSync(`rm -rf "${CONFIG_DIR}"`, { stdio: "pipe", shell: "/bin/bash" });
      logUninstallStep(`Removed: ${CONFIG_DIR}`);
      console.log(`Removed CONFIG_DIR : ${CONFIG_DIR}`);
    } catch (e) {
      logUninstallStep(`Could not remove ${CONFIG_DIR}: ${e.message}`);
      console.log(`Could not remove ${CONFIG_DIR}: ${e.message}`);
    }
  }

  // udev rule — backward compat with old installs that wrote it
  try {
    execSync(
      `rm -f ${UDEV_RULE} && udevadm control --reload-rules 2>/dev/null || true`,
      { stdio: "ignore", shell: "/bin/bash" }
    );
    logUninstallStep(`Removed udev rule: ${UDEV_RULE}`);
    console.log(`Removed udev rule UDEV_RULE: ${UDEV_RULE}`);
  } catch (e) {
    logUninstallStep(`udev rule removal skipped: ${e.message}`);
    console.log(`udev rule removal skipped :${e.message}`);
  }

  logUninstallStep("Linux uninstall complete.");
  console.log("Linux uninstall complete.");
  return true;
}
