import { execSync, exec } from "child_process";
import os from "os";
import fs from "fs";
const platform = os.platform();
import { promisify } from "util";
import * as storageService from "./storageService.js";
import { writeLog } from "./logService.js";

const execAsync = promisify(exec);

function safeParseJSON(output, fallback) {
  if (!output || !output.trim()) return fallback;

  try {
    return JSON.parse(output);
  } catch (err) {
    return fallback;
  }
}

export const getCpuUsage = async () => {
  try {
    if (os.platform() === "win32") {
      const { stdout } = await execAsync(
        `powershell -NoProfile -Command "(Get-CimInstance Win32_Processor | Select-Object -ExpandProperty LoadPercentage)"`
      );

      if (!stdout || !stdout.trim()) return "N/A";

      const values = stdout
        .trim()
        .split(/\r?\n/)
        .map(v => parseFloat(v))
        .filter(v => !isNaN(v));

      if (!values.length) return "N/A";

      const avg = values.reduce((a, b) => a + b, 0) / values.length;

      return `${avg.toFixed(2)}%`;
    } else if (os.platform() === "darwin") {
      // macOS: Get CPU usage using top command
      const output = execSync("top -l 1 | grep 'CPU usage'").toString();
      const match = output.match(/(\d+\.\d+)% user, (\d+\.\d+)% sys/);
      if (match) {
        const user = parseFloat(match[1]);
        const sys = parseFloat(match[2]);
        return `${(user + sys).toFixed(2)}%`;
      }
    } else if (platform === "linux") {
      // Linux/Ubuntu: Get CPU usage using mpstat or top
      try {
        const output = execSync("mpstat 1 1 | awk '/all/ {print 100 - $NF}'", {
          encoding: "utf-8",
        });
        return `${parseFloat(output.trim()).toFixed(2)}%`;
      } catch (mpstatError) {
        // Fallback if mpstat is missing
        const output = execSync(
          "top -bn1 | grep 'Cpu(s)' | awk '{print 100 - $8}'",
          { encoding: "utf-8" }
        );
        return `${parseFloat(output.trim()).toFixed(2)}%`;
      }
    }
  } catch (error) {
    return "N/A";
  }
};

export const getMemoryUsage = async () => {
  try {
    // Get total, free, and used memory
    let totalMemory;
    if (os.platform() === "linux") {
      const { stdout } = await execAsync(
        "grep MemTotal /proc/meminfo | awk '{print $2}'",
        {
          encoding: "utf-8",
        }
      )
      totalMemory = stdout.trim();
      totalMemory = `${(parseInt(totalMemory) / 1024 / 1024).toFixed(2)} GB`; // Convert KB to GB
    } else {
      totalMemory = (os.totalmem() / 1024 ** 3).toFixed(2) + " GB";
    }
    const freeMemory = (os.freemem() / 1024 ** 3).toFixed(2) + " GB";
    const usedMemory =
      ((os.totalmem() - os.freemem()) / 1024 ** 3).toFixed(2) + " GB";
    const usagePercent =
      (((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(2) + "%";

    // Initialize swap memory values
    let totalSwap = "N/A";
    let freeSwap = "N/A";
    let usedSwap = "N/A";

    if (os.platform() === "win32") {
      // ✅ Windows: Get swap memory via PowerShell
      try {
        const { stdout: swapData } = await execAsync(
          'powershell -command "Get-CimInstance Win32_PageFileUsage | Select-Object AllocatedBaseSize, CurrentUsage | ConvertTo-Json"',
          { encoding: "utf-8" }
        );
        const swapInfo = safeParseJSON(swapData, []);

        if (Array.isArray(swapInfo)) {
          totalSwap =
            swapInfo.reduce((sum, entry) => sum + entry.AllocatedBaseSize, 0) +
            " MB";
          usedSwap =
            swapInfo.reduce((sum, entry) => sum + entry.CurrentUsage, 0) +
            " MB";
          freeSwap = parseInt(totalSwap) - parseInt(usedSwap) + " MB";
        }
      } catch (error) {

        writeLog("WARN", "Swap memory info not available on Windows.");
      }
    } else if (os.platform() === "darwin" || os.platform() === "linux") {
      // ✅ macOS & Linux: Use `free` command
      try {
        const swapData = execSync("free -m | grep Swap", {
          encoding: "utf-8",
        }).trim();
        const swapValues = swapData.split(/\s+/).slice(1); // Extract total, used, free swap memory

        totalSwap = swapValues[0]
          ? `${(parseInt(swapValues[0]) / 1024).toFixed(2)} GB`
          : "N/A";
        usedSwap = swapValues[1]
          ? `${(parseInt(swapValues[1]) / 1024).toFixed(2)} GB`
          : "N/A";
        freeSwap = swapValues[2]
          ? `${(parseInt(swapValues[2]) / 1024).toFixed(2)} GB`
          : "N/A";
      } catch (error) {
        writeLog("WARN", "⚠️ Swap memory info not available on macOS/Linux.");
      }
    }

    return {
      totalMemory,
      usedMemory,
      freeMemory,
      usagePercent,
      totalSwap,
      usedSwap,
      freeSwap,
    };
  } catch (error) {
    writeLog("ERROR", "Error retrieving memory usage", {
      error: error?.message || error,
    });
    return { error: error.message };
  }
};

export const getDiskUsage = async () => {
  try {
    let disks = [];

    if (process.platform === "win32") {
      const { stdout } = await execAsync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\" | Select-Object DeviceID,Size,FreeSpace | ConvertTo-Json -Compress"`
      );

      if (!stdout || !stdout.trim()) {
        return [{ error: "No disks found" }];
      }

      let data = safeParseJSON(stdout, []);
      if (!Array.isArray(data)) data = [data];

      disks = data
        .filter(d => d.Size && d.FreeSpace)
        .map(drive => {
          const size = parseInt(drive.Size);
          const free = parseInt(drive.FreeSpace);
          const used = size - free;

          return {
            drive: drive.DeviceID,
            totalSize: (size / 1024 ** 3).toFixed(2) + " GB",
            freeSpace: (free / 1024 ** 3).toFixed(2) + " GB",
            usedSpace: (used / 1024 ** 3).toFixed(2) + " GB",
            usagePercent: size
              ? ((used / size) * 100).toFixed(2) + "%"
              : "N/A"
          };
        });
    } else if (process.platform === "darwin") {
      // ✅ macOS: Use `df -h` to get disk usage
      const output = execSync("df -h | grep '/dev/'", { encoding: "utf8" });
      const lines = output.trim().split("\n");

      disks = lines
        .map((line) => {
          const parts = line.split(/\s+/);
          if (parts.length < 6) return null; // Skip invalid lines

          return {
            drive: parts[0],
            totalSize: parts[1],
            freeSpace: parts[3],
            usedSpace: parts[2],
            usagePercent: parts[4],
          };
        })
        .filter(Boolean); // Remove null values
    } else if (process.platform === "linux") {
      // ✅ Linux: Use `df -h --output` to get disk usage
      const output = execSync(
        "df -B1 --output=source,size,used,avail,pcent | grep '^/'",
        { encoding: "utf8" }
      );
      const lines = output.trim().split("\n");

      disks = lines
        .map((line) => {
          const parts = line.split(/\s+/);
          if (parts.length < 5) return null; // Skip invalid lines

          return {
            drive: parts[0],
            totalSize: `${(parseInt(parts[1]) / 1024 ** 3).toFixed(2)} GB`,
            usedSpace: `${(parseInt(parts[2]) / 1024 ** 3).toFixed(2)} GB`,
            freeSpace: `${(parseInt(parts[3]) / 1024 ** 3).toFixed(2)} GB`,
            usagePercent: parts[4],
          };
        })
        .filter(Boolean); // Remove null values
    } else {
      return [{ error: "Unsupported OS" }];
    }

    return disks.length ? disks : [{ error: "No disks found" }];
  } catch (error) {
    writeLog("ERROR", "❌ Error retrieving disk usage", {
      error: error?.message || error,
    });
    return [{ error: error.message }];
  }
};

export const getNetworkActivity = async () => {
  try {
    const networkInterfaces = os.networkInterfaces();
    let activity = [];

    for (const interfaceName of Object.keys(networkInterfaces)) {
      const ifaceList = networkInterfaces[interfaceName];

      for (const iface of ifaceList) {
        if (!iface.internal && iface.family === "IPv4") {
          let sentBytes = "N/A";
          let receivedBytes = "N/A";

          try {
            if (os.platform() === "win32") {
              // ✅ Windows: Get network usage with netsh
              const { stdout: netshOutput } = await execAsync(
                `netsh interface ipv4 show interfaces | findstr /C:"${interfaceName}"`,
                { encoding: "utf-8" }
              );
              const stats = netshOutput.trim().split(/\s+/);
              receivedBytes = stats[2] ? `${parseInt(stats[2])} bytes` : "N/A";
              sentBytes = stats[3] ? `${parseInt(stats[3])} bytes` : "N/A";
            } else if (os.platform() === "darwin") {
              // ✅ macOS/Linux: Get network usage with ifconfig
              const rxBytes = execSync(
                `cat /sys/class/net/${interfaceName}/statistics/rx_bytes`,
                { encoding: "utf-8" }
              ).trim();
              const txBytes = execSync(
                `cat /sys/class/net/${interfaceName}/statistics/tx_bytes`,
                { encoding: "utf-8" }
              ).trim();
              receivedBytes = `${parseInt(rxBytes)} bytes`;
              sentBytes = `${parseInt(txBytes)} bytes`;
            } else if (os.platform() === "linux") {
              // ✅ Linux (Ubuntu, Debian, CentOS): Use /sys/class/net
              const rxPath = `/sys/class/net/${interfaceName}/statistics/rx_bytes`;
              const txPath = `/sys/class/net/${interfaceName}/statistics/tx_bytes`;

              if (fs.existsSync(rxPath) && fs.existsSync(txPath)) {
                receivedBytes = `${parseInt(
                  fs.readFileSync(rxPath, "utf-8").trim()
                )} bytes`;
                sentBytes = `${parseInt(
                  fs.readFileSync(txPath, "utf-8").trim()
                )} bytes`;
              }
            }
          } catch (error) {

          }
          activity.push({
            interface: interfaceName,
            ipAddress: iface.address,
            macAddress: iface.mac,
            netmask: iface.netmask,
            receivedBytes,
            sentBytes,
          });
        }
      }
    }

    return activity.length
      ? activity
      : [{ error: "No active network interfaces found" }];
  } catch (error) {
    return [{ error: error.message }];
  }
};

export const getProcesses = async () => {
  try {
    let processes = [];

    if (os.platform() === "win32") {
      const { stdout } = await execAsync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object Name,ProcessId,WorkingSetSize | ConvertTo-Json -Compress"`
      );

      if (!stdout || !stdout.trim()) {
        return [];
      }

      let data = safeParseJSON(stdout, []);
      if (!Array.isArray(data)) data = [data];

      processes = data
        .filter(proc => proc.Name && proc.ProcessId)
        .map(proc => ({
          name: proc.Name,
          processId: proc.ProcessId,
          memoryUsage: proc.WorkingSetSize
            ? (parseInt(proc.WorkingSetSize) / 1024 ** 2).toFixed(2) + " MB"
            : "N/A"
        }));
    } else if (os.platform() === "darwin") {
      // ✅ macOS & Linux: Use `ps` command to fetch process details
      const output = execSync("ps -eo pid,comm,rss", { encoding: "utf8" });
      const lines = output.split("\n").filter((line) => line.trim() !== "");

      processes = lines.slice(1).map((line) => {
        const parts = line.trim().split(/\s+/);
        const processId = parts.shift(); // First column is PID
        const name = parts.slice(0, -1).join(" "); // Process name
        const memoryUsageKB = parts.pop(); // Last column is RSS (Resident Set Size)

        return {
          name,
          processId: parseInt(processId) || "N/A",
          memoryUsage: memoryUsageKB
            ? (parseInt(memoryUsageKB) / 1024).toFixed(2) + " MB"
            : "N/A",
        };
      });
    } else if (os.platform() === "linux") {
      // ✅ macOS & Linux: Use `ps` command to fetch process details
      const output = execSync("ps -eo pid,comm,rss --no-headers", {
        encoding: "utf8",
      });
      const lines = output.split("\n").filter((line) => line.trim() !== "");

      processes = lines.map((line) => {
        const parts = line.trim().split(/\s+/);
        const processId = parts.shift();
        const memoryUsageKB = parts.pop();
        const name = parts.join(" ");

        return {
          name,
          processId: parseInt(processId) || "N/A",
          memoryUsage: memoryUsageKB
            ? (parseInt(memoryUsageKB) / 1024).toFixed(2) + " MB"
            : "N/A",
        };
      });
    } else {
      return [{ error: "Unsupported OS" }];
    }

    return processes;
  } catch (error) {
    return [{ error: error.message }];
  }
};

export const getPorts = async () => {
  try {
    let ports = [];

    if (os.platform() === "win32") {
      // ✅ Windows: use netstat
      const { stdout } = await execAsync("netstat -ano", { encoding: "utf8" });
      const lines = stdout.split("\n").filter((line) => line.trim().startsWith("TCP") || line.trim().startsWith("UDP"));

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 4) continue;

        const protocol = parts[0];
        const localAddress = parts[1];
        const foreignAddress = parts[2];
        const state = protocol.startsWith("TCP") ? parts[3] : "LISTEN";
        const pid = protocol.startsWith("TCP") ? parts[4] : parts[3];

        // Extract port numbers
        const localPort = localAddress.split(":").pop();
        const foreignPort = foreignAddress.split(":").pop();

        // Get process name using PID
        let processName = "Unknown";
        try {
          const { stdout: pname } = await execAsync(`
  powershell -NoProfile -Command "
  (Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').Name
  "
`);
          processName = pname.trim() || "System";
        } catch {
          processName = "System";
        }

        ports.push({
          portNo: localPort || "N/A",
          processName,
          processId: pid || "N/A",
          localAddress,
          foreignAddress,
          foreignPort,
          protocol,
          state,
        });
      }
    } else if (os.platform() === "linux" || os.platform() === "darwin") {
      // ✅ Linux/macOS: use netstat or ss
      let output;
      try {
        output = execSync("ss -tunap", { encoding: "utf8" });
      } catch {
        output = execSync("netstat -tunap", { encoding: "utf8" });
      }

      const lines = output.split("\n").filter((line) => line.match(/tcp|udp/i));

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) continue;

        const protocol = parts[0].toUpperCase();
        const local = parts[3];
        const remote = parts[4];
        const state = parts[1] || "LISTEN";

        const pidProc = parts[parts.length - 1];
        const [pid, processName] = pidProc.includes("/")
          ? pidProc.split("/")
          : ["N/A", "Unknown"];

        const localPort = local.split(":").pop();
        const remotePort = remote.split(":").pop();

        ports.push({
          portNo: localPort || "N/A",
          processName,
          processId: pid,
          localAddress: local.split(":")[0],
          foreignAddress: remote.split(":")[0],
          foreignPort: remotePort,
          protocol,
          state,
        });
      }
    }

    return ports.length ? ports : [{ error: "No ports found" }];
  } catch (error) {
    return [{ error: error.message }];
  }
};


export const gatherTaskmangerInfo = async () => {
  try {
    const [cpuUsage, memoryUsage, diskUsage, networkActivity, processes, ports] =
      await Promise.all([
        getCpuUsage(),
        getMemoryUsage(),
        getDiskUsage(),
        getNetworkActivity(),
        getProcesses(),
        getPorts(),
      ]);
    const assetID = storageService.getAssetId();
    const companyToken = storageService.getCompanyToken();
    const taskManagerData = {
      assetID: assetID,
      companyToken: companyToken,
      cpuUsage,
      memoryUsage,
      diskUsage,
      networkActivity,
      processes,
      ports,
    };

    return taskManagerData; // Return the data instead of writing it to a file
  } catch (error) {
    writeLog("ERROR", "Error gathering system information", {
      error: error?.message || error,
    });
  }
};
