//! Outbound-only CTAS receiver. Pair credentials and lease tokens never cross IPC.
//! A persisted claim request and fixed run ID make crashes/retries fail closed.
use std::{fs::{self, File, OpenOptions}, io::{Read, Write}, path::{Path, PathBuf}, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}, thread, time::{Duration, Instant}};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use crate::{diagnostics, execution::{ExecutionManager, LocalRun, RunRequest}, model::{AppError, Profile, Result}, validation};

// Same 4MB encoded budget as execution records; raw diffs stay <=512KB.
const MAX_FILE: u64 = 4_000_000;
const MAX_RESPONSE: u64 = 1_000_000;
fn err(code: &str, message: &str) -> AppError { AppError::new(code, message) }
fn io_error() -> AppError { err("DESKTOP_STORAGE_FAILED", "기기 연결과 결과 전송 기록을 저장하지 못했습니다.") }
fn now() -> String { chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true) }
fn uuid(value: &str) -> bool { uuid::Uuid::parse_str(value).is_ok() }
fn sha(value: &str) -> bool { value.len() == 64 && value.bytes().all(|v| v.is_ascii_hexdigit()) }
fn sha256(value: &str) -> String { format!("{:x}", Sha256::digest(value.as_bytes())) }
fn private_dir(path: &Path) -> Result<()> {
    if fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink() || !m.is_dir()) { return Err(io_error()); }
    fs::create_dir_all(path).map_err(|_| io_error())?;
    #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|_| io_error())?; }
    Ok(())
}
fn open_private(path: &Path) -> Result<File> {
    let mut options = OpenOptions::new(); options.read(true).write(true).create(true);
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600).custom_flags(libc::O_NOFOLLOW); }
    let file = options.open(path).map_err(|_| io_error())?;
    if !file.metadata().map_err(|_| io_error())?.is_file() { return Err(io_error()); }
    #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; file.set_permissions(fs::Permissions::from_mode(0o600)).map_err(|_| io_error())?; }
    Ok(file)
}
fn save_json(path: &Path, value: &impl Serialize) -> Result<()> {
    let bytes = serde_json::to_vec(value).map_err(|_| io_error())?;
    if bytes.len() as u64 > MAX_FILE { return Err(io_error()); }
    if fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink() || !m.is_file()) { return Err(io_error()); }
    let temporary = path.with_extension("tmp"); let mut file = open_private(&temporary)?;
    file.set_len(0).map_err(|_| io_error())?; file.write_all(&bytes).map_err(|_| io_error())?; file.sync_all().map_err(|_| io_error())?;
    fs::rename(temporary, path).map_err(|_| io_error())
}
fn read_disk(path: &Path) -> Result<Disk> {
    let meta = match fs::symlink_metadata(path) { Ok(m) => m, Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Disk::default()), Err(_) => return Err(io_error()) };
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > MAX_FILE { return Err(io_error()); }
    let mut file = open_private(path)?; let mut bytes = vec![]; Read::by_ref(&mut file).take(MAX_FILE + 1).read_to_end(&mut bytes).map_err(|_| io_error())?;
    let disk: Disk = serde_json::from_slice(&bytes).map_err(|_| io_error())?;
    if bytes.len() as u64 > MAX_FILE || disk.schema_version != 1 || disk.outbox.len() > 1 { return Err(io_error()); }
    if let Some(pair) = &disk.pair { if !pair.valid() { return Err(io_error()); } }
    Ok(disk)
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopConnection {
    pub status: String, pub paired: bool, pub receiving: bool,
    pub device_id: Option<String>, pub project_id: Option<String>, pub workspace_id: Option<String>,
    pub repository_url: Option<String>, pub provider: Option<String>, pub last_checked_at: Option<String>,
    pub last_error: Option<AppError>, pub active_job_id: Option<String>, pub pending_result_count: usize,
}
impl Default for DesktopConnection {
    fn default() -> Self { Self { status:"unpaired".into(), paired:false, receiving:false, device_id:None, project_id:None, workspace_id:None, repository_url:None, provider:None, last_checked_at:None, last_error:None, active_job_id:None, pending_result_count:0 } }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct PairSecret {
    device_id: String, project_id: String, workspace_id: String, repository_url: String,
    provider: String, working_folder: String,
}
impl PairSecret {
    fn valid(&self) -> bool {
        uuid(&self.device_id) && validation::project_id(&self.project_id)
            && validation::repository_url(&self.repository_url).ok().as_ref() == Some(&self.repository_url)
            && ["codex", "claude-code"].contains(&self.provider.as_str()) && self.working_folder.len() <= 4000
            && (self.workspace_id.is_empty() || self.workspace_id.len() <= 130 && self.workspace_id.starts_with("t_"))
    }
    fn matches(&self, profile: &Profile) -> bool {
        self.project_id == profile.project_id && self.repository_url.eq_ignore_ascii_case(&profile.repository_url)
            && self.provider == profile.provider && self.working_folder == profile.working_folder
            && (profile.workspace_id.is_empty() || profile.workspace_id == self.workspace_id)
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ClaimRequest { request_id: String, provider: String, repository_url: String, head_sha: String }
#[derive(Clone, Serialize, Deserialize)]
struct RemoteJob {
    job_id: String, lease_token: String, task_id: String, project_id: String, workspace_id: String,
    repository_url: String, provider: String, base_sha: String, target_branch: String, prompt: String,
    input_sha256: String, development_context_sha256: String, prompt_sha256: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ActiveJob { job: RemoteJob, local_run_id: String, last_lease_at: String }
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct PendingResult { job_id: String, pair: PairSecret, payload: Value }
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Disk { schema_version: u8, pair: Option<PairSecret>, receiving: bool, claim_request: Option<ClaimRequest>, active: Option<ActiveJob>, outbox: Vec<PendingResult> }
impl Default for Disk { fn default() -> Self { Self { schema_version:1, pair:None, receiving:false, claim_request:None, active:None, outbox:vec![] } } }
struct Inner { disk: Disk, profile: Option<Profile>, last_checked_at: Option<String>, last_error: Option<AppError> }
trait Api: Send + Sync { fn post(&self, path: &str, token: Option<&str>, body: &Value) -> Result<Value>; }
struct HttpApi { client: reqwest::blocking::Client }
impl HttpApi {
    fn new() -> Result<Self> { Ok(Self { client:reqwest::blocking::Client::builder().https_only(true).redirect(reqwest::redirect::Policy::none()).no_proxy().connect_timeout(Duration::from_secs(5)).timeout(Duration::from_secs(15)).build().map_err(|_| err("DESKTOP_NETWORK_UNAVAILABLE", "CTAS 연결을 준비하지 못했습니다."))? }) }
}
impl Api for HttpApi {
    fn post(&self, path: &str, token: Option<&str>, body: &Value) -> Result<Value> {
        if !valid_api_path(path) { return Err(err("DESKTOP_ENDPOINT_DENIED", "허용되지 않은 연결 경로입니다.")); }
        let target = format!("{}{path}", validation::ORIGIN);
        let mut request = self.client.post(target).json(body);
        if let Some(token) = token { request = request.bearer_auth(token); }
        let response = request.send().map_err(|_| err("DESKTOP_NETWORK_UNAVAILABLE", "CTAS에 연결하지 못했습니다. 전송 기록을 보존하고 다시 시도합니다."))?;
        let status = response.status();
        if status.is_server_error() || status.as_u16()==429 { return Err(err("DESKTOP_NETWORK_UNAVAILABLE","CTAS가 일시적으로 응답하지 않습니다. 전송 기록을 보존하고 다시 시도합니다.")); }
        let mut bytes = vec![];
        response.take(MAX_RESPONSE + 1).read_to_end(&mut bytes).map_err(|_| err("DESKTOP_NETWORK_UNAVAILABLE", "CTAS 응답을 받지 못했습니다. 다시 시도합니다."))?;
        if bytes.len() as u64 > MAX_RESPONSE { return Err(err("DESKTOP_RESPONSE_INVALID", "CTAS 응답이 허용 크기를 초과했습니다.")); }
        let value: Value = serde_json::from_slice(&bytes).map_err(|_| err("DESKTOP_RESPONSE_INVALID", "CTAS 응답 형식을 확인할 수 없습니다."))?;
        if !status.is_success() {
            let code = value["error"]["code"].as_str().or_else(|| value["code"].as_str()).filter(|v| !v.is_empty() && v.len() <= 80 && v.bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_')).unwrap_or(if status.as_u16()==401 { "DESKTOP_UNAUTHORIZED" } else { "DESKTOP_REQUEST_FAILED" });
            return Err(api_error(code));
        }
        Ok(value)
    }
}
fn transient(code:&str)->bool { ["DESKTOP_NETWORK_UNAVAILABLE","DESKTOP_RESPONSE_INVALID","DESKTOP_CREDENTIALS_UNAVAILABLE"].contains(&code) }
fn api_error(code: &str) -> AppError {
    err(code, match code {
        "DESKTOP_UNAUTHORIZED" => "기기 연결이 만료되었거나 해제되었습니다. CTAS에서 연결 코드를 다시 발급하세요.",
        "DESKTOP_DEVICE_NOT_SELECTED" => "웹 프로젝트 설정에서 이 기기를 선택하고 저장한 뒤 자동 수신을 다시 켜세요.",
        "TASK_SOURCE_STALE" => "작업의 근거 자료가 바뀌었습니다. 웹에서 최신 내용을 검토하고 작업을 다시 준비하세요.",
        "DESKTOP_LEASE_EXPIRED" => "서버의 작업 실행 권한이 만료되어 로컬 실행을 중지합니다. 결과는 보존합니다.",
        "DESKTOP_HEAD_MISMATCH" | "HEAD_MISMATCH" => "로컬 저장소 커밋과 승인된 작업 커밋이 다릅니다. 저장소를 확인하세요.",
        "DESKTOP_SCOPE_MISMATCH" => "프로젝트·저장소·개발 도구가 연결 정보와 다릅니다.",
        "DESKTOP_RESULT_CONFLICT" => "서버에 다른 결과가 이미 기록되어 있습니다. 로컬 결과를 보존하고 자동 전송을 중지했습니다.",
        _ => "CTAS 요청을 완료하지 못했습니다. 연결 정보와 웹 작업 상태를 확인하세요.",
    })
}
fn valid_api_path(path: &str) -> bool {
    if ["/api/desktop/pair", "/api/desktop/claim", "/api/desktop/disconnect"].contains(&path) { return true; }
    path.strip_prefix("/api/desktop/jobs/").and_then(|v| v.split_once('/')).is_some_and(|(id, action)| uuid(id) && ["heartbeat", "complete"].contains(&action))
}
trait Tokens: Send + Sync { fn get(&self, device: &str)->Result<String>; fn set(&self, device:&str,token:&str)->Result<()>; fn remove(&self,device:&str)->Result<()>; }
struct KeychainTokens;
const KEYCHAIN_SERVICE: &str="technology.conscience.ctas.desktop.receiver";
fn credential_error()->AppError {err("DESKTOP_CREDENTIALS_UNAVAILABLE","macOS 키체인에서 기기 인증 정보를 읽거나 저장하지 못했습니다. 키체인 접근을 확인한 뒤 다시 연결하세요.")}
impl Tokens for KeychainTokens {
    fn get(&self,device:&str)->Result<String>{
        #[cfg(target_os="macos")] { let bytes=security_framework::passwords::get_generic_password(KEYCHAIN_SERVICE,device).map_err(|_|credential_error())?;String::from_utf8(bytes).map_err(|_|credential_error()) }
        #[cfg(not(target_os="macos"))] {let _=device;Err(credential_error())}
    }
    fn set(&self,device:&str,token:&str)->Result<()>{
        #[cfg(target_os="macos")] {security_framework::passwords::set_generic_password(KEYCHAIN_SERVICE,device,token.as_bytes()).map_err(|_|credential_error())}
        #[cfg(not(target_os="macos"))] {let _=(device,token);Err(credential_error())}
    }
    fn remove(&self,device:&str)->Result<()>{
        #[cfg(target_os="macos")] {match security_framework::passwords::delete_generic_password(KEYCHAIN_SERVICE,device){Ok(())=>Ok(()),Err(e) if e.code()==-25300=>Ok(()),Err(_)=>Err(credential_error())}}
        #[cfg(not(target_os="macos"))] {let _=device;Err(credential_error())}
    }
}
struct Core {
    root: PathBuf, home: PathBuf, inner: Mutex<Inner>, gate: Mutex<()>, api: Arc<dyn Api>, runner: ExecutionManager,
    #[cfg(test)] test_cli: Mutex<Option<PathBuf>>,
    stop: AtomicBool, _instance_lock: Option<File>, owns_lock: bool, tokens: Arc<dyn Tokens>,
}
#[derive(Clone)] pub struct ReceiverManager { core: Arc<Core> }
impl ReceiverManager {
    pub fn new(data_dir: &Path, home: PathBuf, profile: Option<Profile>, runner: ExecutionManager) -> Result<Self> {
        Self::with_dependencies(data_dir.join("desktop-receiver"), home, profile, runner, Arc::new(HttpApi::new()?), Arc::new(KeychainTokens))
    }
    fn with_dependencies(root: PathBuf, home: PathBuf, profile: Option<Profile>, runner: ExecutionManager, api: Arc<dyn Api>, tokens: Arc<dyn Tokens>) -> Result<Self> {
        private_dir(&root)?; let file = open_private(&root.join("receiver.lock"))?;
        #[cfg(unix)] let owns_lock = { use std::os::fd::AsRawFd; (unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) }) == 0 };
        #[cfg(not(unix))] let owns_lock = false;
        let (mut disk, mut last_error) = match read_disk(&root.join("connection.json")) { Ok(v) => (v,None), Err(e) => (Disk::default(),Some(e)) };
        if !owns_lock { disk.receiving = false; last_error = Some(err("DESKTOP_ALREADY_RUNNING", "다른 CTAS 앱이 이 기기의 작업 수신을 관리하고 있습니다.")); }
        if disk.pair.as_ref().is_some_and(|p| !profile.as_ref().is_some_and(|v| p.matches(v))) { disk.receiving=false; last_error=Some(api_error("DESKTOP_SCOPE_MISMATCH")); }
        Ok(Self { core:Arc::new(Core { root,home,inner:Mutex::new(Inner { disk,profile,last_checked_at:None,last_error }),gate:Mutex::new(()),api,runner,#[cfg(test)] test_cli:Mutex::new(None),stop:AtomicBool::new(false),_instance_lock:Some(file),owns_lock,tokens }) })
    }
    fn lock_owner(&self) -> Result<()> { if self.core.stop.load(Ordering::SeqCst) { return Err(err("DESKTOP_STOPPED", "앱을 종료하고 있어 새 작업을 시작하지 않습니다.")); } if self.core.owns_lock { Ok(()) } else { Err(err("DESKTOP_ALREADY_RUNNING", "다른 CTAS 앱을 종료한 뒤 다시 실행하세요.")) } }
    fn read(&self) -> Result<(Disk, Option<Profile>)> { let inner=self.core.inner.lock().map_err(|_|io_error())?; Ok((inner.disk.clone(),inner.profile.clone())) }
    fn persist(&self, disk: Disk) -> Result<()> { save_json(&self.core.root.join("connection.json"), &disk)?; self.core.inner.lock().map_err(|_|io_error())?.disk=disk; Ok(()) }
    fn note(&self, error: Option<AppError>) { if let Ok(mut inner)=self.core.inner.lock() { inner.last_checked_at=Some(now()); inner.last_error=error; } }
    pub fn snapshot(&self) -> DesktopConnection {
        let Ok(inner)=self.core.inner.lock() else { return DesktopConnection { last_error:Some(io_error()),..DesktopConnection::default() }; };
        let pair=inner.disk.pair.as_ref();
        DesktopConnection { status:if inner.last_error.is_some(){"error"}else if inner.disk.active.is_some(){"busy"}else if pair.is_none(){"unpaired"}else if inner.disk.receiving{"receiving"}else{"paired"}.into(),
            paired:pair.is_some(), receiving:inner.disk.receiving, device_id:pair.map(|v|v.device_id.clone()),project_id:pair.map(|v|v.project_id.clone()),workspace_id:pair.map(|v|v.workspace_id.clone()),repository_url:pair.map(|v|v.repository_url.clone()),provider:pair.map(|v|v.provider.clone()),last_checked_at:inner.last_checked_at.clone(),last_error:inner.last_error.clone(),active_job_id:inner.disk.active.as_ref().map(|v|v.job.job_id.clone()),pending_result_count:inner.disk.outbox.len() }
    }
    pub fn spawn(&self) {
        if !self.core.owns_lock { return; } let manager=self.clone();
        thread::spawn(move || { let mut next=Instant::now(); let mut delay=5; while !manager.core.stop.load(Ordering::SeqCst) {
            if Instant::now() >= next { match manager.tick() { Ok(())=>delay=5, Err(error)=>{manager.note(Some(error));delay=(delay*2).min(60);} } next=Instant::now()+Duration::from_secs(delay); }
            thread::sleep(Duration::from_millis(200));
        } });
    }
    pub fn stop(&self) {
        self.core.stop.store(true,Ordering::SeqCst);
        // Drain a bounded in-flight HTTP/dispatch operation before the caller
        // shuts the runner down. No dispatch can race after runner shutdown.
        drop(self.core.gate.lock());
    }
    fn busy(disk: &Disk) -> bool { disk.active.is_some() || disk.claim_request.is_some() || !disk.outbox.is_empty() }
    pub fn pair(&self, code: String) -> Result<()> {
        self.lock_owner()?; let _guard=self.core.gate.lock().map_err(|_|io_error())?;
        let (disk,profile)=self.read()?;
        if Self::busy(&disk) || self.core.runner.is_active() { return Err(err("DESKTOP_BUSY", "진행 작업과 결과 전송을 마친 뒤 연결 정보를 변경하세요.")); }
        if disk.pair.is_some() { return Err(err("DESKTOP_ALREADY_PAIRED", "기존 연결을 해제한 뒤 새 연결 코드를 입력하세요.")); }
        let profile=profile.ok_or_else(||err("PROFILE_REQUIRED","프로젝트와 작업 폴더를 먼저 저장하세요."))?;
        let code=code.trim(); if !code.starts_with("ctas_pair_") || !(30..=256).contains(&code.len()) || !code.bytes().all(|b|b.is_ascii_alphanumeric()||b"_-".contains(&b)) { return Err(err("DESKTOP_PAIR_CODE_INVALID","CTAS에서 발급받은 연결 코드를 입력하세요.")); }
        let repo=diagnostics::repository(&profile.working_folder,Some(&profile),&self.core.home)?;
        if repo.matches_profile != Some(true) { return Err(api_error("DESKTOP_SCOPE_MISMATCH")); }
        let value=self.core.api.post("/api/desktop/pair",None,&json!({"code":code,"device_name":"CTAS Desktop","repository_url":profile.repository_url,"provider":profile.provider}))?;
        let string=|key:&str|value[key].as_str().map(str::to_owned).ok_or_else(||err("DESKTOP_RESPONSE_INVALID","기기 연결 응답을 확인할 수 없습니다."));
        let pair=PairSecret{device_id:string("device_id")?,project_id:string("project_id")?,workspace_id:value["workspace_id"].as_str().unwrap_or("").into(),repository_url:string("repository_url")?,provider:profile.provider.clone(),working_folder:profile.working_folder.clone()};
        let token=string("token")?;
        if !token.starts_with("ctas_desktop_") || !sha(token.trim_start_matches("ctas_desktop_")) { return Err(err("DESKTOP_RESPONSE_INVALID","기기 인증 응답을 확인할 수 없습니다.")); }
        if !pair.valid() || !pair.matches(&profile) { let _=self.core.api.post("/api/desktop/disconnect",Some(&token),&json!({})); return Err(api_error("DESKTOP_SCOPE_MISMATCH")); }
        if let Err(error)=self.core.tokens.set(&pair.device_id,&token){let _=self.core.api.post("/api/desktop/disconnect",Some(&token),&json!({}));return Err(error);}
        if let Err(error)=self.persist(Disk { pair:Some(pair.clone()),receiving:false,..disk }) { let _=self.core.api.post("/api/desktop/disconnect",Some(&token),&json!({}));let _=self.core.tokens.remove(&pair.device_id);return Err(error); }
        self.note(None); Ok(())
    }
    pub fn set_receiving(&self, enabled: bool) -> Result<()> {
        self.lock_owner()?; let _guard=self.core.gate.lock().map_err(|_|io_error())?; let (mut disk,profile)=self.read()?;
        if enabled {
            let pair=disk.pair.as_ref().ok_or_else(||err("DESKTOP_PAIR_REQUIRED","웹에서 발급받은 코드로 기기를 먼저 연결하세요."))?;
            let profile=profile.as_ref().filter(|p|pair.matches(p)).ok_or_else(||api_error("DESKTOP_SCOPE_MISMATCH"))?;
            let repo=diagnostics::repository(&profile.working_folder,Some(profile),&self.core.home)?;
            if repo.matches_profile != Some(true) { return Err(api_error("DESKTOP_SCOPE_MISMATCH")); }
            if diagnostics::installed_path(if profile.provider=="codex"{"codex"}else{"claude"},&self.core.home).is_none(){return Err(err("CLI_NOT_INSTALLED","선택한 개발 도구를 설치하고 로그인하세요."));}
        }
        disk.receiving=enabled; self.persist(disk)?; self.note(None); Ok(())
    }
    pub fn disconnect(&self) -> Result<()> { self.lock_owner()?; let _guard=self.core.gate.lock().map_err(|_|io_error())?; self.disconnect_locked() }
    fn disconnect_locked(&self) -> Result<()> {
        let (mut disk,_)=self.read()?;
        if Self::busy(&disk) || self.core.runner.is_active() { return Err(err("DESKTOP_BUSY","진행 작업과 결과 전송을 마친 뒤 연결을 해제하세요.")); }
        if let Some(pair)=&disk.pair { if let Err(error)=self.core.api.post("/api/desktop/disconnect",Some(&self.core.tokens.get(&pair.device_id)?),&json!({})) { if error.code!="DESKTOP_UNAUTHORIZED" { return Err(error); } } }
        if let Some(pair)=&disk.pair { self.core.tokens.remove(&pair.device_id)?; }
        disk.pair=None;disk.receiving=false;self.persist(disk)?;self.note(None);Ok(())
    }
    pub fn invalidate_for_change(&self) -> Result<()> { self.disconnect() }
    pub fn update_profile(&self, profile: Profile) -> Result<()> { self.core.inner.lock().map_err(|_|io_error())?.profile=Some(profile);Ok(()) }
    pub fn start_manual(&self, profile: Profile, request: RunRequest, path: PathBuf) -> Result<LocalRun> {
        self.lock_owner()?;let _guard=self.core.gate.lock().map_err(|_|io_error())?;let(disk,saved)=self.read()?;
        self.lock_owner()?;
        if saved.as_ref()!=Some(&profile){return Err(api_error("DESKTOP_SCOPE_MISMATCH"));}
        if Self::busy(&disk){return Err(err("DESKTOP_BUSY","웹 작업 또는 결과 전송이 끝난 뒤 로컬 작업을 시작하세요."));}
        self.core.runner.start(profile,request,path)
    }
    fn tick(&self) -> Result<()> {
        self.lock_owner()?;let _guard=self.core.gate.lock().map_err(|_|io_error())?;
        if self.core.stop.load(Ordering::SeqCst){return Ok(());}
        let(mut disk,profile)=self.read()?;
        if let Some(pending)=disk.outbox.first().cloned(){
            let response=self.core.api.post(&format!("/api/desktop/jobs/{}/complete",pending.job_id),Some(&self.core.tokens.get(&pending.pair.device_id)?),&pending.payload);
            match response {
                Ok(_)=>{disk.outbox.clear();self.persist(disk)?;self.note(None);return Ok(());},
                Err(error) if !transient(&error.code)=>{
                    // Keep a token-free, inspectable result when server policy
                    // permanently rejects it; never restart model execution.
                    save_json(&self.core.root.join(format!("blocked-{}.json",pending.job_id)),&json!({"job_id":pending.job_id,"payload":pending.payload,"error_code":error.code}))?;
                    disk.outbox.clear();disk.receiving=false;self.persist(disk)?;return Err(error);
                },Err(error)=>return Err(error)
            }
        }
        if let Some(active)=disk.active.clone(){
            let run=match self.core.runner.get(&active.local_run_id){Ok(v)=>v,Err(error) if error.code=="LOCAL_RUN_NOT_FOUND"=>{self.queue_failure(disk,&active.job,"interrupted","LOCAL_RUN_INTERRUPTED")?;return Ok(());},Err(error)=>return Err(error)};
            if !["preparing","running"].contains(&run.status.as_str()) {self.queue_result(disk,&active.job,Some(&run),None)?;return Ok(());}
            let age=chrono::DateTime::parse_from_rfc3339(&active.last_lease_at).map(|at|(chrono::Utc::now()-at.with_timezone(&chrono::Utc)).num_seconds()).unwrap_or(180);
            if age>=150 {let _=self.core.runner.cancel(&run.id);return Err(api_error("DESKTOP_LEASE_EXPIRED"));}
            if age>=30 {
                let pair=disk.pair.as_ref().ok_or_else(||api_error("DESKTOP_UNAUTHORIZED"))?;
                match self.core.api.post(&format!("/api/desktop/jobs/{}/heartbeat",active.job.job_id),Some(&self.core.tokens.get(&pair.device_id)?),&json!({"lease_token":active.job.lease_token,"local_run_id":run.id,"status":run.status})) {
                    Ok(_)=>{if let Some(current)=disk.active.as_mut(){current.last_lease_at=now();}self.persist(disk)?;self.note(None);},
                    Err(error)=>{if ["DESKTOP_LEASE_EXPIRED","DESKTOP_UNAUTHORIZED","DESKTOP_SCOPE_MISMATCH"].contains(&error.code.as_str()){let _=self.core.runner.cancel(&run.id);disk.receiving=false;self.persist(disk)?;}return Err(error);}
                }
            }
            return Ok(());
        }
        if !disk.receiving && disk.claim_request.is_none(){return Ok(());}
        if self.core.runner.is_active(){return Ok(());}
        let pair=disk.pair.clone().ok_or_else(||api_error("DESKTOP_UNAUTHORIZED"))?;
        let profile=profile.filter(|p|pair.matches(p)).ok_or_else(||api_error("DESKTOP_SCOPE_MISMATCH"))?;
        if disk.claim_request.is_none(){
            let repo=diagnostics::repository(&profile.working_folder,Some(&profile),&self.core.home)?;
            if repo.matches_profile!=Some(true){return Err(api_error("DESKTOP_SCOPE_MISMATCH"));}
            let head=repo.head.ok_or_else(||api_error("DESKTOP_HEAD_MISMATCH"))?;
            disk.claim_request=Some(ClaimRequest{request_id:uuid::Uuid::new_v4().to_string(),provider:profile.provider.clone(),repository_url:profile.repository_url.clone(),head_sha:head});self.persist(disk.clone())?;
        }
        let request=disk.claim_request.as_ref().expect("claim persisted").clone();
        let response=match self.core.api.post("/api/desktop/claim",Some(&self.core.tokens.get(&pair.device_id)?),&serde_json::to_value(&request).map_err(|_|io_error())?){Ok(v)=>v,Err(error)=>{
            if !transient(&error.code){disk.receiving=false;disk.claim_request=None;self.persist(disk)?;}return Err(error);
        }};
        if response.get("job").is_some_and(Value::is_null){disk.claim_request=None;self.persist(disk)?;self.note(None);return Ok(());}
        let job:RemoteJob=serde_json::from_value(response["job"].clone()).map_err(|_|err("DESKTOP_RESPONSE_INVALID","작업 응답을 확인할 수 없어 자동 실행을 보류합니다."))?;
        // IDs/tokens must be safe even when we need to reject a job's scope.
        if !uuid(&job.job_id)||!uuid(&job.task_id)||!uuid(&job.lease_token){return Err(err("DESKTOP_RESPONSE_INVALID","작업 실행 권한을 확인할 수 없습니다."));}
        let run_id=ExecutionManager::remote_run_id(&job.job_id)?;
        disk.active=Some(ActiveJob{job:job.clone(),local_run_id:run_id,last_lease_at:now()});disk.claim_request=None;self.persist(disk.clone())?;
        if let Err(error)=validate_job(&job,&pair,&profile,&request).and_then(|_|self.verify_job_receipt(&job)){self.queue_failure(disk,&job,"failed",&error.code)?;return Err(error);}
        if !disk.receiving||self.core.stop.load(Ordering::SeqCst){self.queue_failure(disk,&job,"cancelled","LOCAL_RUN_CANCELLED")?;return Ok(());}
        let path=diagnostics::installed_path(if profile.provider=="codex"{"codex"}else{"claude"},&self.core.home);
        #[cfg(test)] let path=self.core.test_cli.lock().unwrap().clone().or(path);
        let result=match path{Some(path)=>self.core.runner.start_remote(profile,RunRequest{prompt:job.prompt.clone(),expected_head:job.base_sha.clone()},path,job.job_id.clone(),job.task_id.clone()),None=>Err(err("CLI_NOT_INSTALLED","선택한 개발 도구가 설치되어 있지 않습니다."))};
        if let Err(error)=result{self.queue_failure(disk,&job,"failed",&error.code)?;return Err(error);}self.note(None);Ok(())
    }
    fn verify_job_receipt(&self,job:&RemoteJob)->Result<()> {
        let path=self.core.root.join(format!("job-{}.json",job.job_id));
        let expected=json!({"job_id":job.job_id,"task_id":job.task_id,"project_id":job.project_id,"workspace_id":job.workspace_id,"repository_url":job.repository_url,"provider":job.provider,"base_sha":job.base_sha,"target_branch":job.target_branch,"input_sha256":job.input_sha256,"development_context_sha256":job.development_context_sha256,"prompt_sha256":job.prompt_sha256});
        match fs::symlink_metadata(&path) {
            Ok(meta)=>{if !meta.is_file()||meta.file_type().is_symlink()||meta.len()>4096{return Err(io_error());}
                let value:Value=serde_json::from_slice(&fs::read(&path).map_err(|_|io_error())?).map_err(|_|io_error())?;
                if value!=expected{return Err(err("DESKTOP_JOB_INTEGRITY_INVALID","같은 작업의 승인된 내용이 바뀌어 실행하지 않습니다."));}Ok(())},
            Err(e) if e.kind()==std::io::ErrorKind::NotFound=>save_json(&path,&expected),Err(_)=>Err(io_error())
        }
    }
    fn queue_failure(&self,disk:Disk,job:&RemoteJob,status:&str,code:&str)->Result<()>{self.queue_result(disk,job,None,Some((status,code)))}
    fn queue_result(&self,mut disk:Disk,job:&RemoteJob,run:Option<&LocalRun>,failure:Option<(&str,&str)>)->Result<()>{
        let pair=disk.pair.clone().ok_or_else(||api_error("DESKTOP_UNAUTHORIZED"))?;
        let local_run_id=ExecutionManager::remote_run_id(&job.job_id)?;
        let(status,code)=failure.map(|(s,c)|(s.to_string(),Some(c.to_string()))).unwrap_or_else(||{let run=run.expect("run or failure");(run.status.clone(),run.error_code.clone())});
        let payload=json!({"lease_token":job.lease_token,"local_run_id":local_run_id,"base_sha":job.base_sha,"observed_base_sha":run.filter(|r|r.started_at.is_some()).map(|r|r.base_sha.clone()),"status":status,"summary":run.map(|r|r.summary.clone()).unwrap_or_default(),"diff":run.map(|r|r.diff.clone()).unwrap_or_default(),"changed_files":run.map(|r|r.changed_files.clone()).unwrap_or_default(),"error_code":code,"limitations":run.map(|r|r.limitations.clone()).unwrap_or_else(||vec!["로컬 실행을 완료하지 못했습니다. 자동 재실행하지 않고 상태를 기록합니다.".into()])});
        disk.active=None;disk.outbox=vec![PendingResult{job_id:job.job_id.clone(),pair,payload}];self.persist(disk)
    }
}
fn validate_job(job:&RemoteJob,pair:&PairSecret,profile:&Profile,claim:&ClaimRequest)->Result<()> {
    if job.project_id!=pair.project_id||job.workspace_id!=pair.workspace_id||job.provider!=pair.provider||job.repository_url!=pair.repository_url||!pair.matches(profile){return Err(api_error("DESKTOP_SCOPE_MISMATCH"));}
    if job.base_sha.len()!=40||!job.base_sha.bytes().all(|v|v.is_ascii_hexdigit())||job.base_sha!=claim.head_sha{return Err(api_error("DESKTOP_HEAD_MISMATCH"));}
    if job.prompt.trim().is_empty()||job.prompt.chars().count()>12000||job.prompt.contains('\0')||!sha(&job.input_sha256)||!sha(&job.development_context_sha256)||job.prompt_sha256!=sha256(&job.prompt)||job.target_branch.is_empty()||job.target_branch.len()>200||job.target_branch.chars().any(char::is_control){return Err(err("DESKTOP_JOB_INTEGRITY_INVALID","작업 내용과 승인된 실행 정보를 확인할 수 없습니다."));}
    Ok(())
}

#[cfg(test)] mod tests {
    use super::*;
    use std::{collections::{VecDeque,BTreeMap},process::Command};
    const DEVICE:&str="00000000-0000-4000-8000-000000000001";
    const JOB:&str="00000000-0000-4000-8000-000000000002";
    const TASK:&str="00000000-0000-4000-8000-000000000003";
    #[test] fn stop_drains_dispatch_gate_and_rejects_later_starts() {
        let fixture=Fixture::new();let manager=fixture.manager.clone();
        let held=manager.core.gate.lock().unwrap();let stopping=manager.clone();let ended=Arc::new(AtomicBool::new(false));let flag=ended.clone();
        let worker=thread::spawn(move||{stopping.stop();flag.store(true,Ordering::SeqCst);});
        let began=Instant::now();while !manager.core.stop.load(Ordering::SeqCst){assert!(began.elapsed()<Duration::from_secs(2));thread::sleep(Duration::from_millis(5));}
        assert!(!ended.load(Ordering::SeqCst));drop(held);worker.join().unwrap();assert!(ended.load(Ordering::SeqCst));
        let result=manager.start_manual(fixture.profile,RunRequest{prompt:"must not run".into(),expected_head:fixture.head},PathBuf::from("/unused"));assert_eq!(result.unwrap_err().code,"DESKTOP_STOPPED");
    }
    #[derive(Default)]struct MemoryTokens(Mutex<BTreeMap<String,String>>);
    impl Tokens for MemoryTokens{
        fn get(&self,key:&str)->Result<String>{self.0.lock().unwrap().get(key).cloned().ok_or_else(credential_error)}
        fn set(&self,key:&str,value:&str)->Result<()>{self.0.lock().unwrap().insert(key.into(),value.into());Ok(())}
        fn remove(&self,key:&str)->Result<()>{self.0.lock().unwrap().remove(key);Ok(())}
    }
    #[derive(Default)]struct FakeApi{responses:Mutex<VecDeque<Result<Value>>>,calls:Mutex<Vec<(String,Value)>>}
    impl FakeApi{fn push(&self,result:Result<Value>){self.responses.lock().unwrap().push_back(result);}}
    impl Api for FakeApi{fn post(&self,path:&str,token:Option<&str>,body:&Value)->Result<Value>{
        assert!(valid_api_path(path));if path!="/api/desktop/pair"{assert!(token.unwrap().starts_with("ctas_desktop_"));}
        self.calls.lock().unwrap().push((path.into(),body.clone()));self.responses.lock().unwrap().pop_front().expect("prepared API response")
    }}
    struct Fixture{_temp:tempfile::TempDir,manager:ReceiverManager,api:Arc<FakeApi>,tokens:Arc<MemoryTokens>,profile:Profile,head:String}
    impl Fixture{
        fn new()->Self{
            let temp=tempfile::tempdir().unwrap();let repo=temp.path().join("repo");fs::create_dir(&repo).unwrap();
            let git=|args:&[&str]|{let out=Command::new("/usr/bin/git").args(args).current_dir(&repo).env("GIT_CONFIG_GLOBAL","/dev/null").env("GIT_CONFIG_NOSYSTEM","1").output().unwrap();assert!(out.status.success());String::from_utf8(out.stdout).unwrap().trim().to_string()};
            git(&["init","-b","main"]);git(&["config","user.name","Test"]);git(&["config","user.email","test@example.test"]);fs::write(repo.join("app.txt"),"original\n").unwrap();git(&["add","."]);git(&["commit","-m","fixture"]);git(&["remote","add","origin","https://github.com/acme/repo.git"]);let head=git(&["rev-parse","HEAD"]);
            let profile=Profile{project_id:"ains-sism".into(),workspace_id:"t_test_workspace".into(),repository_url:"https://github.com/acme/repo.git".into(),working_folder:repo.canonicalize().unwrap().to_string_lossy().into(),provider:"codex".into()};
            let api=Arc::new(FakeApi::default());let tokens=Arc::new(MemoryTokens::default());let runner=ExecutionManager::new(temp.path().join("runs"));
            let manager=ReceiverManager::with_dependencies(temp.path().join("receiver"),PathBuf::from(std::env::var_os("HOME").unwrap()),Some(profile.clone()),runner,api.clone(),tokens.clone()).unwrap();
            Self{_temp:temp,manager,api,tokens,profile,head}
        }
        fn pair(&self){self.api.push(Ok(json!({"device_id":DEVICE,"project_id":self.profile.project_id,"workspace_id":self.profile.workspace_id,"repository_url":self.profile.repository_url,"token":format!("ctas_desktop_{}","a".repeat(64))})));self.manager.pair(format!("ctas_pair_{}","b".repeat(32))).unwrap();}
        fn job(&self)->RemoteJob{let prompt="Create hello.txt in this isolated test checkout.";RemoteJob{job_id:JOB.into(),lease_token:"00000000-0000-4000-8000-000000000099".into(),task_id:TASK.into(),project_id:self.profile.project_id.clone(),workspace_id:self.profile.workspace_id.clone(),repository_url:self.profile.repository_url.clone(),provider:"codex".into(),base_sha:self.head.clone(),target_branch:"main".into(),prompt:prompt.into(),input_sha256:"a".repeat(64),development_context_sha256:"b".repeat(64),prompt_sha256:sha256(prompt)}}
        fn enable(&self){let(mut disk,_)=self.manager.read().unwrap();disk.receiving=true;self.manager.persist(disk).unwrap();}
        fn fake_cli(&self){use std::os::unix::fs::PermissionsExt;let path=self._temp.path().join("fake-codex");fs::write(&path,"#!/bin/sh\nif [ \"$1:$2\" = 'exec:--help' ]; then echo '--ignore-user-config --ephemeral --sandbox --json'; exit 0; fi\nif [ \"$1:$2\" = 'login:status' ]; then exit 0; fi\ncat >/dev/null\necho 'receiver fixture' > hello.txt\nprintf '%s\\n' '{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"Added hello.txt\"}}' '{\"type\":\"turn.completed\"}'\n").unwrap();fs::set_permissions(&path,fs::Permissions::from_mode(0o700)).unwrap();*self.manager.core.test_cli.lock().unwrap()=Some(path);}
    }
    #[test]fn pair_credentials_stay_in_keychain_backend_and_receiving_requires_opt_in(){
        let f=Fixture::new();f.pair();let view=serde_json::to_string(&f.manager.snapshot()).unwrap();let disk=fs::read_to_string(f.manager.core.root.join("connection.json")).unwrap();
        assert!(f.manager.snapshot().paired);assert!(!f.manager.snapshot().receiving);assert!(!view.contains("ctas_desktop_"));assert!(!disk.contains("ctas_desktop_"));assert!(!disk.contains("\"token\""));assert!(f.tokens.get(DEVICE).is_ok());
        assert_eq!(f.manager.snapshot().project_id.as_deref(),Some("ains-sism"));
        #[cfg(unix)]{use std::os::unix::fs::PermissionsExt;assert_eq!(fs::metadata(f.manager.core.root.join("connection.json")).unwrap().permissions().mode()&0o777,0o600);}
    }
    #[test]fn claim_transport_failure_reuses_receipt_and_definitive_rejection_unblocks_disconnect(){
        let f=Fixture::new();f.pair();f.enable();f.api.push(Err(err("DESKTOP_NETWORK_UNAVAILABLE","offline")));assert!(f.manager.tick().is_err());
        let request=f.manager.read().unwrap().0.claim_request.unwrap().request_id;
        f.api.push(Err(api_error("DESKTOP_DEVICE_NOT_SELECTED")));assert!(f.manager.tick().is_err());let disk=f.manager.read().unwrap().0;assert!(disk.claim_request.is_none());assert!(!disk.receiving);
        let calls=f.api.calls.lock().unwrap();assert_eq!(calls[1].1["request_id"],request);assert_eq!(calls[2].1["request_id"],request);drop(calls);
        f.api.push(Ok(json!({"disconnected":true})));f.manager.disconnect().unwrap();assert!(!f.manager.snapshot().paired);
    }
    #[test]fn job_scope_prompt_and_head_are_checked_before_dispatch(){
        let f=Fixture::new();f.pair();f.enable();let mut job=f.job();job.prompt.push_str(" changed after hash");f.api.push(Ok(json!({"job":job})));assert_eq!(f.manager.tick().unwrap_err().code,"DESKTOP_JOB_INTEGRITY_INVALID");
        let disk=f.manager.read().unwrap().0;assert!(disk.active.is_none());assert_eq!(disk.outbox.len(),1);assert_eq!(disk.outbox[0].payload["status"],"failed");assert!(f.manager.core.runner.list().unwrap().is_empty());
    }
    #[test]fn automatic_fixture_run_sends_exact_result_and_retries_only_outbox(){
        let f=Fixture::new();f.pair();f.enable();f.fake_cli();f.api.push(Ok(json!({"job":f.job()})));f.manager.tick().unwrap();
        let run_id=ExecutionManager::remote_run_id(JOB).unwrap();let began=Instant::now();loop{let run=f.manager.core.runner.get(&run_id).unwrap();if run.status=="completed"{break;}assert!(began.elapsed()<Duration::from_secs(20),"{:?}",run.error_code);thread::sleep(Duration::from_millis(20));}
        f.manager.tick().unwrap();assert_eq!(f.manager.snapshot().pending_result_count,1);assert!(!Path::new(&f.profile.working_folder).join("hello.txt").exists());
        f.api.push(Err(err("DESKTOP_NETWORK_UNAVAILABLE","offline")));assert!(f.manager.tick().is_err());let first=f.api.calls.lock().unwrap().last().unwrap().1.clone();
        f.api.push(Ok(json!({"accepted":true})));f.manager.tick().unwrap();let second=f.api.calls.lock().unwrap().last().unwrap().1.clone();assert_eq!(first,second);assert!(first["diff"].as_str().unwrap().contains("+receiver fixture"));assert_eq!(first["base_sha"],f.head);assert_eq!(first["observed_base_sha"],f.head);assert_eq!(f.manager.core.runner.list().unwrap().len(),1);assert_eq!(f.manager.snapshot().pending_result_count,0);
    }
    #[test]fn crash_after_claim_before_dispatch_is_reported_interrupted_without_running(){
        let f=Fixture::new();f.pair();let(mut disk,_)=f.manager.read().unwrap();disk.active=Some(ActiveJob{job:f.job(),local_run_id:ExecutionManager::remote_run_id(JOB).unwrap(),last_lease_at:now()});f.manager.persist(disk).unwrap();
        f.manager.tick().unwrap();let disk=f.manager.read().unwrap().0;assert!(disk.active.is_none());assert_eq!(disk.outbox[0].payload["status"],"interrupted");assert!(f.manager.core.runner.list().unwrap().is_empty());
    }
    #[test]fn permanently_revoked_token_archives_result_and_allows_explicit_disconnect(){
        let f=Fixture::new();f.pair();let(disk,_)=f.manager.read().unwrap();f.manager.queue_failure(disk,&f.job(),"failed","TEST_FAILURE").unwrap();f.api.push(Err(api_error("DESKTOP_UNAUTHORIZED")));assert!(f.manager.tick().is_err());
        assert_eq!(f.manager.snapshot().pending_result_count,0);assert!(!f.manager.snapshot().receiving);let archive=fs::read_to_string(f.manager.core.root.join(format!("blocked-{JOB}.json"))).unwrap();assert!(archive.contains("TEST_FAILURE"));assert!(!archive.contains("ctas_desktop_"));
        f.api.push(Err(api_error("DESKTOP_UNAUTHORIZED")));f.manager.disconnect().unwrap();assert!(!f.manager.snapshot().paired);
    }
    #[test]fn same_job_evidence_is_immutable_across_receipts(){let f=Fixture::new();let job=f.job();f.manager.verify_job_receipt(&job).unwrap();f.manager.verify_job_receipt(&job).unwrap();let mut changed=job;changed.development_context_sha256="c".repeat(64);assert_eq!(f.manager.verify_job_receipt(&changed).unwrap_err().code,"DESKTOP_JOB_INTEGRITY_INVALID");}
    #[test]fn second_process_receiver_and_foreign_endpoints_are_denied(){
        let f=Fixture::new();let second=ReceiverManager::with_dependencies(f.manager.core.root.clone(),f.manager.core.home.clone(),Some(f.profile.clone()),f.manager.core.runner.clone(),f.api.clone(),f.tokens.clone()).unwrap();assert_eq!(second.set_receiving(true).unwrap_err().code,"DESKTOP_ALREADY_RUNNING");
        for path in ["https://evil.test","/api/desktop/jobs/../../pair/complete","/api/desktop/jobs/x/complete","/api/desktop/claim?other=1","//evil.test/api/desktop/pair"]{assert!(!valid_api_path(path));}
        assert!(valid_api_path(&format!("/api/desktop/jobs/{JOB}/heartbeat")));
    }
    #[test]fn active_or_pending_result_prevents_profile_invalidation(){let f=Fixture::new();f.pair();let(disk,_)=f.manager.read().unwrap();f.manager.queue_failure(disk,&f.job(),"failed","FIXTURE").unwrap();assert_eq!(f.manager.invalidate_for_change().unwrap_err().code,"DESKTOP_BUSY");assert!(f.manager.snapshot().paired);}
    #[test]fn escaped_result_payload_survives_outbox_reload(){let f=Fixture::new();f.pair();let(disk,_)=f.manager.read().unwrap();f.manager.queue_failure(disk,&f.job(),"failed","FIXTURE").unwrap();let(mut disk,_)=f.manager.read().unwrap();let diff="\u{1}".repeat(512_000);disk.outbox[0].payload["diff"]=json!(diff);f.manager.persist(disk).unwrap();let path=f.manager.core.root.join("connection.json");assert!(fs::metadata(&path).unwrap().len()>2_000_000);assert_eq!(read_disk(&path).unwrap().outbox[0].payload["diff"],diff);}
}
