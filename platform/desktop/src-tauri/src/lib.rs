mod diagnostics;
mod execution;
mod receiver;
mod model;
mod storage;
mod validation;
use std::{path::{Path, PathBuf}, sync::Mutex};
use tauri::{Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_deep_link::DeepLinkExt;
use receiver::ReceiverManager;
use model::{AppError, DesktopState, ProfileInput, Result};
use execution::{ExecutionManager, LocalRun, RunRequest};

struct Service { view: Mutex<DesktopState>, home: PathBuf, data_dir: PathBuf, receiver: ReceiverManager }
fn state_error() -> AppError { AppError::new("DESKTOP_STATE_UNAVAILABLE", "앱 상태를 읽지 못했습니다. 앱을 다시 실행하세요.") }
fn caller(window: &WebviewWindow) -> Result<()> {
    if !window.url().is_ok_and(|url| validation::caller_allowed(window.label(), &url, cfg!(debug_assertions))) { return Err(AppError::new("DESKTOP_CALLER_DENIED", "로컬 CTAS 앱에서만 사용할 수 있는 기능입니다.")); } Ok(())
}
fn snapshot(service: &Service) -> Result<DesktopState> { let mut view=service.view.lock().map(|view| view.clone()).map_err(|_| state_error())?;view.desktop_connection=service.receiver.snapshot();Ok(view) }

#[tauri::command]
async fn desktop_state(window: WebviewWindow, service: State<'_, Service>) -> Result<DesktopState> { caller(&window)?; snapshot(&service) }

#[tauri::command]
async fn choose_workspace(window: WebviewWindow, app: tauri::AppHandle) -> Result<DesktopState> {
    caller(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let service = app.state::<Service>();
        let chosen = app.dialog().file().set_title("Git 프로젝트 최상위 폴더 선택").blocking_pick_folder();
        let Some(chosen) = chosen else { return snapshot(&service); };
        let path = chosen.into_path().map_err(|_| AppError::new("WORKSPACE_PATH_INVALID", "로컬 폴더를 선택하세요."))?;
        let root = diagnostics::validate_repository_folder(&path, &service.home)?;
        let folder = root.to_string_lossy().to_string();
        let mut view = service.view.lock().map_err(|_| state_error())?;
        if view.selected_folder.as_deref() != Some(&folder) { service.receiver.invalidate_for_change()?; }
        view.selected_folder = Some(folder.clone());
        view.diagnostics = diagnostics::refresh(Some(&folder), view.profile.as_ref(), &service.home);
        view.last_error = None; view.desktop_connection=service.receiver.snapshot(); Ok(view.clone())
    }).await.map_err(|_| state_error())?
}

#[tauri::command]
async fn save_profile(window: WebviewWindow, app: tauri::AppHandle, profile: ProfileInput) -> Result<DesktopState> {
    caller(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let service = app.state::<Service>(); let mut view = service.view.lock().map_err(|_| state_error())?;
        let folder = view.selected_folder.as_deref().ok_or_else(|| AppError::new("WORKSPACE_REQUIRED", "먼저 로컬 작업 폴더를 선택하세요."))?;
        let root = diagnostics::validate_repository_folder(Path::new(folder), &service.home)?;
        if root != Path::new(folder) { return Err(AppError::new("WORKSPACE_PATH_CHANGED", "작업 폴더의 실제 경로가 바뀌었습니다. 다시 선택하세요.")); }
        let checked = validation::profile(profile, &root, &service.home)?;
        let repo = diagnostics::repository(folder, Some(&checked), &service.home)?;
        if repo.matches_profile != Some(true) { return Err(AppError::new("REPOSITORY_MISMATCH", "입력한 저장소와 선택한 폴더의 origin이 다릅니다.")); }
        if view.profile.as_ref() != Some(&checked) { service.receiver.invalidate_for_change()?; }
        storage::save(&service.data_dir, &checked)?;
        service.receiver.update_profile(checked.clone())?;
        view.profile = Some(checked); view.diagnostics.repository = repo; view.last_error = None;
        view.desktop_connection=service.receiver.snapshot(); Ok(view.clone())
    }).await.map_err(|_| state_error())?
}

#[tauri::command]
async fn refresh_diagnostics(window: WebviewWindow, app: tauri::AppHandle) -> Result<DesktopState> {
    caller(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let service = app.state::<Service>(); let previous = snapshot(&service)?;
        let result = diagnostics::refresh(previous.selected_folder.as_deref(), previous.profile.as_ref(), &service.home);
        let mut view = service.view.lock().map_err(|_| state_error())?;
        if view.selected_folder == previous.selected_folder && view.profile == previous.profile { view.diagnostics = result; view.last_error = None; }
        view.desktop_connection=service.receiver.snapshot(); Ok(view.clone())
    }).await.map_err(|_| state_error())?
}

#[tauri::command]
async fn open_workspace(window: WebviewWindow, app: tauri::AppHandle) -> Result<DesktopState> {
    caller(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let service = app.state::<Service>(); let view = snapshot(&service)?;
        let profile = view.profile.as_ref().ok_or_else(|| AppError::new("PROFILE_REQUIRED", "프로젝트 정보를 먼저 저장하세요."))?;
        let url = validation::workspace_url(profile)?;
        diagnostics::open_workspace_url(&url, &service.home)?;
        Ok(view)
    }).await.map_err(|_| state_error())?
}

#[tauri::command]
async fn start_local_run(window: WebviewWindow, app: tauri::AppHandle, prompt: String, expected_head: String) -> Result<LocalRun> {
    caller(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let service = app.state::<Service>();
        let view=service.view.lock().map_err(|_|state_error())?;
        let profile = view.profile.clone().ok_or_else(|| AppError::new("PROFILE_REQUIRED", "프로젝트와 로컬 작업 폴더를 먼저 저장하세요."))?;
        if view.selected_folder.as_deref()!=Some(&profile.working_folder){return Err(AppError::new("PROFILE_REQUIRED","선택한 작업 폴더를 프로젝트 정보에 먼저 저장하세요."));}
        let path = diagnostics::installed_path(if profile.provider=="codex"{"codex"}else{"claude"}, &service.home).ok_or_else(|| AppError::new("CLI_NOT_INSTALLED", "선택한 CLI를 설치하고 로그인한 뒤 다시 실행하세요."))?;
        service.receiver.start_manual(profile, RunRequest { prompt, expected_head }, path)
    }).await.map_err(|_| state_error())?
}

#[tauri::command]
async fn list_local_runs(window: WebviewWindow, app: tauri::AppHandle) -> Result<Vec<LocalRun>> {
    caller(&window)?;
    tauri::async_runtime::spawn_blocking(move || app.state::<ExecutionManager>().list()).await.map_err(|_| state_error())?
}

#[tauri::command]
async fn get_local_run(window: WebviewWindow, app: tauri::AppHandle, run_id: String) -> Result<LocalRun> {
    caller(&window)?;
    tauri::async_runtime::spawn_blocking(move || app.state::<ExecutionManager>().get(&run_id)).await.map_err(|_| state_error())?
}

#[tauri::command]
async fn cancel_local_run(window: WebviewWindow, app: tauri::AppHandle, run_id: String) -> Result<LocalRun> {
    caller(&window)?;
    tauri::async_runtime::spawn_blocking(move || app.state::<ExecutionManager>().cancel(&run_id)).await.map_err(|_| state_error())?
}

#[tauri::command]
async fn pair_desktop(window: WebviewWindow, app: tauri::AppHandle, code: String)->Result<DesktopState>{
    caller(&window)?;tauri::async_runtime::spawn_blocking(move||{let service=app.state::<Service>();let view=snapshot(&service)?;
        if view.profile.as_ref().map(|p|p.working_folder.as_str())!=view.selected_folder.as_deref(){return Err(AppError::new("PROFILE_REQUIRED","선택한 작업 폴더를 먼저 저장하세요."));}
        service.receiver.pair(code)?;snapshot(&service)
    }).await.map_err(|_|state_error())?
}
#[tauri::command]
async fn set_desktop_receiving(window:WebviewWindow,app:tauri::AppHandle,enabled:bool)->Result<DesktopState>{
    caller(&window)?;tauri::async_runtime::spawn_blocking(move||{let service=app.state::<Service>();service.receiver.set_receiving(enabled)?;snapshot(&service)}).await.map_err(|_|state_error())?
}
#[tauri::command]
async fn disconnect_desktop(window:WebviewWindow,app:tauri::AppHandle)->Result<DesktopState>{
    caller(&window)?;tauri::async_runtime::spawn_blocking(move||{let service=app.state::<Service>();service.receiver.disconnect()?;snapshot(&service)}).await.map_err(|_|state_error())?
}
fn wake_from_deep_links(app:&tauri::AppHandle,urls:impl IntoIterator<Item=url::Url>){
    if urls.into_iter().any(|url|validation::deep_link_project(&url).is_some()){
        // A link is only a wake-up signal. It never changes profiles, pairs a
        // device, enables receiving, or starts a run.
        if let Some(window)=app.get_webview_window("main"){let _=window.show();let _=window.set_focus();}
    }
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app,_args,_cwd|{if let Some(window)=app.get_webview_window("main"){let _=window.show();let _=window.set_focus();}}))
        .plugin(tauri_plugin_deep_link::init()).plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let home = app.path().home_dir()?; let data_dir = app.path().app_data_dir()?;
            let (profile, error) = match storage::load(&data_dir, &home) { Ok(profile) => (profile, None), Err(error) => (None, Some(error)) };
            let runner=ExecutionManager::new(data_dir.join("runs"));
            let receiver=ReceiverManager::new(&data_dir,home.clone(),profile.clone(),runner.clone()).map_err(|e|std::io::Error::other(e.code))?;
            app.manage(runner);app.manage(receiver.clone());
            app.manage(Service { view: Mutex::new(DesktopState::new(profile, error)), home, data_dir,receiver:receiver.clone() });
            receiver.spawn();
            if let Some(urls)=app.deep_link().get_current()?{wake_from_deep_links(app.handle(),urls);}
            let handle=app.handle().clone();app.deep_link().on_open_url(move|event|wake_from_deep_links(&handle,event.urls()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![desktop_state, choose_workspace, save_profile, refresh_diagnostics, open_workspace, start_local_run, list_local_runs, get_local_run, cancel_local_run, pair_desktop, set_desktop_receiving, disconnect_desktop])
        .build(tauri::generate_context!()).expect("CTAS desktop could not start")
        .run(|app, event| {
            // A macOS window can close while its application remains running.
            // Both paths must stop the local child before its UI disappears.
            let window_closed = matches!(&event, tauri::RunEvent::WindowEvent { label, event: tauri::WindowEvent::Destroyed, .. } if label == "main");
            let shutting_down = matches!(&event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) || window_closed;
            if shutting_down {
                if let Some(receiver)=app.try_state::<ReceiverManager>(){receiver.stop();}
                if let Some(runner) = app.try_state::<ExecutionManager>() { runner.shutdown(); }
                // macOS otherwise keeps a windowless single instance alive,
                // preventing a later web deep link from opening a fresh app.
                if window_closed { app.exit(0); }
            }
        });
}
