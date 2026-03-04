// Shared helpers for integration tests.
// Each file in tests/ is an independent crate, so helpers live here and are
// imported with `mod common;` + `use common::*;` in each test crate.

use disk_analyzer_lib::commands;
use std::fs;
use tempfile::TempDir;

// ─── App factory ─────────────────────────────────────────────────────────────

/// Builds a `MockRuntime`-backed Tauri app with all production commands
/// registered, mimicking the real `run()` setup without the log/dialog/fs
/// plugins (not needed for command testing).
#[allow(dead_code)]
pub fn create_app() -> tauri::App<tauri::test::MockRuntime> {
    tauri::test::mock_builder()
        .invoke_handler(tauri::generate_handler![
            commands::scan_directory,
            commands::get_disk_info,
            commands::get_file_type_stats,
            commands::get_large_files,
        ])
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .expect("failed to build mock app")
}

// ─── Directory scaffolds ──────────────────────────────────────────────────────

/// Minimal directory – one file at the root.
#[allow(dead_code)]
pub fn scaffold_single_file() -> TempDir {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("only.txt"), b"hello integration").unwrap();
    dir
}

/// Realistic multi-extension directory tree used across multiple test suites:
///
/// ```
/// root/
///   document.pdf        (4 KB)
///   photo.jpg           (2 KB)
///   video.mp4           (8 KB)
///   README.md           (9  B)
///   Makefile            (6  B)  ← no extension → "other"
///   src/
///     main.rs           (12 B)
///     lib.rs            (13 B)
///     utils.ts          (512 B)
///   media/
///     track1.mp3        (3 KB)
///     track2.flac       (5 KB)
///     clip.mkv          (6 KB)
///   archives/
///     backup.zip        (10 KB)
///     old.tar           (7 KB)
///   deep/level2/level3/
///     buried.txt        (256 B)
/// ```
#[allow(dead_code)]
pub fn scaffold_complex_dir() -> TempDir {
    let dir = TempDir::new().unwrap();

    // Root files
    fs::write(dir.path().join("document.pdf"), vec![0u8; 4096]).unwrap();
    fs::write(dir.path().join("photo.jpg"), vec![0u8; 2048]).unwrap();
    fs::write(dir.path().join("video.mp4"), vec![0u8; 8192]).unwrap();
    fs::write(dir.path().join("README.md"), b"# Project README").unwrap();
    fs::write(dir.path().join("Makefile"), b"all:\n\t@echo ok").unwrap();

    // src/
    let src = dir.path().join("src");
    fs::create_dir(&src).unwrap();
    fs::write(src.join("main.rs"), b"fn main() {}").unwrap();
    fs::write(src.join("lib.rs"), b"pub mod app;").unwrap();
    fs::write(src.join("utils.ts"), vec![0u8; 512]).unwrap();

    // media/
    let media = dir.path().join("media");
    fs::create_dir(&media).unwrap();
    fs::write(media.join("track1.mp3"), vec![0u8; 3072]).unwrap();
    fs::write(media.join("track2.flac"), vec![0u8; 5120]).unwrap();
    fs::write(media.join("clip.mkv"), vec![0u8; 6144]).unwrap();

    // archives/
    let archives = dir.path().join("archives");
    fs::create_dir(&archives).unwrap();
    fs::write(archives.join("backup.zip"), vec![0u8; 10240]).unwrap();
    fs::write(archives.join("old.tar"), vec![0u8; 7168]).unwrap();

    // deep/level2/level3/
    let deep = dir.path().join("deep").join("level2").join("level3");
    fs::create_dir_all(&deep).unwrap();
    fs::write(deep.join("buried.txt"), vec![0u8; 256]).unwrap();

    dir
}

/// Creates 25 files with distinct extensions to exercise the top-20 truncation.
#[allow(dead_code)]
pub fn scaffold_many_extensions() -> TempDir {
    let dir = TempDir::new().unwrap();
    for i in 0u32..25 {
        fs::write(
            dir.path().join(format!("file{}.ext{:02}", i, i)),
            vec![0u8; (i + 1) as usize * 100],
        )
        .unwrap();
    }
    dir
}

/// Creates a tree with predictable sizes for limit/ordering assertions.
///
/// ```
/// root/
///   a.bin  (100 B)
///   b.bin  (200 B)
///   c.bin  (300 B)
///   sub/
///     d.bin (400 B)
///     e.bin (500 B)
/// ```
#[allow(dead_code)]
pub fn scaffold_sized_tree() -> TempDir {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("a.bin"), vec![1u8; 100]).unwrap();
    fs::write(dir.path().join("b.bin"), vec![2u8; 200]).unwrap();
    fs::write(dir.path().join("c.bin"), vec![3u8; 300]).unwrap();
    let sub = dir.path().join("sub");
    fs::create_dir(&sub).unwrap();
    fs::write(sub.join("d.bin"), vec![4u8; 400]).unwrap();
    fs::write(sub.join("e.bin"), vec![5u8; 500]).unwrap();
    dir
}
