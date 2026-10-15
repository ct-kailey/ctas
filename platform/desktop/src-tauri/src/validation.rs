use std::path::{Path, PathBuf};
use crate::model::{AppError, Profile, ProfileInput, Result};
pub const ORIGIN: &str = "https://ains-workspace-production.up.railway.app";
fn invalid() -> AppError { AppError::new("PROFILE_INVALID", "프로젝트 ID, Nora 워크스페이스, GitHub 저장소와 실행 도구를 확인하세요.") }
pub fn project_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 128 && value.as_bytes()[0].is_ascii_alphanumeric()
        && value.bytes().all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c))
}
pub fn repository_url(value: &str) -> Result<String> {
    let value = value.trim();
    if value.len() > 500 || value.chars().any(char::is_control) { return Err(invalid()); }
    let normalized = if let Some(tail) = value.strip_prefix("git@github.com:") { format!("https://github.com/{tail}") } else { value.into() };
    let url = url::Url::parse(&normalized).map_err(|_| invalid())?;
    let transport = url.scheme() == "https" && url.username().is_empty() || url.scheme() == "ssh" && url.username() == "git";
    if !transport || url.host_str() != Some("github.com") || url.password().is_some() || url.port().is_some() || url.query().is_some() || url.fragment().is_some() { return Err(invalid()); }
    let path = url.path().trim_end_matches('/');
    let parts: Vec<_> = path.strip_prefix('/').unwrap_or("").split('/').collect();
    if parts.len() != 2 { return Err(invalid()); }
    let owner = parts[0]; let repo = parts[1].strip_suffix(".git").unwrap_or(parts[1]);
    if owner.is_empty() || owner.len() > 39 || !owner.as_bytes()[0].is_ascii_alphanumeric() || !owner.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
        || repo.is_empty() || repo.len() > 100 || [".", ".."].contains(&repo) || !repo.bytes().all(|c| c.is_ascii_alphanumeric() || b"_.-".contains(&c)) { return Err(invalid()); }
    Ok(format!("https://github.com/{owner}/{repo}.git"))
}
pub fn canonical_folder(value: &Path, home: &Path) -> Result<PathBuf> {
    let fail = || AppError::new("WORKSPACE_PATH_INVALID", "루트나 홈 폴더가 아닌 Git 프로젝트 폴더를 선택하세요.");
    let path = value.canonicalize().map_err(|_| fail())?;
    let home = home.canonicalize().map_err(|_| fail())?;
    if !path.is_dir() || path.parent().is_none() || path == home || path.to_str().is_none()
        || path.to_string_lossy().len() > 4000 || path.to_string_lossy().chars().any(char::is_control) { return Err(fail()); }
    Ok(path)
}
pub fn profile(input: ProfileInput, folder: &Path, home: &Path) -> Result<Profile> {
    let workspace_valid = input.workspace_id.is_empty() || input.workspace_id.starts_with("t_") && (10..=130).contains(&input.workspace_id.len())
        && input.workspace_id[2..].bytes().all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c));
    if !project_id(&input.project_id) || !workspace_valid || !["codex", "claude-code"].contains(&input.provider.as_str()) { return Err(invalid()); }
    Ok(Profile { project_id: input.project_id, workspace_id: input.workspace_id,
        repository_url: repository_url(&input.repository_url)?, working_folder: canonical_folder(folder, home)?.to_string_lossy().into(), provider: input.provider })
}
pub fn caller_allowed(label: &str, url: &url::Url, debug: bool) -> bool {
    label == "main" && url.username().is_empty() && url.password().is_none()
        && ((url.scheme() == "tauri" && url.host_str() == Some("localhost") && url.port().is_none())
            || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost") && url.port().is_none())
            || (debug && url.origin().ascii_serialization() == "http://127.0.0.1:1420"))
}
pub fn workspace_url(profile: &Profile) -> Result<url::Url> {
    if !project_id(&profile.project_id) { return Err(invalid()); }
    let mut url = url::Url::parse(ORIGIN).expect("fixed production origin");
    url.query_pairs_mut().append_pair("project", &profile.project_id).append_pair("tab", "home"); Ok(url)
}

pub fn deep_link_project(url:&url::Url)->Option<String>{
    if url.scheme()!="ctas"||url.host_str()!=Some("open")||!url.username().is_empty()||url.password().is_some()||url.port().is_some()||url.fragment().is_some()||!["","/"].contains(&url.path()){return None;}
    let pairs:Vec<_>=url.query_pairs().collect();
    if pairs.len()!=1||pairs[0].0!="project"||!project_id(&pairs[0].1){return None;}
    Some(pairs[0].1.to_string())
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn deep_links_only_wake_a_project_and_never_carry_execution_or_pairing() {
        assert_eq!(deep_link_project(&url::Url::parse("ctas://open?project=ains-sism").unwrap()).as_deref(),Some("ains-sism"));
        for value in ["ctas://run?project=ains-sism","ctas://open?project=ains-sism&prompt=run","ctas://open?project=ains-sism&code=secret","ctas://open?project=../x","https://open?project=p","ctas://user@open?project=p"]{assert!(deep_link_project(&url::Url::parse(value).unwrap()).is_none());}
    }
    #[test] fn repository_scope_rejects_credentials_and_non_github_targets() {
        for value in ["https://github.com/acme/repo", "git@github.com:acme/repo.git", "ssh://git@github.com/acme/repo", "https://github.com/acme/repo.git/"] { assert_eq!(repository_url(value).unwrap(), "https://github.com/acme/repo.git"); }
        for value in ["https://token@github.com/acme/repo", "https://a:b@github.com/acme/repo", "http://github.com/acme/repo", "https://github.com.evil/acme/repo", "https://github.com/acme/repo?token=secret", "https://github.com/acme/repo#main", "ssh://token@github.com/acme/repo", "ssh://git:secret@github.com/acme/repo", "file:///tmp/repo", "https://github.com/acme/%2e%2e", "https://github.com/acme/repo/tree/main"] { assert!(repository_url(value).is_err(), "{value}"); }
    }
    #[test] fn native_calls_are_bound_to_local_main_window() {
        for value in ["tauri://localhost/index.html", "http://tauri.localhost/"] { assert!(caller_allowed("main", &url::Url::parse(value).unwrap(), false)); }
        assert!(caller_allowed("main", &url::Url::parse("http://127.0.0.1:1420").unwrap(), true));
        for value in ["http://127.0.0.1:1420", ORIGIN, "https://nora.example", "http://tauri.localhost.evil", "tauri://other", "http://user@tauri.localhost", "http://tauri.localhost:1420"] { assert!(!caller_allowed("main", &url::Url::parse(value).unwrap(), false)); }
        assert!(!caller_allowed("other", &url::Url::parse("tauri://localhost").unwrap(), true));
    }
    #[test] fn local_profiles_accept_project_slugs_without_a_nora_workspace() {
        let home = tempfile::tempdir().unwrap(); let repo = home.path().join("repo"); std::fs::create_dir(&repo).unwrap();
        let valid = profile(ProfileInput { project_id: "ains-sism".into(), workspace_id: "".into(), repository_url: "https://github.com/acme/repo".into(), provider: "codex".into() }, &repo, home.path()).unwrap();
        let url = workspace_url(&valid).unwrap(); assert_eq!(url.origin().ascii_serialization(), ORIGIN); assert!(url.query().unwrap().contains("project=ains-sism"));
        for value in ["../other", "https://evil", "a&project=other", "", "a b"] { assert!(!project_id(value)); }
    }
    #[test] fn root_home_and_symlink_escape_are_not_selected_as_workspaces() {
        let home = tempfile::tempdir().unwrap(); let repo = home.path().join("repo"); std::fs::create_dir(&repo).unwrap();
        assert!(canonical_folder(Path::new("/"), home.path()).is_err()); assert!(canonical_folder(home.path(), home.path()).is_err());
        assert_eq!(canonical_folder(&repo, home.path()).unwrap(), repo.canonicalize().unwrap());
        #[cfg(unix)] { let link = home.path().join("home-link"); std::os::unix::fs::symlink(home.path(), &link).unwrap(); assert!(canonical_folder(&link, home.path()).is_err()); }
    }
}
