/// Integration tests for the `scan_directory` Tauri command.
///
/// These tests exercise the full command pipeline – including AppHandle
/// injection, `spawn_blocking`, progress event emission, and recursive
/// directory traversal – from the public API perspective.
mod common;
use common::*;
use disk_analyzer_lib::commands::scan_directory;
use std::fs;
use tempfile::TempDir;

// ─── Success scenarios ────────────────────────────────────────────────────────

#[tokio::test]
async fn scans_a_real_directory_and_returns_a_valid_file_node() {
    let app = create_app();
    let handle = app.handle().clone();
    let dir = scaffold_complex_dir();

    let result = scan_directory(dir.path().to_string_lossy().to_string(), 5, handle).await;

    assert!(result.is_ok(), "Expected Ok, got: {:?}", result);
    let node = result.unwrap();
    assert!(node.is_dir);
    assert!(!node.name.is_empty());
    assert!(!node.path.is_empty());
    assert!(!node.size_formatted.is_empty());
}

#[tokio::test]
async fn file_count_matches_total_files_in_tree() {
    let app = create_app();
    let handle = app.handle().clone();
    let dir = scaffold_complex_dir();

    // scaffold_complex_dir has 14 files total
    let node = scan_directory(dir.path().to_string_lossy().to_string(), 10, handle)
        .await
        .unwrap();

    assert_eq!(
        node.file_count, 14,
        "Expected 14 files in complex scaffold, got {}",
        node.file_count
    );
}

#[tokio::test]
async fn total_size_is_sum_of_all_file_sizes() {
    let app = create_app();
    let handle = app.handle().clone();
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("a.bin"), vec![0u8; 1000]).unwrap();
    fs::write(dir.path().join("b.bin"), vec![0u8; 2000]).unwrap();

    let node = scan_directory(dir.path().to_string_lossy().to_string(), 5, handle)
        .await
        .unwrap();

    assert_eq!(node.size, 3000);
}

#[tokio::test]
async fn root_node_children_are_sorted_by_size_descending() {
    let app = create_app();
    let handle = app.handle().clone();
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("tiny.bin"), vec![0u8; 50]).unwrap();
    fs::write(dir.path().join("huge.bin"), vec![0u8; 5000]).unwrap();
    fs::write(dir.path().join("mid.bin"), vec![0u8; 500]).unwrap();

    let node = scan_directory(dir.path().to_string_lossy().to_string(), 5, handle)
        .await
        .unwrap();

    let sizes: Vec<u64> = node.children.iter().map(|c| c.size).collect();
    let mut sorted = sizes.clone();
    sorted.sort_unstable_by(|a, b| b.cmp(a));
    assert_eq!(sizes, sorted, "Children must be sorted by size DESC");
}

#[tokio::test]
async fn empty_directory_returns_zero_size_and_zero_file_count() {
    let app = create_app();
    let handle = app.handle().clone();
    let dir = TempDir::new().unwrap();

    let node = scan_directory(dir.path().to_string_lossy().to_string(), 5, handle)
        .await
        .unwrap();

    assert!(node.is_dir);
    assert_eq!(node.size, 0);
    assert_eq!(node.file_count, 0);
    assert!(node.children.is_empty());
}

#[tokio::test]
async fn max_depth_zero_flattens_tree_without_building_children() {
    let app = create_app();
    let handle = app.handle().clone();
    let dir = scaffold_complex_dir();

    let node = scan_directory(dir.path().to_string_lossy().to_string(), 0, handle)
        .await
        .unwrap();

    assert!(
        node.children.is_empty(),
        "At max_depth=0 the children vec must be empty"
    );
    assert!(node.file_count > 0, "But file count must still be counted");
    assert!(node.size > 0, "And total size must still be aggregated");
}

#[tokio::test]
async fn max_depth_one_exposes_only_immediate_children() {
    let app = create_app();
    let handle = app.handle().clone();
    let dir = scaffold_complex_dir();

    let node = scan_directory(dir.path().to_string_lossy().to_string(), 1, handle)
        .await
        .unwrap();

    // At depth=1, direct children are expanded (files + subdirs), but subdirs
    // themselves have no children in the tree.
    for child in &node.children {
        if child.is_dir {
            assert!(
                child.children.is_empty(),
                "Subdirs at depth 1 must not expand their own children"
            );
        }
    }
}

#[tokio::test]
async fn deeply_nested_file_is_counted_in_total_file_count() {
    let app = create_app();
    let handle = app.handle().clone();
    let dir = scaffold_complex_dir();

    let node = scan_directory(dir.path().to_string_lossy().to_string(), 10, handle)
        .await
        .unwrap();

    // The buried.txt inside deep/level2/level3/ must be counted
    assert!(
        node.file_count >= 14,
        "Deeply nested file must be included in file_count"
    );
}

#[tokio::test]
async fn depth_field_of_root_node_is_zero() {
    let app = create_app();
    let handle = app.handle().clone();
    let dir = scaffold_single_file();

    let node = scan_directory(dir.path().to_string_lossy().to_string(), 5, handle)
        .await
        .unwrap();

    assert_eq!(node.depth, 0, "Root node must always have depth=0");
}

#[tokio::test]
async fn path_field_matches_the_scanned_directory() {
    let app = create_app();
    let handle = app.handle().clone();
    let dir = scaffold_single_file();
    let expected_path = dir.path().to_string_lossy().to_string();

    let node = scan_directory(expected_path.clone(), 5, handle)
        .await
        .unwrap();

    assert_eq!(node.path, expected_path);
}

#[tokio::test]
async fn size_formatted_reflects_the_correct_unit() {
    let app = create_app();
    let handle = app.handle().clone();
    let dir = TempDir::new().unwrap();
    // 2 MB of data → should be formatted as MB
    fs::write(dir.path().join("big.bin"), vec![0u8; 2 * 1024 * 1024]).unwrap();

    let node = scan_directory(dir.path().to_string_lossy().to_string(), 5, handle)
        .await
        .unwrap();

    assert!(
        node.size_formatted.contains("MB"),
        "Expected MB unit, got: {}",
        node.size_formatted
    );
}

#[tokio::test]
async fn concurrent_scans_of_different_directories_do_not_interfere() {
    let app = create_app();
    let h1 = app.handle().clone();
    let h2 = app.handle().clone();

    let dir1 = TempDir::new().unwrap();
    let dir2 = TempDir::new().unwrap();
    fs::write(dir1.path().join("f.bin"), vec![1u8; 1000]).unwrap();
    fs::write(dir2.path().join("f.bin"), vec![2u8; 2000]).unwrap();

    let path1 = dir1.path().to_string_lossy().to_string();
    let path2 = dir2.path().to_string_lossy().to_string();

    let (r1, r2) = tokio::join!(scan_directory(path1, 5, h1), scan_directory(path2, 5, h2),);

    assert_eq!(r1.unwrap().size, 1000);
    assert_eq!(r2.unwrap().size, 2000);
}

// ─── Error / exception scenarios ─────────────────────────────────────────────

#[tokio::test]
async fn nonexistent_path_returns_descriptive_error() {
    let app = create_app();
    let handle = app.handle().clone();

    let result = scan_directory(
        "/nonexistent/path/xyz_abc_does_not_exist".to_string(),
        5,
        handle,
    )
    .await;

    assert!(result.is_err(), "Expected Err for non-existent path");
    let msg = result.unwrap_err();
    assert!(!msg.is_empty(), "Error message must not be empty");
}

#[tokio::test]
async fn empty_path_string_returns_error() {
    let app = create_app();
    let handle = app.handle().clone();

    let result = scan_directory(String::new(), 5, handle).await;

    assert!(
        result.is_err(),
        "Expected Err for empty path string, got Ok"
    );
}
