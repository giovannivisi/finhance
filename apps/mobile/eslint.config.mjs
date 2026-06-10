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
  },
]);
