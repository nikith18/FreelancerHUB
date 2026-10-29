const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const clientDirectory = path.join(root, "client");
const serverDirectory = path.join(root, "server");
const viteCli = path.join(clientDirectory, "node_modules", "vite", "bin", "vite.js");
const processes = [];
let stopping = false;

function stopAll(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of processes) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

function start(label, executable, args, cwd) {
  const child = spawn(executable, args, { cwd, stdio: "inherit", windowsHide: true });
  processes.push(child);
  child.once("error", (error) => {
    console.error(`${label} could not start: ${error.message}`);
    stopAll(1);
  });
  child.once("exit", (code, signal) => {
    if (!stopping) {
      const exitCode = code ?? (signal ? 1 : 0);
      if (exitCode !== 0) console.error(`${label} stopped unexpectedly.`);
      stopAll(exitCode);
    }
  });
}

process.once("SIGINT", () => stopAll(0));
process.once("SIGTERM", () => stopAll(0));

console.log("Starting FreelancerHub API and web client. Press Ctrl+C to stop both.");
start("API", process.execPath, [path.join(serverDirectory, "server.js")], serverDirectory);
start("Client", process.execPath, [viteCli, "--host", "127.0.0.1"], clientDirectory);
