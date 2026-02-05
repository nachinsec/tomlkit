# Change Log

All notable changes to the "tomlkit" extension will be documented in this file.

Check [Keep a Changelog](http://keepachanglog.com/) for recommendations on how to structure this file.

## [0.2.0] - 2026-02-05

### Added
- **Universal Schema Validation**: Dynamic schema discovery via [SchemaStore](https://schemastore.org/).
- **Dynamic Fetching**: Automatic download and local caching of JSON schemas for any TOML file (Cargo.toml, pyproject.toml, etc.).
- **Rust Sanitizer**: Improved schema compatibility by automatically removing non-standard extensions before validation.
- **Enhanced Diagnostics**: Semantic warnings from schemas are now displayed alongside syntax errors.

### Fixed
- Fixed WASM compilation issues related to transitive dependencies (`getrandom`, `uuid`).
- Improved network reliability for schema fetching (redirect handling and User-Agent).

## [0.1.1] - 2026-01-30

- Initial release with basic syntax validation.