import os from "os";
import path from "path";
import { readFileSync } from "fs";
import WinReg from "winreg";

export const readCompanyTokenFromRegistry = async () => {
  if (os.platform() !== "win32") { 
    return null;
  }

  const is64BitOS = os.arch() === "x64";

  // Dynamically read `name` from package.json
  const appPackageJson = JSON.parse(
    readFileSync(path.join(process.cwd(), "package.json"), "utf8")
  );
  const appName = appPackageJson?.build?.productName ?? null;

  if (!appName) throw new Error("App name not found in package.json"); 

  const REG_PATHS = is64BitOS
    ? [`\\Software\\${appName}`, `\\Software\\WOW6432Node\\${appName}`]
    : [`\\Software\\${appName}`];

  for (const path of REG_PATHS) {
    const reg = new WinReg({
      hive: WinReg.HKLM,
      key: path,
    });

    try {
      const value = await new Promise((resolve, reject) => {
        reg.get("CompanyToken", (err, item) => {
          if (err || !item?.value) return resolve(null); // Don't reject, just skip
          resolve(item.value);
        });
      });

      if (value) return value;
    } catch (err) { 
      continue; // Try the next path
    }
  }

  return null; // Token not found in any path
};
