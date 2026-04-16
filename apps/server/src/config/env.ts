import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const fallbackMasterKey = Buffer.alloc(32, 7).toString("base64");

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://postgres:postgres@localhost:5432/pm2_log_viewer?schema=public"),
  MASTER_KEY: z.string().min(1).default(fallbackMasterKey),
  JWT_ACCESS_SECRET: z.string().min(16).default("dev-access-secret-change-me"),
  JWT_REFRESH_SECRET: z.string().min(16).default("dev-refresh-secret-change-me"),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: z.coerce.boolean().default(false),
  APP_PORT: z.coerce.number().int().positive().default(3000),
  LOG_BUFFER_MAX_LINES: z.coerce.number().int().positive().default(2000),
  CORS_ORIGIN: z.string().default("http://localhost:5173")
});

const parsed = rawEnvSchema.parse(process.env);
const masterKeyBuffer = Buffer.from(parsed.MASTER_KEY, "base64");

if (masterKeyBuffer.length !== 32) {
  throw new Error("MASTER_KEY must decode to 32 bytes for AES-256-GCM.");
}

if (parsed.NODE_ENV === "production") {
  if (
    parsed.MASTER_KEY === fallbackMasterKey ||
    parsed.JWT_ACCESS_SECRET === "dev-access-secret-change-me" ||
    parsed.JWT_REFRESH_SECRET === "dev-refresh-secret-change-me"
  ) {
    throw new Error("Production requires explicit MASTER_KEY and JWT secrets.");
  }
}

export const env = {
  ...parsed,
  masterKeyBuffer
};

