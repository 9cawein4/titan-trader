import fs from "fs";
import path from "path";

/** Default SQLite file for single-user local installs (project-relative). */
export const DEFAULT_DB_PATH = path.join("data", "titan.db");

/** Resolve DB path from env and ensure parent directory exists. */
export function resolveDbPath(): string {
  const dbPath = process.env.TITAN_DB_PATH || DEFAULT_DB_PATH;
  const dir = path.dirname(path.resolve(dbPath));
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dbPath;
}
