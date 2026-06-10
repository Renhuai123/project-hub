mod projects;
mod server;
mod watcher;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

// true = 壁纸层(桌面级、不可交互);false = 浏览模式(普通层、可交互、置前)
static WALLPAPER_MODE: AtomicBool = AtomicBool::new(true);

// 设置窗口层级:wallpaper=true 压到桌面层(壁纸);false 提到普通层并聚焦(可交互)。
#[cfg(target_os = "macos")]
fn apply_window_mode(window: &tauri::WebviewWindow, wallpaper: bool) {
    use cocoa::base::id;
    use objc::{msg_send, sel, sel_impl};

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGWindowLevelForKey(key: i32) -> i32;
    }
    // kCGDesktopWindowLevelKey=2(桌面层),kCGNormalWindowLevelKey=4(普通层)
    const K_DESKTOP: i32 = 2;
    const K_NORMAL: i32 = 4;

    let ns_window: id = match window.ns_window() {
        Ok(ptr) => ptr as id,
        Err(_) => return,
    };

    unsafe {
        if wallpaper {
            let level = CGWindowLevelForKey(K_DESKTOP) as i64;
            let _: () = msg_send![ns_window, setLevel: level];
            // CanJoinAllSpaces(1<<0) | Stationary(1<<4) | IgnoresCycle(1<<6)
            let behavior: u64 = (1 << 0) | (1 << 4) | (1 << 6);
            let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
        } else {
            let level = CGWindowLevelForKey(K_NORMAL) as i64;
            let _: () = msg_send![ns_window, setLevel: level];
            let _: () = msg_send![ns_window, setCollectionBehavior: 0u64];
        }
    }

    // 进入浏览模式时把窗口提到前台并聚焦,才能接收点击
    if !wallpaper {
        let _ = window.set_focus();
    }
}

#[cfg(not(target_os = "macos"))]
fn apply_window_mode(_window: &tauri::WebviewWindow, _wallpaper: bool) {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostarted"]),
        ));

    // macOS 13–15:解除 WKWebView 的 60fps 上限,让滚动/动画跑满 120Hz ProMotion。
    // 走 WebKit 私有 _features(PreferPageRenderingUpdatesNear60FPSEnabled=false);
    // 本地自用 app 无碍,但用了私有 API → 不能上 Mac App Store;macOS 26+ 上是空操作。
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_plugin_macos_fps::init());

    builder
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // 初始窗口模式:开机自启(LaunchAgent 带 --autostarted)→ 安静壁纸层、不抢焦点;
            // 手动启动 / 重装后启动(无此旗标)→ 前台可见,免得找不着。⌃⌥⌘P 随时互切。
            let autostarted = std::env::args().any(|a| a == "--autostarted");
            if let Some(window) = app.get_webview_window("main") {
                apply_window_mode(&window, autostarted);
            }

            // 开机自启(登录时自动起;LaunchAgent)
            #[cfg(desktop)]
            {
                use tauri_plugin_autostart::ManagerExt;
                let _ = app.autolaunch().enable();
            }

            // 全局热键 ⌃⌥⌘P:在「壁纸」⟷「浏览(可交互)」之间切换
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };

                let toggle = Shortcut::new(
                    Some(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER),
                    Code::KeyP,
                );
                let toggle_for_handler = toggle.clone();

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app, shortcut, event| {
                            if shortcut == &toggle_for_handler
                                && event.state() == ShortcutState::Pressed
                            {
                                if let Some(window) = app.get_webview_window("main") {
                                    // fetch_xor 返回旧值;新值 = !旧值
                                    let was_wallpaper =
                                        WALLPAPER_MODE.fetch_xor(true, Ordering::SeqCst);
                                    apply_window_mode(&window, !was_wallpaper);
                                }
                            }
                        })
                        .build(),
                )?;

                app.global_shortcut().register(toggle)?;
            }

            // 内置 HTTP 推送端口(127.0.0.1:3120)—— 外部 agent 直接 POST 改项目,
            // 无需写 .project.json 等轮询;变更后发 projects-changed 事件让前端立即刷新。
            server::start(app.handle().clone());

            // 文件系统监听:agent 直接写 .project.json / 增删项目文件夹 → 1s 内推送前端重扫
            watcher::start(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            projects::scan_projects,
            projects::create_project,
            projects::update_project,
            projects::delete_project,
            projects::draft_project,
            projects::recon_project,
            projects::get_config,
            projects::set_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
