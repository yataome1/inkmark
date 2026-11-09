//! 设置：`%APPDATA%\Inkmark\settings.json`，与 0.1.0 同一文件（FR-104）。

use serde_json::{Map, Value, json};
use std::fs;
use std::io;
use std::path::PathBuf;

const MAX_RECENT: usize = 10;

pub struct Settings {
    path: PathBuf,
    value: Value,
}

fn defaults() -> Value {
    json!({ "theme": "system", "recent": [], "sidebar": { "visible": true, "tab": "outline", "width": 260 }, "folder": null, "favorites": [], "tabs": { "paths": [], "active": 0 }, "restoreTabs": true })
}

impl Settings {
    pub fn load(path: PathBuf) -> Self {
        let mut value = defaults();
        if let Some(Value::Object(saved)) = fs::read_to_string(&path)
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
        {
            merge(&mut value, saved);
        }
        Self { path, value }
    }

    pub fn value(&self) -> &Value {
        &self.value
    }

    /// 顶层字段整体替换后写盘。
    pub fn update(&mut self, patch: Map<String, Value>) -> io::Result<()> {
        merge(&mut self.value, patch);
        if let Some(dir) = self.path.parent() {
            fs::create_dir_all(dir)?;
        }
        fs::write(&self.path, serde_json::to_string_pretty(&self.value)?)
    }

    pub fn recent(&self) -> Vec<String> {
        self.value["recent"]
            .as_array()
            .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default()
    }

    pub fn add_recent(&mut self, p: &str) -> io::Result<()> {
        let mut list = self.recent();
        list.retain(|r| r != p);
        list.insert(0, p.to_string());
        list.truncate(MAX_RECENT);
        let mut patch = Map::new();
        patch.insert("recent".into(), json!(list));
        self.update(patch)
    }

    pub fn restore_tabs(&self) -> bool {
        self.value["restoreTabs"].as_bool().unwrap_or(true)
    }

    pub fn theme(&self) -> &str {
        self.value["theme"].as_str().unwrap_or("system")
    }
}

fn merge(target: &mut Value, patch: Map<String, Value>) {
    if let Value::Object(t) = target {
        t.extend(patch);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(tag: &str) -> PathBuf {
        let p = std::env::temp_dir()
            .join(format!("inkmark-settings-{tag}-{}", std::process::id()))
            .join("settings.json");
        let _ = fs::remove_file(&p);
        p
    }

    #[test]
    fn missing_file_gives_defaults() {
        let s = Settings::load(temp_file("missing"));
        assert_eq!(s.theme(), "system");
        assert!(s.recent().is_empty());
    }

    #[test]
    fn defaults_include_favorites_and_sidebar_width() {
        let s = Settings::load(temp_file("defaults"));
        assert_eq!(s.value()["favorites"], json!([]));
        assert_eq!(s.value()["sidebar"]["width"], 260);
    }

    #[test]
    fn reads_v010_file_and_keeps_unknown_fields() {
        let p = temp_file("v010");
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(&p, r#"{"theme":"dark","recent":["C:\\a.md"],"extra":1}"#).unwrap();
        let s = Settings::load(p);
        assert_eq!(s.theme(), "dark");
        assert_eq!(s.recent(), ["C:\\a.md"]);
        assert_eq!(s.value()["extra"], 1);
        assert_eq!(s.value()["sidebar"]["tab"], "outline");
    }

    #[test]
    fn add_recent_dedupes_and_caps() {
        let p = temp_file("recent");
        let mut s = Settings::load(p.clone());
        for i in 0..12 {
            s.add_recent(&format!("{i}.md")).unwrap();
        }
        s.add_recent("5.md").unwrap();
        let r = s.recent();
        assert_eq!(r.len(), MAX_RECENT);
        assert_eq!(r[0], "5.md");
        assert_eq!(r.iter().filter(|x| *x == "5.md").count(), 1);
        assert_eq!(Settings::load(p).recent(), r);
    }
}
