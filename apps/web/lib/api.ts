const HTML_ERROR_HINT =
  "Received an HTML page instead of API JSON. Check NEXT_PUBLIC_API_URL; it may be pointing at the Next.js web server instead of the API.";
const MAX_TEXT_ERROR_LENGTH = 240;

function isHtmlBody(text: string): boolean {
  const normalized = text.trimStart().toLowerCase();
  return (
    normalized.startsWith("<!doctype html") ||
    normalized.startsWith("<html") ||
    normalized.startsWith("<head") ||
    normalized.startsWith("<body")
  );
}

function truncatePlainTextError(text: string): string {
  const normalized = text.trim();

  if (normalized.length <= MAX_TEXT_ERROR_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_TEXT_ERROR_LENGTH).trimEnd()}...`;
}

function sanitizeApiErrorText(
  text: string,
  status: number,
  contentType: string | null,
): string {
  if (!text.trim()) {
    return `API error: ${status}`;
  }

  const normalizedContentType = contentType?.toLowerCase() ?? null;
  if (normalizedContentType?.includes("text/html") || isHtmlBody(text)) {
    return `API error: ${status}. ${HTML_ERROR_HINT}`;
  }

  return truncatePlainTextError(text);
}

export function getApiUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured.");
  }

  return new URL(path, baseUrl).toString();
}

export function createIdempotencyKey(): string {
  if (typeof crypto === "undefined") {
    throw new Error(
      "Secure random source is unavailable; cannot generate idempotency key.",
    );
  }

  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  if (typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  }

  throw new Error(
    "Secure random source is unavailable; cannot generate idempotency key.",
  );
}

function isFormDataBody(body: BodyInit | null | undefined): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

function withDefaultHeaders(
  options: RequestInit | undefined,
  includeIdempotencyKey: boolean,
): Headers {
  const headers = new Headers(options?.headers);
  const body = options?.body;

  if (!isFormDataBody(body) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (includeIdempotencyKey && !headers.has("Idempotency-Key")) {
    headers.set("Idempotency-Key", createIdempotencyKey());
  }

  return headers;
}

export async function fetchApi(
  path: string,
  options?: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const headers = withDefaultHeaders(options, false);

  return fetchImpl(getApiUrl(path), {
    cache: "no-store",
    ...options,
    headers,
  });
}

export async function fetchApiMutation(
  path: string,
  options?: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const headers = withDefaultHeaders(options, true);

  return fetchImpl(getApiUrl(path), {
    cache: "no-store",
    ...options,
    headers,
  });
}

export async function readApiError(response: Response): Promise<string> {
  const text = await response.text();
  const contentType = response.headers.get("content-type");

  if (!text) {
    return `API error: ${response.status}`;
  }

  try {
    const parsed = JSON.parse(text) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) {
      return parsed.message.join(", ");
    }
    if (typeof parsed.message === "string") {
      return parsed.message;
    }
  } catch {
    return sanitizeApiErrorText(text, response.status, contentType);
  }

  return sanitizeApiErrorText(text, response.status, contentType);
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchApi(path, options);

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function apiMutation<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetchApiMutation(path, options);

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
