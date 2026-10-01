use serde::Serialize;
use std::fs;
use std::path::Path;

/// 目录项：文件名、完整路径、是否为目录
#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

/// 列出目录内容：目录优先，再按名称（不区分大小写）排序
#[tauri::command]
pub fn read_dir(path: String) -> Result<Vec<FileEntry>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("不是目录: {}", path));
    }
    let mut entries: Vec<FileEntry> = Vec::new();
    let read = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in read.flatten() {
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().into_owned();
        let full = entry.path();
        entries.push(FileEntry {
            name,
            path: full.to_string_lossy().into_owned(),
            is_dir: file_type.is_dir(),
        });
    }
    entries.sort_by(|a, b| match b.is_dir.cmp(&a.is_dir) {
        std::cmp::Ordering::Equal => {
            let an = a.name.to_lowercase();
            let bn = b.name.to_lowercase();
            an.cmp(&bn)
        }
        other => other,
    });
    Ok(entries)
}

/// 读取文本文件
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("读取失败 {}: {}", path, e))
}

/// 写入文本文件（覆盖）
#[tauri::command]
pub fn write_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| format!("写入失败 {}: {}", path, e))
}
