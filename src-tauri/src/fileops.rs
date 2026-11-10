//! 文件操作：读、原子写（宪章 IV）、目录列表、图片保存与查找（specs/011）。

use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

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

#[derive(Serialize, Debug, PartialEq)]
pub struct PathInfo {
    pub exists: bool,
    pub dir: bool,
}

/// 只报告路径是否存在、是否目录，不读取内容（收藏夹 FR-213）。
pub fn path_info(paths: &[String]) -> Vec<PathInfo> {
    paths
        .iter()
        .map(|p| {
            let meta = fs::metadata(p);
            PathInfo {
                exists: meta.is_ok(),
                dir: meta.is_ok_and(|m| m.is_dir()),
            }
        })
        .collect()
}

/// 一层目录：文件夹在前，其次 Markdown 文件；忽略隐藏项与 node_modules。
pub fn list_dir(dir: &Path) -> io::Result<Vec<Entry>> {
    let mut out: Vec<Entry> = fs::read_dir(dir)?
        .filter_map(Result::ok)
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let is_dir = e.file_type().ok()?.is_dir();
            let keep = !name.starts_with('.') && name != "node_modules" && (is_dir || is_markdown(&e.path()));
            keep.then(|| Entry {
                path: e.path().to_string_lossy().into_owned(),
                name,
                dir: is_dir,
            })
        })
        .collect();
    out.sort_by(|a, b| {
        b.dir
            .cmp(&a.dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(out)
}

// SHA-256 由 Windows CNG 计算，不引入依赖（specs/011 plan）
#[link(name = "bcrypt")]
unsafe extern "system" {
    fn BCryptHash(
        algorithm: usize,
        secret: *const u8,
        secret_len: u32,
        input: *const u8,
        input_len: u32,
        output: *mut u8,
        output_len: u32,
    ) -> i32;
}
const BCRYPT_SHA256_ALG_HANDLE: usize = 0x41;

pub fn sha256(bytes: &[u8]) -> io::Result<[u8; 32]> {
    let len = u32::try_from(bytes.len()).map_err(|_| io::Error::other("图片过大"))?;
    let mut out = [0u8; 32];
    // SAFETY: 输入、输出指针与长度一致；SHA-256 伪句柄由系统提供，无需打开或释放
    let status = unsafe {
        BCryptHash(
            BCRYPT_SHA256_ALG_HANDLE,
            std::ptr::null(),
            0,
            bytes.as_ptr(),
            len,
            out.as_mut_ptr(),
            32,
        )
    };
    if status != 0 {
        return Err(io::Error::other(format!("计算哈希失败：{status:#x}")));
    }
    Ok(out)
}

/// 内容哈希名：SHA-256 前 128 位的十六进制 + 小写扩展名（FR-1102）
pub fn hash_name(bytes: &[u8], ext: &str) -> io::Result<String> {
    let hex: String = sha256(bytes)?[..16].iter().map(|b| format!("{b:02x}")).collect();
    Ok(format!("{hex}.{}", ext.to_ascii_lowercase()))
}

pub fn is_hash_name(name: &str) -> bool {
    name.split_once('.').is_some_and(|(stem, ext)| {
        stem.len() == 32
            && stem.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            && IMAGE_EXT.contains(&ext)
    })
}

fn image_ext(name: &str) -> String {
    Path::new(name)
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .filter(|e| IMAGE_EXT.contains(&e.as_str()))
        .unwrap_or_else(|| "png".into())
}

/// 把图片按内容哈希保存到 dir（须已存在）；同内容的文件已存在时不再写入
pub fn save_image(dir: &Path, name: &str, bytes: &[u8]) -> io::Result<PathBuf> {
    let full = dir.join(hash_name(bytes, &image_ext(name))?);
    if !full.exists() {
        write_atomic(&full, bytes)?;
    }
    Ok(full)
}

/// 原路径存在则用原路径；否则内容哈希名的图片到 image_dir 中按文件名查找（FR-1104）
pub fn resolve_image(path: &Path, image_dir: &Path) -> Option<PathBuf> {
    if !is_image(path) {
        return None;
    }
    if path.is_file() {
        return Some(path.to_path_buf());
    }
    let name = path.file_name()?.to_str()?;
    let candidate = image_dir.join(name);
    (is_hash_name(name) && candidate.is_file()).then_some(candidate)
}

/// 复制 from 顶层的图片到 to；同名已存在则跳过。返回 (复制, 跳过)
pub fn copy_images(from: &Path, to: &Path) -> io::Result<(usize, usize)> {
    let (mut copied, mut skipped) = (0, 0);
    if !from.is_dir() {
        return Ok((0, 0));
    }
    for e in fs::read_dir(from)? {
        let p = e?.path();
        if !p.is_file() || !is_image(&p) {
            continue;
        }
        let dest = to.join(p.file_name().unwrap_or_default());
        if dest.exists() {
            skipped += 1;
        } else {
            fs::copy(&p, &dest)?;
            copied += 1;
        }
    }
    Ok((copied, skipped))
}

/// 导出可分享副本：复制到 dir 并返回文件名。dir 中已有的同名文件直接覆盖（用户已确认）；
/// 同一次导出中同名但来源不同的图片加序号，同一来源只复制一次。
pub fn copy_into(src: &Path, dir: &Path, used: &mut HashMap<String, PathBuf>) -> io::Result<String> {
    let mut name = src
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    if let Some(prev) = used.get(&name) {
        if prev == src {
            return Ok(name);
        }
        let p = Path::new(&name);
        let stem = p
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        let ext = p
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        name = (1..)
            .map(|i| format!("{stem}-{i}{ext}"))
            .find(|n| !used.contains_key(n))
            .unwrap_or_default();
    }
    fs::copy(src, dir.join(&name))?;
    used.insert(name.clone(), src.to_path_buf());
    Ok(name)
}

pub fn count_images(dir: &Path) -> usize {
    fs::read_dir(dir).map_or(0, |entries| {
        entries
            .filter_map(Result::ok)
            .filter(|e| e.path().is_file() && is_image(&e.path()))
            .count()
    })
}

/// URL 路径段转义（文件名中的空格、中文等）
pub fn encode_segment(seg: &str) -> String {
    seg.bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || b"-._~".contains(&b) {
                (b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}

/// Windows 路径 → `file:///C:/a%20b/c.png`
pub fn file_url(p: &Path) -> String {
    let s = p.to_string_lossy().replace('\\', "/");
    let mut out = String::from("file:///");
    for (i, seg) in s.split('/').enumerate() {
        if i > 0 {
            out.push('/');
        }
        // 盘符中的冒号保留
        out.push_str(&if i == 0 { seg.to_string() } else { encode_segment(seg) });
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
    fn path_info_reports_files_dirs_and_missing() {
        let d = tmpdir("info");
        let f = d.join("a.md");
        fs::write(&f, "").unwrap();
        let paths = [f, d.clone(), d.join("none")].map(|p| p.to_string_lossy().into_owned());
        assert_eq!(
            path_info(&paths),
            [
                PathInfo {
                    exists: true,
                    dir: false
                },
                PathInfo {
                    exists: true,
                    dir: true
                },
                PathInfo {
                    exists: false,
                    dir: false
                },
            ]
        );
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
            [
                ("zdir".into(), true),
                ("A.markdown".into(), false),
                ("b.md".into(), false),
                ("c.TXT".into(), false)
            ]
        );
    }

    #[test]
    fn sha256_matches_known_vector() {
        let hex: String = sha256(b"abc").unwrap().iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    #[test]
    fn save_image_names_by_content_and_dedupes() {
        let d = tmpdir("img");
        let a = save_image(&d, "截图 1.PNG", b"same").unwrap();
        let b = save_image(&d, "other.png", b"same").unwrap();
        let c = save_image(&d, "x", b"different").unwrap();
        assert_eq!(a, b);
        assert_ne!(a, c);
        let name = a.file_name().unwrap().to_str().unwrap();
        assert!(is_hash_name(name) && name.ends_with(".png"), "{name}");
        assert_eq!(fs::read_dir(&d).unwrap().count(), 2);
    }

    #[test]
    fn hash_name_rules() {
        assert!(is_hash_name("0123456789abcdef0123456789abcdef.png"));
        assert!(!is_hash_name("0123456789ABCDEF0123456789abcdef.png"));
        assert!(!is_hash_name("0123456789abcdef.png"));
        assert!(!is_hash_name("0123456789abcdef0123456789abcdef.txt"));
        assert!(!is_hash_name("cat.png"));
    }

    #[test]
    fn resolve_image_falls_back_only_for_hash_names() {
        let d = tmpdir("resolve");
        let lib = d.join("lib");
        fs::create_dir_all(&lib).unwrap();
        let saved = save_image(&lib, "p.png", b"pic").unwrap();
        let name = saved.file_name().unwrap();
        assert_eq!(resolve_image(&saved, &lib), Some(saved.clone()));
        let moved = Path::new(r"C:Userssomeone-elseAppDataLocalinkmark-images").join(name);
        assert_eq!(resolve_image(&moved, &lib), Some(lib.join(name)));
        fs::write(lib.join("cat.png"), b"c").unwrap();
        assert_eq!(
            resolve_image(
                Path::new(
                    r"C:
owherecat.png"
                ),
                &lib
            ),
            None
        );
        assert_eq!(resolve_image(&lib.join("a.md"), &lib), None);
    }

    #[test]
    fn copy_helpers() {
        let d = tmpdir("copy");
        let (from, to) = (d.join("from"), d.join("to"));
        fs::create_dir_all(&from).unwrap();
        fs::create_dir_all(&to).unwrap();
        fs::write(from.join("a.png"), b"a").unwrap();
        fs::write(from.join("b.png"), b"b").unwrap();
        fs::write(from.join("note.md"), b"x").unwrap();
        fs::write(to.join("b.png"), b"old").unwrap();
        assert_eq!(copy_images(&from, &to).unwrap(), (1, 1));
        assert_eq!(fs::read(to.join("b.png")).unwrap(), b"old");
        let mut used = HashMap::new();
        assert_eq!(copy_into(&from.join("b.png"), &to, &mut used).unwrap(), "b.png");
        assert_eq!(fs::read(to.join("b.png")).unwrap(), b"b", "已确认覆盖");
        assert_eq!(copy_into(&from.join("b.png"), &to, &mut used).unwrap(), "b.png");
        let other = d.join("other");
        fs::create_dir_all(&other).unwrap();
        fs::write(other.join("b.png"), b"other").unwrap();
        assert_eq!(copy_into(&other.join("b.png"), &to, &mut used).unwrap(), "b-1.png");
        assert_eq!(count_images(&to), 3);
    }

    #[test]
    fn file_url_encodes() {
        assert_eq!(file_url(Path::new(r"C:\a b\中.png")), "file:///C:/a%20b/%E4%B8%AD.png");
    }
}
