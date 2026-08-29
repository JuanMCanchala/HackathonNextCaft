import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["convex/_generated/**", "node_modules/**", "coverage/**"],
  },
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-misused-promises": "off",
    },
  },
);
