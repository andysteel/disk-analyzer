use crate::{DiskInfo, FileNode, FileTypeStats, ScanProgress, extension_color, format_size};
use log::{debug, error, info};
use rayon::prelude::*;
use std::collections::HashMap;
use std::path::Path;
use tauri::Emitter;
use walkdir::WalkDir;

/// Scan a directory and return a tree structure
#[tauri::command]
pub async fn scan_directory<R: tauri::Runtime>(
    path: String,
    max_depth: u32,
    app: tauri::AppHandle<R>,
) -> Result<FileNode, String> {
    info!("[scan_directory] Iniciando scan: path='{}', max_depth={}", path, max_depth);

    let path_clone = path.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || {
        scan_dir_recursive(Path::new(&path_clone), 0, max_depth, &app_clone)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string());

    match &result {
        Ok(node) => info!(
            "[scan_directory] Scan concluído: '{}' | tamanho={} | arquivos={}",
            node.path, node.size_formatted, node.file_count
        ),
        Err(e) => error!("[scan_directory] Erro no scan: {}", e),
    }

    result
}

pub(crate) fn scan_dir_recursive<R: tauri::Runtime>(
    path: &Path,
    depth: u32,
    max_depth: u32,
    app: &tauri::AppHandle<R>,
) -> Result<FileNode, String> {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string());

    debug!("[scan_dir_recursive] depth={} | '{}'", depth, path.display());

    // Emit progress event
    let _ = app.emit(
        "scan-progress",
        ScanProgress {
            current_path: path.to_string_lossy().to_string(),
            files_scanned: 0,
            total_size: 0,
        },
    );

    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;

    if metadata.is_file() {
        let size = metadata.len();
        return Ok(FileNode {
            name,
            path: path.to_string_lossy().to_string(),
            size,
            size_formatted: format_size(size),
            is_dir: false,
            children: vec![],
            file_count: 1,
            depth,
        });
    }

    if depth >= max_depth {
        // At max depth, just count sizes without building tree
        let size: u64 = WalkDir::new(path)
            .min_depth(1)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .filter_map(|e| e.metadata().ok())
            .map(|m| m.len())
            .sum();
        let file_count: u64 = WalkDir::new(path)
            .min_depth(1)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .count() as u64;
        return Ok(FileNode {
            name,
            path: path.to_string_lossy().to_string(),
            size,
            size_formatted: format_size(size),
            is_dir: true,
            children: vec![],
            file_count,
            depth,
        });
    }

    // Read directory entries
    let entries: Vec<_> = std::fs::read_dir(path)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .collect();

    let children: Vec<FileNode> = entries
        .par_iter()
        .filter_map(|entry| {
            scan_dir_recursive(&entry.path(), depth + 1, max_depth, app).ok()
        })
        .collect();

    let mut children_sorted = children;
    children_sorted.sort_by(|a, b| b.size.cmp(&a.size));

    let total_size: u64 = children_sorted.iter().map(|c| c.size).sum();
    let file_count: u64 = children_sorted.iter().map(|c| c.file_count).sum();

    Ok(FileNode {
        name,
        path: path.to_string_lossy().to_string(),
        size: total_size,
        size_formatted: format_size(total_size),
        is_dir: true,
        children: children_sorted,
        file_count,
        depth,
    })
}

/// Get disk space information
#[tauri::command]
pub async fn get_disk_info(path: String) -> Result<DiskInfo, String> {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        let wide: Vec<u16> = OsStr::new(&path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let mut free_bytes: u64 = 0;
        let mut total_bytes: u64 = 0;
        let mut total_free_bytes: u64 = 0;

        unsafe {
            windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW(
                wide.as_ptr(),
                &mut free_bytes,
                &mut total_bytes,
                &mut total_free_bytes,
            );
        }

        let used = total_bytes - free_bytes;
        let percent = if total_bytes > 0 {
            (used as f64 / total_bytes as f64) * 100.0
        } else {
            0.0
        };

        return Ok(DiskInfo {
            path,
            total_space: total_bytes,
            available_space: free_bytes,
            used_space: used,
            total_formatted: format_size(total_bytes),
            available_formatted: format_size(free_bytes),
            used_formatted: format_size(used),
            usage_percent: percent,
        });
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::ffi::CString;
        let cpath = CString::new(path.clone()).map_err(|e| e.to_string())?;
        let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
        let result = unsafe { libc::statvfs(cpath.as_ptr(), &mut stat) };
        if result != 0 {
            return Err("Failed to get disk info".to_string());
        }
        let block_size = stat.f_frsize as u64;
        let total = stat.f_blocks as u64 * block_size;
        let available = stat.f_bavail as u64 * block_size;
        let used = total - available;
        let percent = if total > 0 {
            (used as f64 / total as f64) * 100.0
        } else {
            0.0
        };

        Ok(DiskInfo {
            path,
            total_space: total,
            available_space: available,
            used_space: used,
            total_formatted: format_size(total),
            available_formatted: format_size(available),
            used_formatted: format_size(used),
            usage_percent: percent,
        })
    }
}

/// Get file type statistics for a directory
#[tauri::command]
pub async fn get_file_type_stats(path: String) -> Result<Vec<FileTypeStats>, String> {
    let stats_map: std::sync::Mutex<HashMap<String, (u64, u64)>> =
        std::sync::Mutex::new(HashMap::new());

    WalkDir::new(&path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .for_each(|entry| {
            let ext = entry
                .path()
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_else(|| "other".into())
                .to_string();
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            let mut map = stats_map.lock().unwrap();
            let entry = map.entry(ext).or_insert((0, 0));
            entry.0 += 1;
            entry.1 += size;
        });

    let map = stats_map.into_inner().map_err(|e| e.to_string())?;
    let mut stats: Vec<FileTypeStats> = map
        .into_iter()
        .map(|(ext, (count, size))| FileTypeStats {
            color: extension_color(&ext),
            extension: ext,
            count,
            total_size: size,
            size_formatted: format_size(size),
        })
        .collect();

    stats.sort_by(|a, b| b.total_size.cmp(&a.total_size));
    stats.truncate(20); // Top 20 file types

    Ok(stats)
}

/// Get large files in a directory
#[tauri::command]
pub async fn get_large_files(path: String, limit: usize) -> Result<Vec<FileNode>, String> {
    let mut files: Vec<FileNode> = WalkDir::new(&path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|entry| {
            let meta = entry.metadata().ok()?;
            let size = meta.len();
            Some(FileNode {
                name: entry.file_name().to_string_lossy().to_string(),
                path: entry.path().to_string_lossy().to_string(),
                size,
                size_formatted: format_size(size),
                is_dir: false,
                children: vec![],
                file_count: 1,
                depth: entry.depth() as u32,
            })
        })
        .collect();

    files.sort_by(|a, b| b.size.cmp(&a.size));
    files.truncate(limit);

    Ok(files)
}

// ─── Unit Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /// Creates a lightweight mock Tauri app backed by `MockRuntime`.
    fn mock_app() -> tauri::App<tauri::test::MockRuntime> {
        tauri::test::mock_app()
    }

    /// Builds a temporary directory tree used across multiple test suites:
    ///
    /// ```
    /// root/
    ///   small.txt   (2 B)
    ///   medium.mp4  (1 KB)
    ///   large.zip   (2 KB)
    ///   subdir/
    ///     nested.rs (12 B)
    /// ```
    fn scaffold_test_dir() -> TempDir {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("small.txt"), b"hi").unwrap();
        fs::write(dir.path().join("medium.mp4"), vec![0u8; 1024]).unwrap();
        fs::write(dir.path().join("large.zip"), vec![0u8; 2048]).unwrap();
        let subdir = dir.path().join("subdir");
        fs::create_dir(&subdir).unwrap();
        fs::write(subdir.join("nested.rs"), b"fn main() {}").unwrap();
        dir
    }

    // ─── scan_dir_recursive ──────────────────────────────────────────────────

    mod scan_dir_recursive_tests {
        use super::*;

        #[test]
        fn single_file_returns_file_node_with_correct_metadata() {
            let app = mock_app();
            let handle = app.handle().clone();

            let dir = TempDir::new().unwrap();
            let file_path = dir.path().join("hello.txt");
            fs::write(&file_path, b"hello world").unwrap(); // 11 bytes

            let node = scan_dir_recursive(&file_path, 0, 5, &handle).unwrap();

            assert_eq!(node.name, "hello.txt");
            assert_eq!(node.size, 11);
            assert_eq!(node.file_count, 1);
            assert_eq!(node.depth, 0);
            assert!(!node.is_dir);
            assert!(node.children.is_empty());
        }

        #[test]
        fn empty_directory_returns_dir_node_with_zero_size() {
            let app = mock_app();
            let handle = app.handle().clone();

            let dir = TempDir::new().unwrap();
            let node = scan_dir_recursive(dir.path(), 0, 5, &handle).unwrap();

            assert!(node.is_dir);
            assert_eq!(node.size, 0);
            assert_eq!(node.file_count, 0);
            assert!(node.children.is_empty());
        }

        #[test]
        fn directory_aggregates_children_sizes() {
            let app = mock_app();
            let handle = app.handle().clone();

            let dir = TempDir::new().unwrap();
            fs::write(dir.path().join("a.bin"), vec![0u8; 100]).unwrap();
            fs::write(dir.path().join("b.bin"), vec![0u8; 200]).unwrap();

            let node = scan_dir_recursive(dir.path(), 0, 5, &handle).unwrap();

            assert_eq!(node.size, 300);
            assert_eq!(node.file_count, 2);
        }

        #[test]
        fn children_are_sorted_by_size_descending() {
            let app = mock_app();
            let handle = app.handle().clone();

            let dir = TempDir::new().unwrap();
            fs::write(dir.path().join("a.bin"), vec![0u8; 100]).unwrap();
            fs::write(dir.path().join("b.bin"), vec![0u8; 50]).unwrap();
            fs::write(dir.path().join("c.bin"), vec![0u8; 300]).unwrap();

            let node = scan_dir_recursive(dir.path(), 0, 5, &handle).unwrap();

            assert!(node.children.len() >= 2, "Should have at least 2 children");
            for i in 1..node.children.len() {
                assert!(
                    node.children[i - 1].size >= node.children[i].size,
                    "Children must be sorted by size DESC: {} < {}",
                    node.children[i - 1].size,
                    node.children[i].size
                );
            }
        }

        #[test]
        fn at_max_depth_returns_dir_without_explicit_children_but_correct_counts() {
            let app = mock_app();
            let handle = app.handle().clone();

            let dir = TempDir::new().unwrap();
            let subdir = dir.path().join("sub");
            fs::create_dir(&subdir).unwrap();
            fs::write(subdir.join("nested.txt"), vec![0u8; 512]).unwrap();

            // Scan root at depth = max_depth (0), so it should flatten
            let node = scan_dir_recursive(dir.path(), 0, 0, &handle).unwrap();

            assert!(node.is_dir);
            // At max depth, children vec is empty but counts/sizes bubble up
            assert!(node.children.is_empty(), "Children must be empty at max_depth");
            assert_eq!(node.file_count, 1);
            assert_eq!(node.size, 512);
        }

        #[test]
        fn nested_file_count_is_accumulated_recursively() {
            let app = mock_app();
            let handle = app.handle().clone();

            let dir = TempDir::new().unwrap();
            fs::write(dir.path().join("root.txt"), b"root").unwrap();
            let sub = dir.path().join("sub");
            fs::create_dir(&sub).unwrap();
            fs::write(sub.join("child.txt"), b"child").unwrap();

            let node = scan_dir_recursive(dir.path(), 0, 5, &handle).unwrap();

            assert_eq!(node.file_count, 2);
        }

        #[test]
        fn depth_field_reflects_call_depth() {
            let app = mock_app();
            let handle = app.handle().clone();

            let dir = TempDir::new().unwrap();
            fs::write(dir.path().join("f.txt"), b"x").unwrap();

            let node = scan_dir_recursive(dir.path(), 3, 10, &handle).unwrap();

            assert_eq!(node.depth, 3);
            // Direct file child must be at depth + 1
            let child = node.children.first().unwrap();
            assert_eq!(child.depth, 4);
        }

        #[test]
        fn nonexistent_path_returns_error() {
            let app = mock_app();
            let handle = app.handle().clone();

            let result = scan_dir_recursive(
                Path::new("/nonexistent/path/does_not_exist_xyz"),
                0,
                5,
                &handle,
            );

            assert!(result.is_err(), "Expected Err for non-existent path");
        }

        #[test]
        fn size_formatted_is_non_empty_string() {
            let app = mock_app();
            let handle = app.handle().clone();

            let dir = TempDir::new().unwrap();
            fs::write(dir.path().join("data.bin"), vec![0u8; 1024]).unwrap();

            let node = scan_dir_recursive(dir.path(), 0, 5, &handle).unwrap();

            assert!(!node.size_formatted.is_empty());
            assert!(node.size_formatted.contains("KB") || node.size_formatted.contains("B"));
        }
    }

    // ─── get_disk_info ───────────────────────────────────────────────────────

    mod get_disk_info_tests {
        use super::*;

        #[tokio::test]
        async fn valid_path_returns_ok() {
            let result = get_disk_info("/tmp".to_string()).await;
            assert!(result.is_ok(), "Expected Ok for /tmp, got: {:?}", result);
        }

        #[tokio::test]
        async fn total_space_is_greater_than_zero() {
            let info = get_disk_info("/tmp".to_string()).await.unwrap();
            assert!(info.total_space > 0, "total_space must be > 0");
        }

        #[tokio::test]
        async fn available_space_does_not_exceed_total() {
            let info = get_disk_info("/tmp".to_string()).await.unwrap();
            assert!(
                info.available_space <= info.total_space,
                "available ({}) > total ({})",
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
                "used_space must equal total - available"
            );
        }

        #[tokio::test]
        async fn usage_percent_is_within_valid_range() {
            let info = get_disk_info("/tmp".to_string()).await.unwrap();
            assert!(
                info.usage_percent >= 0.0 && info.usage_percent <= 100.0,
                "usage_percent out of range: {}",
                info.usage_percent
            );
        }

        #[tokio::test]
        async fn formatted_strings_are_non_empty() {
            let info = get_disk_info("/tmp".to_string()).await.unwrap();
            assert!(!info.total_formatted.is_empty());
            assert!(!info.available_formatted.is_empty());
            assert!(!info.used_formatted.is_empty());
        }

        #[tokio::test]
        async fn path_field_matches_input() {
            let info = get_disk_info("/tmp".to_string()).await.unwrap();
            assert_eq!(info.path, "/tmp");
        }

        #[tokio::test]
        async fn nonexistent_path_returns_error() {
            let result =
                get_disk_info("/nonexistent/path/that/does_not_exist_xyz".to_string()).await;
            assert!(result.is_err(), "Expected Err for non-existent path");
        }

        #[tokio::test]
        #[cfg(not(target_os = "windows"))]
        async fn path_containing_null_byte_returns_error() {
            let result = get_disk_info("/tmp/\0invalid".to_string()).await;
            assert!(result.is_err(), "Expected Err for path with NUL byte");
        }
    }

    // ─── get_file_type_stats ─────────────────────────────────────────────────

    mod get_file_type_stats_tests {
        use super::*;

        #[tokio::test]
        async fn empty_directory_returns_empty_vec() {
            let dir = TempDir::new().unwrap();
            let result =
                get_file_type_stats(dir.path().to_string_lossy().to_string()).await;
            assert!(result.is_ok());
            assert!(result.unwrap().is_empty());
        }

        #[tokio::test]
        async fn groups_files_by_extension_with_correct_count() {
            let dir = TempDir::new().unwrap();
            fs::write(dir.path().join("a.txt"), vec![0u8; 100]).unwrap();
            fs::write(dir.path().join("b.txt"), vec![0u8; 200]).unwrap();
            fs::write(dir.path().join("c.mp4"), vec![0u8; 500]).unwrap();

            let stats =
                get_file_type_stats(dir.path().to_string_lossy().to_string())
                    .await
                    .unwrap();

            let txt = stats.iter().find(|s| s.extension == "txt").unwrap();
            assert_eq!(txt.count, 2, "txt count should be 2");
            assert_eq!(txt.total_size, 300, "txt total_size should be 300");

            let mp4 = stats.iter().find(|s| s.extension == "mp4").unwrap();
            assert_eq!(mp4.count, 1);
        }

        #[tokio::test]
        async fn files_without_extension_are_grouped_as_other() {
            let dir = TempDir::new().unwrap();
            fs::write(dir.path().join("Makefile"), vec![0u8; 100]).unwrap();
            fs::write(dir.path().join("Dockerfile"), vec![0u8; 200]).unwrap();

            let stats =
                get_file_type_stats(dir.path().to_string_lossy().to_string())
                    .await
                    .unwrap();

            let other = stats.iter().find(|s| s.extension == "other");
            assert!(other.is_some(), "Files without extension must go to 'other'");
            assert_eq!(other.unwrap().count, 2);
        }

        #[tokio::test]
        async fn results_are_sorted_by_total_size_descending() {
            let dir = TempDir::new().unwrap();
            fs::write(dir.path().join("tiny.txt"), vec![0u8; 10]).unwrap();
            fs::write(dir.path().join("huge.mp4"), vec![0u8; 10_000]).unwrap();
            fs::write(dir.path().join("mid.zip"), vec![0u8; 1_000]).unwrap();

            let stats =
                get_file_type_stats(dir.path().to_string_lossy().to_string())
                    .await
                    .unwrap();

            for i in 1..stats.len() {
                assert!(
                    stats[i - 1].total_size >= stats[i].total_size,
                    "Stats must be sorted DESC by total_size"
                );
            }
        }

        #[tokio::test]
        async fn extension_is_normalised_to_lowercase() {
            let dir = TempDir::new().unwrap();
            fs::write(dir.path().join("image.JPG"), vec![0u8; 100]).unwrap();

            let stats =
                get_file_type_stats(dir.path().to_string_lossy().to_string())
                    .await
                    .unwrap();

            let jpg = stats.iter().find(|s| s.extension == "jpg");
            assert!(jpg.is_some(), "Extension must be normalised to lowercase");
        }

        #[tokio::test]
        async fn correct_color_is_assigned_for_known_extension() {
            let dir = TempDir::new().unwrap();
            fs::write(dir.path().join("clip.mp4"), vec![0u8; 100]).unwrap();

            let stats =
                get_file_type_stats(dir.path().to_string_lossy().to_string())
                    .await
                    .unwrap();

            let mp4 = stats.iter().find(|s| s.extension == "mp4").unwrap();
            assert_eq!(mp4.color, "#EF4444");
        }

        #[tokio::test]
        async fn results_are_truncated_to_20_entries() {
            let dir = TempDir::new().unwrap();
            // Create 25 distinct extensions so truncation must kick in
            for i in 0u32..25 {
                fs::write(
                    dir.path().join(format!("file{}.ext{:02}", i, i)),
                    vec![0u8; (i + 1) as usize * 10],
                )
                .unwrap();
            }

            let stats =
                get_file_type_stats(dir.path().to_string_lossy().to_string())
                    .await
                    .unwrap();

            assert!(
                stats.len() <= 20,
                "Should be truncated to ≤20 entries, got {}",
                stats.len()
            );
        }

        #[tokio::test]
        async fn size_formatted_is_present_for_each_entry() {
            let dir = TempDir::new().unwrap();
            fs::write(dir.path().join("doc.pdf"), vec![0u8; 2048]).unwrap();

            let stats =
                get_file_type_stats(dir.path().to_string_lossy().to_string())
                    .await
                    .unwrap();

            for entry in &stats {
                assert!(
                    !entry.size_formatted.is_empty(),
                    "size_formatted must never be empty"
                );
            }
        }
    }

    // ─── get_large_files ─────────────────────────────────────────────────────

    mod get_large_files_tests {
        use super::*;

        #[tokio::test]
        async fn empty_directory_returns_empty_vec() {
            let dir = TempDir::new().unwrap();
            let result =
                get_large_files(dir.path().to_string_lossy().to_string(), 10).await;
            assert!(result.is_ok());
            assert!(result.unwrap().is_empty());
        }

        #[tokio::test]
        async fn files_are_sorted_by_size_descending() {
            let dir = TempDir::new().unwrap();
            fs::write(dir.path().join("small.bin"), vec![0u8; 100]).unwrap();
            fs::write(dir.path().join("medium.bin"), vec![0u8; 500]).unwrap();
            fs::write(dir.path().join("large.bin"), vec![0u8; 1000]).unwrap();

            let files =
                get_large_files(dir.path().to_string_lossy().to_string(), 10)
                    .await
                    .unwrap();

            assert_eq!(files.len(), 3);
            assert_eq!(files[0].size, 1000);
            assert_eq!(files[1].size, 500);
            assert_eq!(files[2].size, 100);
        }

        #[tokio::test]
        async fn limit_is_respected() {
            let dir = TempDir::new().unwrap();
            for i in 0u8..10 {
                fs::write(dir.path().join(format!("f{}.bin", i)), vec![i; 100 + i as usize]).unwrap();
            }

            let files =
                get_large_files(dir.path().to_string_lossy().to_string(), 3)
                    .await
                    .unwrap();

            assert_eq!(files.len(), 3, "Must not exceed requested limit");
        }

        #[tokio::test]
        async fn limit_larger_than_count_returns_all_files() {
            let dir = TempDir::new().unwrap();
            fs::write(dir.path().join("a.bin"), vec![0u8; 100]).unwrap();
            fs::write(dir.path().join("b.bin"), vec![0u8; 200]).unwrap();

            let files =
                get_large_files(dir.path().to_string_lossy().to_string(), 1000)
                    .await
                    .unwrap();

            assert_eq!(files.len(), 2);
        }

        #[tokio::test]
        async fn returns_only_files_not_directories() {
            let dir = TempDir::new().unwrap();
            fs::write(dir.path().join("file.bin"), vec![0u8; 100]).unwrap();
            fs::create_dir(dir.path().join("subdir")).unwrap();

            let files =
                get_large_files(dir.path().to_string_lossy().to_string(), 10)
                    .await
                    .unwrap();

            assert_eq!(files.len(), 1, "Directories must not be included");
            assert!(!files[0].is_dir);
        }

        #[tokio::test]
        async fn each_file_node_has_is_dir_false_and_file_count_one() {
            let dir = TempDir::new().unwrap();
            fs::write(dir.path().join("test.txt"), b"content").unwrap();

            let files =
                get_large_files(dir.path().to_string_lossy().to_string(), 10)
                    .await
                    .unwrap();

            assert!(!files[0].is_dir);
            assert_eq!(files[0].file_count, 1);
        }

        #[tokio::test]
        async fn exact_file_size_is_reported_correctly() {
            let dir = TempDir::new().unwrap();
            let content = vec![42u8; 512];
            fs::write(dir.path().join("exact.bin"), &content).unwrap();

            let files =
                get_large_files(dir.path().to_string_lossy().to_string(), 10)
                    .await
                    .unwrap();

            assert_eq!(files[0].size, 512);
        }

        #[tokio::test]
        async fn nested_files_are_included() {
            let dir = scaffold_test_dir();

            let files =
                get_large_files(dir.path().to_string_lossy().to_string(), 100)
                    .await
                    .unwrap();

            // scaffold_test_dir creates 4 files total (3 root + 1 nested)
            assert_eq!(files.len(), 4);
        }

        #[tokio::test]
        async fn top_file_is_the_largest_in_tree() {
            let dir = scaffold_test_dir();

            let files =
                get_large_files(dir.path().to_string_lossy().to_string(), 10)
                    .await
                    .unwrap();

            // large.zip = 2048 bytes should be first
            assert_eq!(files[0].size, 2048);
            assert!(files[0].name.contains("large"));
        }
    }
}
