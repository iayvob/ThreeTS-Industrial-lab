import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Project-specific rules
    rules: {
      "no-unused-expressions": "error",
      "@typescript-eslint/no-unused-expressions": "error",
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "next-env.d.ts",
    // Repo-specific ignores migrated from .eslintignore.
    "node_modules/**",
    "public/**",
  ]),
]);

export default eslintConfig;
