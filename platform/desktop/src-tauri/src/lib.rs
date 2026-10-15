mod diagnostics;
mod execution;
mod model;
mod storage;
mod validation;
use std::{path::{Path, PathBuf}, sync::Mutex};
use tauri::{Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use model::{AppError, DesktopState, ProfileInput, Result};
use execution::{ExecutionManager, LocalRun, RunRequest};

struct Service { view: Mutex<DesktopState>, home: PathBuf, data_dir: PathBuf }
fn state_error() -> AppError { AppError::new("DESKTOP_STATE_UNAVAILABLE", "앱 상태를 읽지 못했습니다. 앱을 다시 실행하세요.") }
fn caller(window: &WebviewWindow) -> Result<()> {
    if !window.url().is_ok_and(|url| validation::caller_allowed(window.label(), &url, cfg!(debug_assertions))) { return Err(AppError::new("DESKTOP_CALLER_DENIED", "로컬 CTAS 앱에서만 사용할 수 있는 기능입니다.")); } Ok(())
}
fn snapshot(service: &Service) -> Result<DesktopState> { service.view.lock().map(|view| view.clone()).map_err(|_| state_error()) }

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
        view.selected_folder = Some(folder.clone());
        view.diagnostics = diagnostics::refresh(Some(&folder), view.profile.as_ref(), &service.home);
        view.last_error = None; Ok(view.clone())
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
        storage::save(&service.data_dir, &checked)?;
        view.profile = Some(checked); view.diagnostics.repository = repo; view.last_error = None;
        Ok(view.clone())
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
        Ok(view.clone())
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
        let profile = snapshot(&service)?.profile.ok_or_else(|| AppError::new("PROFILE_REQUIRED", "프로젝트와 로컬 작업 폴더를 먼저 저장하세요."))?;
        if profile.provider != "codex" { return Err(AppError::new("PROVIDER_NOT_SUPPORTED", "현재 직접 실행은 Codex를 지원합니다. Claude Code는 설치 상태만 확인할 수 있습니다.")); }
        let path = diagnostics::installed_path("codex", &service.home).ok_or_else(|| AppError::new("CODEX_NOT_INSTALLED", "Codex CLI를 설치하고 로그인한 뒤 다시 실행하세요."))?;
        app.state::<ExecutionManager>().start(profile, RunRequest { prompt, expected_head }, path)
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

pub fn run() {
    tauri::Builder::default().plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let home = app.path().home_dir()?; let data_dir = app.path().app_data_dir()?;
            let (profile, error) = match storage::load(&data_dir, &home) { Ok(profile) => (profile, None), Err(error) => (None, Some(error)) };
            app.manage(ExecutionManager::new(data_dir.join("runs")));
            app.manage(Service { view: Mutex::new(DesktopState::new(profile, error)), home, data_dir }); Ok(())
        })
        .invoke_handler(tauri::generate_handler![desktop_state, choose_workspace, save_profile, refresh_diagnostics, open_workspace, start_local_run, list_local_runs, get_local_run, cancel_local_run])
        .build(tauri::generate_context!()).expect("CTAS desktop could not start")
        .run(|app, event| {
            // A macOS window can close while its application remains running.
            // Both paths must stop the local child before its UI disappears.
            let shutting_down = matches!(&event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit)
                || matches!(&event, tauri::RunEvent::WindowEvent { label, event: tauri::WindowEvent::Destroyed, .. } if label == "main");
            if shutting_down {
                if let Some(runner) = app.try_state::<ExecutionManager>() { runner.shutdown(); }
            }
        });
}
