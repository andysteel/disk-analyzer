// @ts-check

// ─────────────────────────────────────────────────────────────────────────────
// ESLint Flat Config — Angular 21
// Utiliza @angular-eslint para regras específicas de Angular e templates
// ─────────────────────────────────────────────────────────────────────────────

const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");

module.exports = tseslint.config(
  // ── TypeScript ────────────────────────────────────────────────────────────
  {
    files: ["**/*.ts"],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      // ── Angular ────────────────────────────────────────────────────────
      "@angular-eslint/directive-selector": [
        "error",
        { type: "attribute", prefix: "app", style: "camelCase" },
      ],
      "@angular-eslint/component-selector": [
        "error",
        { type: "element", prefix: "app", style: "kebab-case" },
      ],
      "@angular-eslint/no-empty-lifecycle-method": "warn",
      "@angular-eslint/use-lifecycle-interface": "error",
      // Constructor injection ainda é válido — prefer-inject é recomendação,
      // não obrigatoriedade. Usar "warn" para migração gradual.
      "@angular-eslint/prefer-inject": "warn",

      // ── TypeScript ─────────────────────────────────────────────────────
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },

  // ── Templates HTML ────────────────────────────────────────────────────────
  {
    files: ["**/*.html"],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
    rules: {
      "@angular-eslint/template/prefer-self-closing-tags": "warn",
      "@angular-eslint/template/no-negated-async": "error",
    },
  },

  // ── Ignorar arquivos gerados ──────────────────────────────────────────────
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src-tauri/**",
      "coverage/**",
      "*.min.js",
    ],
  }
);
