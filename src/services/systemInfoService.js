import os from "os";
import fs from "fs";
import { execSync, exec } from "child_process";
import formatBiosInstallDate from "../helperFunctions/formatBiosInstallDate.js";
import getDriveType from "../helperFunctions/getDriveType.js";
import { promisify } from "util";
import * as storageService from "./storageService.js";
import formatInstallDate from "../helperFunctions/formatInstallDate.js";
import { writeLog } from "./logService.js";
import {
  getWindowsExpiry,
  detectLicenseType,
  getMacSoftwareExpiry,
  getLinuxSoftwareExpiry,
  getMacInstallDate,
} from "../helperFunctions/getExpiry.js";
import { getInstalledSoftwareFromRegistry } from "../helperFunctions/getSoftwaresInfo.js";
import { getLinuxDeviceType } from "../utils/deviceTypeUtils.js";
import { getLinuxInstallDate } from "../utils/getOSInstallDateForLinux.js";
const execAsync = promisify(exec);
const platform = os.platform();

const chassisGroups = {
  desktop: [3, 4, 5, 6, 7, 15, 16],
  laptop: [8, 9, 10, 11, 12, 14, 18, 21, 31, 32],
  tablet: [30],
  server: [17, 23]
};

function safeParseJSON(output, fallback) {
  if (!output) return fallback;

  try {
    const cleaned = output
      .toString()
      .trim()
      .replace(/^\uFEFF/, ""); // remove BOM

    return JSON.parse(cleaned);
  } catch (err) {
    console.log("JSON parse error:", output); // debug
    writeLog("WARN", "JSON parse failed", { error: err.message });
    return fallback;
  }
}

export const getBiosInfo = async () => {
  try {
    if (platform === "win32") {
      // Windows: Get BIOS Manufacturer, Version, and Install Date
      const biosInfo = execSync(
        'powershell "Get-WmiObject -Class Win32_BIOS | Select-Object -Property Manufacturer, SMBIOSBIOSVersion, ReleaseDate"'
      )
        .toString()
        .trim();

      const lines = biosInfo
        .split("\n")
        .slice(1)
        .filter((line) => line.trim() !== "");

      if (lines.length === 0) throw new Error("No BIOS information retrieved.");

      const parts = lines[1].trim().split(/\s+/);
      const manufacturer = parts[0] || "N/A";
      const biosVersion = parts[parts.length - 2] || "N/A";
      const installDate =
        formatBiosInstallDate(parts[parts.length - 1]) || "N/A";

      return { manufacturer, biosVersion, installDate };
    } else if (platform === "darwin") {
      // macOS: Get BIOS Version and Manufacturer
      const manufacturer = "Apple";
      const biosVersion = execSync(
        "system_profiler SPHardwareDataType | awk '/Boot ROM Version:/ {print $4}'"
      )
        .toString()
        .trim();
      const installDate = "N/A"; // macOS doesn't expose BIOS install date

      return { manufacturer, biosVersion, installDate };
    } else if (platform === "linux") {
      // Linux: Get BIOS Manufacturer, Version, and Install Date
      const manufacturer = execSync(
        "cat /sys/class/dmi/id/bios_vendor 2>/dev/null || echo 'Unknown'"
      )
        .toString()
        .trim();
      const biosVersion = execSync(
        "cat /sys/class/dmi/id/bios_version 2>/dev/null || echo 'Unknown'"
      )
        .toString()
        .trim();
      const installDateRaw = execSync(
        "cat /sys/class/dmi/id/bios_date 2>/dev/null || echo 'Unknown'"
      )
        .toString()
        .trim();
      const installDate = formatBiosInstallDate(installDateRaw);

      return { manufacturer, biosVersion, installDate };
    }
    return { error: "Unsupported OS" };
  } catch (error) {
    writeLog("ERROR", "BIOS info collection failed", {
      error: error?.message || error
    });
    return { manufacturer: "N/A", biosVersion: "N/A", installDate: "N/A" };
  }
};

export const getDriveInfo = async () => {
  let drives = [];
  try {
    if (platform === "win32") {
      const command = `powershell -command "Get-WmiObject Win32_LogicalDisk | Select-Object DeviceID,VolumeName,Size,FreeSpace,DriveType,FileSystem,VolumeSerialNumber | ConvertTo-Json"`;
      const driveData = execSync(command, { encoding: "utf-8" });

      if (!driveData.trim()) throw new Error("No drive data found.");
      let driveInfo = JSON.parse(driveData);
      if (!Array.isArray(driveInfo)) driveInfo = [driveInfo];

      drives = await Promise.all(
        driveInfo.map(async (drive) => {
          return {
            driveName: drive.DeviceID || "Unknown",
            volumeName: drive.VolumeName || "No Label",
            driveCapacity: drive.Size
              ? `${(drive.Size / 1024 ** 3).toFixed(2)} GB`
              : "N/A",
            freeSpace: drive.FreeSpace
              ? `${(drive.FreeSpace / 1024 ** 3).toFixed(2)} GB`
              : "N/A",
            usedSpace:
              drive.Size && drive.FreeSpace
                ? `${((drive.Size - drive.FreeSpace) / 1024 ** 3).toFixed(
                  2
                )} GB`
                : "N/A",
            driveType: await getDriveType(drive.DriveType, platform),
            fileSystem: drive.FileSystem || "Unknown",
            serialNumber: drive.VolumeSerialNumber || "N/A",
          };
        })
      );
    } else if (platform === "darwin") {
      // ✅ Fix for macOS: Use diskutil list and parse correctly
      const command = `diskutil list | grep "APFS Volume\\|HFS+ Volume" | awk '{print $NF}'`;
      const diskList = execSync(command, { encoding: "utf-8" })
        .trim()
        .split("\n");

      if (!diskList.length || (diskList.length === 1 && diskList[0] === "")) {
        writeLog("WARN", "No mounted drives found");
        return [];
      }

      diskList.forEach((disk) => {
        try {
          const info = execSync(`diskutil info "${disk}"`, {
            encoding: "utf-8",
          }).split("\n");
          let drive = { driveName: disk };
          info.forEach((line) => {
            if (line.includes("Volume Name")) {
              drive.volumeName = line.split(":")[1]?.trim() || "No Label";
            } else if (line.includes("File System")) {
              drive.fileSystem = line.split(":")[1]?.trim() || "Unknown";
            } else if (line.includes("Container Total Space")) {
              const match = line.match(/([\d.]+) (GB|TB)/);
              if (match) {
                drive.driveCapacity = `${parseFloat(match[1]).toFixed(2)} ${match[2]
                  }`;
              }
            } else if (line.includes("Container Free Space")) {
              const match = line.match(/([\d.]+) (GB|TB)/);
              if (match) {
                drive.freeSpace = `${parseFloat(match[1]).toFixed(2)} ${match[2]
                  }`;
                drive.usedSpace = drive.driveCapacity
                  ? `${(
                    parseFloat(drive.driveCapacity) -
                    parseFloat(drive.freeSpace)
                  ).toFixed(2)} ${match[2]}`
                  : "N/A";
              }
            }
          });

          // ✅ Only add drives with a valid capacity
          if (drive.driveCapacity) drives.push(drive);
        } catch (err) {
          writeLog("ERROR", "Drive detail collection failed", {
            disk,
            error: err?.message || err
          });
        }
      });
    } else if (platform === "linux") {
      // Linux: Use lsblk and df to get drive details
      const command = `lsblk -J -o NAME,FSTYPE,SIZE,MOUNTPOINT`;
      const output = execSync(command, { encoding: "utf-8" });
      const diskData = JSON.parse(output);
      if (!diskData.blockdevices) return [];

      diskData.blockdevices.forEach((device) => {
        if (!device.mountpoint) return;

        let freeSpace = "N/A";
        try {
          // ✅ Get free space using `df`
          const dfOutput = execSync(`df -h | grep '${device.mountpoint}$'`, {
            encoding: "utf-8",
          }).split(/\s+/);
          freeSpace = dfOutput[3] || "N/A";
        } catch (err) { }

        drives.push({
          driveName: `/dev/${device.name}`,
          volumeName: device.mountpoint || "No Label",
          driveCapacity: device.size || "N/A",
          freeSpace: freeSpace,
          usedSpace: "N/A",
          fileSystem: device.fstype || "Unknown",
        });
      });
    }
  } catch (error) {
    writeLog("ERROR", "Drive info collection failed", {
      error: error?.message || error
    });
  }
  return drives;
};

export const getMacAddress = () => {
  try {
    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (!iface.internal && iface.mac && iface.mac !== "00:00:00:00:00:00") {
          return iface.mac;
        }
      }
    }

    return "N/A";
  } catch (error) {
    return "N/A";
  }
};

//optimized
export const getWindowsInfo = async () => {
  try {
    if (platform === "win32") {

      const command = `powershell -NoProfile -ExecutionPolicy Bypass -Command "$os=Get-CimInstance Win32_OperatingSystem;$prod=Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion';[PSCustomObject]@{ProductID=$prod.ProductId;BuildNumber=$os.BuildNumber;InstallDate=$os.InstallDate}|ConvertTo-Json"`;

      const { stdout } = await execAsync(command);

      const data = safeParseJSON(stdout, {});

      if (!data || Object.keys(data).length === 0) {
        return {
          productKey: "N/A",
          productID: "N/A",
          buildNumber: "N/A",
          installDate: "N/A",
        };
      }

      let installDate = "N/A";

      if (data.InstallDate) {
        const match = /Date\((\d+)\)/.exec(data.InstallDate);
        if (match) {
          installDate = new Date(parseInt(match[1])).toISOString().split("T")[0];
        }
      }
      return {
        productKey: "N/A",
        productID: data.ProductID || "N/A",
        buildNumber: data.BuildNumber || "N/A",
        installDate
      };
    } else if (platform === "darwin") {
      // macOS: Get Serial Number, Build Number, and Install Date
      const [productIDOut, buildNumberOut, installDateOut] = await Promise.all([
        execAsync("ioreg -l | grep IOPlatformSerialNumber"),
        execAsync("sw_vers -buildVersion"),
        execAsync("ls -lt /var/db/.AppleSetupDone | awk '{print $6, $7, $8}'"),
      ]);

      const productID = productIDOut.stdout.split('"')[3]?.trim() || "Unknown";
      const buildNumber = buildNumberOut.stdout.trim();
      const installDate = installDateOut.stdout.trim();

      return { productKey: "N/A", productID, buildNumber, installDate };
    } else if (platform === "linux") {
      // Linux: Get Serial Number, Kernel Version, and Install Date
      let productID = "Unknown";
      const buildNumber = execSync("uname -r").toString().trim() || "N/A";

      let installDate = "Unknown";
      try {
        installDate = await getLinuxInstallDate()
      } catch (err) { }

      return { productKey: "N/A", productID, buildNumber, installDate };
    }

    return { error: "Unsupported OS" };
  } catch (error) {
    writeLog("ERROR", "Windows system info collection failed", {
      error: error?.message || error
    });
    return { error: "Failed to retrieve system information" };
  }
};

//optimized
export const getCpuInfo = async () => {
  let cpuSpeedInGHz = "N/A";
  let logicalProcessors = os.cpus().length;
  let cpuCoresCount = Math.floor(logicalProcessors / 2); // Approximate physical cores
  let cpuStepping = "N/A";
  let cpuModel = os.cpus()[0].model || "Unknown";

  try {
    if (platform === "win32") {
      // Windows: Use PowerShell to get CPU details
      const command = `powershell -command "Get-WmiObject Win32_Processor | Select-Object MaxClockSpeed,NumberOfLogicalProcessors,Stepping,NumberOfCores | ConvertTo-Json"`;
      const { stdout: cpuData, stderr } = await execAsync(command, {
        encoding: "utf-8",
      });
      if (!cpuData.trim() || stderr) throw new Error("No CPU data found.");

      const data = JSON.parse(cpuData);
      const cpuInfo = Array.isArray(data) ? data[0] : data;
      cpuSpeedInGHz = cpuInfo.MaxClockSpeed
        ? `${(cpuInfo.MaxClockSpeed / 1000).toFixed(2)} GHz`
        : "N/A";
      logicalProcessors =
        cpuInfo.NumberOfLogicalProcessors || logicalProcessors;
      cpuCoresCount = cpuInfo.NumberOfCores || cpuCoresCount;
      cpuStepping = cpuInfo.Stepping || "N/A";
    } else if (platform === "darwin") {
      // macOS: Use system_profiler to get CPU details
      const command = `sysctl -n machdep.cpu.brand_string`;
      cpuModel = execSync(command, { encoding: "utf-8" }).trim();

      const speedMatch = cpuModel.match(/@ (\d+(\.\d+)?) GHz/);
      if (speedMatch) cpuSpeedInGHz = `${speedMatch[1]} GHz`;

      logicalProcessors = parseInt(
        execSync("sysctl -n hw.logicalcpu", { encoding: "utf-8" }).trim(),
        10
      );
      cpuCoresCount = parseInt(
        execSync("sysctl -n hw.physicalcpu", { encoding: "utf-8" }).trim(),
        10
      );
    } else if (platform === "linux") {
      // Linux: Use lscpu to get CPU details 
      const cpuInfoFallBack = execSync("lscpu", { encoding: "utf-8" }).split("\n");
      const cpuInfo = fs.readFileSync("/proc/cpuinfo", "utf-8").split("\n"); // /proc used by node as per official doc for os.cpus()

      cpuInfo.forEach((line) => {
        if (line.toLowerCase().startsWith("model name")) {
          if (cpuModel === "Unknown") cpuModel = line.split(":")[1].trim();
        } else if (line.toLowerCase().startsWith("cpu mhz")) {
          if (cpuSpeedInGHz === "N/A")
            cpuSpeedInGHz = `${(parseFloat(line.split(":")[1].trim()) / 1000).toFixed(2)} GHz`;
        } else if (line.toLowerCase().startsWith("processor")) {
          if (!logicalProcessors) logicalProcessors = 1;
        } else if (line.toLowerCase().startsWith("cpu cores")) {
          if (cpuCoresCount === 0) cpuCoresCount = parseInt(line.split(":")[1].trim(), 10);
        } else if (line.toLowerCase().startsWith("stepping")) {
          if (cpuStepping === "N/A") cpuStepping = line.split(":")[1].trim();
        }
      });

      if (!cpuSpeedInGHz || cpuSpeedInGHz === "N/A" || cpuSpeedInGHz === "0.00 GHz") {
        cpuInfoFallBack.forEach((line) => {
          if (line.toLowerCase().startsWith("cpu mhz")) {
            cpuSpeedInGHz = `${(parseFloat(line.split(":")[1].trim()) / 1000).toFixed(2)} GHz`;
          }
        });
      }
    }
  } catch (error) {
    writeLog("ERROR", "CPU info collection failed", {
      error: error?.message || error
    });
  }

  return {
    cpuModel,
    cpuSpeed: cpuSpeedInGHz,
    logicalProcessors,
    cpuStepping,
    cpuCoresCount,
  };
};

//optimized
export const getMonitorInfo = async () => {
  let monitorInfo = {
    caption: "Unknown",
    resolution: "Unknown",
    status: "Unknown",
  };

  try {
    if (platform === "win32") {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object Name,CurrentHorizontalResolution,CurrentVerticalResolution,Status | ConvertTo-Json"'
      );
      const data = safeParseJSON(stdout, {});
      if (!data) return monitorInfo;
      const monitor = Array.isArray(data)
        ? data.find(m => m.CurrentHorizontalResolution && m.CurrentVerticalResolution) || data[0]
        : data;

      const width = monitor.CurrentHorizontalResolution;
      const height = monitor.CurrentVerticalResolution;

      monitorInfo = {
        caption: monitor.Name || "Unknown",
        resolution: width && height ? `${width}x${height}` : "Unknown",
        status: monitor.Status || "Unknown",
      };
    } else if (platform === "darwin") {
      // macOS: Use system_profiler to get display information
      const output = execSync("system_profiler SPDisplaysDataType", {
        encoding: "utf-8",
      });
      const resolutionMatch = output.match(/Resolution:\s*(\d+)\sx\s*(\d+)/);

      if (resolutionMatch) {
        monitorInfo.resolution = `${resolutionMatch[1]}x${resolutionMatch[2]}`;
        monitorInfo.caption = "Mac Display";
        monitorInfo.status = "OK";
      }
    } else if (platform === "linux") {
      // Linux: Use xrandr to get display information
      const output = execSync("xrandr --current", { encoding: "utf-8" });
      const resolutionMatch = output.match(/(\d+)x(\d+)\s+\d+\.\d+\*/);

      if (resolutionMatch) {
        monitorInfo.resolution = `${resolutionMatch[1]}x${resolutionMatch[2]}`;
        monitorInfo.caption = "Linux Display";
        monitorInfo.status = "OK";
      }
    }
  } catch (err) {
    writeLog("ERROR", "Monitor info collection failed", {
      error: err?.message || err
    });
  }
  return monitorInfo;
};

// ----------------------------AS IT IS ----------------------------------------------
export const getKeyboardInfo = async () => {
  let keyboardInfo = {
    keyboardType: "Unknown",
    keyboardSerialNumber: "Unknown",
  };

  try {
    if (platform === "win32") {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "Get-PnpDevice -Class Keyboard | Select-Object FriendlyName,InstanceId | ConvertTo-Json"'
      );
      const data = safeParseJSON(stdout, {});
      if (!data) return keyboardInfo;

      const kb = Array.isArray(data)
        ? data.find(k => k.PNPDeviceID || k.DeviceID) || data[0]
        : data;

      keyboardInfo = {
        keyboardType: kb.FriendlyName || "Keyboard",
        keyboardSerialNumber: kb.InstanceId || "N/A"
      };
    } else if (platform === "darwin") {
      // macOS: Use ioreg to get keyboard details
      const output = execSync("ioreg -n AppleKeyboard -r -d 1")
        .toString()
        .trim();
      const description = output.includes("AppleKeyboard")
        ? "Apple Keyboard"
        : "External Keyboard";
      keyboardInfo.keyboardType = await getMacInstallDate();
      keyboardInfo.keyboardSerialNumber = "N/A"; // macOS does not expose serial numbers for keyboards.
    } else if (platform === "linux") {
      try {
        const lsusbOutput = execSync(
          "lsusb | grep -i keyboard || echo 'No USB Keyboard'",
          { encoding: "utf-8" }
        ).trim();
        keyboardInfo.keyboardType = lsusbOutput.includes("No USB Keyboard")
          ? "Built-in Keyboard"
          : lsusbOutput.split(":")[1]?.trim();
      } catch (err) {
        writeLog("ERROR", "Linux keyboard type detection failed", {
          error: err?.message || err
        });
      }

      // ✅ Linux: Get keyboard serial number safely
      try {
        const devicePath = execSync(
          "ls /dev/input/by-id | grep -i keyboard || echo 'No Device'",
          { encoding: "utf-8" }
        ).trim();
        if (!devicePath.includes("No Device")) {
          const serialOutput = execSync(
            `udevadm info --query=all --name=/dev/input/by-id/${devicePath} | grep ID_SERIAL || echo 'N/A'`,
            { encoding: "utf-8" }
          ).trim();
          keyboardInfo.keyboardSerialNumber = serialOutput.includes("=")
            ? serialOutput.split("=")[1]?.trim()
            : "N/A";
        }
      } catch (err) {
        writeLog("ERROR", "Linux keyboard serial detection failed", {
          error: err?.message || err
        });
      }
    }
  } catch (err) {
    writeLog("ERROR", "Keyboard info collection failed", {
      error: err?.message || err
    });
  }
  return keyboardInfo;
};

export const getRamProperties = async () => {
  let ramProperties = {
    totalMemory: "N/A",
    freeMemory: "N/A",
    usedMemory: "N/A",
    usagePercentage: "N/A",
    modules: []
  };

  const manufacturerMap = {
    "802C": "Micron",
    "80CE": "Samsung",
    "80AD": "Hynix",
    "859B": "Crucial",
    "04CB": "Adata",
    "98C0": "Kingston"
  };

  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const toGB = (bytes) => (bytes / 1024 ** 3).toFixed(2) + " GB";

    ramProperties.totalMemory = toGB(totalMem);
    ramProperties.freeMemory = toGB(freeMem);
    ramProperties.usedMemory = toGB(usedMem);
    ramProperties.usagePercentage =
      ((usedMem / totalMem) * 100).toFixed(2) + "%";

    // ✅ Windows (Detailed like keyboard/mouse)
    if (platform === "win32") {
      const { stdout } = await execAsync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity,Speed,Manufacturer,PartNumber | ConvertTo-Json"`
      );

      let data = safeParseJSON(stdout, []);
      if (!Array.isArray(data)) data = [data];

      ramProperties.modules = data.map((ram) => {
        const rawManufacturer = ram.Manufacturer?.trim() || "";

        // 🔥 Extract first 4 chars (vendor code)
        const manufacturerCode = rawManufacturer.substring(0, 4).toUpperCase();

        return {
          capacity: ram.Capacity
            ? `${(ram.Capacity / 1024 ** 3).toFixed(2)} GB`
            : "N/A",

          speed: ram.Speed ? `${ram.Speed} MHz` : "N/A",

          // ✅ FIXED MANUFACTURER
          manufacturer:
            manufacturerMap[manufacturerCode] || rawManufacturer || "Unknown",

          partNumber: ram.PartNumber?.trim() || "N/A"
        };
      });
    }

  } catch (error) {
    writeLog("ERROR", "RAM properties collection failed", {
      error: error?.message || error
    });
  }

  return ramProperties;
};

export const getMouseInfo = async () => {
  let mouseInfo = { mouseSerialNumber: "Unknown", numberOfButtons: "Unknown" };

  try {
    if (platform === "win32") {
      // Windows: Use PowerShell to get mouse details
      let { stdout: output } = await execAsync(
        'powershell "Get-WmiObject -Class Win32_PointingDevice | Select-Object -Property DeviceID, NumberOfButtons | ConvertTo-Csv -NoTypeInformation"'
      );
      output = output.toString().trim().split("\n").slice(1);

      if (output.length > 0) {
        const [deviceId, numberOfButtons] = output[0].split(",");
        mouseInfo.mouseSerialNumber = deviceId || "N/A";
        mouseInfo.numberOfButtons = numberOfButtons || "N/A";
      }
    } else if (platform === "darwin") {
      // macOS: Use IOKit to get mouse details
      const output = execSync("ioreg -c IOHIDDevice -r -l | grep -i Mouse")
        .toString()
        .trim();
      const isAppleMouse = output.includes("Apple")
        ? "Apple Mouse"
        : "External Mouse";
      mouseInfo.mouseSerialNumber = "N/A"; // macOS does not expose serial numbers for mice.
      mouseInfo.numberOfButtons = isAppleMouse;
    } else if (platform === "linux") {
      // Linux: Use lsusb to list connected pointing devices
      try {
        const lsusbOutput = execSync(
          "lsusb | grep -i mouse || echo 'No USB Mouse'",
          { encoding: "utf-8" }
        ).trim();
        if (lsusbOutput.includes("No USB Mouse")) {
          mouseInfo.deviceName = "Built-in Mouse/Touchpad";
        } else {
          mouseInfo.deviceName =
            lsusbOutput.split(":")[1]?.trim() || "Linux USB Mouse";
        }
      } catch (err) {
        writeLog("ERROR", "Linux mouse type detection failed", {
          error: err?.message || err
        });
      }

      // ✅ Linux: Get Number of Buttons Safely
      try {
        const buttonCount = execSync(
          "xinput --list --short | grep -i 'mouse' | awk '{print $5}' || echo 'Unknown'",
          { encoding: "utf-8" }
        ).trim();
        mouseInfo.numberOfButtons =
          buttonCount !== "Unknown"
            ? `${buttonCount} buttons`
            : "Standard Buttons";
      } catch (err) {
        writeLog("ERROR", "Linux mouse button detection failed", {
          error: err?.message || err
        });
        mouseInfo.numberOfButtons = "Standard Mouse";
      }

      mouseInfo.mouseSerialNumber = "N/A"; // Serial numbers are not easily accessible on Linux
    }
  } catch (err) {
    writeLog("ERROR", "Mouse info collection failed", {
      error: err?.message || err
    });
  }

  return mouseInfo;
};

export const getSystemDetails = async () => {
  // Get the hostname
  const hostname = os.hostname();
  const alias = await getDeviceAlias();
  // Get the IP address
  const networkInterfaces = os.networkInterfaces();
  const macAddress = getMacAddress();
  const ipAddress = Object.values(networkInterfaces)
    .flat()
    .filter((iface) => iface.family === "IPv4" && !iface.internal)
    .map((iface) => iface.address)
    .join(", ");

  // Get system model and make
  let systemModel = "N/A";
  let systemMake = "N/A";
  let systemSerialNumber = "N/A";

  try {
    if (platform === "win32") {
      const command = `powershell -NoProfile -Command "$cs=Get-CimInstance Win32_ComputerSystem;$bios=Get-CimInstance Win32_BIOS;$prod=Get-CimInstance Win32_ComputerSystemProduct;[PSCustomObject]@{Manufacturer=$cs.Manufacturer;Model=$cs.Model;SerialNumber=$bios.SerialNumber;UUID=$prod.UUID}|ConvertTo-Json"`;

      const { stdout } = await execAsync(command);
      const data = safeParseJSON(stdout, {});
      if (!data) return {
        hostname,
        alias,
        ipAddress,
        macAddress,
        systemMake: "N/A",
        systemModel: "N/A",
        serialNumber: "N/A",
      };

      systemMake = data.Manufacturer || "N/A";
      systemModel = data.Model || "N/A";
      systemSerialNumber = data.SerialNumber || data.UUID || "N/A";
    } else if (platform === "darwin") {
      // macOS: Get system make, model, and serial number
      systemMake = "Apple";
      systemModel = execSync("sysctl -n hw.model").toString().trim() || "N/A";
      systemSerialNumber =
        execSync("ioreg -l | grep IOPlatformSerialNumber")
          .toString()
          .split('"IOPlatformSerialNumber" = "')[1]
          ?.split('"')[0] || "N/A";
    } else if (platform === "linux") {
      // Linux: Get system make, model, and serial number
      const readFile = (filePath) => {
        try {
          return execSync(`cat ${filePath}`, { encoding: "utf-8" }).trim();
        } catch (err) {
          return "N/A";
        }
      };

      systemMake = readFile("/sys/class/dmi/id/sys_vendor");
      systemModel = readFile("/sys/class/dmi/id/product_name");
      systemSerialNumber = readFile("/sys/class/dmi/id/product_serial");
    }
  } catch (error) {
    writeLog("ERROR", "System details collection failed", {
      error: error?.message || error
    });
  }

  return {
    hostname,
    alias,
    ipAddress,
    macAddress,
    systemMake: systemMake || "N/A",
    systemModel: systemModel || "N/A",
    serialNumber: systemSerialNumber || "N/A",
  };
};

export const getDriverDetails = async () => {
  try {
    let driverDetails = []; // Declare it outside to be accessible for all platforms

    if (process.platform === "win32") {
      // Windows: Use PowerShell to get driver details
      const command = `powershell -Command "Get-WmiObject Win32_PnPSignedDriver | Select-Object DeviceName,Manufacturer,DriverVersion,DriverProviderName,InfName | ConvertTo-Json"`;
      const output = execSync(command, { encoding: "utf-8" }).trim();
      if (output) {
        const parsedJson = safeParseJSON(output, []);
        if (!Array.isArray(parsedJson)) return [];
        driverDetails = parsedJson.map((driver) => ({
          deviceName: driver.DeviceName || "Unknown",
          manufacturer: driver.Manufacturer || "Unknown",
          driverVersion: driver.DriverVersion || "Unknown",
          driverProviderName: driver.DriverProviderName || "Unknown",
          infName: driver.InfName || "Unknown",
        }));
      }
    } else if (process.platform === "darwin") {
      // macOS: Fetch driver details using system commands
      const kextOutput = execSync("kextstat | awk '{print $6, $7}'", {
        encoding: "utf-8",
      });

      driverDetails = kextOutput
        .split("\n")
        .slice(1)
        .filter((line) => line.trim() !== "")
        .map((line) => {
          const [bundleID, version] = line.split(" ");
          return {
            deviceName: bundleID || "N/A",
            manufacturer: "Apple or Third-Party",
            driverVersion: version || "N/A",
            driverProviderName: "N/A",
            infName: "N/A",
          };
        });
    } else if (process.platform === "linux") {
      // Linux: Use 'lspci' and 'modinfo' to fetch driver details
      const lspciOutput = execSync("lspci -vmm", { encoding: "utf-8" });

      let currentDevice = {};
      driverDetails = lspciOutput
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "")
        .reduce((acc, line) => {
          const [key, value] = line.split(":\t");
          if (key === "Slot") {
            if (Object.keys(currentDevice).length) acc.push(currentDevice);
            currentDevice = {
              deviceName: value,
              driverVersion: "N/A",
              manufacturer: "Unknown",
            };
          } else if (key === "Driver") {
            currentDevice.driverVersion = value || "N/A";
          } else if (key === "Vendor") {
            currentDevice.manufacturer = value || "Unknown";
          }
          return acc;
        }, []);

      // ✅ Fetch additional details using `modinfo`
      driverDetails.forEach((driver) => {
        if (driver.driverVersion !== "N/A") {
          try {
            const modinfoOutput = execSync(`modinfo ${driver.driverVersion}`, {
              encoding: "utf-8",
            });
            const versionMatch = modinfoOutput.match(/version:\s+(.+)/);
            driver.driverVersion = versionMatch ? versionMatch[1] : "N/A";
            driver.driverProviderName = "Linux Kernel";
            driver.infName = `/lib/modules/${os.release()}/kernel/drivers/`;
          } catch (error) {
            driver.driverVersion = "Unknown";
            driver.driverProviderName = "Unknown";
            driver.infName = "N/A";
          }
        }
      });
    } else {
      return { error: "Unsupported OS" };
    }

    return driverDetails;
  } catch (error) {
    writeLog("ERROR", "Driver details collection failed", {
      error: error?.message || error
    });
    return { error: error.message };
  }
};

export const getProcessorDetails = async () => {
  try {
    let processorDetails = {};

    if (process.platform === "win32") {
      const commands = [
        "(Get-CimInstance Win32_Processor).Name",
        "(Get-CimInstance Win32_Processor).Manufacturer",
        "(Get-CimInstance Win32_Processor).NumberOfCores",
        "(Get-CimInstance Win32_Processor).NumberOfLogicalProcessors",
        "(Get-CimInstance Win32_Processor).MaxClockSpeed",
        "(Get-CimInstance Win32_ComputerSystemProduct).UUID",
        "(Get-CimInstance Win32_BIOS).SerialNumber",
      ];

      const powershellCmd = (cmd) => `powershell -command "${cmd}"`;

      const [
        { stdout: name },
        { stdout: manufacturer },
        { stdout: cores },
        { stdout: logical },
        { stdout: speed },
        { stdout: uuid },
        { stdout: serial },
      ] = await Promise.all(
        commands.map((cmd) => execAsync(powershellCmd(cmd)))
      );

      processorDetails = {
        name: name.trim(),
        manufacturer: manufacturer.trim(),
        numberOfCores: parseInt(cores.trim(), 10),
        logicalProcessors: parseInt(logical.trim(), 10),
        maxClockSpeed: `${(parseInt(speed.trim(), 10) / 1000).toFixed(2)} GHz`,
        uUID: uuid.trim(),
        serialNumber: serial.trim(),
      };
    } else if (process.platform === "darwin") {
      // ✅ macOS: Use sysctl and ioreg to fetch processor details
      let name;
      try {
        name = execSync("sysctl -n machdep.cpu.brand_string", {
          encoding: "utf-8",
        }).trim();
      } catch {
        name = execSync("sysctl -n hw.model", { encoding: "utf-8" }).trim(); // Fallback for Apple Silicon
      }

      let manufacturer = "Apple"; // Default to Apple for M1/M2/M3
      try {
        manufacturer = execSync("sysctl -n machdep.cpu.brand_string", {
          encoding: "utf-8",
        }).trim();
      } catch { }

      const numberOfCores = execSync("sysctl -n hw.physicalcpu", {
        encoding: "utf-8",
      }).trim();
      const logicalProcessors = execSync("sysctl -n hw.logicalcpu", {
        encoding: "utf-8",
      }).trim();

      let maxClockSpeed;
      try {
        maxClockSpeed = execSync("sysctl -n hw.cpufrequency", {
          encoding: "utf-8",
        }).trim();
      } catch {
        maxClockSpeed = execSync("sysctl -n hw.cpufrequency_max", {
          encoding: "utf-8",
        }).trim();
      }

      const uuid = execSync(
        "ioreg -rd1 -c IOPlatformExpertDevice | awk -F'\"' '/IOPlatformUUID/ {print $4}'",
        { encoding: "utf-8" }
      ).trim();

      processorDetails = {
        name,
        manufacturer: manufacturer || "Unknown",
        numberOfCores: parseInt(numberOfCores),
        maxClockSpeed: `${(parseInt(maxClockSpeed) / 1e9).toFixed(2)} GHz`, // Convert Hz to GHz
        uUID: uuid,
        logicalProcessors: parseInt(logicalProcessors),
      };
    } else if (process.platform === "linux") {
      // ✅ Linux: Use lscpu and cat /proc/cpuinfo
      const name = execSync(
        "lscpu | grep 'Model name' | awk -F: '{print $2}' || echo 'Unknown'",
        { encoding: "utf-8" }
      ).trim();
      const manufacturer = execSync(
        "cat /proc/cpuinfo | grep 'vendor_id' | uniq | awk -F: '{print $2}' || echo 'Unknown'",
        { encoding: "utf-8" }
      ).trim();
      const numberOfCores = execSync(
        "lscpu | grep '^CPU(s):' | awk -F: '{print $2}' || echo '0'",
        { encoding: "utf-8" }
      ).trim();
      const logicalProcessors = execSync(
        "lscpu | grep '^Thread(s) per core' | awk -F: '{print $2}' || echo '0'",
        { encoding: "utf-8" }
      ).trim();

      let maxClockSpeed;
      try {
        maxClockSpeed = execSync(
          "lscpu | grep 'CPU max MHz' | awk -F: '{print $2}' || echo 'Unknown'",
          { encoding: "utf-8" }
        ).trim();
        maxClockSpeed = `${(parseFloat(maxClockSpeed) / 1000).toFixed(2)} GHz`; // Convert MHz to GHz
      } catch {
        maxClockSpeed = "Unknown";
      }

      // ✅ Fix Permission Denied for UUID
      let uuid;
      try {
        uuid = execSync(
          "cat /sys/class/dmi/id/product_uuid 2>/dev/null || echo 'Permission Denied'",
          { encoding: "utf-8" }
        ).trim();
        if (uuid.includes("Permission Denied")) {
          uuid = "Access Restricted - Run as Root";
        }
      } catch (error) {
        writeLog("ERROR", "Linux UUID collection failed", {
          error: error?.message || error
        });
        uuid = "Unknown";
      }

      processorDetails = {
        name,
        manufacturer,
        numberOfCores: parseInt(numberOfCores),
        logicalProcessors: parseInt(logicalProcessors) || "Unknown",
        maxClockSpeed,
        uUID: uuid,
      };
    } else {
      return { error: "Unsupported OS" };
    }

    return processorDetails;
  } catch (error) {
    writeLog("ERROR", "Processor details collection failed", {
      error: error?.message || error
    });
    return { error: error.message };
  }
};

export const getUSBControllers = async () => {
  try {
    let controllers = [];

    if (process.platform === "win32") {
      // ✅ Windows: Use PowerShell to get USB Controller details
      const { stdout: usbData } = await execAsync(
        'powershell -command "Get-WmiObject Win32_USBController | Select-Object Name,DeviceID"',
        { encoding: "utf-8" }
      );

      let lines = usbData
        .split("\n")
        .slice(3)
        .map((line) => line.trim())
        .filter((line) => line);

      controllers = lines
        .map((line) => {
          let match = line.match(/^(.*?)\s+(PCI\\.+)$/); // Match name and deviceID
          if (!match) return null;
          return {
            name: match[1].trim(), // The full device name
            deviceID: match[2].trim(), // The rest (device ID)
          };
        })
        .filter(Boolean);
    } else if (process.platform === "darwin") {
      // ✅ macOS: Use system_profiler to fetch USB Controller details
      const usbData = execSync(
        "system_profiler SPUSBDataType | grep -E 'Host Controller|Product ID|Vendor ID'",
        { encoding: "utf-8" }
      );

      let lines = usbData
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line);

      let currentController = null;
      lines.forEach((line) => {
        if (line.includes("Host Controller")) {
          if (currentController) controllers.push(currentController);
          currentController = {
            name: line.replace("Host Controller:", "").trim(),
            deviceID: "Unknown",
          };
        }
      });

      if (currentController) controllers.push(currentController);
    } else if (process.platform === "linux") {
      // ✅ Linux: Use lsusb to fetch USB Controller details
      const usbData = execSync("lsusb", { encoding: "utf-8" });

      controllers = usbData
        .split("\n")
        .map((line) => {
          let parts = line.split(" ");
          let idIndex = parts.findIndex((p) => p.includes(":"));
          if (idIndex === -1) return null;

          return {
            name: parts
              .slice(idIndex + 1)
              .join(" ")
              .trim(), // USB Controller Name
            deviceID: parts[idIndex - 1] + ":" + parts[idIndex], // Vendor ID:Product ID
          };
        })
        .filter(Boolean);
    } else {
      return { error: "Unsupported OS" };
    }

    return controllers.length ? controllers : "No USB Controllers Found";
  } catch (error) {
    writeLog("ERROR", "USB controller collection failed", {
      error: error?.message || error
    });
    return { error: error.message };
  }
};

export const getBaseboardDetails = async () => {
  try {
    let details = {};

    if (process.platform === "win32") {
      // ✅ Windows: Use PowerShell (WMI) to fetch baseboard details
      const { stdout: baseboardData } = await execAsync(
        'powershell -command "Get-WmiObject Win32_BaseBoard | Select-Object Manufacturer,Product,SerialNumber,Version,PartNumber | ConvertTo-Json"',
        { encoding: "utf-8" }
      );

      const parsedData = safeParseJSON(baseboardData, {});
      if (!parsedData) return {};
      details = {
        manufacturer: parsedData.Manufacturer || "Unknown",
        product: parsedData.Product || "Unknown",
        serialNumber: parsedData.SerialNumber || "Unknown",
        version: parsedData.Version || "Unknown",
        tag: "Base Board",
        productID: parsedData.PartNumber || parsedData.Product || "Unknown",
      };
    } else if (process.platform === "darwin") {
      // ✅ macOS: Use system_profiler to fetch baseboard details
      const manufacturer = execSync(
        "system_profiler SPHardwareDataType | awk '/Model Name/ {print $3, $4, $5}'",
        { encoding: "utf-8" }
      ).trim();
      const serialNumber = execSync(
        "system_profiler SPHardwareDataType | awk '/Serial Number/ {print $4}'",
        { encoding: "utf-8" }
      ).trim();
      const product = execSync(
        "system_profiler SPHardwareDataType | awk '/Model Identifier/ {print $3}'",
        { encoding: "utf-8" }
      ).trim();

      details = {
        manufacturer: manufacturer || "Apple",
        product: product || "Unknown",
        serialNumber: serialNumber || "Unknown",
        version: "N/A",
        tag: "Base Board",
        productID: "",
      };
    } else if (process.platform === "linux") {
      // ✅ Linux: Use dmidecode to fetch baseboard details (requires sudo)
      try {
        // ✅ First, try without sudo
        let manufacturer = execSync(
          "dmidecode -s baseboard-manufacturer 2>/dev/null || echo 'Permission Denied'",
          { encoding: "utf-8" }
        ).trim();
        let product = execSync(
          "dmidecode -s baseboard-product-name 2>/dev/null || echo 'Permission Denied'",
          { encoding: "utf-8" }
        ).trim();
        let serialNumber = execSync(
          "dmidecode -s baseboard-serial-number 2>/dev/null || echo 'Permission Denied'",
          { encoding: "utf-8" }
        ).trim();
        let version = execSync(
          "dmidecode -s baseboard-version 2>/dev/null || echo 'Permission Denied'",
          { encoding: "utf-8" }
        ).trim();

        // ✅ If permission denied, fallback to `/sys/devices/virtual/dmi/id/`
        if (manufacturer.includes("Permission Denied")) {
          manufacturer = execSync(
            "cat /sys/devices/virtual/dmi/id/board_vendor 2>/dev/null || echo 'Unknown'",
            { encoding: "utf-8" }
          ).trim();
        }
        if (product.includes("Permission Denied")) {
          product = execSync(
            "cat /sys/devices/virtual/dmi/id/board_name 2>/dev/null || echo 'Unknown'",
            { encoding: "utf-8" }
          ).trim();
        }
        if (serialNumber.includes("Permission Denied")) {
          serialNumber = execSync(
            "cat /sys/devices/virtual/dmi/id/board_serial 2>/dev/null || echo 'Unknown'",
            { encoding: "utf-8" }
          ).trim();
        }
        if (version.includes("Permission Denied")) {
          version = execSync(
            "cat /sys/devices/virtual/dmi/id/board_version 2>/dev/null || echo 'Unknown'",
            { encoding: "utf-8" }
          ).trim();
        }

        details = {
          manufacturer: manufacturer || "Unknown",
          product: product || "Unknown",
          serialNumber: serialNumber || "Unknown",
          version: version || "Unknown",
          tag: "Base Board",
          productID: "",
        };
      } catch (error) {
        writeLog("ERROR", "Linux baseboard collection failed", {
          error: error?.message || error
        });
        details = { error: "Could not fetch baseboard details." };
      }
    } else {
      return { error: "Unsupported OS" };
    }

    return details;
  } catch (error) {
    writeLog("ERROR", "Baseboard collection failed", {
      error: error?.message || error
    });
    return { error: error.message };
  }
};

export const getPrinterDetails = async () => {
  let printers = [];

  try {
    if (process.platform === "win32") {
      // ✅ Windows: Use PowerShell to fetch printer details
      const command = `powershell -command "Get-Printer | Select-Object Name,DriverName,PortName,Shared,Default | ConvertTo-Json"`;
      const { stdout: printerData } = await execAsync(command, {
        encoding: "utf-8",
      });

      if (!printerData.trim()) {
        throw new Error("No printer data found.");
      }

      let printerInfo = safeParseJSON(printerData, []);
      if (!Array.isArray(printerInfo)) printerInfo = [printerInfo];

      // Ensure the output is an array
      if (!Array.isArray(printerInfo)) {
        printerInfo = [printerInfo];
      }
      printerInfo.forEach((printer) => {
        printers.push({
          printerName: printer.Name || "Unknown",
          driverName: printer.DriverName || "Unknown",
          portName: printer.PortName || "Unknown",
          isShared: printer.Shared ? "Yes" : "No",
          isDefault: printer.Default ? "Yes" : "No",
        });
      });
    } else if (process.platform === "darwin" || process.platform === "linux") {
      // ✅ macOS & Linux: Use lpstat
      let printerNames;
      try {
        printerNames = execSync("lpstat -p | awk '{print $2}'", {
          encoding: "utf-8",
        })
          .trim()
          .split("\n");
        if (!printerNames.length || printerNames[0] === "")
          return [{ error: "No printers found" }];
      } catch {
        return [{ error: "No printers found" }];
      }

      printerNames.forEach((name) => {
        let driverName = "Unknown";
        let isDefault = "No";

        try {
          driverName = execSync(`lpinfo -v | grep ${name} | awk '{print $3}'`, {
            encoding: "utf-8",
          }).trim();
        } catch { }

        try {
          isDefault = execSync("lpstat -d", { encoding: "utf-8" }).includes(
            name
          )
            ? "Yes"
            : "No";
        } catch { }

        printers.push({
          printerName: name || "Unknown",
          driverName: driverName || "Unknown",
          portName: "N/A",
          isShared: "N/A",
          isDefault,
        });
      });
    } else {
      return [{ error: "Unsupported OS" }];
    }

    return printers;
  } catch (error) {
    writeLog("ERROR", "Printer information collection failed", {
      error: error?.message || error
    });
    return [{ error: error.message }];
  }
};

export const getSoundCardDetails = async () => {
  let soundCards = [];

  try {
    if (process.platform === "win32") {
      // ✅ Windows: Use PowerShell to fetch sound card details
      const command = `powershell -command "Get-WmiObject Win32_SoundDevice | Select-Object Name,Manufacturer,Status,DeviceID | ConvertTo-Json"`;
      const { stdout: soundCardData } = await execAsync(command, {
        encoding: "utf-8",
      });

      if (!soundCardData.trim()) {
        throw new Error("No sound card data found.");
      }

      let soundCardInfo = safeParseJSON(soundCardData, []);
      if (!Array.isArray(soundCardInfo)) soundCardInfo = [soundCardInfo];

      // Ensure the output is an array
      if (!Array.isArray(soundCardInfo)) {
        soundCardInfo = [soundCardInfo];
      }

      soundCardInfo.forEach((card) => {
        soundCards.push({
          name: card.Name || "Unknown",
          manufacturer: card.Manufacturer || "Unknown",
          status: card.Status || "Unknown",
          deviceID: card.DeviceID || "Unknown",
        });
      });
    } else if (process.platform === "darwin") {
      // ✅ macOS: Use system_profiler to get sound card details
      const command = `system_profiler SPAudioDataType | grep -E "Output Device:|Input Device:" -A 2`;
      const soundCardData = execSync(command, { encoding: "utf-8" });

      let lines = soundCardData
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line);
      let currentDevice = {};

      lines.forEach((line) => {
        if (
          line.startsWith("Output Device:") ||
          line.startsWith("Input Device:")
        ) {
          if (Object.keys(currentDevice).length) {
            soundCards.push(currentDevice);
          }
          currentDevice = {
            name: line.split(":")[1].trim(),
            manufacturer: "Unknown",
            status: "OK",
            deviceID: "N/A",
          };
        } else if (line.includes("Manufacturer:")) {
          currentDevice.manufacturer = line.split(":")[1].trim();
        }
      });

      if (Object.keys(currentDevice).length) {
        soundCards.push(currentDevice);
      }
    } else if (process.platform === "linux") {
      // ✅ Linux: Use aplay and lspci to get sound card details
      try {
        // Try `aplay -l` first
        const aplayCommand = `aplay -l | grep "card"`;
        const soundCardData = execSync(aplayCommand, { encoding: "utf-8" });

        let lines = soundCardData
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line);
        lines.forEach((line) => {
          let match = line.match(
            /card (\d+): (.+) \[.+\], device (\d+): (.+) \[.+\]/
          );
          if (match) {
            soundCards.push({
              name: match[2] || "Unknown",
              manufacturer: "Unknown",
              status: "OK",
              deviceID: `card${match[1]}-device${match[3]}`,
            });
          }
        });
      } catch (err) {
        writeLog("WARN", "aplay command failed, fallback to lspci for sound detection");
        // Fallback to `lspci` if `aplay` is not available
        const lspciCommand = `lspci | grep -i audio`;
        const soundCardData = execSync(lspciCommand, { encoding: "utf-8" });

        let lines = soundCardData
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line);
        lines.forEach((line) => {
          soundCards.push({
            name: line.split(":")[1]?.trim() || "Unknown",
            manufacturer: "Unknown",
            status: "OK",
            deviceID: "N/A",
          });
        });
      }
    } else {
      return [{ error: "Unsupported OS" }];
    }

    return soundCards.length ? soundCards : [{ error: "No sound cards found" }];
  } catch (error) {
    writeLog("ERROR", "Sound card information collection failed", {
      error: error?.message || error
    });
    return [{ error: error.message }];
  }
};

export const getVideoCardDetails = async () => {
  let videoCards = [];

  try {
    if (process.platform === "win32") {
      // ✅ Windows: Use PowerShell to get GPU details
      const command = `powershell -command "Get-WmiObject Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion,Status,PNPDeviceID | ConvertTo-Json"`;
      const { stdout: videoCardData } = await execAsync(command, {
        encoding: "utf-8",
      });

      if (!videoCardData.trim()) {
        throw new Error("No video card data found.");
      }

      let videoCardInfo = safeParseJSON(videoCardData, []);
      if (!Array.isArray(videoCardInfo)) videoCardInfo = [videoCardInfo];

      // Ensure the output is an array
      if (!Array.isArray(videoCardInfo)) {
        videoCardInfo = [videoCardInfo];
      }

      videoCardInfo.forEach((gpu) => {
        videoCards.push({
          name: gpu.Name || "Unknown",
          memorySize: gpu.AdapterRAM
            ? `${gpu.AdapterRAM / 1024 / 1024} MB`
            : "Unknown",
          driverVersion: gpu.DriverVersion || "Unknown",
          status: gpu.Status || "Unknown",
          deviceID: gpu.PNPDeviceID || "Unknown",
        });
      });
    } else if (process.platform === "darwin") {
      // ✅ macOS: Use system_profiler to get GPU details
      const command = `system_profiler SPDisplaysDataType | grep -E "Chipset Model|VRAM|Vendor"`;
      const videoCardData = execSync(command, { encoding: "utf-8" });

      let lines = videoCardData
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line);
      let currentGPU = {};

      lines.forEach((line) => {
        if (line.includes("Chipset Model:")) {
          if (Object.keys(currentGPU).length) {
            videoCards.push(currentGPU);
          }
          currentGPU = {
            name: line.split(":")[1].trim(),
            memorySize: "Unknown",
            driverVersion: "Unknown",
            status: "OK",
            deviceID: "N/A",
          };
        } else if (
          line.includes("VRAM (Dynamic, Max):") ||
          line.includes("VRAM:")
        ) {
          currentGPU.memorySize = line.split(":")[1].trim();
        } else if (line.includes("Vendor:")) {
          currentGPU.vendor = line.split(":")[1].trim();
        }
      });

      if (Object.keys(currentGPU).length) {
        videoCards.push(currentGPU);
      }
    } else if (process.platform === "linux") {
      // ✅ Linux: Use lspci and glxinfo to get GPU details
      try {
        const command = `lspci -nn | grep -i 'VGA\\|3D'`;
        const videoCardData = execSync(command, { encoding: "utf-8" });

        let lines = videoCardData
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line);

        lines.forEach((line) => {
          let match = line.match(/\[(.*?)\]: (.+)/);
          if (match) {
            videoCards.push({
              name: match[2] || "Unknown",
              memorySize: "Unknown",
              driverVersion: "Unknown",
              status: "OK",
              deviceID: match[1] || "Unknown",
            });
          }
        });

        // ✅ Try to get GPU memory size (if available)
        try {
          const memCommand = `grep -i "memory" /var/log/Xorg.0.log | grep -o '[0-9]\\+ kB' | tail -1`;
          const memData = execSync(memCommand, { encoding: "utf-8" }).trim();
          if (memData && videoCards.length) {
            videoCards[0].memorySize = `${(parseInt(memData) / 1024).toFixed(
              2
            )} MB`;
          }
        } catch (memError) {
          writeLog("WARN", "GPU memory detection failed on Linux");
        }
      } catch (linuxError) {
        throw new Error("No video card data found.");
      }
    } else {
      return [{ error: "Unsupported OS" }];
    }

    return videoCards.length ? videoCards : [{ error: "No video cards found" }];
  } catch (error) {
    writeLog("ERROR", "Video card information collection failed", {
      error: error?.message || error
    });
    return [{ error: error.message }];
  }
};

export const getInstallSoftwareList = async () => {
  try {
    let registrySoftware = await getInstalledSoftwareFromRegistry(platform);
    // let exeSoftware = await getExeFilesFromDrives();
    // let combinedSoftware = [...registrySoftware, ...exeSoftware];
    return registrySoftware;
  } catch (error) {
    writeLog("ERROR", "Installed software list collection failed", {
      error: error?.message || error
    });
    return []; // Optional: return empty array if failure occurs
  }
};

export async function getSystemEnvironmentVariables() {
  try {
    const envVars = process.env;
    const envObject = {};

    for (const key in envVars) {
      if (Object.prototype.hasOwnProperty.call(envVars, key)) {
        envObject[key] = envVars[key];
      }
    }

    return envObject;
  } catch (error) {
    writeLog("ERROR", "Environment variables collection failed", {
      error: error?.message || error
    });
    return { error: "Failed to retrieve environment variables" };
  }
}

export async function getInstalledHotfixes() {
  let updates = [];

  try {
    if (platform === "win32") {
      const raw = execSync(`powershell "Get-HotFix | Select-Object -Property HotFixID, InstalledOn | ConvertTo-Json"`).toString().trim();
      let parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) parsed = [parsed];

      updates = parsed.map(entry => {
        let dateString = "Unknown";
        try {
          if (entry.InstalledOn) {
            let rawDate = entry.InstalledOn;


            // Handle if it's an object
            if (typeof rawDate === "object") {
              // Prefer DateTime if available, else parse value

              if (rawDate.DateTime) {
                dateString = rawDate.DateTime;
              } else if (rawDate.value) {
                // Extract number from /Date(1753381800000)/
                const match = /Date\((\d+)\)/.exec(rawDate.value);
                if (match) {
                  dateString = parseInt(match[1], 10);
                }
              }
            }
          }
        } catch {
          dateString = String(entry.InstalledOn);
        }
        return {
          name: entry.HotFixID || "Unknown",
          vendor: "Microsoft",
          type: "Hotfix",
          installDate: dateString
        };
      });
    }

    else if (platform === "darwin") {
      const raw = execSync(`system_profiler SPInstallHistoryDataType -json`).toString();
      const parsed = JSON.parse(raw)["SPInstallHistoryDataType"];

      updates = parsed.map(entry => {
        let dateString = "Unknown";
        try {
          if (entry.installDate) {
            const dateObj = new Date(entry.installDate);
            if (!isNaN(dateObj)) {
              dateString = dateObj.toISOString();
            } else {
              dateString = String(entry.installDate);
            }
          }
        } catch {
          dateString = String(entry.installDate);
        }

        return {
          name: entry.displayName || entry._name || "Unknown",
          vendor: entry.displayName?.includes("Apple") ? "Apple" : "Unknown",
          type: entry.installType || "Software",
          installDate: dateString
        };
      });
    }

    else if (platform === "linux") {
      try {
        const raw = execSync(`dpkg-query -W -f='${'${Package} ${Version}\\n'}'`, { encoding: 'utf-8' });
        updates = raw.split("\n").filter(Boolean).map(line => {
          const [name] = line.split(" ");
          return {
            name,
            vendor: "Unknown",
            type: "Package",
            installDate: "N/A"
          };
        });
      } catch {
        try {
          const raw = execSync(`rpm -qa --queryformat '%{NAME} %{VERSION}-%{RELEASE}\\n'`, { encoding: 'utf-8' });
          updates = raw.split("\n").filter(Boolean).map(line => {
            const [name] = line.split(" ");
            return {
              name,
              vendor: "Unknown",
              type: "Package",
              installDate: "N/A"
            };
          });
        } catch (e) {
          updates.push({
            name: "Unavailable",
            vendor: "Unknown",
            type: "Package",
            installDate: "Unknown"
          });
        }
      }
    }

    return updates;

  } catch (error) {
    writeLog("ERROR", "Installed hotfix collection failed", {
      error: error?.message || error
    });
    return [{
      name: "Error",
      vendor: "Unknown",
      type: "Error",
      installDate: "Error fetching data"
    }];
  }
}


export const getDeviceFormFactor = async () => {

  try {
    if (platform === "win32") {
      // // ✅ Windows: Use chassis type
      // const raw = execSync(`powershell "Get-WmiObject Win32_SystemEnclosure | Select-Object -ExpandProperty ChassisTypes"`).toString().trim();
      // const chassisCode = parseInt(raw);
      // for (const [formFactor, codes] of Object.entries(chassisGroups)) {
      //   if (codes.includes(chassisCode)) {
      //     return formFactor;
      //   }
      // }
      // return "Unknown";

      const runPS = (cmd) =>
        execSync(`powershell -NoProfile -Command "${cmd}"`)
          .toString()
          .trim();

      // OS type
      const productType = parseInt(
        runPS("(Get-CimInstance Win32_OperatingSystem).ProductType")
      );

      // Model (VM detection)
      const model = runPS("(Get-CimInstance Win32_ComputerSystem).Model");

      // Chassis (can be multiple values)
      const chassisRaw = runPS(
        "(Get-CimInstance Win32_SystemEnclosure).ChassisTypes"
      );

      const chassisTypes = chassisRaw
        .split(/\s+/)
        .map(n => parseInt(n))
        .filter(n => !isNaN(n));

      const isVM =
        /Virtual|VMware|KVM|Hyper-V/i.test(model) ||
        chassisTypes.includes(1);

      // --- Server ---
      if (productType === 2 || productType === 3) {
        return "servers";
      }

      // --- Workstation ---
      if (productType === 1) {
        if (chassisTypes.includes(30)) return "tablet";

        if (
          chassisTypes.some(code =>
            [8, 9, 10, 11, 12, 14, 18, 21, 31, 32].includes(code)
          )
        ) {
          return "laptop";
        }

        if (
          chassisTypes.some(code =>
            [3, 4, 5, 6, 7, 15, 16].includes(code)
          )
        ) {
          return "desktop";
        }

        // fallback
        return isVM ? "laptop" : "desktop";
      }

      return "laptop";


    } else if (platform === "darwin") {
      // ✅ macOS: Use hardware model
      const model = execSync(`sysctl -n hw.model`).toString().trim();
      if (model.includes("MacBook")) {
        return "laptop";
      } else if (
        model.includes("iMac") ||
        model.includes("MacPro") ||
        model.includes("Macmini")
      ) {
        return "desktop";
      } else if (model.includes("Xserve")) {
        return "servers";
      } else {
        return "laptop";
      }

    } else if (platform === "linux") {
      return getLinuxDeviceType();

      // ✅ Linux: Read from chassis_type if available
      // let type = "";
      // try {
      //   type = fs.readFileSync("/sys/class/dmi/id/chassis_type", "utf8").trim();
      // } catch { }

      // const chassisCode = parseInt(type);

      // const laptopCodes = [8, 9, 10, 14, 31, 32];
      // const desktopCodes = [3, 4, 5, 6, 7, 13];
      // const serverCodes = [23];

      // try {
      //   if (laptopCodes.includes(chassisCode)) {
      //     return "laptop";
      //   } else if (desktopCodes.includes(chassisCode)) {
      //     return "desktop";
      //   } else if (serverCodes.includes(chassisCode)) {
      //     return "servers";
      //   } else {
      //     try {
      //       const name = fs.readFileSync("/sys/class/dmi/id/product_name", "utf8").trim().toLowerCase();
      //       if (name.includes("laptop") || name.includes("notebook")) {
      //         return "laptop";
      //       } else if (name.includes("desktop") || name.includes("all-in-one")) {
      //         return "desktop";
      //       } else if (name.includes("server")) {
      //         return "server";
      //       } else {
      //         return "laptop"
      //       }

      //     } catch {
      //       return "laptop"
      //     }
      //   }
      // } catch (error) {
      //   return "laptop"
      // }
    } else {
      return "laptop";
    }
  } catch (err) {
    writeLog("ERROR", "Device form factor detection failed", {
      error: err?.message || err
    });
    return "laptop"
  }

};


export const getSubCategoryByOS = async () => {
  try {
    console.log("getSubCategoryByOS::::>", platform)
    if (platform === "linux") {
      return "linux"
    }
    if (platform === "darwin") {
      return "macos"
    }
    if (platform === "win32") {
      return "windows"
    }
    return "others"
  } catch (error) {
    writeLog("ERROR", "Sub category detection failed", {
      error: error?.message || error
    });
    return "others"
  }
}

export const getDeviceAlias = async () => {
  try {
    let hostname = os.hostname(); // Works on Windows, macOS, Linux
    const currentYear = new Date().getFullYear();

    // Additional checks for macOS & Linux
    if (!hostname || hostname === "localhost") {
      try {
        if (os.platform() === "linux") {
          hostname = execSync("hostnamectl --static", {
            encoding: "utf-8",
          }).trim();
        } else if (os.platform() === "darwin") {
          hostname = execSync("scutil --get ComputerName", {
            encoding: "utf-8",
          }).trim();
        }
      } catch (err) {
        writeLog("WARN", "Hostname fallback used");
      }
    }

    return `Alias-${hostname}-${currentYear}`;
  } catch (error) {
    writeLog("ERROR", "Device alias generation failed", {
      error: error?.message || error
    });
    return "Unknown-Alias";
  }
};

export const getLastBootUpTime = async () => {
  try {
    if (os.platform() === "win32") {
      const { stdout } = await execAsync(
        `powershell -command "(Get-CimInstance Win32_OperatingSystem).LastBootUpTime"`,
        { encoding: "utf8" }
      );
      const output = stdout.trim();

      if (output) {
        const date = new Date(output);
        return date.toISOString().replace("T", " ").split(".")[0]; // Format: YYYY-MM-DD HH:MM:SS
      }
    } else if (os.platform() === "darwin" || os.platform() === "linux") {
      // ✅ macOS & Linux: Use `who -b` (works on all UNIX-based systems)
      const output = execSync("who -b | awk '{print $3, $4}'", {
        encoding: "utf8",
      }).trim();
      return output; // Already formatted as "YYYY-MM-DD HH:MM"
    } else {
      return "Unsupported OS";
    }
  } catch (error) {
    writeLog("ERROR", "Boot time collection failed", {
      error: error?.message || error
    });
    return "N/A";
  }
};

export const getBootDevice = async () => {
  try {
    if (os.platform() === "win32") {
      try {
        const { stdout } = await execAsync(
          'powershell -command "(Get-CimInstance Win32_OperatingSystem).BootDevice"',
          { encoding: "utf8" }
        );
        return stdout.trim() || "N/A";
      } catch (error) {
        const { stdout } = await execAsync(
          'powershell -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem).BootDevice"'
        );
        return stdout.trim() || "N/A";
      }
    } else if (os.platform() === "darwin") {
      // ✅ macOS: Use `mount` to find the root volume
      try {
        const output = execSync("mount | grep ' / ' | awk '{print $1}'", {
          encoding: "utf8",
        }).trim();
        return output || "N/A";
      } catch {
        return "N/A";
      }
    } else if (os.platform() === "linux") {
      // ✅ Linux: Use `findmnt` or `df` to get the root partition
      try {
        let output;
        try {
          output = execSync("findmnt -n -o SOURCE /", {
            encoding: "utf8",
          }).trim();
        } catch {
          output = execSync("df / | awk 'NR==2 {print $1}'", {
            encoding: "utf8",
          }).trim();
        }
        return output || "N/A";
      } catch {
        return "N/A";
      }
    } else {
      return "Unsupported OS";
    }
  } catch (error) {
    writeLog("ERROR", "Boot device collection failed", {
      error: error?.message || error
    });
    return "N/A";
  }
};

export const getWindowsDirectory = async () => {
  try {
    if (os.platform() === "win32") {
      try {
        const { stdout } = await execAsync(
          "powershell -command \"[System.Environment]::GetFolderPath('Windows')\"",
          { encoding: "utf8" }
        );
        return stdout.trim() || "C:\\Windows"; // Default fallback
      } catch {
        return "C:\\Windows"; // Fallback
      }
    } else if (os.platform() === "darwin" || os.platform() === "linux") {
      // ✅ macOS & Linux: Root directory is always "/"
      return "/";
    } else {
      return "Unsupported OS";
    }
  } catch (error) {
    writeLog("ERROR", "System root directory detection failed", {
      error: error?.message || error
    });
    return os.platform() === "win32" ? "C:\\Windows" : "/"; // Fallback values
  }
};

export const getSystemDirectory = async () => {
  try {
    if (os.platform() === "win32") {
      const { stdout } = await execAsync(
        'powershell -command "(Get-CimInstance Win32_OperatingSystem).SystemDirectory"',
        { encoding: "utf8" }
      );
      return stdout.trim() || "N/A";
    } else if (os.platform() === "darwin") {
      // ✅ macOS: System directory
      return "/System/Library";
    } else if (os.platform() === "linux") {
      const possibleDirs = ["/lib", "/usr/lib", "/lib64", "/usr/local/lib"];
      for (const dir of possibleDirs) {
        if (fs.existsSync(dir)) return dir;
      }
      return "/lib"; // Default fallback
    } else {
      return "Unsupported OS";
    }
  } catch (error) {
    writeLog("ERROR", "System directory detection failed", {
      error: error?.message || error
    });
    return "N/A";
  }
};

export const getdiskdrive = async () => {
  try {
    let diskDrive = {};

    if (process.platform === "win32") {
      const commands = [
        'powershell -command "(Get-PhysicalDisk)[0].Model"',
        'powershell -command "(Get-PhysicalDisk)[0].MediaType"',
        'powershell -command "(Get-PhysicalDisk)[0].HealthStatus"',
        'powershell -command "(Get-PhysicalDisk)[0].Size / 1GB"',
      ];
      const [modelRes, mediaTypeRes, healthStatusRes, sizeRes] =
        await Promise.all(commands.map((cmd) => execAsync(cmd)));

      const model = modelRes.stdout.trim();
      const mediaType = mediaTypeRes.stdout.trim();
      const healthStatus = healthStatusRes.stdout.trim();
      const size = parseFloat(sizeRes.stdout.trim()).toFixed(2) + " GB";

      diskDrive = {
        model,
        size: `${parseFloat(size).toFixed(2)} GB`,
        mediaType, // SSD or HDD
        healthStatus, // OK, Warning, or Bad
      };
    } else if (process.platform === "darwin") {
      // ✅ macOS: Use diskutil & system_profiler to fetch disk details
      const model = execSync(
        "system_profiler SPSerialATADataType | grep 'Model' | awk -F': ' '{print $2}' | head -1",
        { encoding: "utf-8" }
      ).trim();
      const size = execSync(
        "diskutil info / | grep 'Total Size' | awk -F'(' '{print $2}' | awk '{print $1, $2}'",
        { encoding: "utf-8" }
      ).trim();
      const mediaType = execSync(
        "diskutil info / | grep 'Solid State' | awk -F': ' '{print $2}'",
        { encoding: "utf-8" }
      ).trim();

      diskDrive = {
        model: model || "Unknown",
        size: size || "Unknown",
        mediaType: mediaType === "Yes" ? "SSD" : "HDD",
        healthStatus: "Unknown", // No direct health check for macOS
      };
    }
    else if (process.platform === "linux") {

      try {
        const output = execSync(
          "lsblk -d -o NAME,SIZE,MODEL,ROTA | tail -n +2",
          { encoding: "utf-8" }
        ).trim();

        const line = output.split("\n")[0];
        const parts = line.split(/\s+/);

        diskDrive = {
          model: parts.slice(2).join(" ") || "Unknown",
          size: parts[1] || "Unknown",
          mediaType: parts[3] === "0" ? "SSD" : "HDD",
          healthStatus: "Unknown"
        };

      } catch (err) {
        writeLog("ERROR", "Linux disk drive detection failed", {
          error: err?.message || err
        });

        diskDrive = {
          model: "Unknown",
          size: "Unknown",
          mediaType: "Unknown",
          healthStatus: "Unknown"
        };
      }

    }
    else {
      return { error: "Unsupported OS" };
    }

    return diskDrive;
  } catch (error) {
    writeLog("ERROR", "Disk drive information collection failed", {
      error: error?.message || error
    });
    return { error: error.message };
  }
};

export const getOSInstalledBy = async () => {
  try {
    if (os.platform() === "win32") {
      // ✅ Windows: Get RegisteredOwner from Registry
      try {
        const { stdout } = await execAsync(
          'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion" /v RegisteredOwner',
          { encoding: "utf8" }
        );
        const match = stdout.match(/RegisteredOwner\s+REG_SZ\s+(.*)/);
        return match ? match[1].trim() : "N/A";
      } catch {
        return "N/A";
      }
    } else if (os.platform() === "darwin" || os.platform() === "linux") {
      // ✅ macOS & Linux: Get first system user (most likely the OS installer)
      try {
        const firstUser = execSync("logname", { encoding: "utf8" }).trim();
        if (firstUser) return firstUser;
      } catch { }

      try {
        const users = execSync("who | awk '{print $1}' | sort -u", {
          encoding: "utf8",
        }).trim();
        return users.split("\n")[0] || "N/A"; // Return first user found
      } catch {
        return "N/A";
      }
    } else {
      return "Unsupported OS";
    }
  } catch (error) {
    writeLog("ERROR", "OS installer detection failed", {
      error: error?.message || error
    });
    return "N/A";
  }
};

export const getWindowsLicenseStatus = async () => {
  try {
    if (platform !== "win32") return "Unsupported";

    const { stdout } = await execAsync(`
      powershell -NoProfile -ExecutionPolicy Bypass -Command "
      Get-CimInstance -ClassName SoftwareLicensingProduct -Filter \\"ApplicationID='55c92734-d682-4d71-983e-d6ec3f16059f' AND PartialProductKey IS NOT NULL\\" |
      Select-Object -First 1 -ExpandProperty LicenseStatus
      "
    `);

    const status = parseInt(stdout.trim());

    switch (status) {
      case 1: return "Licensed";
      case 2: return "OOB Grace";
      case 3: return "OOT Grace";
      case 4: return "Non-Genuine";
      case 5: return "Notification";
      default: return "Trial";
    }

  } catch (error) {
    writeLog("WARN", "License status detection failed", {
      error: error?.message || error
    });
    return "Unknown";
  }
};

export function getOSName() {
  const platform = os.platform();

  try {
    // 🐧 Any Linux distro (Ubuntu, Rocky, Debian, Arch, etc.)
    if (platform === "linux") {
      if (fs.existsSync("/etc/os-release")) {
        const data = fs.readFileSync("/etc/os-release", "utf8");

        const pretty = data.match(/^PRETTY_NAME="(.+)"$/m);
        if (pretty) return pretty[1];

        const name = data.match(/^NAME="(.+)"$/m);
        const version = data.match(/^VERSION="(.+)"$/m);

        if (name && version) return `${name[1]} ${version[1]}`;
        if (name) return name[1];
      }

      // fallback (rare cases)
      return execSync("uname -sr", { encoding: "utf8" }).trim();
    }

    // 🪟 Windows (dynamic, real OS name)
    if (platform === "win32") {
      try {
        return execSync("powershell -Command \"(Get-CimInstance Win32_OperatingSystem).Caption\"", { encoding: "utf8" }).trim();
      } catch {
        return os.version();
      }
    }

    // 🍎 macOS
    if (platform === "darwin") {
      const name = execSync("sw_vers -productName", { encoding: "utf8" }).trim();
      const version = execSync("sw_vers -productVersion", { encoding: "utf8" }).trim();
      return `${name} ${version}`;
    }

    // fallback for unknown systems
    return `${os.type()} ${os.release()}`;
  } catch {
    return `${os.type()} ${os.release()}`;
  }
}


export const gatherSystemInfo = async () => {
  try {
    const windowsInfo = await getWindowsInfo();
    let totalVirtualMemoryGB = (os.totalmem() / 1024 ** 3).toFixed(2) + " GB";
    if (os.platform() === "win32") {
      const { stdout } = await execAsync(`
    powershell -NoProfile -Command "
    (Get-CimInstance Win32_OperatingSystem).TotalVirtualMemorySize
    "
  `);

      const totalVirtualMemoryKB = Number(stdout.trim());

      if (!totalVirtualMemoryKB || isNaN(totalVirtualMemoryKB)) {
        totalVirtualMemoryGB = (os.totalmem() / 1024 ** 3).toFixed(2) + " GB";
      } else {
        totalVirtualMemoryGB = (totalVirtualMemoryKB / 1024 ** 2).toFixed(2) + " GB";
      }

    } else if (os.platform() === "darwin") {
      const output = execSync("sysctl -n hw.memsize", {
        encoding: "utf8",
      }).trim();
      const totalMemoryBytes = parseInt(output);
      totalVirtualMemoryGB = (totalMemoryBytes / 1024 ** 3).toFixed(2) + " GB";
    } else if (os.platform() === "linux") {
      const output = execSync(
        "grep MemTotal /proc/meminfo | awk '{print $2}'",
        { encoding: "utf8" }
      ).trim();
      totalVirtualMemoryGB =
        (parseInt(output) / 1024 / 1024).toFixed(2) + " GB";
    } else {
      totalVirtualMemoryGB = (os.totalmem() / 1024 ** 3).toFixed(2) + " GB";
    }

    const [
      alias,
      lastBootUpTime,
      bootDevice,
      windowsDirectory,
      systemDirectory,
      licenseStatus,
      osName
    ] = await Promise.all([
      getDeviceAlias(),
      getLastBootUpTime(),
      getBootDevice(),
      getWindowsDirectory(),
      getSystemDirectory(),
      getWindowsLicenseStatus(),
      getOSName()
    ]);
    const osInfo = {
      osName: osName,
      osVersion: os.release(),
      osServicePack: os.version(),
      osInstallDate: windowsInfo.installDate || "N/A",
      osInstalledBy: await getOSInstalledBy(),
      lastBootUpTime,
      bootDevice,
      ProductID: windowsInfo?.productID || "N/A",
      ProductKey: windowsInfo?.productKey || "N/A",
      BuildNumber: windowsInfo?.buildNumber || "N/A",
      windowsDirectory,
      systemDirectory,
      virtualMemory: totalVirtualMemoryGB,
      licenseStatus,
    };
    const [
      biosInfo,
      cpuInfo,
      ramProperties,
      driveInfo,
      installInfo,
      Environment,
      Inventory,
      monitorInfo,
      keyboardInfo,
      mouseInfo,
      driverDetails,
      processor_details,
      disk_drive,
      usb_controller,
      baseboard_details,
      printer_details,
      sound_card,
      video_card,
      // license_software,
      systemDetails,
    ] = await Promise.all([
      getBiosInfo(),
      getCpuInfo(),
      getRamProperties(),
      getDriveInfo(),
      getInstallSoftwareList(),
      getSystemEnvironmentVariables(),
      getInstalledHotfixes(),
      getMonitorInfo(),
      getKeyboardInfo(),
      getMouseInfo(),
      getDriverDetails(),
      getProcessorDetails(),
      getdiskdrive(),
      getUSBControllers(),
      getBaseboardDetails(),
      getPrinterDetails(),
      getSoundCardDetails(),
      getVideoCardDetails(),
      // getLicensedSoftware(),
      getSystemDetails(),
    ]);

    const systemData = {
      assetName: os.hostname(),
      alias,
      assetID: storageService.getAssetId(),
      companyToken: storageService.getCompanyToken(),
      uUID: processor_details?.uUID || "N/A",
      serialNumber: processor_details?.serialNumber || "N/A",
      productID: windowsInfo?.productID || "N/A",
      category: await getDeviceFormFactor(),
      subCategory: await getSubCategoryByOS(),
      CommonProperties: systemDetails,
      OSProperties: osInfo,
      BIOSProperties: biosInfo,
      CPUProperties: cpuInfo,
      RAMProperties: ramProperties,
      diskProperties: driveInfo,
      MonitorProperties: monitorInfo,
      KeyboardProperties: keyboardInfo,
      MouseProperties: mouseInfo,
      DriverDetails: driverDetails,
      ProcessorDetails: processor_details,
      DiskDrive: disk_drive,
      USBController: usb_controller,
      BaseBoardDetail: baseboard_details,
      PrinterDetails: printer_details,
      SoundCard: sound_card,
      VideoCard: video_card,
      // LicenseSoftware: license_software,
      installSoftwareList: installInfo,
      SystemEnvironment: Environment,
      SoftwareInventory: Inventory,

    };

    writeLog("INFO", "System inventory collected successfully");
    return systemData || {};
  } catch (error) {
    writeLog("ERROR", "System inventory collection failed", {
      error: error?.message || error
    });
  }
};

export const getAgentBasicInfo = async () => {
  try {

    // existing functions already in this file
    const systemDetails = await getSystemDetails();
    const windowsInfo = await getWindowsInfo();
    const processor_details = await getProcessorDetails();
    const category = await getDeviceFormFactor();
    const macAddress = getMacAddress();

    const hostname = systemDetails?.hostname || os.hostname();

    const alias = `Alias-${hostname}-${new Date().getFullYear()}`;

    const payload = {
      assetName: hostname,
      alias,

      assetID: storageService.getAssetId(),
      companyToken: storageService.getCompanyToken(),

      uUID: processor_details?.uUID || "N/A",
      serialNumber: processor_details?.serialNumber || "N/A",

      productID: windowsInfo?.productID || "N/A",
      category: category || "Unknown",

      CommonProperties: {
        hostname,
        alias,
        ipAddress: systemDetails?.ipAddress || "N/A",
        macAddress,
        systemMake: systemDetails?.systemMake || "N/A",
        systemModel: systemDetails?.systemModel || "N/A",
        serialNumber: processor_details?.serialNumber || "N/A"
      }
    };

    return payload;

  } catch (error) {

    writeLog("ERROR", "Failed to collect basic agent info", {
      error: error?.message || error
    });

    return null;
  }
};