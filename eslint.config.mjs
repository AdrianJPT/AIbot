import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

/**
 * Flat config. `eslint-config-next` v16 already ships flat-config arrays, so
 * no eslintrc compatibility layer is needed.
 *
 * `prettier` stays last on purpose: it only switches rules off, so it has to
 * win over every stylistic rule the Next presets enable. Formatting is
 * Prettier's job (`npm run format`), linting is ESLint's — they must not
 * both have an opinion about the same thing.
 */
const config = [
  {
    // Leading `**/` matters: `.claude/worktrees/*` holds throwaway checkouts
    // with their own `.next/` build output, and a root-anchored `.next/**`
    // would let ~80k problems in from generated bundles.
    ignores: [
      "**/.next/**",
      "**/.claude/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  prettier,
];

export default config;
