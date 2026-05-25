import fs from "fs";
import { execSync } from "child_process";

const readFile = (path) => {
  try {
    return fs.readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
};

const runCmd = (cmd) => {
  try {
    return execSync(cmd, { stdio: "pipe" }).toString().trim();
  } catch {
    return "";
  }
};

const detectVM = () => {
  // 1. systemd (most reliable)
  const virt = runCmd("systemd-detect-virt");
  if (virt && virt !== "none") return true;

  // 2. DMI hints
  const vendor = readFile("/sys/class/dmi/id/sys_vendor").toLowerCase();
  const product = readFile("/sys/class/dmi/id/product_name").toLowerCase();

  if (/vmware|kvm|virtualbox|qemu|hyper-v|xen/.test(vendor + product)) {
    return true;
  }

  return false;
};


const detectContainer = () => {
  return (
    fs.existsSync("/.dockerenv") ||
    fs.existsSync("/run/systemd/container")
  );
};

export const getLinuxDeviceType = () => {
  try {
    const chassis = parseInt(readFile("/sys/class/dmi/id/chassis_type"));

    const product = readFile("/sys/class/dmi/id/product_name").toLowerCase();

    const isVM = detectVM();
    const isContainer = detectContainer();

    // --- Containers ---
    if (isContainer) return "container";

    // --- Servers (very important in enterprise/cloud) ---
    if (isVM) return "servers";

    if (chassis === 23) return "servers";

    // --- Laptop ---
    if ([8, 9, 10, 14, 31, 32].includes(chassis)) {
      return "laptop";
    }

    // --- Desktop ---
    if ([3, 4, 5, 6, 7, 13].includes(chassis)) {
      return "desktop";
    }

    // --- Tablet ---
    if (chassis === 30) return "tablet";

    // --- Fallback using product name ---
    if (product.includes("laptop") || product.includes("notebook")) {
      return "laptop";
    }

    if (product.includes("desktop") || product.includes("workstation")) {
      return "desktop";
    }

    if (product.includes("server")) {
      return "servers";
    }

    // --- CPU fallback (last resort) ---
    const cpuInfo = readFile("/proc/cpuinfo").toLowerCase();

    if (cpuInfo.includes("raspberry")) return "desktop";// embedded

    // --- Final fallback ---
    return "laptop";

  } catch {
    return "laptop";
  }
};
