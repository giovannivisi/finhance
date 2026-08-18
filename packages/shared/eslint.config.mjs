import { config } from "../eslint-config/base.js";

export default [
  ...config,
  {
    files: ["**/*.cjs"],
    languageOptions: {
      globals: {
        exports: "readonly",
        module: "readonly",
        require: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
