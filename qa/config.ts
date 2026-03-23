// QA environment configuration
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const QA_CONFIG = {
  baseUrl: process.env.QA_BASE_URL || 'http://localhost:5000',
  timeout: 10_000,
  serverDir: join(__dirname, '..', 'server'),
  clientDir: join(__dirname, '..', 'client', 'src'),
  sharedDir: join(__dirname, '..', 'shared'),
  repoRoot: join(__dirname, '..'),

  // Asana project where bugs are filed
  asanaProjectId: '1213750784915547',
  asanaApiKey: process.env.ASANA_API_KEY || '',

  // Dev user used by mock auth
  devUserId: 'dev-user',
};
