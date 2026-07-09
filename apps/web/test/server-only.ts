// Vitest runs server-route unit tests outside Next.js' server-only boundary.
// The production build still resolves the real marker; this no-op exists only
// through the test runner alias in vitest.config.ts.
export {};
