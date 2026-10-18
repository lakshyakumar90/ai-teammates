import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local worker/browser state and deployment artifacts are generated files.
    ".trigger/**",
    ".vercel/**",
    ".firecrawl/**",
    ".clerk/**",
    ".neon/**",
    ".pnpm-store/**",
    // Installed agent examples are not application source.
    ".agents/**",
    ".codex/**",
  ]),
])

export default eslintConfig
