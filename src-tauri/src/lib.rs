use serde::{Deserialize, Serialize};

pub mod commands;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub size_formatted: String,
    pub is_dir: bool,
    pub children: Vec<FileNode>,
    pub file_count: u64,
    pub depth: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub current_path: String,
    pub files_scanned: u64,
    pub total_size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub path: String,
    pub total_space: u64,
    pub available_space: u64,
    pub used_space: u64,
    pub total_formatted: String,
    pub available_formatted: String,
    pub used_formatted: String,
    pub usage_percent: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileTypeStats {
    pub extension: String,
    pub count: u64,
    pub total_size: u64,
    pub size_formatted: String,
    pub color: String,
}

pub(crate) fn format_size(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    if bytes == 0 {
        return "0 B".to_string();
    }
    let i = (bytes as f64).log(1024.0).floor() as usize;
    let i = i.min(UNITS.len() - 1);
    let value = bytes as f64 / 1024f64.powi(i as i32);
    if i == 0 {
        format!("{} {}", bytes, UNITS[i])
    } else {
        format!("{:.2} {}", value, UNITS[i])
    }
}

pub(crate) fn extension_color(ext: &str) -> String {
    match ext.to_lowercase().as_str() {
        "mp4" | "mkv" | "avi" | "mov" | "wmv" => "#EF4444".to_string(),
        "mp3" | "flac" | "wav" | "aac" | "ogg" => "#F97316".to_string(),
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg" => "#EAB308".to_string(),
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" => "#A855F7".to_string(),
        "pdf" => "#EC4899".to_string(),
        "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" => "#3B82F6".to_string(),
        "rs" | "js" | "ts" | "py" | "go" | "java" | "cpp" | "c" | "cs" => "#22C55E".to_string(),
        "iso" | "img" | "dmg" => "#64748B".to_string(),
        _ => "#94A3B8".to_string(),
    }
}

// ─── App Setup ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Debug)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            commands::scan_directory,
            commands::get_disk_info,
            commands::get_file_type_stats,
            commands::get_large_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ─── Unit Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ─── format_size ─────────────────────────────────────────────────────────

    mod format_size_tests {
        use super::*;

        #[test]
        fn zero_bytes_returns_zero_b() {
            assert_eq!(format_size(0), "0 B");
        }

        #[test]
        fn single_byte_returns_plain_number() {
            assert_eq!(format_size(1), "1 B");
        }

        #[test]
        fn bytes_below_1kb_have_no_decimal() {
            assert_eq!(format_size(512), "512 B");
            assert_eq!(format_size(1023), "1023 B");
        }

        #[test]
        fn exact_one_kilobyte_formats_correctly() {
            assert_eq!(format_size(1024), "1.00 KB");
        }

        #[test]
        fn fractional_kilobytes_round_to_two_decimals() {
            assert_eq!(format_size(1536), "1.50 KB");
            assert_eq!(format_size(2048), "2.00 KB");
        }

        #[test]
        fn exact_one_megabyte_formats_correctly() {
            assert_eq!(format_size(1024 * 1024), "1.00 MB");
        }

        #[test]
        fn sub_megabyte_stays_in_kb() {
            // 512 KB = 524288 bytes
            let kb_512 = format_size(512 * 1024);
            assert!(kb_512.contains("KB"), "Expected KB, got: {}", kb_512);
        }

        #[test]
        fn exact_one_gigabyte_formats_correctly() {
            assert_eq!(format_size(1024u64.pow(3)), "1.00 GB");
        }

        #[test]
        fn exact_one_terabyte_formats_correctly() {
            assert_eq!(format_size(1024u64.pow(4)), "1.00 TB");
        }

        #[test]
        fn very_large_values_capped_at_terabyte_unit() {
            // 2 TB should still show TB
            let two_tb = format_size(2 * 1024u64.pow(4));
            assert!(two_tb.contains("TB"), "Expected TB unit, got: {}", two_tb);
        }
    }

    // ─── extension_color ─────────────────────────────────────────────────────

    mod extension_color_tests {
        use super::*;

        #[test]
        fn video_extensions_return_red() {
            for ext in &["mp4", "mkv", "avi", "mov", "wmv"] {
                assert_eq!(
                    extension_color(ext),
                    "#EF4444",
                    "Failed for video extension: {}",
                    ext
                );
            }
        }

        #[test]
        fn audio_extensions_return_orange() {
            for ext in &["mp3", "flac", "wav", "aac", "ogg"] {
                assert_eq!(
                    extension_color(ext),
                    "#F97316",
                    "Failed for audio extension: {}",
                    ext
                );
            }
        }

        #[test]
        fn image_extensions_return_yellow() {
            for ext in &["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"] {
                assert_eq!(
                    extension_color(ext),
                    "#EAB308",
                    "Failed for image extension: {}",
                    ext
                );
            }
        }

        #[test]
        fn archive_extensions_return_purple() {
            for ext in &["zip", "rar", "7z", "tar", "gz", "bz2"] {
                assert_eq!(
                    extension_color(ext),
                    "#A855F7",
                    "Failed for archive extension: {}",
                    ext
                );
            }
        }

        #[test]
        fn pdf_returns_pink() {
            assert_eq!(extension_color("pdf"), "#EC4899");
        }

        #[test]
        fn office_document_extensions_return_blue() {
            for ext in &["doc", "docx", "xls", "xlsx", "ppt", "pptx"] {
                assert_eq!(
                    extension_color(ext),
                    "#3B82F6",
                    "Failed for document extension: {}",
                    ext
                );
            }
        }

        #[test]
        fn code_extensions_return_green() {
            for ext in &["rs", "js", "ts", "py", "go", "java", "cpp", "c", "cs"] {
                assert_eq!(
                    extension_color(ext),
                    "#22C55E",
                    "Failed for code extension: {}",
                    ext
                );
            }
        }

        #[test]
        fn disk_image_extensions_return_slate() {
            for ext in &["iso", "img", "dmg"] {
                assert_eq!(
                    extension_color(ext),
                    "#64748B",
                    "Failed for disk image extension: {}",
                    ext
                );
            }
        }

        #[test]
        fn unknown_extension_returns_default_color() {
            assert_eq!(extension_color("xyz"), "#94A3B8");
            assert_eq!(extension_color("unknown_ext"), "#94A3B8");
            assert_eq!(extension_color("log"), "#94A3B8");
        }

        #[test]
        fn empty_string_returns_default_color() {
            assert_eq!(extension_color(""), "#94A3B8");
        }

        #[test]
        fn matching_is_case_insensitive() {
            assert_eq!(extension_color("MP4"), "#EF4444");
            assert_eq!(extension_color("JPG"), "#EAB308");
            assert_eq!(extension_color("RS"), "#22C55E");
            assert_eq!(extension_color("ZIP"), "#A855F7");
            assert_eq!(extension_color("PDF"), "#EC4899");
        }
    }
}
