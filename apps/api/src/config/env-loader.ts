import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CANDIDATE_ENV_PATHS = [
  resolve(__dirname, '../../.env'),
  resolve(__dirname, '../.env'),
];

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const separatorIndex = trimmed.indexOf('=');

  if (separatorIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

export function getApiEnvPath(
  candidatePaths: readonly string[] = CANDIDATE_ENV_PATHS,
): string | null {
  for (const envPath of candidatePaths) {
    if (!existsSync(envPath)) {
      continue;
    }

    return envPath;
  }

  return null;
}

export function loadApiEnv(
  candidatePaths: readonly string[] = CANDIDATE_ENV_PATHS,
): void {
  const envPath = getApiEnvPath(candidatePaths);

  if (!envPath) {
    return;
  }

  const contents = readFileSync(envPath, 'utf8');

  for (const line of contents.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);

    if (!parsed) {
      continue;
    }

    const [key, value] = parsed;

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
