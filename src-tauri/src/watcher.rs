// 文件系统监听(真·实时):macOS FSEvents 递归监听两个项目根,
// agent 直接写 .project.json / HANDOFF.md / 新建删除项目文件夹 → 1 秒内 emit `projects-changed`,
// 前端立即重扫 —— 根治「改了文件、桌面等轮询才动」。
// 事件过滤:只对元数据文件与根目录顶层增删置脏(项目内 build 产物等海量写入不触发),1s 防抖合并。
use notify::{event::ModifyKind, EventKind, RecursiveMode, Watcher};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let dirty = Arc::new(AtomicBool::new(false));
        let d2 = dirty.clone();

        let mut watcher = match notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
            if let Ok(ev) = res {
                if event_relevant(&ev) {
                    d2.store(true, Ordering::SeqCst);
                }
            }
        }) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[project-hub] 文件监听启动失败(回退纯轮询): {}", e);
                return;
            }
        };

        let watch_all = |w: &mut notify::RecommendedWatcher| -> usize {
            let mut n = 0;
            for r in crate::projects::roots() {
                match w.watch(&r, RecursiveMode::Recursive) {
                    Ok(()) => n += 1,
                    Err(e) => eprintln!("[project-hub] watch {:?} 失败: {}", r, e),
                }
            }
            n
        };
        let watched = watch_all(&mut watcher);
        eprintln!("[project-hub] 文件监听已开({} roots, FSEvents) → 变更毫秒级推送", watched);

        // 防抖循环:每 1s 检查脏标记合并推送;配置代数变化 → 重新 watch 新目录(热生效,无需重启)
        let mut gen = crate::projects::CONFIG_GEN.load(Ordering::SeqCst);
        loop {
            std::thread::sleep(Duration::from_millis(1000));
            let g = crate::projects::CONFIG_GEN.load(Ordering::SeqCst);
            if g != gen {
                gen = g;
                drop(watcher);
                watcher = match notify::recommended_watcher({
                    let d3 = dirty.clone();
                    move |res: Result<notify::Event, notify::Error>| {
                        if let Ok(ev) = res {
                            if event_relevant(&ev) {
                                d3.store(true, Ordering::SeqCst);
                            }
                        }
                    }
                }) {
                    Ok(w) => w,
                    Err(e) => {
                        eprintln!("[project-hub] 重建监听失败: {}", e);
                        return;
                    }
                };
                let n = watch_all(&mut watcher);
                eprintln!("[project-hub] 配置变更 → 重建监听({} roots)", n);
                dirty.store(true, Ordering::SeqCst);
            }
            if dirty.swap(false, Ordering::SeqCst) {
                let _ = app.emit("projects-changed", ());
            }
        }
    });
}

/// 事件相关性:①元数据文件(.project.json / HANDOFF.md / README*)被改 ②根目录顶层条目增删/改名(=新建/删除项目)
fn event_relevant(ev: &notify::Event) -> bool {
    let roots = crate::projects::roots();
    for p in &ev.paths {
        if let Some(name) = p.file_name().and_then(|s| s.to_str()) {
            if name == ".project.json"
                || name == "HANDOFF.md"
                || name.to_ascii_lowercase().starts_with("readme")
            {
                return true;
            }
        }
        if let Some(parent) = p.parent() {
            if roots.iter().any(|r| r == parent) {
                if matches!(
                    ev.kind,
                    EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_))
                ) {
                    return true;
                }
            }
        }
    }
    false
}
