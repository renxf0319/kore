use serde::Serialize;
use std::fs;
use std::path::Path;

/// 目录项：文件名、完整路径、是否为目录
///
/// ⚠️ `rename_all = "camelCase"` 不是可选的洁癖，而是**修一个真实 bug**：
/// Tauri 只对**命令参数**做 camelCase 转换，**返回值**按 `serde` 原样序列化。
/// 所以字段名 `is_dir` 到了前端就是 `is_dir`，而 TS 侧读的是 `node.isDir`，
/// 结果恒为 `undefined`（falsy）→ 所有子目录都被当成文件：
///   - 图标显示成文件图标
///   - 点击走 `openFile` 而不是 `toggleExpand`
///   - 于是 `read_to_string(目录)` 在 Windows 上报 os error 5「拒绝访问」
/// 去掉这行会立刻复现「文件夹无法展开」的故障。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
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
    // 先判目录：对目录调 read_to_string 在 Windows 上只会得到
    // os error 5「拒绝访问」，用户完全看不出真实原因（他其实点错了文件夹）。
    // 这里显式拦下来并给出可读提示，前端据此把提示换成「请点击左侧箭头展开」。
    if Path::new(&path).is_dir() {
        return Err(format!("这是一个文件夹，不是文件: {}", path));
    }
    fs::read_to_string(&path).map_err(|e| format!("读取失败 {}: {}", path, e))
}

/// 写入文本文件（覆盖）
#[tauri::command]
pub fn write_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| format!("写入失败 {}: {}", path, e))
}
