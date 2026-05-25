//#region getDriveInfo
const getDriveType = async (type, platform) => {
  if (platform === "win32") {
    const types = {
      0: "Unknown",
      1: "No Root Directory",
      2: "Removable Drive (USB, SD Card, etc.)",
      3: "Local Disk (HDD, SSD)",
      4: "Network Drive",
      5: "CD/DVD",
      6: "RAM Disk",
    };
    return types[type] || "Unknown";
  }
  return type; // macOS & Linux will return "Local Disk", "USB Drive", etc.
};

export default getDriveType;
