import { randomBytes } from 'node:crypto';

process.env.DEMO_SEED_PASSWORD ??= randomBytes(24).toString('base64');
