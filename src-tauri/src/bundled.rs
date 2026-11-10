//! 编进程序的使用指南与示例文档（specs/013 FR-1302）：打开时释放到程序数据目录下的 help 文件夹。

use crate::fileops;
use std::io;
use std::path::{Path, PathBuf};

/// 相对 resources/samples/ 的路径与内容；测试保证与该目录一致。
const FILES: &[(&str, &[u8])] = &[
    ("使用指南.md", include_bytes!("../../resources/samples/使用指南.md")),
    ("demo.md", include_bytes!("../../resources/samples/demo.md")),
    (
        "assets/inkmark.png",
        include_bytes!("../../resources/samples/assets/inkmark.png"),
    ),
];

/// 只接受固定名称，不接受路径（宪章 V）。
fn markdown_of(name: &str) -> Option<&'static str> {
    match name {
        "guide" => Some("使用指南.md"),
        "demo" => Some("demo.md"),
        _ => None,
    }
}

/// 写入（覆盖）指定文档及全部图片，返回文档路径与内容。只写被打开的文档，不覆盖另一篇（plan）。
/// 文档中的 `{{version}}` 替换为当前版本（US1-4）。
pub fn extract(dir: &Path, name: &str, version: &str) -> io::Result<(PathBuf, String)> {
    let doc = markdown_of(name).ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "未知的内置文档"))?;
    let mut content = String::new();
    for (rel, bytes) in FILES {
        if *rel == doc {
            content = String::from_utf8_lossy(bytes).replace("{{version}}", version);
            fileops::write_atomic(&dir.join(rel), content.as_bytes())?;
        } else if !fileops::is_markdown(Path::new(rel)) {
            fileops::write_atomic(&dir.join(rel), bytes)?;
        }
    }
    Ok((dir.join(doc), content))
}

/// 路径是否位于 dir 之内（不区分大小写与斜杠方向）。
pub fn contains(dir: &Path, p: &Path) -> bool {
    let norm = |p: &Path| p.to_string_lossy().replace('/', "\\").to_lowercase();
    let dir = norm(dir);
    norm(p)
        .strip_prefix(dir.trim_end_matches('\\'))
        .is_some_and(|rest| rest.starts_with('\\'))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn walk(dir: &Path, base: &Path, out: &mut Vec<String>) {
        for e in fs::read_dir(dir).unwrap() {
            let p = e.unwrap().path();
            if p.is_dir() {
                walk(&p, base, out);
            } else {
                out.push(p.strip_prefix(base).unwrap().to_string_lossy().replace('\\', "/"));
            }
        }
    }

    #[test]
    fn files_match_resources() {
        let base = Path::new(env!("CARGO_MANIFEST_DIR")).join("../resources/samples");
        let mut found = Vec::new();
        walk(&base, &base, &mut found);
        found.sort();
        let mut listed: Vec<String> = FILES.iter().map(|(p, _)| p.to_string()).collect();
        listed.sort();
        assert_eq!(found, listed, "resources/samples/ 与 bundled.rs 的 FILES 不一致");
    }

    #[test]
    fn extract_writes_one_doc_and_overwrites() {
        let dir = std::env::temp_dir().join(format!("inkmark-help-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let (path, content) = extract(&dir, "demo", "1.2.3").unwrap();
        assert_eq!(path, dir.join("demo.md"));
        assert!(content.starts_with("# Inkmark 示例文档"));
        assert!(dir.join("assets/inkmark.png").is_file());
        assert!(!dir.join("使用指南.md").exists());
        fs::write(&path, "改过").unwrap();
        extract(&dir, "demo", "1.2.3").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), content);
        let (guide, text) = extract(&dir, "guide", "1.2.3").unwrap();
        assert!(text.contains("适用于 Inkmark 1.2.3") && !text.contains("{{version}}"));
        assert_eq!(fs::read_to_string(guide).unwrap(), text);
        assert!(extract(&dir, "../x", "1.2.3").is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn contains_ignores_case_and_slashes() {
        let dir = Path::new(r"C:\Users\a\AppData\Local\app\help");
        assert!(contains(dir, Path::new("c:/users/a/appdata/local/app/help/demo.md")));
        assert!(!contains(
            dir,
            Path::new(r"C:\Users\a\AppData\Local\app\helper\demo.md")
        ));
        assert!(!contains(dir, Path::new(r"C:\Users\a\demo.md")));
    }
}
