/// Integration tests for the `get_large_files` Tauri command.
///
/// Verifies the full pipeline: recursive walk, size ranking, limit enforcement,
/// file-only filtering, correct metadata population, and error handling.
mod common;
use common::*;

use disk_analyzer_lib::commands::get_large_files;
use std::fs;
use tempfile::TempDir;

// ─── Success scenarios ────────────────────────────────────────────────────────

#[tokio::test]
async fn empty_directory_returns_empty_vec() {
    let dir = TempDir::new().unwrap();
    let result = get_large_files(dir.path().to_string_lossy().to_string(), 10).await;
    assert!(result.is_ok());
    assert!(
        result.unwrap().is_empty(),
        "Empty directory must yield empty list"
    );
}

#[tokio::test]
async fn single_file_is_returned_with_correct_metadata() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("only.bin"), vec![0u8; 512]).unwrap();

    let files = get_large_files(dir.path().to_string_lossy().to_string(), 10)
        .await
        .unwrap();

    assert_eq!(files.len(), 1);
    assert_eq!(files[0].name, "only.bin");
    assert_eq!(files[0].size, 512);
    assert!(!files[0].is_dir);
    assert_eq!(files[0].file_count, 1);
    assert!(!files[0].size_formatted.is_empty());
    assert!(!files[0].path.is_empty());
}

#[tokio::test]
async fn files_are_returned_sorted_by_size_descending() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("a.bin"), vec![0u8; 100]).unwrap();
    fs::write(dir.path().join("b.bin"), vec![0u8; 500]).unwrap();
    fs::write(dir.path().join("c.bin"), vec![0u8; 250]).unwrap();

    let files = get_large_files(dir.path().to_string_lossy().to_string(), 10)
        .await
        .unwrap();

    let sizes: Vec<u64> = files.iter().map(|f| f.size).collect();
    let mut expected = sizes.clone();
    expected.sort_unstable_by(|a, b| b.cmp(a));
    assert_eq!(sizes, expected, "Files must be sorted by size DESC");
}

#[tokio::test]
async fn first_result_is_always_the_largest_file() {
    let dir = scaffold_sized_tree();

    let files = get_large_files(dir.path().to_string_lossy().to_string(), 100)
        .await
        .unwrap();

    // scaffold_sized_tree: e.bin=500 B is the largest
    assert_eq!(files[0].size, 500, "Largest file must be first");
    assert!(
        files[0].name.contains("e.bin"),
        "Name must be e.bin, got {}",
        files[0].name
    );
}

#[tokio::test]
async fn limit_is_strictly_respected() {
    let dir = scaffold_sized_tree(); // 5 files total

    let files = get_large_files(dir.path().to_string_lossy().to_string(), 3)
        .await
        .unwrap();

    assert_eq!(
        files.len(),
        3,
        "Result must contain exactly `limit` entries"
    );
}

#[tokio::test]
async fn limit_of_one_returns_the_largest_single_file() {
    let dir = scaffold_sized_tree();

    let files = get_large_files(dir.path().to_string_lossy().to_string(), 1)
        .await
        .unwrap();

    assert_eq!(files.len(), 1);
    assert_eq!(files[0].size, 500); // e.bin
}

#[tokio::test]
async fn limit_larger_than_total_count_returns_all_files() {
    let dir = scaffold_sized_tree(); // 5 files

    let files = get_large_files(dir.path().to_string_lossy().to_string(), 1000)
        .await
        .unwrap();

    assert_eq!(
        files.len(),
        5,
        "All 5 files must be returned when limit > count"
    );
}

#[tokio::test]
async fn limit_zero_returns_empty_vec() {
    let dir = scaffold_sized_tree();

    let files = get_large_files(dir.path().to_string_lossy().to_string(), 0)
        .await
        .unwrap();

    assert!(files.is_empty(), "limit=0 must return an empty vec");
}

#[tokio::test]
async fn directories_are_excluded_from_results() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("file.bin"), vec![0u8; 256]).unwrap();
    fs::create_dir(dir.path().join("subdir")).unwrap();
    fs::create_dir(dir.path().join("another_dir")).unwrap();

    let files = get_large_files(dir.path().to_string_lossy().to_string(), 100)
        .await
        .unwrap();

    assert_eq!(
        files.len(),
        1,
        "Only files, not directories, must be returned"
    );
    assert!(!files[0].is_dir);
}

#[tokio::test]
async fn files_in_subdirectories_are_traversed_recursively() {
    let dir = scaffold_sized_tree();

    let files = get_large_files(dir.path().to_string_lossy().to_string(), 100)
        .await
        .unwrap();

    // scaffold_sized_tree has d.bin and e.bin inside sub/
    let names: Vec<&str> = files.iter().map(|f| f.name.as_str()).collect();
    assert!(
        names.contains(&"d.bin"),
        "Nested d.bin must appear in results"
    );
    assert!(
        names.contains(&"e.bin"),
        "Nested e.bin must appear in results"
    );
}

#[tokio::test]
async fn each_file_node_has_correct_is_dir_and_file_count_flags() {
    let dir = scaffold_sized_tree();

    let files = get_large_files(dir.path().to_string_lossy().to_string(), 100)
        .await
        .unwrap();

    for file in &files {
        assert!(!file.is_dir, "is_dir must be false for all results");
        assert_eq!(
            file.file_count, 1,
            "file_count must be 1 for each file node"
        );
    }
}

#[tokio::test]
async fn path_field_is_an_absolute_path_pointing_to_the_file() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("target.bin"), vec![0u8; 100]).unwrap();

    let files = get_large_files(dir.path().to_string_lossy().to_string(), 10)
        .await
        .unwrap();

    let path = std::path::Path::new(&files[0].path);
    assert!(
        path.is_absolute(),
        "path field must be absolute: {}",
        files[0].path
    );
    assert!(path.exists(), "path field must point to an existing file");
}

#[tokio::test]
async fn size_formatted_reflects_the_correct_magnitude() {
    let dir = TempDir::new().unwrap();
    // 1.5 MB file → must display MB
    fs::write(dir.path().join("big.bin"), vec![0u8; 1_500_000]).unwrap();

    let files = get_large_files(dir.path().to_string_lossy().to_string(), 10)
        .await
        .unwrap();

    assert!(
        files[0].size_formatted.contains("MB"),
        "Expected MB unit, got: {}",
        files[0].size_formatted
    );
}

#[tokio::test]
async fn complex_tree_returns_files_from_all_subdirectories() {
    let dir = scaffold_complex_dir();

    let files = get_large_files(dir.path().to_string_lossy().to_string(), 100)
        .await
        .unwrap();

    // scaffold_complex_dir has 14 files spread across multiple subdirs
    assert_eq!(
        files.len(),
        14,
        "All 14 files from scaffold must be returned"
    );

    // The largest file is archives/backup.zip = 10240 bytes
    assert_eq!(files[0].size, 10240, "backup.zip must be the largest file");
    assert!(
        files[0].name.contains("backup"),
        "First result name must be backup.zip, got: {}",
        files[0].name
    );
}

#[tokio::test]
async fn top_three_results_from_complex_tree_are_correct() {
    let dir = scaffold_complex_dir();

    let files = get_large_files(dir.path().to_string_lossy().to_string(), 3)
        .await
        .unwrap();

    assert_eq!(files.len(), 3);
    // Expected (by size DESC): backup.zip=10240, video.mp4=8192, old.tar=7168
    assert_eq!(files[0].size, 10240);
    assert_eq!(files[1].size, 8192);
    assert_eq!(files[2].size, 7168);
}

// ─── Error / exception scenarios ─────────────────────────────────────────────

#[tokio::test]
async fn nonexistent_path_returns_empty_or_error() {
    // WalkDir on a non-existent path yields zero entries (no panic).
    let result = get_large_files("/nonexistent/path/xyz_abc_does_not_exist".to_string(), 10).await;

    if let Ok(files) = result {
        assert!(
            files.is_empty(),
            "Non-existent path must yield empty list, not: {:?}",
            files
        )
    }
}
