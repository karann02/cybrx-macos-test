import os from "os";
import { getWindowsInfo } from "../services/systemInfoService.js";
import crypto from "crypto";
 

export const generateUniqueID = async () => {
  try {
    const hostname = os.hostname(); // Get the hostname of the computer
    const category = "Desktop"; // Replace with the actual category
    const year = new Date().getFullYear(); // Replace with the actual year
    const { productID } = await getWindowsInfo(); // Replace with the actual produc

    const timestamp = Date.now(); // Ensure uniqueness with timestamp
    const combined = `${hostname}-${category}-${year}-${productID}-${timestamp}`;

   
    const newID = crypto
      .createHash("sha256")
      .update(combined)
      .digest("hex")
      .substring(0, 30); // Return first 30 characters of the hash
    return newID;
  } catch (error) { 
    return null;
  }
};

// await generateUniqueID();
