import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CANDIDATE_ENV_PATHS = [
  resolve(__dirname, '../../.env'),
  resolve(__dirname, '../.env'),
];

function parseEnvEntries(contents: string): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  const lines = contents.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? '';

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    const quote = value.startsWith('"')
      ? '"'
      : value.startsWith("'")
        ? "'"
        : null;

    if (quote) {
      value = value.slice(1);

      while (true) {
        if (value.endsWith(quote)) {
          value = value.slice(0, -1);
          break;
        }

        index += 1;
        if (index >= lines.length) {
          break;
        }

        value += `\n${lines[index] ?? ''}`;
      }
    }

    entries.push([key, value]);
  }

  return entries;
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

  for (const [key, value] of parseEnvEntries(contents)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
