// src/services/serviceInstaller.js
import { Service } from "node-windows";
import path from "path";
import { fileURLToPath } from "url";
import { writeLog } from "./logService.js";

// javascript-obfuscator:disable
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// javascript-obfuscator:enable

// Path to the main entry that the service will run (dev = src/main.js ; packaged = main exe)
/** If you use packaged exe update logic to point to your exe path. For dev, we point to src/main.js */
const scriptPath = path.resolve(__dirname, "..", "main.js");


const svc = new Service({
  id: "CybrxAgent",
  name: "CybrxAgent",
  displayName: "CybrxAgent",
  description: "Background agent for CybrxAgent",
  script: scriptPath,
  wait: 1,
  grow: 0.25,
  maxRestarts: 3,
  startType: "auto",
  nodeOptions: ["--harmony", "--max_old_space_size=4096"],
  logmode: "rotate",
});

svc.on("install", () => {
  writeLog("INFO", "CybrxAgent service installed");
  svc.start();
});

svc.on("alreadyinstalled", () => {
  writeLog("WARN", "CybrxAgent service already installed");
});

svc.on("start", () => {
  writeLog("INFO", "CybrxAgent service started successfully");
});

svc.on("uninstall", () => {
  writeLog("INFO", "CybrxAgent service uninstalled");
  writeLog("INFO", "Service exists after uninstall", { exists: svc.exists });
});

svc.on("error", (err) => { 
  writeLog("ERROR", "Service error occurred", {
    error: err?.message || err,
  });
});

// CLI usage: node serviceInstaller.js install | uninstall
const arg = process.argv[2];
if (arg === "install") {
   writeLog("INFO", "Installing CybrxAgent Windows service");
  svc.install();
} else if (arg === "uninstall") {
  writeLog("INFO", "Uninstalling CybrxAgent Windows service");
  svc.uninstall();
} else {
  // no-op when required as module
}
