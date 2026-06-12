export function reloadPage(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  window.location.reload();
  return true;
}
