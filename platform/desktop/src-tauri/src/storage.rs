use std::{fs::{self, OpenOptions}, io::{Read, Write}, path::{Path, PathBuf}};
use serde::{Deserialize, Serialize};
use crate::{model::{AppError, Profile, ProfileInput, Result}, validation};
const LIMIT: u64 = 16_384;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProfileFile { schema_version: u8, profile: Profile }
fn storage_error() -> AppError { AppError::new("PROFILE_STORAGE_INVALID", "로컬 프로필을 읽거나 저장하지 못했습니다. 작업 폴더와 프로필을 다시 설정하세요.") }
fn folder(dir: &Path) -> Result<PathBuf> {
    if let Ok(metadata) = fs::symlink_metadata(dir) { if metadata.file_type().is_symlink() || !metadata.is_dir() { return Err(storage_error()); } }
    fs::create_dir_all(dir).map_err(|_| storage_error())?;
    #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; fs::set_permissions(dir, fs::Permissions::from_mode(0o700)).map_err(|_| storage_error())?; }
    dir.canonicalize().map_err(|_| storage_error())
}
pub fn load(dir: &Path, home: &Path) -> Result<Option<Profile>> {
    let file = dir.join("profile.json");
    let meta = match fs::symlink_metadata(&file) { Ok(meta) => meta, Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None), Err(_) => return Err(storage_error()) };
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > LIMIT { return Err(storage_error()); }
    let mut content = Vec::new(); fs::File::open(&file).map_err(|_| storage_error())?.take(LIMIT + 1).read_to_end(&mut content).map_err(|_| storage_error())?;
    if content.len() as u64 > LIMIT { return Err(storage_error()); }
    let saved: ProfileFile = serde_json::from_slice(&content).map_err(|_| storage_error())?;
    if saved.schema_version != 1 { return Err(storage_error()); }
    let original = saved.profile;
    let checked = validation::profile(ProfileInput { project_id: original.project_id.clone(), workspace_id: original.workspace_id.clone(), repository_url: original.repository_url.clone(), provider: original.provider.clone() }, Path::new(&original.working_folder), home)?;
    if original != checked { return Err(storage_error()); }
    Ok(Some(checked))
}
pub fn save(dir: &Path, profile: &Profile) -> Result<()> {
    let dir = folder(dir)?; let target = dir.join("profile.json");
    if fs::symlink_metadata(&target).is_ok_and(|meta| !meta.is_file() || meta.file_type().is_symlink()) { return Err(storage_error()); }
    let temporary = dir.join(format!("profile-{}.tmp", std::process::id()));
    let bytes = serde_json::to_vec_pretty(&ProfileFile { schema_version: 1, profile: profile.clone() }).map_err(|_| storage_error())?;
    let mut options = OpenOptions::new(); options.write(true).create_new(true);
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
    let mut file = options.open(&temporary).map_err(|_| storage_error())?;
    let result = (|| { file.write_all(&bytes)?; file.sync_all()?; fs::rename(&temporary, &target) })();
    if result.is_err() { let _ = fs::remove_file(&temporary); return Err(storage_error()); }
    Ok(())
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn profile_roundtrip_is_private_and_rejects_unknown_fields_and_symlinks() {
        let home = tempfile::tempdir().unwrap(); let repo = home.path().join("repo"); fs::create_dir(&repo).unwrap(); let dir = home.path().join("data");
        let profile = validation::profile(ProfileInput { project_id: "f3ffa708-b79f-4aa6-a2e7-54a675246a9b".into(), workspace_id: "t_test_workspace".into(), repository_url: "git@github.com:acme/repo.git".into(), provider: "codex".into() }, &repo, home.path()).unwrap();
        assert!(load(&dir, home.path()).unwrap().is_none()); save(&dir, &profile).unwrap(); assert_eq!(load(&dir, home.path()).unwrap(), Some(profile));
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; assert_eq!(fs::metadata(dir.join("profile.json")).unwrap().permissions().mode() & 0o777, 0o600); }
        let target = dir.join("profile.json"); let mut data: serde_json::Value = serde_json::from_slice(&fs::read(&target).unwrap()).unwrap(); data["token"] = serde_json::json!("not accepted"); fs::write(&target, serde_json::to_vec(&data).unwrap()).unwrap(); assert!(load(&dir, home.path()).is_err());
        #[cfg(unix)] { fs::remove_file(&target).unwrap(); std::os::unix::fs::symlink(home.path().join("elsewhere"), &target).unwrap(); assert!(load(&dir, home.path()).is_err()); }
    }
}
