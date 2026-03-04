/// Integration tests for the `get_disk_info` Tauri command.
///
/// Tests the complete disk-info pipeline: system call (statvfs / Win32 API),
/// arithmetic invariants, formatted output, and error handling.
mod common;

use disk_analyzer_lib::commands::get_disk_info;

// ─── Success scenarios ────────────────────────────────────────────────────────

#[tokio::test]
async fn valid_path_returns_ok() {
    let result = get_disk_info("/tmp".to_string()).await;
    assert!(
        result.is_ok(),
        "get_disk_info('/tmp') must succeed: {:?}",
        result
    );
}

#[tokio::test]
async fn total_space_is_greater_than_zero() {
    let info = get_disk_info("/tmp".to_string()).await.unwrap();
    assert!(
        info.total_space > 0,
        "total_space must be > 0, got {}",
        info.total_space
    );
}

#[tokio::test]
async fn available_space_does_not_exceed_total_space() {
    let info = get_disk_info("/tmp".to_string()).await.unwrap();
    assert!(
        info.available_space <= info.total_space,
        "available_space ({}) must be ≤ total_space ({})",
        info.available_space,
        info.total_space
    );
}

#[tokio::test]
async fn used_space_equals_total_minus_available() {
    let info = get_disk_info("/tmp".to_string()).await.unwrap();
    assert_eq!(
        info.used_space,
        info.total_space - info.available_space,
        "used_space must equal total_space - available_space"
    );
}

#[tokio::test]
async fn usage_percent_is_between_zero_and_one_hundred() {
    let info = get_disk_info("/tmp".to_string()).await.unwrap();
    assert!(
        info.usage_percent >= 0.0 && info.usage_percent <= 100.0,
        "usage_percent out of range [0, 100]: {}",
        info.usage_percent
    );
}

#[tokio::test]
async fn usage_percent_is_consistent_with_used_and_total() {
    let info = get_disk_info("/tmp".to_string()).await.unwrap();
    let expected_pct = (info.used_space as f64 / info.total_space as f64) * 100.0;
    let delta = (info.usage_percent - expected_pct).abs();
    assert!(
        delta < 0.01,
        "usage_percent ({}) diverges from computed value ({:.4})",
        info.usage_percent,
        expected_pct
    );
}

#[tokio::test]
async fn all_formatted_strings_are_non_empty() {
    let info = get_disk_info("/tmp".to_string()).await.unwrap();
    assert!(
        !info.total_formatted.is_empty(),
        "total_formatted must not be empty"
    );
    assert!(
        !info.available_formatted.is_empty(),
        "available_formatted must not be empty"
    );
    assert!(
        !info.used_formatted.is_empty(),
        "used_formatted must not be empty"
    );
}

#[tokio::test]
async fn formatted_strings_contain_a_size_unit() {
    let info = get_disk_info("/tmp".to_string()).await.unwrap();
    let units = ["B", "KB", "MB", "GB", "TB"];

    for field in [
        &info.total_formatted,
        &info.available_formatted,
        &info.used_formatted,
    ] {
        let has_unit = units.iter().any(|u| field.contains(u));
        assert!(
            has_unit,
            "Formatted string '{}' must contain a size unit",
            field
        );
    }
}

#[tokio::test]
async fn path_field_echoes_the_input() {
    let info = get_disk_info("/tmp".to_string()).await.unwrap();
    assert_eq!(info.path, "/tmp", "path field must reflect the input path");
}

#[tokio::test]
async fn scanning_root_filesystem_succeeds() {
    // Tests that a real filesystem root can be queried without panicking.
    let result = get_disk_info("/".to_string()).await;
    assert!(
        result.is_ok(),
        "get_disk_info('/') must succeed: {:?}",
        result
    );
}

#[tokio::test]
async fn two_calls_with_same_path_return_consistent_total_space() {
    // total_space must be stable between calls (invariant of the filesystem).
    let info1 = get_disk_info("/tmp".to_string()).await.unwrap();
    let info2 = get_disk_info("/tmp".to_string()).await.unwrap();

    assert_eq!(
        info1.total_space, info2.total_space,
        "total_space must be the same across two consecutive calls"
    );
}

// ─── Error / exception scenarios ─────────────────────────────────────────────

#[tokio::test]
async fn nonexistent_directory_returns_error() {
    let result = get_disk_info("/nonexistent/path/xyz_abc_does_not_exist".to_string()).await;
    assert!(result.is_err(), "Expected Err for non-existent path");
}

#[tokio::test]
async fn error_message_is_non_empty_string() {
    let err = get_disk_info("/nonexistent/path/xyz_abc_does_not_exist".to_string())
        .await
        .unwrap_err();
    assert!(!err.is_empty(), "Error message must not be empty");
}

#[tokio::test]
#[cfg(not(target_os = "windows"))]
async fn path_containing_null_byte_returns_error() {
    // CString::new() fails on NUL bytes, which must propagate as Err.
    let result = get_disk_info("/tmp/\0invalid".to_string()).await;
    assert!(result.is_err(), "Path with NUL byte must return Err");
}
