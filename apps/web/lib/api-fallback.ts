export function isMissingPageDataRouteError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.trim();

  if (!message.includes("page-data")) {
    return false;
  }

  return (
    message.startsWith("Cannot GET /") || message.endsWith("was not found.")
  );
}
