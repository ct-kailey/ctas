fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "desktop_state", "choose_workspace", "save_profile", "refresh_diagnostics", "open_workspace",
            "start_local_run", "list_local_runs", "get_local_run", "cancel_local_run",
        ]),
    )).expect("CTAS desktop build configuration is invalid");
}
