import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    linterOptions: {
      reportUnusedDisableDirectives: "warn",
    },
    rules: {
      // Correctness rules must fail CI. These identify code paths that cannot
      // execute safely or hide accidental control-flow defects.
      "no-debugger": "error",
      "no-unreachable": "error",
      "no-fallthrough": "error",
      "no-redeclare": "error",
      "no-case-declarations": "error",

      // Gradual TypeScript hardening. Bucket 4/issue 49 owns eliminating the
      // existing `any` surface; warnings prevent new debt without blocking the
      // current application while those boundaries are migrated.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/ban-ts-comment": [
        "warn",
        { "ts-expect-error": "allow-with-description" },
      ],
      "@typescript-eslint/prefer-as-const": "warn",

      // Hooks stay enabled. Existing legacy patterns are warnings so the
      // project can adopt the rules incrementally instead of suppressing them.
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react/no-unescaped-entities": "warn",
      "react/display-name": "warn",

      // Framework and general hygiene.
      "@next/next/no-img-element": "warn",
      "prefer-const": "warn",
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-useless-escape": "warn",

      // TypeScript and Next.js provide the authoritative checks for these.
      "no-undef": "off",
      "no-unused-vars": "off",
      "react/prop-types": "off",
      "react-compiler/react-compiler": "off",
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "examples/**",
      "skills/**",
    ],
  },
];

export default eslintConfig;
