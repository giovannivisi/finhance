export function shouldIgnoreRepeatedActionError(
  status: number | null,
): boolean {
  return status === 409 || status === 429;
}
