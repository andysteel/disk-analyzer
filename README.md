# 💿 Disk Analyzer

A cross-platform desktop application for analyzing disk usage, built with **Tauri 2**, **Angular 21**, and **D3.js**.

## Tech Stack

| Layer     | Technology |
|-----------|-----------|
| Desktop   | Tauri 2   |
| Frontend  | Angular 21 (Standalone Components) |
| Charts    | D3.js v7  |
| Backend   | Rust (walkdir + rayon) |
| Styling   | SCSS (CSS Variables) |

## Architecture

```
disk-analyzer/
├── src/                          # Angular frontend
│   ├── app/
│   │   ├── core/
│   │   │   ├── models/           # TypeScript interfaces
│   │   │   │   └── file.models.ts
│   │   │   └── services/
│   │   │       └── disk.service.ts    # Tauri invoke wrapper
│   │   ├── features/
│   │   │   ├── dashboard/        # Treemap + stats
│   │   │   ├── scanner/          # Scan UI + progress
│   │   │   └── settings/         # User preferences
│   │   └── shared/
│   │       └── components/
│   │           └── sidebar/
│   ├── styles.scss               # Global styles + CSS vars
│   └── main.ts
│
└── src-tauri/                    # Rust backend
    ├── Cargo.toml
    └── src/
        ├── main.rs
        └── lib.rs               # Commands: scan_directory, get_disk_info, etc.
```

## Prerequisites

```bash
# Node.js 18+
node --version

# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Angular CLI
npm install -g @angular/cli

# Tauri CLI dependencies (Ubuntu/Debian)
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget \
  file libssl-dev libayatana-appindicator3-dev librsvg2-dev

# Tauri CLI dependencies (macOS)
xcode-select --install
```

## Getting Started

```bash
# Install Node dependencies
npm install

# Run in development mode (hot reload)
npm run tauri:dev

# Build for production
npm run tauri:build
```

## Rust Commands (Tauri backend)

| Command              | Description                              |
|----------------------|------------------------------------------|
| `scan_directory`     | Recursively scans a path, returns tree   |
| `get_disk_info`      | Returns total/used/available disk space  |
| `get_file_type_stats`| Aggregates file types and sizes          |
| `get_large_files`    | Returns top N largest files              |

## Angular Services

### `DiskService`
Central state service using Angular **Signals**:
- `scanState` — `'idle' | 'scanning' | 'done' | 'error'`
- `scanProgress` — live progress from Rust events
- `scanResult` — full scan data after completion

```typescript
// Invoking a Rust command
const result = await invoke<FileNode>('scan_directory', { path, maxDepth });
```

## Features

- **Treemap visualization** — D3.js interactive treemap (click to drill down)
- **File type breakdown** — Bar chart of top 20 file types by size
- **Largest files list** — Sortable table of biggest files
- **Disk usage overview** — Used / Available / Total with progress bar
- **Cross-platform** — Windows, Linux, macOS
- **Fast scanning** — Parallel directory traversal via Rust + Rayon

## Testing

### Prerequisites

```bash
# Rust toolchain (already required for development)
rustup toolchain install stable

# Node.js dependencies (already installed)
npm install
```

---

### Rust / Tauri — Unit tests

Unit tests live alongside the implementation (`#[cfg(test)] mod tests`) in:
- `src-tauri/src/lib.rs` — `format_size`, `extension_color`
- `src-tauri/src/commands.rs` — `scan_dir_recursive`, `get_disk_info`, `get_file_type_stats`, `get_large_files`

```bash
# Run all Rust unit tests
cd src-tauri && cargo test --lib

# Run and display test output (including println!)
cd src-tauri && cargo test --lib -- --nocapture

# Run a specific test module
cd src-tauri && cargo test --lib tests::format_size_tests
cd src-tauri && cargo test --lib commands::tests::scan_dir_recursive_tests

# Run a single test by name
cd src-tauri && cargo test --lib zero_bytes_returns_zero_b
```

---

### Rust / Tauri — Integration tests

Integration tests exercise the full Tauri command pipeline (with `MockRuntime`)
and live in `src-tauri/tests/`:

| File | Command under test | Tests |
|---|---|---|
| `tests/test_scan_directory.rs` | `scan_directory` | 14 |
| `tests/test_disk_info.rs` | `get_disk_info` | 14 |
| `tests/test_file_type_stats.rs` | `get_file_type_stats` | 15 |
| `tests/test_large_files.rs` | `get_large_files` | 16 |

```bash
# Run all integration tests
cd src-tauri && cargo test --tests

# Run a specific integration test file
cd src-tauri && cargo test --test test_scan_directory
cd src-tauri && cargo test --test test_disk_info
cd src-tauri && cargo test --test test_file_type_stats
cd src-tauri && cargo test --test test_large_files

# Run a specific integration test by name
cd src-tauri && cargo test --test test_scan_directory empty_directory_returns_zero_size
```

---

### Rust / Tauri — All tests at once

```bash
# Unit + integration tests (from the src-tauri directory)
cd src-tauri && cargo test

# From the project root
npm run test:rust          # if the script is configured in package.json
```

---

### Angular — Unit tests

Angular tests use **Vitest** and live alongside components/services (`.spec.ts`).

```bash
# Run Angular tests (watch mode)
npm run test

# Run once and exit (CI mode)
npm run test -- --run

# Run with coverage report
npm run test -- --coverage
```

---

### Running all tests (Rust + Angular) in one command

```bash
# From the project root
cd src-tauri && cargo test && cd .. && npm run test -- --run
```

---
## Linting

### Angular - Lint

```bash
npm run lint
```

### Rust - Lint

```bash
# From the project root
cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings
```
---

### Interpreting test output

```
running 59 tests
test empty_directory_returns_empty_vec ... ok
test files_are_returned_sorted_by_size_descending ... ok
...
test result: ok. 59 passed; 0 failed; 0 ignored; 0 measured
```

| Symbol | Meaning |
|---|---|
| `ok` | Test passed |
| `FAILED` | Test failed — run with `RUST_BACKTRACE=1` for full stack trace |
| `ignored` | Test skipped (`#[ignore]`) |

```bash
# Full stack trace on failure
cd src-tauri && RUST_BACKTRACE=1 cargo test
```

---

## Extending

### Add a new Rust command
```rust
// src-tauri/src/commands.rs
#[tauri::command]
pub async fn my_command(arg: String) -> Result<MyType, String> {
    // ...
}

// Register in run()
.invoke_handler(tauri::generate_handler![..., my_command])
```

### Call from Angular
```typescript
import { invoke } from '@tauri-apps/api/core';
const result = await invoke<MyType>('my_command', { arg: 'value' });
```

## CI Structure

.github/
├── workflows/
│   ├── _reusable-ci.yml        ← Workflow reutilizável (core)
│   ├── ci.yml                  ← Feature/fix/hotfix/patch + PRs
│   ├── developer.yml           ← Developer branch (SNAPSHOT)
│   ├── release-create-tag.yml  ← Gerar tag de versão estável
│   └── release.yml             ← Build estável a partir da tag
├── dependabot.yml              ← Atualizações automáticas de deps
└── pull_request_template.md    ← Template de PR
eslint.config.js                ← ESLint Angular (flat config)

### Complete flow

feature/* fix/* hotfix/* patch/* release/*
    │
    ▼ [ci.yml]
🦀 lint Rust (fmt + clippy) ──┐
🅰️ lint Angular (ESLint)    ──┤
🦀 testes Rust               ──┤── ✅ CI Gate (required status check)
🅰️ testes Angular (Vitest)  ──┤
🏗️ build Angular             ──┤
🔍 cargo check               ──┘

developer
    │
    ▼ [developer.yml]
    [todos os passos acima]
    + 📦 versão SNAPSHOT (ex: 0.1.0-snapshot.20260303.abc1def2)
    + 🔨 build multi-plataforma (Linux, Windows, macOS arm64/x64)
    + ⬆️  artefatos publicados (30 dias de retenção)

release/x.y.z
    │
    ▼ [workflow_dispatch → release-create-tag.yml]
    ✅ valida versão consistente (branch name = package.json = tauri.conf.json)
    🏷️ cria tag anotada v{x.y.z} e publica no repositório
    │
    ▼ [tag v* → release.yml]
    [CI completo]
    + 🔨 build release multi-plataforma
    + 📦 GitHub Release com changelog automático e instaladores
