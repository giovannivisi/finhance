function normalizePath(path: string | null): string | null {
  if (!path) {
    return null;
  }

  if (path === "/") {
    return path;
  }

  return path.endsWith("/") ? path.slice(0, -1) : path;
}

export function isRedundantTabNavigation(input: {
  currentPath: string;
  targetPath: string;
  pendingPath?: string | null;
}): boolean {
  const currentPath = normalizePath(input.currentPath);
  const targetPath = normalizePath(input.targetPath);
  const pendingPath = normalizePath(input.pendingPath ?? null);

  if (!currentPath || !targetPath) {
    return false;
  }

  return currentPath === targetPath || pendingPath === targetPath;
}
