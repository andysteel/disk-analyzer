/// Integration tests for the `get_file_type_stats` Tauri command.
///
/// Verifies the full aggregation pipeline: recursive walk, extension grouping,
/// color mapping, size accumulation, sorting, and top-20 truncation.
mod common;
use common::*;

use disk_analyzer_lib::commands::get_file_type_stats;
use std::fs;
use tempfile::TempDir;

// ─── Success scenarios ────────────────────────────────────────────────────────

#[tokio::test]
async fn empty_directory_returns_empty_vec() {
    let dir = TempDir::new().unwrap();
    let result = get_file_type_stats(dir.path().to_string_lossy().to_string()).await;
    assert!(result.is_ok());
    assert!(
        result.unwrap().is_empty(),
        "Empty directory must yield empty stats"
    );
}

#[tokio::test]
async fn single_file_produces_one_stat_entry() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("doc.pdf"), vec![0u8; 1024]).unwrap();

    let stats = get_file_type_stats(dir.path().to_string_lossy().to_string())
        .await
        .unwrap();

    assert_eq!(stats.len(), 1, "One extension → one stat entry");
    assert_eq!(stats[0].extension, "pdf");
    assert_eq!(stats[0].count, 1);
    assert_eq!(stats[0].total_size, 1024);
}

#[tokio::test]
async fn multiple_files_with_same_extension_are_grouped() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("a.txt"), vec![0u8; 100]).unwrap();
    fs::write(dir.path().join("b.txt"), vec![0u8; 200]).unwrap();
    fs::write(dir.path().join("c.txt"), vec![0u8; 300]).unwrap();

    let stats = get_file_type_stats(dir.path().to_string_lossy().to_string())
        .await
        .unwrap();

    let txt = stats.iter().find(|s| s.extension == "txt").unwrap();
    assert_eq!(txt.count, 3);
    assert_eq!(txt.total_size, 600);
}

#[tokio::test]
async fn files_in_subdirectories_are_included_in_stats() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("root.rs"), b"fn a() {}").unwrap();
    let sub = dir.path().join("sub");
    fs::create_dir(&sub).unwrap();
    fs::write(sub.join("nested.rs"), b"fn b() {}").unwrap();

    let stats = get_file_type_stats(dir.path().to_string_lossy().to_string())
        .await
        .unwrap();

    let rs = stats.iter().find(|s| s.extension == "rs").unwrap();
    assert_eq!(
        rs.count, 2,
        "Both root and nested .rs files must be counted"
    );
}

#[tokio::test]
async fn files_without_extension_are_grouped_as_other() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("Makefile"), b"all:").unwrap();
    fs::write(dir.path().join("Dockerfile"), b"FROM ubuntu").unwrap();

    let stats = get_file_type_stats(dir.path().to_string_lossy().to_string())
        .await
        .unwrap();

    let other = stats.iter().find(|s| s.extension == "other");
    assert!(
        other.is_some(),
        "Files without extension must appear under 'other'"
    );
    assert_eq!(other.unwrap().count, 2);
}

#[tokio::test]
async fn results_are_sorted_by_total_size_descending() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("tiny.txt"), vec![0u8; 10]).unwrap();
    fs::write(dir.path().join("huge.mp4"), vec![0u8; 10_000]).unwrap();
    fs::write(dir.path().join("mid.zip"), vec![0u8; 1_000]).unwrap();

    let stats = get_file_type_stats(dir.path().to_string_lossy().to_string())
        .await
        .unwrap();

    for i in 1..stats.len() {
        assert!(
            stats[i - 1].total_size >= stats[i].total_size,
            "Results must be sorted by total_size DESC: {} < {}",
            stats[i - 1].total_size,
            stats[i].total_size
        );
    }
}

#[tokio::test]
async fn extension_is_normalized_to_lowercase() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("photo.JPG"), vec![0u8; 256]).unwrap();

    let stats = get_file_type_stats(dir.path().to_string_lossy().to_string())
        .await
        .unwrap();

    let jpg = stats.iter().find(|s| s.extension == "jpg");
    assert!(
        jpg.is_some(),
        "Extension must be lowercased: found {:?}",
        stats
    );
}

#[tokio::test]
async fn mixed_case_extensions_are_grouped_together() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("lower.rs"), b"fn a() {}").unwrap();
    fs::write(dir.path().join("upper.RS"), b"fn b() {}").unwrap();

    let stats = get_file_type_stats(dir.path().to_string_lossy().to_string())
        .await
        .unwrap();

    let rs = stats.iter().find(|s| s.extension == "rs").unwrap();
    assert_eq!(
        rs.count, 2,
        "Both `.rs` and `.RS` files must be grouped under 'rs'"
    );
}

#[tokio::test]
async fn known_extension_has_correct_color() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("clip.mp4"), vec![0u8; 100]).unwrap();
    fs::write(dir.path().join("song.mp3"), vec![0u8; 100]).unwrap();
    fs::write(dir.path().join("photo.jpg"), vec![0u8; 100]).unwrap();
    fs::write(dir.path().join("archive.zip"), vec![0u8; 100]).unwrap();
    fs::write(dir.path().join("doc.pdf"), vec![0u8; 100]).unwrap();
    fs::write(dir.path().join("code.rs"), vec![0u8; 100]).unwrap();

    let stats = get_file_type_stats(dir.path().to_string_lossy().to_string())
        .await
        .unwrap();

    let color_of = |ext: &str| {
        stats
            .iter()
            .find(|s| s.extension == ext)
            .map(|s| s.color.as_str())
            .unwrap_or("")
    };

    assert_eq!(color_of("mp4"), "#EF4444", "video color wrong");
    assert_eq!(color_of("mp3"), "#F97316", "audio color wrong");
    assert_eq!(color_of("jpg"), "#EAB308", "image color wrong");
    assert_eq!(color_of("zip"), "#A855F7", "archive color wrong");
    assert_eq!(color_of("pdf"), "#EC4899", "pdf color wrong");
    assert_eq!(color_of("rs"), "#22C55E", "code color wrong");
}

#[tokio::test]
async fn unknown_extension_receives_default_color() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("data.xyz123"), vec![0u8; 100]).unwrap();

    let stats = get_file_type_stats(dir.path().to_string_lossy().to_string())
        .await
        .unwrap();

    assert_eq!(
        stats[0].color, "#94A3B8",
        "Unknown extension must use default color"
    );
}

#[tokio::test]
async fn size_formatted_is_present_and_non_empty_for_all_entries() {
    let dir = scaffold_complex_dir();

    let stats = get_file_type_stats(dir.path().to_string_lossy().to_string())
        .await
        .unwrap();

    assert!(!stats.is_empty(), "Complex scaffold must produce stats");
    for entry in &stats {
        assert!(
            !entry.size_formatted.is_empty(),
            "size_formatted must never be empty (ext: {})",
            entry.extension
        );
    }
}

#[tokio::test]
async fn results_are_truncated_to_at_most_20_entries() {
    let dir = scaffold_many_extensions();

    let stats = get_file_type_stats(dir.path().to_string_lossy().to_string())
        .await
        .unwrap();

    assert!(
        stats.len() <= 20,
        "Results must be truncated to ≤ 20 entries, got {}",
        stats.len()
    );
}

#[tokio::test]
async fn top_entry_after_truncation_is_the_largest_extension() {
    let dir = scaffold_many_extensions();

    let stats = get_file_type_stats(dir.path().to_string_lossy().to_string())
        .await
        .unwrap();

    // The scaffold creates files with size (i+1)*100, so ext24 (2500 B) is the
    // largest. After truncation, stats[0] must have the highest total_size.
    let max_size = stats.iter().map(|s| s.total_size).max().unwrap_or(0);
    assert_eq!(
        stats[0].total_size, max_size,
        "First entry must be the largest extension by total size"
    );
}

#[tokio::test]
async fn complex_tree_produces_correct_extension_grouping() {
    let dir = scaffold_complex_dir();

    let stats = get_file_type_stats(dir.path().to_string_lossy().to_string())
        .await
        .unwrap();

    // archives: backup.zip (10240) + old.tar (7168) — but tar is a different ext.
    // zip should have count=1 and total_size=10240
    let zip = stats.iter().find(|s| s.extension == "zip");
    assert!(zip.is_some(), "zip extension must appear in stats");
    assert_eq!(zip.unwrap().total_size, 10240);
    assert_eq!(zip.unwrap().count, 1);

    // rs: main.rs + lib.rs
    let rs = stats.iter().find(|s| s.extension == "rs");
    assert!(rs.is_some(), "rs extension must appear in stats");
    assert_eq!(rs.unwrap().count, 2);
}

// ─── Error / exception scenarios ─────────────────────────────────────────────

#[tokio::test]
async fn nonexistent_directory_returns_error_or_empty() {
    // WalkDir over a nonexistent path silently produces zero entries in some
    // versions, or may error. We verify the command does not panic.
    let result = get_file_type_stats("/nonexistent/path/xyz_abc_does_not_exist".to_string()).await;

    // Must be Ok (empty) or Err – but must never panic.
    match result {
        Ok(stats) => assert!(
            stats.is_empty(),
            "Non-existent path must yield empty stats, not: {:?}",
            stats
        ),
        Err(_) => {} // also acceptable
    }
}
