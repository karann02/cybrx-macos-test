
import readline from "readline";

export async function promptForTokenLinux() {
  console.log("promptForTokenLinux ::promptForTokenLinux:::>  Function Call")
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question("🔐 Enter your Company Token: ", (input) => {
      rl.close();
      resolve(input.trim());
    });
  });
}