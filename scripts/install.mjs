#!/usr/bin/env node
import { execSync } from "child_process";
import { existsSync, copyFileSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function run(cmd, env) {
  console.log("\n> " + cmd + "\n");
  execSync(cmd, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: env ?? process.env,
  });
}

function main() {
  const installEnv = { ...process.env };
  if (installEnv.NODE_ENV === "production") {
    console.warn("[install] NODE_ENV=production would omit devDependencies — unsetting for npm install.");
    delete installEnv.NODE_ENV;
  }

  const maj = parseInt(process.versions.node.split(".")[0], 10);
  if (maj < 20) {
    console.error("Node.js 20+ required.");
    process.exit(1);
  }

  const dataDir = join(root, "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
    console.log("[install] Created data/ for SQLite");
  }

  run("npm install", installEnv);

  try {
    run("npm rebuild better-sqlite3", installEnv);
    console.log("[install] better-sqlite3 rebuild OK");
  } catch {
    console.warn("[install] npm rebuild better-sqlite3 failed — if startup errors, try: npm rebuild better-sqlite3 --build-from-source");
  }

  const envPath = join(root, ".env");
  const examplePath = join(root, ".env.example");
  if (!existsSync(envPath) && existsSync(examplePath)) {
    copyFileSync(examplePath, envPath);
    console.log("[install] Created .env from .env.example");
  }

  if (existsSync(envPath)) {
    let env = readFileSync(envPath, "utf8");
    if (!/^TITAN_ENCRYPTION_KEY=[a-fA-F0-9]{64}/m.test(env)) {
      const key = crypto.randomBytes(32).toString("hex");
      if (/^TITAN_ENCRYPTION_KEY=/m.test(env)) {
        env = env.replace(/^TITAN_ENCRYPTION_KEY=.*$/m, "TITAN_ENCRYPTION_KEY=" + key);
      } else {
        env += "\nTITAN_ENCRYPTION_KEY=" + key + "\n";
      }
      writeFileSync(envPath, env);
      console.log("[install] Set TITAN_ENCRYPTION_KEY in .env");
    }
  }

  try {
    run("npm run db:push", installEnv);
  } catch {
    console.warn("[install] db:push failed — run npm run db:push manually.");
  }

  console.log("\nDone. Next steps:");
  console.log("  1. Add Alpaca API keys in Settings (paper recommended).");
  console.log("  2. Run Ollama: ollama serve  (and pull a model, e.g. ollama pull llama3.2)");
  console.log("  3. npm run dev  → http://127.0.0.1:5000");
  console.log("  4. Click START in the sidebar after saving watchlist + Ollama URL/model.\n");
}

main();
