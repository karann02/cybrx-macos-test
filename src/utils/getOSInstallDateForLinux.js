import { promisify } from "util";
import { exec } from "child_process";
const execAsync = promisify(exec);

const runCmdAsync = async (cmd) => {
  try {
    const { stdout } = await execAsync(cmd);
    return stdout.trim();
  } catch {
    return "";
  }
};

export const getLinuxInstallDate = async () => {
  let out = await runCmdAsync("stat -c %y /var/log/installer 2>/dev/null");
  if (out) return out.split(" ")[0];

  out = await runCmdAsync("stat -c %y /root/anaconda-ks.cfg 2>/dev/null");
  if (out) return out.split(" ")[0];

  out = await runCmdAsync("stat / | grep -i birth");
  if (out) {
    const birth = out.split("Birth:")[1]?.trim();
    if (birth && birth !== "-") {
      return birth.split(" ")[0];
    }
  }

  out = await runCmdAsync("stat -c %y /var/lib/systemd 2>/dev/null");
  if (out) return out.split(" ")[0];

  return "Unknown";
};