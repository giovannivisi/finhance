const API_URL_RESOLUTION_ORIGIN = "https://finhance.invalid";
const ABSOLUTE_URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

export class InvalidApiPathError extends Error {
  constructor(message = "API path must be relative.") {
    super(message);
    this.name = "InvalidApiPathError";
  }
}

export function normalizeDirectApiPath(path: string): string {
  const trimmed = path.trim();

  if (!trimmed) {
    return "/";
  }

  if (ABSOLUTE_URL_SCHEME_PATTERN.test(trimmed)) {
    throw new InvalidApiPathError();
  }

  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

  if (normalized.startsWith("//") || normalized.startsWith("/\\")) {
    throw new InvalidApiPathError();
  }

  const parsed = new URL(normalized, API_URL_RESOLUTION_ORIGIN);

  if (parsed.origin !== API_URL_RESOLUTION_ORIGIN || parsed.hash) {
    throw new InvalidApiPathError();
  }

  return `${parsed.pathname}${parsed.search}`;
}

export function resolveDirectApiUrl(path: string, baseUrl: string): string {
  return new URL(normalizeDirectApiPath(path), baseUrl).toString();
}
