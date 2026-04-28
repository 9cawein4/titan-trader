import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { resolveDbPath } from "./server/paths";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: resolveDbPath(),
  },
});