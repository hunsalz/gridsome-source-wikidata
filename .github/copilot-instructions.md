# Copilot instructions for gridsome-source-wikidata

Purpose: Provide concise, repo-specific guidance so Copilot sessions can quickly find the build/test commands, key files, architecture, and project conventions.

---

Build / test / lint commands

- Run full test suite: npm test
- Run a single test file: npx jest test/index.test.js (or npx jest test/httpProxy.test.js)
- Run a single test by name: npx jest -t "name or regex of test"
- Run tests in watch mode: npm run test:watch
- Coverage: npm run test:coverage
- Format code (Prettier): npm run format
- Check format: npm run format:check

Notes: Node >=20 is required per package.json. Tests use Jest; testEnvironment=node.

---

High-level architecture (big picture)

- This is a Gridsome source plugin that queries a SPARQL endpoint and creates GraphQL collections for Gridsome.
- Core entry point: index.js — constructs SourcePlugin, validates options, registers api.loadSource hook.
- Data flow:
  1. index.js (SourcePlugin) builds the SPARQL query URL and calls HttpProxy to fetch JSON results.
  2. Results are transformed: URI fields are rewritten to local file paths and queued for download.
  3. actions.addCollection(...) is used to create nodes for each SPARQL result.
  4. httpProxy.js handles HTTP fetching, file downloads, caching (.cache.json), rate limiting, timeouts and file-size/type checks.
- Types: index.d.ts documents options and the minimal Gridsome Actions API used by the plugin.
- Configuration and defaults are exposed via exports.defaults (baseDir, ttl, timeout, maxFileSize, rateLimitDelay, verbose).
- Tests live under /test and validate option parsing, caching, HTTP behavior and download logic.
- CI: .github/workflows contains CI and release workflows that run tests, formatting checks and matrix Node builds.

---

Key conventions and repo-specific patterns

- GraphQL typeName must be an upper-case leading identifier (e.g., Painting). The plugin enforces /^[A-Z][a-zA-Z0-9]\*$/.
- Include an `?item` variable in SPARQL and use BIND(REPLACE(STR(...), "^.\*/", "") AS ?item) to produce stable node IDs.
- baseDir semantics:
  - Default: "/content/" and treated relative to project root.
  - Provided baseDir must resolve inside the project root (plugin prevents path traversal).
- URI handling:
  - SPARQL bindings with type === 'uri' are rewritten to local file paths (fileDir + filename) and their original URIs are queued for download.
  - Filenames are URL-decoded and sanitized; path traversal protections are applied.
- Downloads & caching:
  - Cache file: default `.cache.json` in project root (configurable via cacheFilename).
  - Cache TTL: exports.defaults.ttl (24h by default).
  - rateLimitDelay default: 100ms; set to 0 to disable rate limiting.
  - allowedFileTypes undefined = allow all; specifying this array restricts downloads by extension.
- Error handling:
  - Plugin validates url, sparql, and typeName early and throws clear errors.
  - Use `verbose: true` option to enable progress and extra logs.
- Tests & coverage:
  - Jest config in package.json; coveragePathIgnorePatterns excludes /test and /node_modules.
  - Run a single test file with npx jest <path> or match a test name with -t.
- Formatting: Prettier is used and scripts are provided (format, format:check).

---

Where to start for common tasks (short pointers)

- Understand behavior and options: README.md
- Core runtime logic and validations: index.js
- Download & cache behavior: httpProxy.js
- Types and public API: index.d.ts
- Tests: test/index.test.js and test/httpProxy.test.js
- CI and release checks: .github/workflows/ci.yml and release.yml

---

Helpful shortcuts for Copilot-enabled edits

- Prefer editing index.js or httpProxy.js only when changing runtime behavior. Update tests alongside behavioral changes.
- When adding options, update index.d.ts and README options table to keep docs & types in sync.
- Preserve Node >=20 engine constraint in package.json unless intentionally changing supported Node versions. CI matrix relies on this.

---

If this file exists already: merge any new commands, workflows, or conventions from README.md into the existing copilot-instructions.md rather than replacing it wholesale.

---

Summary

This file records how to run tests, where the main logic lives, and the repo-specific conventions Copilot should follow when suggesting or making changes.

If you'd like adjustments or want coverage for other areas (packaging, release workflows, or testing patterns), say which area to expand.
