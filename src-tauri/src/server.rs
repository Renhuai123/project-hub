// 内置本地 HTTP 推送端口(127.0.0.1:3120):让外部 agent(Claude Code / wanman / curl)
// 直接 POST 给「正在运行的 .app」改项目,无需写 .project.json 再等 6 秒轮询。
// 镜像 dev 版(vite :5173)的 /api 契约,见 scanner/AI_API.md —— dev / app 同一套接口。
// 变更成功后发 `projects-changed` 事件 → 前端立即重扫(真·推送,毫秒级反映)。
use std::io::Read;
use tauri::{AppHandle, Emitter};

pub const PORT: u16 = 3120;

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        // 只绑 127.0.0.1(本机),不对外网开放;绑定失败(端口被占)→ 记日志、退出线程,app 照常跑。
        let server = match tiny_http::Server::http(("127.0.0.1", PORT)) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[project-hub] 内置 HTTP 端口 {} 启动失败(可能被占用): {}", PORT, e);
                return;
            }
        };
        eprintln!("[project-hub] 内置推送端口已开:http://127.0.0.1:{}", PORT);
        for mut req in server.incoming_requests() {
            // 直接匹配枚举(不依赖各版本不一定有的 as_str()),只关心 GET/POST/OPTIONS
            let method = match req.method() {
                tiny_http::Method::Get => "GET",
                tiny_http::Method::Post => "POST",
                tiny_http::Method::Options => "OPTIONS",
                _ => "OTHER",
            };
            let path = req.url().split('?').next().unwrap_or("").to_string();
            let mut body = String::new();
            let _ = req.as_reader().read_to_string(&mut body);

            let (code, json, changed) = route(method, &path, &body);
            if changed {
                // 通知前端:有 agent 经端口改了项目 → 立刻重扫 + 滚活动流(不等 6s 轮询)
                let _ = app.emit("projects-changed", ());
            }
            respond(req, code, &json);
        }
    });
}

fn respond(req: tiny_http::Request, code: u16, json: &serde_json::Value) {
    let data = json.to_string();
    let ct = tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]).unwrap();
    let cors = tiny_http::Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap();
    let resp = tiny_http::Response::from_string(data)
        .with_status_code(code)
        .with_header(ct)
        .with_header(cors);
    let _ = req.respond(resp);
}

#[derive(serde::Deserialize)]
struct UpdateBody {
    id: String,
    #[serde(default)]
    patch: serde_json::Value,
}

#[derive(serde::Deserialize)]
struct DeleteBody {
    id: String,
    #[serde(default)]
    hard: Option<bool>,
}

fn route(method: &str, path: &str, body: &str) -> (u16, serde_json::Value, bool) {
    use crate::projects;
    let err = |e: String| serde_json::json!({ "ok": false, "error": e });
    match (method, path) {
        ("GET", "/health") | ("GET", "/api/health") => (
            200,
            serde_json::json!({
                "ok": true,
                "app": "project-hub",
                "port": PORT,
                "endpoints": ["GET /api/projects", "POST /api/project/create", "POST /api/project/update", "POST /api/project/delete"],
            }),
            false,
        ),
        ("GET", "/api/config") => (
            200,
            serde_json::to_value(projects::get_config()).unwrap_or_else(|_| serde_json::json!({})),
            false,
        ),
        ("POST", "/api/config") => match serde_json::from_str::<projects::HubConfig>(body) {
            Ok(cfg) => match projects::set_config(cfg) {
                Ok(v) => (200, serde_json::to_value(v).unwrap_or_default(), true),
                Err(e) => (400, err(e), false),
            },
            Err(e) => (400, err(format!("bad body: {}", e)), false),
        },
        ("GET", "/api/projects") => (
            200,
            serde_json::to_value(projects::scan_projects()).unwrap_or_else(|_| serde_json::json!([])),
            false,
        ),
        ("POST", "/api/project/create") => match serde_json::from_str::<projects::CreateInput>(body) {
            Ok(input) => match projects::create_project(input) {
                Ok(v) => (200, v, true),
                Err(e) => (400, err(e), false),
            },
            Err(e) => (400, err(format!("bad body: {}", e)), false),
        },
        ("POST", "/api/project/update") => match serde_json::from_str::<UpdateBody>(body) {
            Ok(b) => match projects::update_project(b.id, b.patch) {
                Ok(v) => (200, v, true),
                Err(e) => (400, err(e), false),
            },
            Err(e) => (400, err(format!("bad body: {}", e)), false),
        },
        ("POST", "/api/project/delete") => match serde_json::from_str::<DeleteBody>(body) {
            Ok(b) => match projects::delete_project(b.id, b.hard) {
                Ok(v) => (200, v, true),
                Err(e) => (400, err(e), false),
            },
            Err(e) => (400, err(format!("bad body: {}", e)), false),
        },
        // CORS 预检
        ("OPTIONS", _) => (200, serde_json::json!({ "ok": true }), false),
        _ => (404, err(format!("not found: {} {}", method, path)), false),
    }
}
