import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";
import eslintConfigPrettier from "eslint-config-prettier";

export default defineConfig([
  expoConfig,
  eslintConfigPrettier,
  {
    ignores: [
      "node_modules",
      ".expo",
      ".expo-export-check",
      "dist",
      "expo-env.d.ts",
    ],
    // Expo SDK 57's config enables the React Compiler diagnostics by default.
    // Keep these opt-in for now: the mobile codebase predates those rules and
    // changing them would be an unrelated behavioural refactor.
    rules: {
      "react-hooks/globals": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);
