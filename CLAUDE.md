# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                        # Run full test suite
npm run test:watch              # Watch mode
npm run test:coverage           # Coverage report
npm run format                  # Format with Prettier
npm run format:check            # Check formatting

npx jest test/index.test.js     # Run a single test file
npx jest -t "name or regex"     # Run a single test by name
```

Node >= 22 is required (driven by `got@^15` and `rev-hash@^4`, both ESM-only). The project itself is also ESM (`"type": "module"` in `package.json`). Tests run with `NODE_OPTIONS=--experimental-vm-modules` and use `jest.unstable_mockModule()` instead of `jest.mock()`; import `{ jest }` from `@jest/globals` at the top of every test file.

## Architecture

This is a Gridsome source plugin that queries a SPARQL endpoint and populates GraphQL collections.

**Two core files:**

- `index.js` — `SourcePlugin` class: validates options, registers the `api.loadSource` hook, transforms SPARQL results into Gridsome nodes.
- `httpProxy.js` — handles HTTP fetching, file downloads, caching (`.cache.json`), rate limiting, timeouts, and file-size/type validation.

**Data flow:**

1. `SourcePlugin` validates options and builds the SPARQL query URL.
2. `HttpProxy` fetches JSON results from the SPARQL endpoint.
3. SPARQL bindings with `type === 'uri'` are rewritten to local file paths and queued for download.
4. `actions.addCollection()` creates a node per SPARQL result row.
5. `HttpProxy.download()` fetches media files with caching, rate limiting, and validation.

**Public API surface:** `index.d.ts` documents `WikidataSourceOptions` and the Gridsome `Actions` interface used by the plugin. `exports.defaults` exposes all default option values.

## Key Conventions

- `typeName` must match `/^[A-Z][a-zA-Z0-9]*$/` (e.g., `Painting`).
- Include `?item` in SPARQL queries and use `BIND(REPLACE(STR(...), "^.*/", "") AS ?item)` to produce stable node IDs.
- `baseDir` defaults to `"/content/"` relative to project root; path traversal outside the project root is blocked.
- `allowedFileTypes` — when `undefined`, all file extensions are allowed; supply an array to restrict.
- Cache TTL is 24h by default; set `rateLimitDelay: 0` to disable rate limiting.
- `verbose: true` enables progress bars and extra logs.

## Editing Guidelines

- When changing runtime behavior in `index.js` or `httpProxy.js`, update the corresponding tests in `test/`.
- When adding options, keep `index.d.ts` and the README options table in sync.
- Preserve the `engines: { node: ">=22" }` constraint in `package.json`; the CI matrix depends on it.
