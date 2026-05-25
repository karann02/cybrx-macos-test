// testEncryptionFlow.js
import crypto from "crypto";

import { writeLog } from "./logService.js";
// --------------------------
// 1. Generate temp RSA key pair
// --------------------------
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

// --------------------------
// 2. Example payload (like your agent data)
// --------------------------
const sampleData = {
	"assetName": "Karnnn",
	"alias": "Alias-Karnnn-2025",
	"assetID": "a3e7bf156ba82b537b89633647e02f",
	"companyToken": "audixtechnologies-58460f5333c2f5079edda3",
	"productID": "00379-20000-00001-AAOEM",
	"category": "Laptop",
	"CommonProperties": {
		"hostname": "Karnnn",
		"alias": "Alias-Karnnn-2025",
		"ipAddress": "192.168.56.1, 192.168.68.160",
		"systemMake": "Dell Inc.",
		"systemModel": "Latitude 5490",
		"serialNumber": "9R69VN2"
	},
	"OSProperties": {
		"osName": "Windows 11 Pro Education",
		"osVersion": "10.0.26200",
		"osServicePack": "Windows 11 Pro Education",
		"osInstallDate": "28-03-2025",
		"osInstalledBy": "ADMIN",
		"lastBootUpTime": "2025-10-31 11:12:01",
		"bootDevice": "\\Device\\HarddiskVolume1",
		"windowsDirectory": "C:\\WINDOWS",
		"systemDirectory": "C:\\WINDOWS\\system32",
		"productKey": "PVM7C-Y3NXT-HD92W-F224M-CWF9D",
		"productID": "00379-20000-00001-AAOEM",
		"buildNumber": "26200",
		"installDate": "28-03-2025",
		"virtualMemory": "21.00 GB"
	},
	"BIOSProperties": {
		"manufacturer": "Dell",
		"biosVersion": "1.38.0",
		"installDate": "06-11-2024"
	},
	"CPUProperties": {
		"cpuModel": "Intel(R) Core(TM) i5-8350U CPU @ 1.70GHz",
		"cpuSpeed": "1.90 GHz",
		"logicalProcessors": 8,
		"cpuStepping": "N/A",
		"cpuCoresCount": 4
	},
	"diskProperties": [
		{
			"driveName": "C:",
			"volumeName": "No Label",
			"driveCapacity": "237.48 GB",
			"freeSpace": "27.61 GB",
			"usedSpace": "209.87 GB",
			"driveType": "Local Disk (HDD, SSD)",
			"fileSystem": "NTFS",
			"serialNumber": "EE95AEE1"
		}
	],
	"MonitorProperties": {
		"caption": "Unknown",
		"resolution": "Unknown",
		"status": "Unknown"
	},
	"KeyboardProperties": {
		"keyboardType": "Standard PS/2 Keyboard",
		"keyboardSerialNumber": "ACPI\\DLLK0816\\4&60E9DDF&0"
	},
	"MouseProperties": {
		"mouseSerialNumber": "\"USB\\VID_1C4F&PID_0048\\5&34C481A1&0&9\"",
		"numberOfButtons": "\"0\"\r"
	},
	"DriverDetails": [
		{
			"deviceName": "Local Print Queue",
			"manufacturer": "Microsoft",
			"driverVersion": "10.0.26100.1",
			"driverProviderName": "Microsoft",
			"infName": "printqueue.inf"
		},
		{
			"deviceName": "Local Print Queue",
			"manufacturer": "Microsoft",
			"driverVersion": "10.0.26100.1",
			"driverProviderName": "Microsoft",
			"infName": "printqueue.inf"
		}
	],
	"ProcessorDetails": {
		"name": "Intel(R) Core(TM) i5-8350U CPU @ 1.70GHz",
		"manufacturer": "GenuineIntel",
		"numberOfCores": 4,
		"logicalProcessors": 8,
		"maxClockSpeed": "1.90 GHz",
		"uUID": "4C4C4544-0052-3610-8039-B9C04F564E32"
	},
	"DiskDrive": {
		"model": "SAMSUNG MZVLB256HAHQ-000L7",
		"size": "238.47 GB",
		"mediaType": "SSD",
		"healthStatus": "Healthy"
	},
	"USBController": [
		{
			"name": "Intel(R) USB 3.0 eXtensible Host Controller - 1.0 (Microsoft)",
			"deviceID": "PCI\\VEN_8086&DEV_9D2F&SUBSYS_08161028&REV_21\\3&1158365..."
		}
	],
	"BaseBoardDetail": {
		"manufacturer": "Dell Inc.",
		"product": "0JGGTN",
		"serialNumber": "/9R69VN2/CNCMK0085S027C/",
		"version": "A00",
		"tag": "Base Board",
		"productID": ""
	},
	"PrinterDetails": [
		{
			"printerName": "Fax",
			"driverName": "Microsoft Shared Fax Driver",
			"portName": "SHRFAX:",
			"isShared": "No",
			"isDefault": "No"
		},
		{
			"printerName": "Microsoft Print to PDF",
			"driverName": "Microsoft Print To PDF",
			"portName": "PORTPROMPT:",
			"isShared": "No",
			"isDefault": "No"
		} 
	],
	"SoundCard": [
		{
			"name": "Realtek Audio",
			"manufacturer": "Realtek",
			"status": "OK",
			"deviceID": "INTELAUDIO\\FUNC_01&VEN_10EC&DEV_0256&SUBSYS_10280816&REV_1000\\4&276799F&0&0001"
		},
		{
			"name": "Intel(R) Display Audio",
			"manufacturer": "Intel(R) Corporation",
			"status": "OK",
			"deviceID": "INTELAUDIO\\FUNC_01&VEN_8086&DEV_280B&SUBSYS_80860101&REV_1000\\4&276799F&0&0201"
		}
	],
	"VideoCard": [
		{
			"name": "NVIDIA GeForce MX130",
			"memorySize": "2048 MB",
			"driverVersion": "32.0.15.7344",
			"status": "OK",
			"deviceID": "PCI\\VEN_10DE&DEV_174D&SUBSYS_08161028&REV_A2\\4&2D0E14ED&0&00E4"
		},
		{
			"name": "Intel(R) UHD Graphics 620",
			"memorySize": "1024 MB",
			"driverVersion": "31.0.101.2134",
			"status": "OK",
			"deviceID": "PCI\\VEN_8086&DEV_5917&SUBSYS_08161028&REV_07\\3&11583659&0&10"
		}
	],
	"installSoftwareList": [
		{
			"applicationName": "7-Zip 25.01 (x64)",
			"version": "25.01",
			"softwareLocation": "C:\\Program Files\\7-Zip\\",
			"softwareType": "Utility",
			"manufacturer": "Igor Pavlov",
			"installDate": "Unknown",
			"expiryDate": "Unknown",
			"licenseType": "Free"
		},
		{
			"applicationName": "Git",
			"version": "2.49.0",
			"softwareLocation": "C:\\Program Files\\Git\\",
			"softwareType": "Developer Tool",
			"manufacturer": "The Git Development Community",
			"installDate": "Unknown",
			"expiryDate": "Unknown",
			"licenseType": "Free"
		},
		{
			"applicationName": "Microsoft SQL Server 2022 (64-bit)",
			"version": "Unknown",
			"softwareLocation": "Unknown",
			"softwareType": "Database",
			"manufacturer": "Unknown",
			"installDate": "Unknown",
			"expiryDate": "Unknown",
			"licenseType": "Unknown"
		},
		{
			"applicationName": "Microsoft SQL Server 2022 (64-bit)",
			"version": "Unknown",
			"softwareLocation": "Unknown",
			"softwareType": "Database",
			"manufacturer": "Microsoft Corporation",
			"installDate": "Unknown",
			"expiryDate": "Unknown",
			"licenseType": "Unknown"
		},
		{
			"applicationName": "@C:\\Windows\\System32\\mspaint.exe,-57344",
			"version": "Unknown",
			"softwareLocation": "C:\\Windows\\System32\\",
			"softwareType": "Application",
			"manufacturer": "Microsoft Corporation",
			"installDate": "Unknown",
			"expiryDate": "Unknown",
			"licenseType": "Unknown"
		},
		{
			"applicationName": "@C:\\Windows\\System32\\mstsc.exe,-4000",
			"version": "Unknown",
			"softwareLocation": "C:\\Windows\\System32\\",
			"softwareType": "Application",
			"manufacturer": "Microsoft Corporation",
			"installDate": "Unknown",
			"expiryDate": "Unknown",
			"licenseType": "Unknown"
		} ,
		{
			"applicationName": "Microsoft Visual Studio Code (User)",
			"version": "1.105.1",
			"softwareLocation": "C:\\Users\\ADMIN\\AppData\\Local\\Programs\\Microsoft VS Code\\",
			"softwareType": "Application",
			"manufacturer": "Microsoft Corporation",
			"installDate": "Unknown",
			"expiryDate": "Unknown",
			"licenseType": "Free"
		}
	],
	"SystemEnvironment": {
		"ALLUSERSPROFILE": "C:\\ProgramData",
		"APPDATA": "C:\\Users\\ADMIN\\AppData\\Roaming",
		"ChocolateyInstall": "C:\\ProgramData\\chocolatey",
		"ChocolateyLastPathUpdate": "134024985202416921",
		"CHROME_CRASHPAD_PIPE_NAME": "\\\\.\\pipe\\crashpad_20816_VFWPNYCQEWYZTAGW",
		"COLOR": "1",
		"COLORTERM": "truecolor",
		"CommonProgramFiles": "C:\\Program Files\\Common Files",
		"CommonProgramFiles(x86)": "C:\\Program Files (x86)\\Common Files",
		"CommonProgramW6432": "C:\\Program Files\\Common Files",
		"COMPUTERNAME": "KARNNN",
		"ComSpec": "C:\\WINDOWS\\system32\\cmd.exe",
		"DriverData": "C:\\Windows\\System32\\Drivers\\DriverData",
		"EDITOR": "C:\\WINDOWS\\notepad.exe",
		"EFC_4736_1262719628": "1",
		"EFC_4736_1592913036": "1",
		"EFC_4736_2283032206": "1",
		"EFC_4736_2775293581": "1",
		"EFC_4736_3789132940": "1",
		"FPS_BROWSER_APP_PROFILE_STRING": "Internet Explorer",
		"FPS_BROWSER_USER_PROFILE_STRING": "Default",
		"GIT_ASKPASS": "c:\\Users\\ADMIN\\AppData\\Local\\Programs\\Microsoft VS Code\\resources\\app\\extensions\\git\\dist\\askpass.sh",
		"HOME": "C:\\Users\\ADMIN",
		"HOMEDRIVE": "C:",
		"HOMEPATH": "\\Users\\ADMIN",
		"INIT_CWD": "C:\\AudixAgent_Final_8.0.0",
		"LANG": "en_US.UTF-8",
		"LOCALAPPDATA": "C:\\Users\\ADMIN\\AppData\\Local",
		"LOGONSERVER": "\\\\KARNNN",
		"NODE": "C:\\Program Files\\nodejs\\node.exe",
		"npm_command": "run-script",
		"npm_config_cache": "C:\\Users\\ADMIN\\AppData\\Local\\npm-cache",
		"npm_config_globalconfig": "C:\\Users\\ADMIN\\AppData\\Roaming\\npm\\etc\\npmrc",
		"npm_config_global_prefix": "C:\\Users\\ADMIN\\AppData\\Roaming\\npm",
		"npm_config_init_module": "C:\\Users\\ADMIN\\.npm-init.js",
		"npm_config_local_prefix": "C:\\AudixAgent_Final_8.0.0",
		"npm_config_node_gyp": "C:\\Program Files\\nodejs\\node_modules\\npm\\node_modules\\node-gyp\\bin\\node-gyp.js",
		"npm_config_noproxy": "",
		"npm_config_npm_version": "10.9.2",
		"npm_config_prefix": "C:\\Users\\ADMIN\\AppData\\Roaming\\npm",
		"npm_config_userconfig": "C:\\Users\\ADMIN\\.npmrc",
		"npm_config_user_agent": "npm/10.9.2 node/v22.14.0 win32 x64 workspaces/false",
		"npm_execpath": "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
		"npm_lifecycle_event": "start",
		"npm_lifecycle_script": "electron .",
		"npm_node_execpath": "C:\\Program Files\\nodejs\\node.exe",
		"npm_package_json": "C:\\AudixAgent_Final_8.0.0\\package.json",
		"npm_package_name": "CybrxAgent",
		"npm_package_version": "1.0.0",
		"NUMBER_OF_PROCESSORS": "8",
		"OneDrive": "C:\\Users\\ADMIN\\OneDrive",
		"ORIGINAL_XDG_CURRENT_DESKTOP": "undefined",
		"OS": "Windows_NT",
		"Path": "C:\\AudixAgent_Final_8.0.0\\node_modules\\.bin;C:\\node_modules\\.bin;C:\\Program Files\\nodejs\\node_modules\\npm\\node_modules\\@npmcli\\run-script\\lib\\node-gyp-bin;C:\\WINDOWS\\system32;C:\\WINDOWS;C:\\WINDOWS\\System32\\Wbem;C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\;C:\\WINDOWS\\System32\\OpenSSH\\;C:\\Program Files\\nodejs\\;C:\\Program Files\\Git\\cmd;C:\\Program Files\\Microsoft SQL Server\\160\\Tools\\Binn\\;C:\\Program Files (x86)\\Microsoft SQL Server\\160\\Tools\\Binn\\;C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\170\\Tools\\Binn\\;C:\\Program Files\\Microsoft SQL Server\\160\\DTS\\Binn\\;C:\\Program Files (x86)\\Microsoft SQL Server\\160\\DTS\\Binn\\;C:\\usr\\bin;C:\\ProgramData\\chocolatey\\bin;C:\\Users\\ADMIN\\AppData\\Local\\Programs\\Python\\Python310\\Scripts\\;C:\\Users\\ADMIN\\AppData\\Local\\Programs\\Python\\Python310\\;C:\\Users\\ADMIN\\AppData\\Local\\Microsoft\\WindowsApps;C:\\Users\\ADMIN\\AppData\\Local\\Programs\\Microsoft VS Code\\bin;C:\\Users\\ADMIN\\AppData\\Roaming\\npm;C:\\Program Files (x86)\\Nmap;C:\\Users\\ADMIN\\AppData\\Local\\GitHubDesktop\\bin;C:\\Users\\ADMIN\\AppData\\Local\\Programs\\Windsurf\\bin;c:\\Users\\ADMIN\\AppData\\Roaming\\Code\\User\\globalStorage\\github.copilot-chat\\debugCommand",
		"PATHEXT": ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC;.CPL",
		"PROCESSOR_ARCHITECTURE": "AMD64",
		"PROCESSOR_IDENTIFIER": "Intel64 Family 6 Model 142 Stepping 10, GenuineIntel",
		"PROCESSOR_LEVEL": "6",
		"PROCESSOR_REVISION": "8e0a",
		"ProgramData": "C:\\ProgramData",
		"ProgramFiles": "C:\\Program Files",
		"ProgramFiles(x86)": "C:\\Program Files (x86)",
		"ProgramW6432": "C:\\Program Files",
		"PROMPT": "$P$G",
		"PSModulePath": "C:\\Users\\ADMIN\\OneDrive\\Documents\\WindowsPowerShell\\Modules;C:\\Program Files\\WindowsPowerShell\\Modules;C:\\WINDOWS\\system32\\WindowsPowerShell\\v1.0\\Modules;C:\\Program Files (x86)\\Microsoft SQL Server\\160\\Tools\\PowerShell\\Modules\\",
		"PUBLIC": "C:\\Users\\Public",
		"SESSIONNAME": "Console",
		"SystemDrive": "C:",
		"SystemRoot": "C:\\WINDOWS",
		"TEMP": "C:\\Users\\ADMIN\\AppData\\Local\\Temp",
		"TERM_PROGRAM": "vscode",
		"TERM_PROGRAM_VERSION": "1.105.1",
		"TMP": "C:\\Users\\ADMIN\\AppData\\Local\\Temp",
		"USERDOMAIN": "KARNNN",
		"USERDOMAIN_ROAMINGPROFILE": "KARNNN",
		"USERNAME": "ADMIN",
		"USERPROFILE": "C:\\Users\\ADMIN",
		"VBOX_MSI_INSTALL_PATH": "C:\\Program Files\\Oracle\\VirtualBox\\",
		"VSCODE_GIT_ASKPASS_EXTRA_ARGS": "",
		"VSCODE_GIT_ASKPASS_MAIN": "c:\\Users\\ADMIN\\AppData\\Local\\Programs\\Microsoft VS Code\\resources\\app\\extensions\\git\\dist\\askpass-main.js",
		"VSCODE_GIT_ASKPASS_NODE": "C:\\Users\\ADMIN\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
		"VSCODE_GIT_IPC_HANDLE": "\\\\.\\pipe\\vscode-git-ddc53fbd82-sock",
		"VSCODE_INJECTION": "1",
		"VSCODE_PYTHON_AUTOACTIVATE_GUARD": "1",
		"windir": "C:\\WINDOWS",
		"ZES_ENABLE_SYSMAN": "1"
	},
	"SoftwareInventory": [
		{
			"name": "KB5067931",
			"vendor": "Microsoft",
			"type": "Hotfix",
			"installDate": "29 October 2025 00:00:00"
		},
		{
			"name": "KB5054156",
			"vendor": "Microsoft",
			"type": "Hotfix",
			"installDate": "28 October 2025 00:00:00"
		},
		{
			"name": "KB5067036",
			"vendor": "Microsoft",
			"type": "Hotfix",
			"installDate": "29 October 2025 00:00:00"
		},
		{
			"name": "KB5067035",
			"vendor": "Microsoft",
			"type": "Hotfix",
			"installDate": "29 October 2025 00:00:00"
		}
	]
};

// --------------------------
// 3. Encrypt payload (agent-side simulation)
// --------------------------
function encryptPayload(data, publicKey) {
  const jsonString = JSON.stringify(data);
  const aesKey = crypto.randomBytes(32); // AES-256 key
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
  let encryptedData = cipher.update(jsonString, "utf8", "base64");
  encryptedData += cipher.final("base64");
  const authTag = cipher.getAuthTag().toString("base64");

  const encryptedKey = crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    aesKey
  );

  return {
    encryptedKey: encryptedKey.toString("base64"),
    iv: iv.toString("base64"),
    authTag,
    data: encryptedData,
  };
}

// --------------------------
// 4. Decrypt payload (server-side simulation)
// --------------------------
function decryptPayload(payload, privateKey) {
  const aesKey = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(payload.encryptedKey, "base64")
  );

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    aesKey,
    Buffer.from(payload.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));

  let decrypted = decipher.update(payload.data, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted);
}

// --------------------------
// 5. Run test
// --------------------------
const encrypted = encryptPayload(sampleData, publicKey);
 writeLog("INFO", "Encrypted payload",encrypted ); 

const decrypted = decryptPayload(encrypted, privateKey); 
