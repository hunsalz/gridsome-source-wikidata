# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-12-13

### Added

#### Security Features
- Comprehensive input validation for URL, SPARQL, typeName, and baseDir
- Request timeout configuration (default: 30 seconds)
- File size limits (`maxFileSize` option, default: 100MB)
- File type validation (`allowedFileTypes` option)
- Path traversal protection for baseDir and filenames
- Cache file integrity validation
- Improved error recovery with warnings for corrupted cache files

#### Performance Features
- Rate limiting (`rateLimitDelay` option, default: 100ms)
- Async cache operations (non-blocking)
- Debounced cache saves (reduces disk I/O, 1 second debounce)

#### Developer Experience
- TypeScript definitions (`index.d.ts`) with Gridsome API types
- JSDoc comments throughout the codebase
- `.editorconfig` for consistent code style
- `.prettierrc` and `.prettierignore` for code formatting
- Prettier scripts: `format` and `format:check`
- `.npmignore` for proper npm publishing
- Comprehensive Jest test suite with ~63% coverage
- Test scripts: `test`, `test:watch`, `test:coverage`

#### Documentation
- CHANGELOG.md for version history
- Enhanced README with:
  - Comprehensive troubleshooting section
  - Multiple SPARQL query examples (People, Books, Places, Organizations, Events)
  - Template variables documentation
  - Contributing guidelines
  - Enhanced options table with types and better formatting
  - Error handling examples
  - Gridsome compatibility information
- Explicit node ID generation for Gridsome compatibility

#### CI/CD
- GitHub Actions CI workflow (`.github/workflows/ci.yml`)
  - Matrix testing across Node.js versions (20.x, 22.x, 24.x)
  - Code formatting checks
  - Test execution with coverage
  - Optional codecov integration
- Enhanced GitHub Actions release workflow
  - Dependency caching for faster builds
  - Separated test and publish jobs
  - Code formatting checks before publish
  - Conditional publishing on version tags

### Changed

#### Dependencies & Configuration
- Updated Node.js requirement from `>=8.3` to `>=20.0.0`
- Updated GitHub Actions to latest versions (checkout@v4, setup-node@v4)
- Updated Node.js version in CI to 24.x (current Active LTS)
- Updated npm-publish action to v4.1.1
- Enhanced package.json with metadata:
  - `author`: Markus Hunsalz
  - `license`: MIT
  - `repository`: GitHub repository URL
  - `bugs`: Issue tracker URL
  - `peerDependencies`: Gridsome version requirements
  - `types`: TypeScript definitions entry point

#### Code Quality
- Improved error handling with proper async/await patterns
- Replaced magic numbers with named constants (`ONE_HOUR_MS`, `DEFAULT_TTL_MS`, `DEFAULT_TIMEOUT_MS`, etc.)
- Improved filename extraction using `path` module
- Fixed cache file saving race conditions
- Converted synchronous cache operations to async
- Applied Prettier formatting to entire codebase
- Consistent code style across all files

#### Documentation
- Fixed inconsistent option names (`cacheFile` → `cacheFilename`)
- Enhanced README options table with types and better formatting
- Added comprehensive SPARQL query examples
- Improved template path documentation

### Fixed

#### Critical Bugs
- Fixed bug where `download.path` was referenced but didn't exist
- Fixed inconsistent option name (`cacheFile` vs `cacheFilename`) in README
- Fixed silent error handling in `fetchWikidata`
- Fixed missing error handling in `loadSource` hook
- Fixed missing test script in package.json

#### Security Issues
- Fixed path traversal vulnerability in baseDir and filename handling
- Fixed missing request timeouts (could hang indefinitely)
- Fixed cache file location security concerns

#### Code Quality
- Fixed variable declaration (`var` to `let`)
- Fixed empty `onCreateNode` hook (removed)
- Fixed inconsistent async patterns
- Fixed cache file saving race conditions
- Fixed file extension detection issues

#### Documentation
- Fixed README example: `verbose: "true"` → `verbose: true` (boolean)
- Fixed missing defaults in code vs documentation
- Fixed outdated "Open Issues" section in README

### Security

- Added path validation to prevent directory traversal attacks
- Added request timeouts to prevent hanging requests
- Added file size limits to prevent disk exhaustion
- Added optional file type validation to prevent downloading unwanted files
- Added cache file integrity validation
- Improved error recovery with security warnings

### Testing

- Added comprehensive Jest test suite:
  - Option validation tests
  - Default options tests
  - API integration tests
  - Cache functionality tests
  - HTTP request tests
  - Error handling tests
  - Path validation tests
  - File size validation tests
  - File type validation tests
  - Rate limiting tests
  - Debounced cache saves tests
- Test coverage: ~63% overall (73.58% for httpProxy.js, 39.72% for index.js)
- 41 total tests across 2 test suites

## [0.0.11] - Previous Release

### Features
- Initial release with basic Wikidata SPARQL query support
- File download and caching functionality
- Progress bar for downloads (verbose mode)
- Cache with TTL support

[Unreleased]: https://github.com/hunsalz/gridsome-source-wikidata/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/hunsalz/gridsome-source-wikidata/compare/v0.0.11...v0.1.0
[0.0.11]: https://github.com/hunsalz/gridsome-source-wikidata/releases/tag/v0.0.11
