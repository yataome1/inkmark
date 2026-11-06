//! 文件操作：读、原子写（宪章 IV）、目录列表、图片保存（FR-011）。

use serde::Serialize;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MD_EXT: [&str; 4] = ["md", "markdown", "mdown", "txt"];
const IMAGE_EXT: [&str; 7] = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];

fn has_ext(p: &Path, list: &[&str]) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| list.contains(&e.to_ascii_lowercase().as_str()))
}

pub fn is_markdown(p: &Path) -> bool {
    has_ext(p, &MD_EXT)
}

pub fn is_image(p: &Path) -> bool {
    has_ext(p, &IMAGE_EXT)
}

/// 按 UTF-8 读取；非法字节以替换字符代替，保证任何文件都能打开。
pub fn read_text(p: &Path) -> io::Result<String> {
    Ok(String::from_utf8_lossy(&fs::read(p)?).into_owned())
}

/// 先写临时文件再替换，避免写一半时崩溃导致原文件损坏。
pub fn write_atomic(p: &Path, content: &[u8]) -> io::Result<()> {
    if let Some(dir) = p.parent() {
        fs::create_dir_all(dir)?;
    }
    let mut tmp = p.as_os_str().to_owned();
    tmp.push(format!(".{}.tmp", std::process::id()));
    fs::write(&tmp, content)?;
    fs::rename(&tmp, p).inspect_err(|_| {
        let _ = fs::remove_file(&tmp);
    })
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub dir: bool,
}

/// 一层目录：文件夹在前，其次 Markdown 文件；忽略隐藏项与 node_modules。
pub fn list_dir(dir: &Path) -> io::Result<Vec<Entry>> {
    let mut out: Vec<Entry> = fs::read_dir(dir)?
        .filter_map(Result::ok)
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let is_dir = e.file_type().ok()?.is_dir();
            let keep = !name.starts_with('.') && name != "node_modules" && (is_dir || is_markdown(&e.path()));
            keep.then(|| Entry { path: e.path().to_string_lossy().into_owned(), name, dir: is_dir })
        })
        .collect();
    out.sort_by(|a, b| b.dir.cmp(&a.dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

/// 去掉文件名中的非法字符；剪贴板图片的通用名 image.png 加时间戳避免覆盖。
fn sanitize(name: &str) -> String {
    let mut out = String::new();
    for c in name.chars() {
        let bad = c.is_whitespace() || matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|');
        if !bad {
            out.push(c);
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    if out.is_empty() || out == "-" {
        out = "image.png".into();
    }
    let p = Path::new(&out);
    if p.file_stem().is_some_and(|s| s.eq_ignore_ascii_case("image")) {
        let ext = p.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_else(|| "png".into());
        let ms = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
        out = format!("image-{ms}.{ext}");
    }
    out
}

fn unique_name(dir: &Path, name: &str) -> String {
    let p = Path::new(name);
    let stem = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let mut candidate = name.to_string();
    let mut i = 1;
    while dir.join(&candidate).exists() {
        candidate = format!("{stem}-{i}{ext}");
        i += 1;
    }
    candidate
}

/// 保存图片，返回插入 Markdown 的地址：
/// 已保存的文档 → `assets/<文件名>`（相对路径）；未保存的文档 → 系统临时目录下文件的 `file:///` URL。
pub fn save_image(doc_path: Option<&Path>, name: &str, bytes: &[u8], temp_root: &Path) -> io::Result<(String, PathBuf)> {
    let (dir, relative) = match doc_path.and_then(Path::parent) {
        Some(doc_dir) => (doc_dir.join("assets"), true),
        None => (temp_root.join("inkmark-images"), false),
    };
    fs::create_dir_all(&dir)?;
    let file = unique_name(&dir, &sanitize(name));
    let full = dir.join(&file);
    fs::write(&full, bytes)?;
    let src = if relative { format!("assets/{file}") } else { file_url(&full) };
    Ok((src, full))
}

/// Windows 路径 → `file:///C:/a%20b/c.png`
pub fn file_url(p: &Path) -> String {
    let s = p.to_string_lossy().replace('\\', "/");
    let mut out = String::from("file:///");
    for (i, seg) in s.split('/').enumerate() {
        if i > 0 {
            out.push('/');
        }
        for b in seg.bytes() {
            let keep = b.is_ascii_alphanumeric() || b"-._~".contains(&b) || (i == 0 && b == b':');
            if keep {
                out.push(b as char);
            } else {
                out.push_str(&format!("%{b:02X}"));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("inkmark-test-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn write_atomic_replaces_and_leaves_no_temp() {
        let d = tmpdir("atomic");
        let f = d.join("sub").join("a.md");
        write_atomic(&f, b"one").unwrap();
        write_atomic(&f, "二".as_bytes()).unwrap();
        assert_eq!(read_text(&f).unwrap(), "二");
        assert_eq!(fs::read_dir(f.parent().unwrap()).unwrap().count(), 1);
    }

    #[test]
    fn read_text_tolerates_invalid_utf8() {
        let d = tmpdir("utf8");
        let f = d.join("bad.md");
        fs::write(&f, [b'a', 0xFF, b'b']).unwrap();
        assert_eq!(read_text(&f).unwrap(), "a\u{FFFD}b");
    }

    #[test]
    fn list_dir_filters_and_sorts() {
        let d = tmpdir("list");
        for f in ["b.md", "A.markdown", "x.png", ".hidden.md", "c.TXT"] {
            fs::write(d.join(f), "").unwrap();
        }
        for sub in ["zdir", "node_modules", ".git"] {
            fs::create_dir(d.join(sub)).unwrap();
        }
        let names: Vec<_> = list_dir(&d).unwrap().into_iter().map(|e| (e.name, e.dir)).collect();
        assert_eq!(
            names,
            [("zdir".into(), true), ("A.markdown".into(), false), ("b.md".into(), false), ("c.TXT".into(), false)]
        );
    }

    #[test]
    fn sanitize_names() {
        assert_eq!(sanitize("my photo?.png"), "my-photo-.png");
        assert!(sanitize("image.png").starts_with("image-"));
        assert!(sanitize("").ends_with(".png"));
    }

    #[test]
    fn save_image_relative_to_document() {
        let d = tmpdir("img");
        let doc = d.join("note.md");
        let (src1, _) = save_image(Some(&doc), "pic.png", b"1", &d).unwrap();
        let (src2, full2) = save_image(Some(&doc), "pic.png", b"2", &d).unwrap();
        assert_eq!(src1, "assets/pic.png");
        assert_eq!(src2, "assets/pic-1.png");
        assert_eq!(fs::read(full2).unwrap(), b"2");
    }

    #[test]
    fn save_image_untitled_uses_temp_file_url() {
        let d = tmpdir("untitled");
        let (src, full) = save_image(None, "pic.png", b"1", &d).unwrap();
        assert!(src.starts_with("file:///"));
        assert!(full.starts_with(d.join("inkmark-images")));
    }

    #[test]
    fn file_url_encodes() {
        assert_eq!(file_url(Path::new(r"C:\a b\中.png")), "file:///C:/a%20b/%E4%B8%AD.png");
    }
}
