use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError { pub code: String, pub message: String }
impl AppError { pub fn new(code: &str, message: &str) -> Self { Self { code: code.into(), message: message.into() } } }
pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Profile {
    pub project_id: String, pub workspace_id: String, pub repository_url: String,
    pub working_folder: String, pub provider: String,
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProfileInput { pub project_id: String, #[serde(default)] pub workspace_id: String, pub repository_url: String, pub provider: String }

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection { pub status: String, pub connected: bool, pub protocol_required: bool, pub message: String }
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolDiagnostic { pub installed: bool, pub path: Option<String>, pub version: Option<String>, pub error_code: Option<String> }
#[derive(Clone, Debug, Serialize)]
pub struct Tools { pub git: ToolDiagnostic, pub codex: ToolDiagnostic, pub claude: ToolDiagnostic }
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryDiagnostic {
    pub status: String, pub working_folder: Option<String>, pub branch: Option<String>, pub head: Option<String>,
    pub clean: Option<bool>, pub origin: Option<String>, pub matches_profile: Option<bool>, pub error_code: Option<String>,
}
impl RepositoryDiagnostic {
    pub fn empty() -> Self { Self { status: "not_selected".into(), working_folder: None, branch: None, head: None, clean: None, origin: None, matches_profile: None, error_code: None } }
    pub fn failed(folder: &str, code: &str) -> Self { Self { status: "error".into(), working_folder: Some(folder.into()), error_code: Some(code.into()), ..Self::empty() } }
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostics { pub checked_at: Option<String>, pub tools: Tools, pub repository: RepositoryDiagnostic }
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopState {
    pub schema_version: u8, pub app_version: String, pub connection: Connection, pub profile: Option<Profile>,
    pub selected_folder: Option<String>, pub diagnostics: Diagnostics, pub last_error: Option<AppError>,
}
impl DesktopState {
    pub fn new(profile: Option<Profile>, error: Option<AppError>) -> Self {
        let unknown = || ToolDiagnostic { installed: false, path: None, version: None, error_code: Some("DIAGNOSTICS_NOT_RUN".into()) };
        Self { schema_version: 1, app_version: env!("CARGO_PKG_VERSION").into(),
            connection: Connection { status: "protocol_required".into(), connected: false, protocol_required: true,
                message: "Nora 작업 자동 수신은 아직 연결 전입니다. 로컬 Codex 실행과 별도로 관리됩니다.".into() },
            selected_folder: profile.as_ref().map(|p| p.working_folder.clone()), profile,
            diagnostics: Diagnostics { checked_at: None, tools: Tools { git: unknown(), codex: unknown(), claude: unknown() }, repository: RepositoryDiagnostic::empty() }, last_error: error }
    }
}
