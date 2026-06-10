// 项目后端(Rust 版,供打包后的独立 .app 用)。port 自 scanner/*.mjs。
// 命令:scan_projects / create_project / update_project / delete_project / draft_project。
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Milestone {
    pub title: String,
    #[serde(default)]
    pub done: bool,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Branch {
    pub name: String,
    #[serde(default)]
    pub milestones: Vec<Milestone>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub by: Option<serde_json::Value>,
}

#[derive(Serialize, Clone)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub category: String,
    pub emoji: String,
    pub tagline: String,
    pub status: String,
    pub goal: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outcome: Option<String>,
    pub path: String,
    pub source: String,
    pub branches: Vec<Branch>,
    pub mtime: f64,
}

#[derive(Deserialize, Default)]
struct Meta {
    name: Option<String>,
    category: Option<String>,
    emoji: Option<String>,
    tagline: Option<String>,
    status: Option<String>,
    goal: Option<String>,
    outcome: Option<String>,
    #[serde(default)]
    branches: Vec<Branch>,
}

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/".into()))
}
// 主根(新建项目 / 回收站默认落这里)
fn root() -> PathBuf {
    home().join("Downloads").join("王多鱼")
}
// 多扫描根:读用户配置(~/.project-hub/config.json);未配置时回退默认两根(向后兼容)
pub(crate) fn roots() -> Vec<PathBuf> {
    let cfg = config().lock().unwrap_or_else(|e| e.into_inner());
    let list: Vec<PathBuf> = cfg
        .roots
        .iter()
        .map(|s| expand_home(s))
        .filter(|p| p.is_dir())
        .collect();
    if !list.is_empty() {
        return list;
    }
    vec![
        home().join("Downloads").join("王多鱼"),
        home().join("Downloads").join("紫薇斗数网页"),
    ]
}

// ─── 用户配置(可交付化):扫描根 + 称呼,存 ~/.project-hub/config.json ───
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct HubConfig {
    #[serde(default)]
    pub roots: Vec<String>,
    #[serde(default, rename = "userName")]
    pub user_name: String,
}
/// 配置代数:set_config 时 +1,watcher 据此重建文件监听(热生效,无需重启)
pub(crate) static CONFIG_GEN: AtomicU64 = AtomicU64::new(0);

fn config_path() -> PathBuf {
    home().join(".project-hub").join("config.json")
}
fn expand_home(s: &str) -> PathBuf {
    if let Some(rest) = s.strip_prefix("~/") {
        home().join(rest)
    } else {
        PathBuf::from(s)
    }
}
fn config() -> &'static Mutex<HubConfig> {
    static C: OnceLock<Mutex<HubConfig>> = OnceLock::new();
    C.get_or_init(|| {
        let cfg = fs::read_to_string(config_path())
            .ok()
            .and_then(|t| serde_json::from_str::<HubConfig>(&t).ok())
            .unwrap_or_default();
        Mutex::new(cfg)
    })
}

#[tauri::command]
pub fn get_config() -> HubConfig {
    config().lock().unwrap_or_else(|e| e.into_inner()).clone()
}

#[tauri::command]
pub fn set_config(cfg: HubConfig) -> Result<HubConfig, String> {
    // 校验:roots 里的路径必须存在(给前端明确报错而非静默吞)
    for r in &cfg.roots {
        if !expand_home(r).is_dir() {
            return Err(format!("目录不存在: {}", r));
        }
    }
    let dir = config_path();
    if let Some(parent) = dir.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&dir, serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    *config().lock().unwrap_or_else(|e| e.into_inner()) = cfg.clone();
    CONFIG_GEN.fetch_add(1, Ordering::SeqCst);
    // 扫描缓存作废(根变了,旧缓存可能含不在新根里的项目)
    scan_cache().lock().unwrap_or_else(|e| e.into_inner()).clear();
    Ok(cfg)
}
// 按 id(文件夹名)在各根里找项目目录,找不到回退主根
fn find_dir(name: &str) -> PathBuf {
    for r in roots() {
        let d = r.join(name);
        if d.is_dir() {
            return d;
        }
    }
    root().join(name)
}

const SKIP_EXACT: &[&str] = &["__pycache__", "node_modules", ".git", ".idea", ".vscode", "dist", "build", "data", "xiaojing-report", "archives"];
const SKIP_SUFFIX: &[&str] = &["_runs", "-data", "_data", "_test", "_cache", ".egg-info", "_screenshots"];

fn is_project_dir(name: &str) -> bool {
    if name.starts_with('.') {
        return false;
    }
    if SKIP_EXACT.contains(&name) {
        return false;
    }
    if SKIP_SUFFIX.iter().any(|s| name.ends_with(s)) {
        return false;
    }
    true
}

fn classify(name: &str) -> (&'static str, &'static str) {
    let n = name.to_lowercase();
    let sci = ["tumor", "mouse", "brca", "microbe", "fusarium", "antibody", "metabric", "bft", "vsv", "proteogenom", "阴茎", "凯格尔", "paper", "aim1", "养生", "节气"];
    let cul = ["名著", "文豪", "agora", "哥伦布", "狼人", "吸血鬼", "紫薇", "ziwei", "小说", "传"];
    let eng = ["quant", "hub", "site", "tool", "offer", "jarvis", "audit", "reply", "聚鲸", "软文", "logo", "promo", "tesla", "article", "家办", "opc", "report", "sphere"];
    if sci.iter().any(|k| n.contains(k)) {
        return ("科研", "🧬");
    }
    if cul.iter().any(|k| n.contains(k)) {
        return ("文化", "🀄");
    }
    if eng.iter().any(|k| n.contains(k)) {
        return ("引擎", "⚙️");
    }
    ("其他", "📁")
}

fn status_from_name(name: &str) -> String {
    let n = name.to_lowercase();
    for k in ["废弃", "搁置", "deprecated", "abandon", "已停", "弃用"] {
        if n.contains(k) {
            return "failed".into();
        }
    }
    "active".into()
}

fn clean(s: &str) -> String {
    let t = s.replace("**", "").replace('`', "");
    let t = t.trim_start_matches(|c: char| c == '#' || c == '>' || c == '-' || c == ' ').trim();
    t.chars().take(72).collect()
}

fn section_key(h: &str) -> Option<&'static str> {
    let norm = h
        .trim_start_matches('#')
        .trim()
        .trim_start_matches(|c: char| c.is_ascii_digit() || c == '.' || c == '、' || c == ')' || c == ' ');
    let s = norm.to_lowercase();
    if s.starts_with("goal") || norm.starts_with("目标") {
        return Some("goal");
    }
    if s.starts_with("next step") || s.starts_with("todo") || norm.starts_with("下一步") || norm.starts_with("后续") || norm.starts_with("待办") {
        return Some("next");
    }
    if s.starts_with("current progress") || norm.starts_with("当前进度") || norm.starts_with("已完成") || norm.starts_with("进度") {
        return Some("progress");
    }
    None
}

fn bullet(ln: &str) -> Option<String> {
    let t = ln.trim_start();
    for p in ["- ", "* ", "+ "] {
        if let Some(rest) = t.strip_prefix(p) {
            return Some(rest.to_string());
        }
    }
    None
}

fn parse_handoff(text: &str) -> (String, Vec<Milestone>) {
    let mut goal: Vec<String> = vec![];
    let mut next: Vec<String> = vec![];
    let mut prog: Vec<String> = vec![];
    let mut checks: Vec<Milestone> = vec![];
    let mut cur: Option<&'static str> = None;
    let mut fence = false;
    for ln in text.lines() {
        if ln.trim_start().starts_with("```") {
            fence = !fence;
            continue;
        }
        if fence {
            continue;
        }
        let trimmed = ln.trim();
        let is_heading = ln.starts_with('#');
        let bold_heading = trimmed.starts_with("**") && trimmed.ends_with("**") && trimmed.len() > 4;
        if is_heading || bold_heading {
            let h = trimmed.trim_matches('*').trim_start_matches('#').trim();
            cur = section_key(h);
            continue;
        }
        let tl = ln.trim_start();
        if tl.starts_with("- [") || tl.starts_with("* [") {
            if let Some(close) = tl.find("] ") {
                let head = &tl[..close];
                let done = head.contains('x') || head.contains('X');
                let title = clean(&tl[close + 2..]);
                if !title.is_empty() {
                    checks.push(Milestone { title, done });
                }
                continue;
            }
        }
        if let Some(c) = cur {
            if let Some(b) = bullet(ln) {
                let t = clean(&b);
                match c {
                    "next" => next.push(t),
                    "progress" => prog.push(t),
                    _ => {}
                }
            } else if c == "goal" && !trimmed.is_empty() && goal.is_empty() {
                goal.push(clean(ln));
            }
        }
    }
    let g = goal.into_iter().next().unwrap_or_default();
    let mut ms: Vec<Milestone> = vec![];
    if !checks.is_empty() {
        ms = checks;
    } else {
        for t in prog {
            if !t.is_empty() {
                ms.push(Milestone { title: t, done: true });
            }
        }
        for t in next {
            if !t.is_empty() {
                ms.push(Milestone { title: t, done: false });
            }
        }
    }
    ms.truncate(14);
    (g, ms)
}

fn first_heading(text: &str) -> String {
    for ln in text.lines() {
        let t = ln.trim();
        if let Some(h) = t.strip_prefix("# ").or_else(|| t.strip_prefix("## ")).or_else(|| t.strip_prefix("### ")) {
            return clean(h);
        }
        if !t.is_empty() {
            return clean(t);
        }
    }
    String::new()
}

fn build_project(dir: &Path, name: &str) -> Project {
    let (cat, emoji) = classify(name);
    let mut p = Project {
        id: name.to_string(),
        name: name.to_string(),
        category: cat.into(),
        emoji: emoji.into(),
        tagline: String::new(),
        status: status_from_name(name),
        goal: String::new(),
        outcome: None,
        path: dir.to_string_lossy().to_string(),
        source: "folder".into(),
        branches: vec![],
        mtime: quick_mtime(dir),
    };

    let meta_path = dir.join(".project.json");
    if meta_path.exists() {
        if let Ok(txt) = fs::read_to_string(&meta_path) {
            if let Ok(m) = serde_json::from_str::<Meta>(&txt) {
                if let Some(v) = m.name {
                    p.name = v;
                }
                if let Some(v) = m.category {
                    p.category = v;
                }
                if let Some(v) = m.emoji {
                    p.emoji = v;
                }
                if let Some(v) = m.tagline {
                    p.tagline = v;
                }
                if let Some(v) = m.status {
                    p.status = v;
                }
                if let Some(v) = m.goal {
                    p.goal = v;
                }
                p.outcome = m.outcome;
                p.branches = m.branches;
                p.source = "project.json".into();
                return p;
            }
        }
    }

    let handoff = dir.join("HANDOFF.md");
    if handoff.exists() {
        if let Ok(txt) = fs::read_to_string(&handoff) {
            let (goal, ms) = parse_handoff(&txt);
            if !goal.is_empty() || !ms.is_empty() {
                p.tagline = if goal.is_empty() {
                    "HANDOFF 项目".into()
                } else {
                    goal.chars().take(32).collect()
                };
                p.goal = goal;
                if !ms.is_empty() {
                    p.branches = vec![Branch {
                        name: "里程碑(自 HANDOFF)".into(),
                        milestones: ms,
                        by: None,
                    }];
                }
                p.source = "handoff".into();
                return p;
            }
        }
    }

    for rn in ["README.md", "readme.md", "Readme.md"] {
        let rp = dir.join(rn);
        if rp.exists() {
            if let Ok(txt) = fs::read_to_string(&rp) {
                let tag: String = first_heading(&txt).chars().take(36).collect();
                p.tagline = tag.clone();
                p.goal = tag;
                p.source = "readme".into();
                return p;
            }
        }
    }

    p.tagline = "待补充简介".into();
    p
}

// 增量扫描缓存:key = (.project.json mtime, HANDOFF.md mtime, 目录 mtime),三者未变 → 复用上次 Project,
// 免去每轮对 41+ 项目的全量重读/递归(配合 fs-watch,高频刷新也只重读真正变了的项目)。
// 条目带写入时间,超 120s 强制重建一次(兜底深层变化导致的"最近活跃"失真)。
struct CacheEnt {
    key: (u64, u64, u64),
    at: u64,
    proj: Project,
}
fn scan_cache() -> &'static Mutex<HashMap<String, CacheEnt>> {
    static C: OnceLock<Mutex<HashMap<String, CacheEnt>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}
fn mt_of(p: &Path) -> u64 {
    fs::metadata(p)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
fn now_s() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

#[tauri::command]
pub fn scan_projects() -> Vec<Project> {
    let mut out: Vec<Project> = vec![];
    let mut cache = scan_cache().lock().unwrap_or_else(|e| e.into_inner());
    let mut seen: Vec<String> = vec![];
    let now = now_s();
    for r in roots() {
        if let Ok(rd) = fs::read_dir(&r) {
            for e in rd.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                let path = e.path();
                if !path.is_dir() || !is_project_dir(&name) {
                    continue;
                }
                seen.push(name.clone());
                let key = (
                    mt_of(&path.join(".project.json")),
                    mt_of(&path.join("HANDOFF.md")),
                    mt_of(&path),
                );
                if let Some(ent) = cache.get(&name) {
                    if ent.key == key && now.saturating_sub(ent.at) < 120 {
                        out.push(ent.proj.clone());
                        continue;
                    }
                }
                let proj = build_project(&path, &name);
                cache.insert(name.clone(), CacheEnt { key, at: now, proj: proj.clone() });
                out.push(proj);
            }
        }
    }
    // 清掉已消失的项目(防缓存泄漏)
    cache.retain(|k, _| seen.contains(k));
    drop(cache);
    let rank = |s: &str| match s {
        "active" => 0,
        "done" => 1,
        _ => 2,
    };
    out.sort_by(|a, b| rank(&a.status).cmp(&rank(&b.status)).then(a.name.cmp(&b.name)));
    out
}

fn safe_name(name: &str) -> Result<String, String> {
    let n: String = name.chars().filter(|c| !"/\\:*?\"<>|".contains(*c)).collect();
    let n = n.replace("..", "");
    let n = n.trim().to_string();
    if n.is_empty() || n.starts_with('.') {
        return Err("invalid project name".into());
    }
    Ok(n)
}

#[derive(Deserialize)]
pub struct CreateInput {
    name: String,
    category: Option<String>,
    emoji: Option<String>,
    tagline: Option<String>,
    status: Option<String>,
    goal: Option<String>,
    outcome: Option<String>,
    #[serde(default)]
    branches: Vec<Branch>,
}

#[tauri::command]
pub fn create_project(input: CreateInput) -> Result<serde_json::Value, String> {
    let name = safe_name(&input.name)?;
    let dir = root().join(&name);
    if dir.exists() {
        return Err(format!("already exists: {}", name));
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let meta = serde_json::json!({
        "category": input.category.unwrap_or_else(|| "其他".into()),
        "emoji": input.emoji.unwrap_or_else(|| "📁".into()),
        "tagline": input.tagline.unwrap_or_default(),
        "status": input.status.unwrap_or_else(|| "active".into()),
        "goal": input.goal.unwrap_or_default(),
        "outcome": input.outcome,
        "branches": input.branches,
    });
    fs::write(dir.join(".project.json"), serde_json::to_string_pretty(&meta).unwrap_or_default())
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true, "id": name, "path": dir.to_string_lossy() }))
}

#[tauri::command]
pub fn update_project(id: String, patch: serde_json::Value) -> Result<serde_json::Value, String> {
    let name = safe_name(&id)?;
    let dir = find_dir(&name);
    if !dir.exists() {
        return Err(format!("not found: {}", name));
    }
    let mp = dir.join(".project.json");
    let mut meta: serde_json::Value = if mp.exists() {
        fs::read_to_string(&mp)
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_else(|| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    if let (Some(o), Some(po)) = (meta.as_object_mut(), patch.as_object()) {
        for (k, v) in po {
            o.insert(k.clone(), v.clone());
        }
    }
    fs::write(&mp, serde_json::to_string_pretty(&meta).unwrap_or_default()).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true, "id": name }))
}

#[tauri::command]
pub fn delete_project(id: String, hard: Option<bool>) -> Result<serde_json::Value, String> {
    let name = safe_name(&id)?;
    let dir = find_dir(&name);
    if !dir.exists() {
        return Err(format!("not found: {}", name));
    }
    if hard.unwrap_or(false) {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
        return Ok(serde_json::json!({ "ok": true, "id": name, "deleted": "hard" }));
    }
    let trash = dir
        .parent()
        .map(|p| p.join(".project-hub-trash"))
        .unwrap_or_else(|| root().join(".project-hub-trash"));
    fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dest = trash.join(format!("{}__{}", name, ts));
    fs::rename(&dir, &dest).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true, "id": name, "deleted": "soft", "trash": dest.to_string_lossy() }))
}

fn clean_line(s: &str) -> String {
    let t = s.replace("**", "").replace('`', "");
    let t = t.trim_start_matches(|c: char| c == '#' || c == '>' || c == '*' || c == '+' || c == '-' || c == ' ').trim();
    t.chars().take(72).collect()
}

fn read_doc(dir: &Path) -> Option<(String, String)> {
    for n in ["README.md", "readme.md", "Readme.md", "HANDOFF.md", "README.txt", "readme.txt"] {
        let p = dir.join(n);
        if p.exists() {
            if let Ok(txt) = fs::read_to_string(&p) {
                return Some((n.to_string(), txt));
            }
        }
    }
    None
}

// 第一个非空 / 非围栏行当目标
fn goal_from_text(text: &str) -> String {
    let mut fence = false;
    for ln in text.lines() {
        let tl = ln.trim();
        if tl.starts_with("```") {
            fence = !fence;
            continue;
        }
        if fence || tl.is_empty() {
            continue;
        }
        let c = clean_line(tl);
        if c.chars().count() >= 4 {
            return c;
        }
    }
    String::new()
}

// 正文里的 checkbox / 「下一步·待办」段 bullet → 里程碑
fn milestones_from_text(text: &str) -> Vec<serde_json::Value> {
    let mut out: Vec<serde_json::Value> = vec![];
    for ln in text.lines() {
        let t = ln.trim_start();
        if (t.starts_with("- [") || t.starts_with("* [") || t.starts_with("+ [")) && t.len() > 5 {
            let mark = t.as_bytes()[3] as char;
            if let Some(close) = t.find("] ") {
                let title = clean_line(&t[close + 2..]);
                if !title.is_empty() {
                    out.push(serde_json::json!({ "title": title, "done": mark == 'x' || mark == 'X' }));
                }
            }
        }
    }
    if !out.is_empty() {
        out.truncate(12);
        return out;
    }
    let mut in_next = false;
    for ln in text.lines() {
        let t = ln.trim();
        let is_heading = t.starts_with('#') || (t.starts_with("**") && t.ends_with("**") && t.len() > 4);
        if is_heading {
            let h = t.trim_matches('*').trim_start_matches('#').trim().to_lowercase();
            in_next = h.contains("下一步") || h.contains("待办") || h.contains("todo") || h.contains("next") || h.contains("计划");
            continue;
        }
        if in_next {
            let tl = ln.trim_start();
            let bullet = tl.starts_with("- ") || tl.starts_with("* ") || tl.starts_with("+ ") || tl.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false);
            if bullet {
                let title = clean_line(tl);
                if !title.is_empty() {
                    out.push(serde_json::json!({ "title": title, "done": false }));
                }
            }
        }
    }
    out.truncate(12);
    out
}

fn clean_file_name(n: &str) -> String {
    let stem = match n.rfind('.') {
        Some(i) if i > 0 => &n[..i],
        _ => n,
    };
    let trimmed = stem.trim_start_matches(|c: char| c.is_ascii_digit() || c == '_' || c == '-' || c == '.' || c == ' ');
    let spaced: String = trimmed.chars().map(|c| if c == '_' || c == '-' { ' ' } else { c }).collect();
    spaced.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(48).collect()
}

fn is_image(n: &str) -> bool {
    let l = n.to_lowercase();
    [".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".svg"].iter().any(|e| l.ends_with(e))
}

#[tauri::command]
pub fn draft_project(id: String) -> Result<serde_json::Value, String> {
    let name = safe_name(&id)?;
    let dir = find_dir(&name);
    if !dir.exists() {
        return Err(format!("not found: {}", name));
    }
    let mut items: Vec<String> = vec![];
    if let Ok(rd) = fs::read_dir(&dir) {
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            if !n.starts_with('.') {
                items.push(n);
            }
        }
    }

    let mut goal = String::new();
    let mut branches: Vec<serde_json::Value> = vec![];

    // 1) README/HANDOFF 正文:目标 + checkbox/待办
    if let Some((doc_name, text)) = read_doc(&dir) {
        goal = goal_from_text(&text);
        let ms = milestones_from_text(&text);
        if !ms.is_empty() {
            branches.push(serde_json::json!({ "name": format!("里程碑(自 {})", doc_name), "milestones": ms }));
        }
    }

    // 2) 截图/图片密集 → 每张命名图当一项"已产出"
    let imgs: Vec<&String> = items.iter().filter(|n| is_image(n)).collect();
    if branches.is_empty() && imgs.len() >= 3 && imgs.len() * 2 >= items.len() {
        let mut sorted: Vec<String> = imgs.iter().map(|s| s.to_string()).collect();
        sorted.sort();
        let ms: Vec<serde_json::Value> = sorted
            .iter()
            .take(12)
            .map(|n| serde_json::json!({ "title": format!("{} 已产出", clean_file_name(n)), "done": true }))
            .collect();
        branches.push(serde_json::json!({ "name": "产出物(自文件名)", "milestones": ms }));
        if goal.is_empty() {
            goal = format!("{}:已产出 {} 项可视化交付", name, imgs.len());
        }
    }

    // 3) 文件名类型信号
    if branches.is_empty() {
        let lc: Vec<String> = items.iter().map(|n| n.to_lowercase()).collect();
        let has = |pat: &str| lc.iter().any(|n| n.contains(pat));
        let mut ms: Vec<serde_json::Value> = vec![];
        if has("readme") {
            ms.push(serde_json::json!({ "title": "写 README / 文档", "done": true }));
        }
        if has("package.json") || has("requirements") || has("cargo.toml") || has("environment.y") || has("go.mod") || has("pyproject") {
            ms.push(serde_json::json!({ "title": "脚手架 / 依赖", "done": true }));
        }
        if lc.iter().any(|n| n == "src" || n.starts_with("app.") || n.starts_with("index.") || n.starts_with("main.")) {
            ms.push(serde_json::json!({ "title": "核心实现", "done": false }));
        }
        if has("test") || has("spec") {
            ms.push(serde_json::json!({ "title": "测试", "done": false }));
        }
        if has("dist") || has("build") || has("renders") || has("manuscript") || has("报告") || has("交付") {
            ms.push(serde_json::json!({ "title": "产出 / 交付", "done": false }));
        }
        if !ms.is_empty() {
            branches.push(serde_json::json!({ "name": "里程碑(启发式)", "milestones": ms }));
        }
    }

    if branches.is_empty() {
        branches.push(serde_json::json!({ "name": "里程碑(启发式)", "milestones": [
            { "title": "明确目标", "done": false },
            { "title": "拆里程碑", "done": false }
        ]}));
    }
    if goal.is_empty() {
        goal = format!("整理 {} 的目标与进度(草稿)", name);
    }
    let draft = serde_json::json!({ "goal": goal, "branches": branches, "engine": "heuristic-rust" });
    Ok(serde_json::json!({ "ok": true, "id": name, "draft": draft, "note": "独立 .app 用启发式草稿(LLM 草稿走 dev 版)" }))
}

// ===== 项目侦察(recon):没里程碑也能看清文件夹里有什么 =====

const RECON_SKIP: &[&str] = &[
    "__pycache__", "node_modules", ".git", ".idea", ".vscode", "dist", "build",
    ".next", "venv", ".venv", "target", ".cache", ".parcel-cache", ".turbo",
];

fn skip_entry(name: &str) -> bool {
    name.starts_with('.') || RECON_SKIP.contains(&name)
}

fn mtime_ms(meta: &fs::Metadata) -> f64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

fn quick_mtime(dir: &Path) -> f64 {
    let mut newest = fs::metadata(dir).map(|m| mtime_ms(&m)).unwrap_or(0.0);
    if let Ok(rd) = fs::read_dir(dir) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if skip_entry(&name) {
                continue;
            }
            if let Ok(m) = e.metadata() {
                let t = mtime_ms(&m);
                if t > newest {
                    newest = t;
                }
            }
        }
    }
    newest
}

struct WalkStat {
    files: u64,
    dirs: u64,
    size: u64,
    newest: f64,
    types: std::collections::HashMap<String, u64>,
    truncated: bool,
}

fn walk(dir: &Path, max_depth: usize, budget: u64) -> WalkStat {
    let mut st = WalkStat {
        files: 0,
        dirs: 0,
        size: 0,
        newest: 0.0,
        types: std::collections::HashMap::new(),
        truncated: false,
    };
    let mut count: u64 = 0;
    let mut stack: Vec<(PathBuf, usize)> = vec![(dir.to_path_buf(), 0)];
    while let Some((d, depth)) = stack.pop() {
        let rd = match fs::read_dir(&d) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for e in rd.flatten() {
            if count >= budget {
                st.truncated = true;
                break;
            }
            let name = e.file_name().to_string_lossy().to_string();
            if skip_entry(&name) {
                continue;
            }
            let meta = match e.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            count += 1;
            let t = mtime_ms(&meta);
            if t > st.newest {
                st.newest = t;
            }
            if meta.is_dir() {
                st.dirs += 1;
                if depth < max_depth {
                    stack.push((e.path(), depth + 1));
                }
            } else {
                st.files += 1;
                st.size += meta.len();
                let ext = name
                    .rfind('.')
                    .filter(|i| *i > 0)
                    .map(|i| name[i + 1..].to_lowercase())
                    .unwrap_or_else(|| "(无扩展)".into());
                *st.types.entry(ext).or_insert(0) += 1;
            }
        }
        if count >= budget {
            st.truncated = true;
            break;
        }
    }
    st
}

fn top_tree(dir: &Path, cap: usize) -> Vec<serde_json::Value> {
    let mut items: Vec<(String, bool, u64, f64)> = vec![];
    if let Ok(rd) = fs::read_dir(dir) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if skip_entry(&name) {
                continue;
            }
            let meta = match e.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let is_dir = meta.is_dir();
            items.push((name, is_dir, if is_dir { 0 } else { meta.len() }, mtime_ms(&meta)));
        }
    }
    items.sort_by(|a, b| {
        (b.1 as u8)
            .cmp(&(a.1 as u8))
            .then(b.3.partial_cmp(&a.3).unwrap_or(std::cmp::Ordering::Equal))
    });
    items
        .into_iter()
        .take(cap)
        .map(|(name, dir, size, mtime)| serde_json::json!({ "name": name, "dir": dir, "size": size, "mtime": mtime }))
        .collect()
}

fn meta_mtime(dir: &Path) -> f64 {
    for n in [".project.json", "HANDOFF.md", "README.md", "readme.md"] {
        let p = dir.join(n);
        if p.exists() {
            if let Ok(m) = fs::metadata(&p) {
                return mtime_ms(&m);
            }
        }
    }
    0.0
}

fn readme_preview(dir: &Path) -> serde_json::Value {
    for n in ["README.md", "readme.md", "Readme.md", "HANDOFF.md", "README.txt", "readme.txt"] {
        let p = dir.join(n);
        if p.exists() {
            if let Ok(txt) = fs::read_to_string(&p) {
                let preview: String = txt.chars().take(1400).collect();
                return serde_json::json!({ "name": n, "preview": preview });
            }
        }
    }
    serde_json::Value::Null
}

fn git_info(dir: &Path) -> serde_json::Value {
    if !dir.join(".git").exists() {
        return serde_json::json!({ "repo": false });
    }
    let run = |args: &[&str]| -> String {
        std::process::Command::new("git")
            .arg("-C")
            .arg(dir)
            .args(args)
            .output()
            .ok()
            .and_then(|o| if o.status.success() { String::from_utf8(o.stdout).ok() } else { None })
            .map(|s| s.trim().to_string())
            .unwrap_or_default()
    };
    let last = run(&["log", "-1", "--format=%cI\u{1f}%s"]);
    let last_commit = if last.is_empty() {
        serde_json::Value::Null
    } else {
        let mut parts = last.splitn(2, '\u{1f}');
        let iso = parts.next().unwrap_or("").to_string();
        let msg: String = parts.next().unwrap_or("").chars().take(90).collect();
        serde_json::json!({ "iso": iso, "msg": msg })
    };
    let branch = run(&["rev-parse", "--abbrev-ref", "HEAD"]);
    let dirty = !run(&["status", "--porcelain"]).is_empty();
    serde_json::json!({ "repo": true, "branch": branch, "lastCommit": last_commit, "dirty": dirty })
}

#[tauri::command]
pub fn recon_project(id: String) -> Result<serde_json::Value, String> {
    let name = safe_name(&id)?;
    let dir = find_dir(&name);
    if !dir.exists() {
        return Ok(serde_json::json!({ "ok": false, "error": format!("not found: {}", name) }));
    }
    let w = walk(&dir, 3, 4000);
    let mtime = if w.newest > 0.0 {
        w.newest
    } else {
        fs::metadata(&dir).map(|m| mtime_ms(&m)).unwrap_or(0.0)
    };
    let mut types: Vec<(String, u64)> = w.types.into_iter().collect();
    types.sort_by(|a, b| b.1.cmp(&a.1));
    let types_json: Vec<serde_json::Value> = types
        .into_iter()
        .take(8)
        .map(|(ext, count)| serde_json::json!({ "ext": ext, "count": count }))
        .collect();
    Ok(serde_json::json!({
        "ok": true,
        "id": name,
        "path": dir.to_string_lossy(),
        "mtime": mtime,
        "metaMtime": meta_mtime(&dir),
        "fileCount": w.files,
        "dirCount": w.dirs,
        "totalSize": w.size,
        "truncated": w.truncated,
        "types": types_json,
        "tree": top_tree(&dir, 40),
        "readme": readme_preview(&dir),
        "git": git_info(&dir),
    }))
}
