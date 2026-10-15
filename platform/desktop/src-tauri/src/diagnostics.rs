use std::{ffi::OsStr, io::Read, path::{Path, PathBuf}, process::{Command, Stdio}, thread, time::{Duration, Instant}};
use crate::{model::{AppError, Diagnostics, Profile, RepositoryDiagnostic, Result, ToolDiagnostic, Tools}, validation};

const OUTPUT_LIMIT: usize = 65_536;
struct ProcessOutput { success: bool, stdout: String }
fn process_error(code: &str) -> AppError { AppError::new(code, "로컬 도구의 응답을 확인할 수 없습니다. 설치 상태와 작업 폴더를 확인하세요.") }
fn read_bounded(reader: impl Read, limit: usize) -> std::io::Result<Vec<u8>> {
    let mut output = Vec::new(); reader.take((limit + 1) as u64).read_to_end(&mut output)?; Ok(output)
}
fn stop_group(child: &mut std::process::Child) {
    #[cfg(unix)] unsafe { libc::kill(-(child.id() as i32), libc::SIGKILL); }
    let _ = child.kill(); let _ = child.wait();
}
fn run_fixed(program: &Path, args: &[&OsStr], cwd: Option<&Path>, timeout: Duration, limit: usize) -> Result<ProcessOutput> {
    let mut command = Command::new(program);
    command.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    // No application secrets are forwarded to diagnostics. HOME is needed by
    // installed CLI shims; this command only requests their version, never auth.
    command.env_clear();
    for key in ["HOME", "PATH", "TMPDIR", "SystemRoot"] { if let Some(value) = std::env::var_os(key) { command.env(key, value); } }
    command.env("LANG", "en_US.UTF-8").env("GIT_CONFIG_NOSYSTEM", "1").env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_TERMINAL_PROMPT", "0").env("GIT_PAGER", "cat");
    if let Some(cwd) = cwd { command.current_dir(cwd); }
    #[cfg(unix)] { use std::os::unix::process::CommandExt; command.process_group(0); }
    let mut child = command.spawn().map_err(|_| process_error("TOOL_START_FAILED"))?;
    let stdout = child.stdout.take().expect("piped stdout"); let stderr = child.stderr.take().expect("piped stderr");
    let out = thread::spawn(move || read_bounded(stdout, limit)); let err = thread::spawn(move || read_bounded(stderr, limit));
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) if started.elapsed() < timeout => thread::sleep(Duration::from_millis(10)),
            Ok(None) => break Err(process_error("TOOL_TIMEOUT")),
            Err(_) => break Err(process_error("TOOL_START_FAILED")),
        }
    };
    stop_group(&mut child);
    // A misbehaving CLI can spawn a detached descendant that retains a pipe.
    // Killing the original process group must not leave diagnostics waiting
    // forever for that descendant to close stdout or stderr.
    let reader_deadline = Instant::now() + Duration::from_millis(250);
    while (!out.is_finished() || !err.is_finished()) && Instant::now() < reader_deadline {
        thread::sleep(Duration::from_millis(5));
    }
    if !out.is_finished() || !err.is_finished() {
        drop(out); drop(err);
        return Err(process_error("TOOL_TIMEOUT"));
    }
    let output = out.join().map_err(|_| process_error("TOOL_OUTPUT_INVALID"))?.map_err(|_| process_error("TOOL_OUTPUT_INVALID"))?;
    let errors = err.join().map_err(|_| process_error("TOOL_OUTPUT_INVALID"))?.map_err(|_| process_error("TOOL_OUTPUT_INVALID"))?;
    let status = status?;
    if output.len() > limit || errors.len() > limit || output.len() + errors.len() > limit { return Err(process_error("TOOL_OUTPUT_LIMIT")); }
    Ok(ProcessOutput { success: status.success(), stdout: String::from_utf8(output).map_err(|_| process_error("TOOL_OUTPUT_INVALID"))? })
}
pub fn installed_path(tool: &str, home: &Path) -> Option<PathBuf> {
    if !["git", "codex", "claude"].contains(&tool) { return None; }
    let mut candidates = Vec::new();
    if tool == "codex" {
        candidates.push(PathBuf::from("/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex"));
        candidates.push(PathBuf::from("/Applications/ChatGPT.app/Contents/Resources/codex"));
    }
    for dir in [PathBuf::from("/usr/bin"), PathBuf::from("/opt/homebrew/bin"), PathBuf::from("/usr/local/bin"), home.join(".local/bin"), home.join(".npm-global/bin"), home.join(".bun/bin")] { candidates.push(dir.join(tool)); }
    candidates.into_iter().find(|path| {
        let Ok(meta) = path.metadata() else { return false }; if !meta.is_file() { return false; }
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; meta.permissions().mode() & 0o111 != 0 }
        #[cfg(not(unix))] { true }
    })
}
pub fn open_workspace_url(url: &url::Url, home: &Path) -> Result<()> {
    if url.origin().ascii_serialization() != validation::ORIGIN || !url.username().is_empty() || url.password().is_some() { return Err(process_error("BROWSER_TARGET_INVALID")); }
    #[cfg(target_os = "macos")] {
        let output = run_fixed(Path::new("/usr/bin/open"), &[OsStr::new(url.as_str())], Some(home), Duration::from_secs(5), 4096)?;
        if !output.success { return Err(process_error("BROWSER_OPEN_FAILED")); } Ok(())
    }
    #[cfg(not(target_os = "macos"))] { let _ = home; Err(AppError::new("PLATFORM_NOT_SUPPORTED", "현재 브라우저 열기는 macOS에서 지원합니다.")) }
}
fn tool(tool: &str, home: &Path) -> ToolDiagnostic {
    let Some(path) = installed_path(tool, home) else { return ToolDiagnostic { installed: false, path: None, version: None, error_code: Some("TOOL_NOT_INSTALLED".into()) }; };
    let mut result = ToolDiagnostic { installed: true, path: Some(path.to_string_lossy().into()), version: None, error_code: None };
    match run_fixed(&path, &[OsStr::new("--version")], Some(home), Duration::from_secs(5), 4096) {
        Ok(output) if output.success => {
            let version = output.stdout.lines().next().unwrap_or("").trim();
            if version.is_empty() || version.len() > 200 || version.chars().any(char::is_control) { result.error_code = Some("TOOL_VERSION_INVALID".into()); }
            else { result.version = Some(version.into()); }
        },
        Ok(_) => result.error_code = Some("TOOL_VERSION_FAILED".into()),
        Err(error) => result.error_code = Some(error.code),
    }
    result
}
fn git(path: &Path, args: &[&str], home: &Path) -> Result<ProcessOutput> {
    let bin = installed_path("git", home).ok_or_else(|| process_error("GIT_NOT_INSTALLED"))?;
    let mut fixed = vec!["--no-pager", "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "core.quotePath=true"];
    fixed.extend_from_slice(args);
    run_fixed(&bin, &fixed.iter().map(OsStr::new).collect::<Vec<_>>(), Some(path), Duration::from_secs(5), OUTPUT_LIMIT)
}
fn git_text(path: &Path, args: &[&str], home: &Path) -> Result<String> {
    let output = git(path, args, home)?;
    if !output.success { return Err(process_error("GIT_DIAGNOSTIC_FAILED")); }
    Ok(output.stdout.trim().into())
}
pub fn validate_repository_folder(path: &Path, home: &Path) -> Result<PathBuf> {
    let root = validation::canonical_folder(path, home)?;
    let top = git_text(&root, &["rev-parse", "--show-toplevel"], home).map_err(|_| AppError::new("GIT_WORKSPACE_REQUIRED", "Git 저장소의 최상위 작업 폴더를 선택하세요."))?;
    if Path::new(&top).canonicalize().ok().as_ref() != Some(&root) { return Err(AppError::new("GIT_WORKSPACE_ROOT_REQUIRED", "저장소 내부의 하위 폴더 대신 Git 프로젝트 최상위 폴더를 선택하세요.")); }
    Ok(root)
}
pub fn repository(folder: &str, profile: Option<&Profile>, home: &Path) -> Result<RepositoryDiagnostic> {
    let path = validate_repository_folder(Path::new(folder), home)?;
    if path != Path::new(folder) { return Err(AppError::new("WORKSPACE_PATH_CHANGED", "저장한 작업 폴더의 실제 경로가 변경되었습니다. 다시 선택하세요.")); }
    let head = git_text(&path, &["rev-parse", "--verify", "HEAD"], home)?;
    if head.len() != 40 || !head.bytes().all(|c| c.is_ascii_hexdigit()) { return Err(process_error("GIT_HEAD_INVALID")); }
    let branch = git(&path, &["symbolic-ref", "--quiet", "--short", "HEAD"], home)?;
    let branch = if branch.success { Some(branch.stdout.trim().to_string()) } else { None };
    if branch.as_ref().is_some_and(|b| b.len() > 500 || b.chars().any(char::is_control)) { return Err(process_error("GIT_BRANCH_INVALID")); }
    let clean = git_text(&path, &["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=all"], home)?.is_empty();
    let origins = git_text(&path, &["remote", "get-url", "--all", "origin"], home)?;
    let push = git_text(&path, &["remote", "get-url", "--push", "--all", "origin"], home)?;
    if origins.lines().count() != 1 || push.lines().count() != 1 { return Err(process_error("GIT_ORIGIN_INVALID")); }
    let origin = validation::repository_url(&origins).map_err(|_| process_error("GIT_ORIGIN_INVALID"))?;
    if validation::repository_url(&push).ok().as_ref() != Some(&origin) { return Err(process_error("GIT_PUSH_ORIGIN_MISMATCH")); }
    Ok(RepositoryDiagnostic { status: "ready".into(), working_folder: Some(folder.into()), branch, head: Some(head), clean: Some(clean),
        matches_profile: profile.map(|p| p.repository_url.eq_ignore_ascii_case(&origin) && p.working_folder == folder), origin: Some(origin), error_code: None })
}
pub fn refresh(folder: Option<&str>, profile: Option<&Profile>, home: &Path) -> Diagnostics {
    let tools = Tools { git: tool("git", home), codex: tool("codex", home), claude: tool("claude", home) };
    let repository = folder.map(|f| repository(f, profile, home).unwrap_or_else(|error| RepositoryDiagnostic::failed(f, &error.code))).unwrap_or_else(RepositoryDiagnostic::empty);
    Diagnostics { checked_at: Some(chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)), tools, repository }
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn process_timeout_and_output_limits_are_enforced() {
        #[cfg(unix)] {
            let result = run_fixed(Path::new("/bin/sh"), &[OsStr::new("-c"), OsStr::new("sleep 5")], None, Duration::from_millis(50), 100);
            assert_eq!(result.err().unwrap().code, "TOOL_TIMEOUT");
            let result = run_fixed(Path::new("/bin/sh"), &[OsStr::new("-c"), OsStr::new("printf '01234567890123456789'")], None, Duration::from_secs(1), 5);
            assert_eq!(result.err().unwrap().code, "TOOL_OUTPUT_LIMIT");
        }
    }
    #[cfg(target_os = "macos")]
    #[test] fn detached_descendant_pipe_cannot_hold_diagnostics_open() {
        let temp = tempfile::tempdir().unwrap(); let pid_file = temp.path().join("child.pid");
        // Python is supplied by the Xcode command line tools needed to build
        // this macOS target. The child deliberately escapes the parent's group.
        let code = "import os,sys,time\nr,w=os.pipe()\npid=os.fork()\nif pid==0:\n os.close(r)\n os.setsid()\n with open(sys.argv[1],'w') as f: f.write(str(os.getpid()))\n os.write(w,b'1')\n os.close(w)\n time.sleep(5)\n os._exit(0)\nos.close(w)\nos.read(r,1)\nos._exit(0)\n";
        let started = Instant::now();
        let result = run_fixed(Path::new("/usr/bin/python3"), &[OsStr::new("-c"), OsStr::new(code), pid_file.as_os_str()], None, Duration::from_secs(2), 100);
        let elapsed = started.elapsed();
        // Clean up exactly the helper created by this test, including on a
        // regression where run_fixed waits for the child's normal exit.
        if let Ok(pid) = std::fs::read_to_string(&pid_file) { if let Ok(pid) = pid.parse::<i32>() { unsafe { libc::kill(pid, libc::SIGKILL); } } }
        assert_eq!(result.err().unwrap().code, "TOOL_TIMEOUT");
        assert!(elapsed < Duration::from_secs(2), "detached pipe waited {elapsed:?}");
    }
    #[test] fn real_git_diagnostics_do_not_change_checkout_and_reject_subfolders() {
        let home = tempfile::tempdir().unwrap(); let root = home.path().join("repo"); std::fs::create_dir(&root).unwrap();
        let run = |args: &[&str]| { let result = Command::new("/usr/bin/git").args(args).current_dir(&root).env("GIT_CONFIG_GLOBAL", "/dev/null").env("GIT_CONFIG_NOSYSTEM", "1").output().unwrap(); assert!(result.status.success(), "{}", String::from_utf8_lossy(&result.stderr)); };
        run(&["init", "-b", "main"]); run(&["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "--allow-empty", "-m", "fixture"]);
        run(&["remote", "add", "origin", "git@github.com:acme/repo.git"]);
        let canonical = root.canonicalize().unwrap(); let clean = repository(canonical.to_str().unwrap(), None, home.path()).unwrap();
        assert_eq!(clean.branch.as_deref(), Some("main")); assert_eq!(clean.clean, Some(true)); assert_eq!(clean.origin.as_deref(), Some("https://github.com/acme/repo.git"));
        std::fs::write(root.join("new.txt"), "retained changes").unwrap();
        assert_eq!(repository(canonical.to_str().unwrap(), None, home.path()).unwrap().clean, Some(false));
        assert_eq!(std::fs::read_to_string(root.join("new.txt")).unwrap(), "retained changes");
        let sub = root.join("sub"); std::fs::create_dir(&sub).unwrap(); assert!(validate_repository_folder(&sub, home.path()).is_err());
        run(&["remote", "set-url", "origin", "https://secret@github.com/acme/repo"]);
        assert_eq!(repository(canonical.to_str().unwrap(), None, home.path()).err().unwrap().code, "GIT_ORIGIN_INVALID");
    }
}
