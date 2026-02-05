# tomlkit 🦆

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**High-performance TOML validation, powered by Rust.**

`tomlkit` is a VS Code extension designed for developers who want instant, reliable TOML validation. By using the official Rust `toml` parser compiled to WebAssembly (WASM), we provide the same level of accuracy as `cargo` itself, right in your editor.

![tomlkit icon](icon.jpg)

## Features

- **Universal Schema Validation**: Support for any TOML file via [SchemaStore](https://schemastore.org/). Automatically validates `Cargo.toml`, `pyproject.toml`, `poetry.toml`, and more.
- **Blazing Fast**: Incremental validation using an optimized `LineIndex` algorithm in Rust.
- **Rust-Powered**: Built on top of `toml-rs` and `valico` (WASM).
- **Semantics & Syntax**: Detects both structural errors (malformed TOML) and semantic errors (wrong types, missing fields in schemas).
- **Dynamic Caching**: Efficiently caches downloaded schemas locally for high performance and offline support.
- **Lightweight**: Pure VS Code contribution without heavy background processes.

## Installation

1. Open **VS Code**.
2. Go to **Extensions** (`Ctrl+Shift+X`).
3. Search for `tomlkit`.
4. Click **Install**.

## License

MIT © [nachinsec](https://github.com/nachinsec)
