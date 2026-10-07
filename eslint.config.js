import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/** Builds a rule that stops one part of src from importing the parts it must not see. */
function forbidImports(folders, message) {
  return {
    "no-restricted-imports": [
      "error",
      {
        patterns: folders.map((folder) => ({
          group: [`@${folder}/*`, `**/${folder}/*`, `**/${folder}`],
          message,
        })),
      },
    ],
  };
}

export default defineConfig(
  globalIgnores(["dist", "data", "coverage"]),

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // CLAUDE.md: exported functions have typed parameters and returns.
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },

  {
    files: ["src/client/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat["recommended-latest"]],
    rules: forbidImports(["server"], "Client code must never import server code."),
  },
  {
    files: ["src/server/**/*.ts"],
    rules: forbidImports(["client"], "Server code must not import client code."),
  },
  {
    files: ["src/shared/**/*.ts"],
    rules: forbidImports(
      ["client", "server"],
      "Shared code is used by both sides, so it must not import either.",
    ),
  },

  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  },
);
