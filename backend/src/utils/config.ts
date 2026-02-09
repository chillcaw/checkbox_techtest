import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  // Added default for testing
  DATABASE_URL: z.string().url().default('postgres://matter:matter@postgres:5432/matter_db'),
  PORT: z.string().transform(Number).default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SLA_THRESHOLD_HOURS: z.string().transform(Number).default('8'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export const config = configSchema.parse(process.env);

export default config;
