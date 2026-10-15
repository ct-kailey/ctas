export function desktopOpenUrl(projectId) {
  if (typeof projectId !== 'string' || !projectId.trim() || projectId.length > 200 || /[\x00-\x1f]/.test(projectId)) return null;
  return `ctas://open?project=${encodeURIComponent(projectId)}`;
}
export function desktopDevices(data, provider, now = Date.now()) {
  return (Array.isArray(data?.devices) ? data.devices : []).filter(device => device && typeof device.id === 'string' && !device.revoked_at && (!device.expires_at || Date.parse(device.expires_at) > now) && ['codex', 'claude-code'].includes(device.provider) && (!provider || device.provider === provider));
}
export function desktopDeviceState(device, now = Date.now()) {
  if (device.revoked_at) return { label: '연결 해제됨', tone: 'quiet' };
  if (device.expires_at && Date.parse(device.expires_at) <= now) return { label: '연결 만료', tone: 'amber' };
  if (device.online === true) return { label: '최근 연결 확인', tone: 'green' };
  return { label: '오프라인 · 수신 대기', tone: 'amber' };
}
export function desktopTaskMode(task, settings) {
  return task?.execution_context?.execution_profile?.execution_mode === 'desktop';
}
export function desktopTaskMessage(task, settings) {
  if (!desktopTaskMode(task, settings)) return null;
  if (task?.execution_status === 'queued') return { title: '데스크톱 수신 대기', body: '개발 요청을 접수했습니다. 선택한 CTAS Desktop을 열고 자동 수신을 켜면 작업이 시작됩니다.', open: true };
  if (task?.execution_status === 'running') return { title: '데스크톱에서 개발 중', body: '로컬 개발이 끝나면 코드 변경안과 실행 결과가 이 작업에 동기화됩니다.', open: true };
  if (task?.execution_status === 'ready' && task?.artifact) return { title: '데스크톱 결과 동기화됨', body: '로컬 변경안을 받았습니다. 실제 코드와 검증 근거를 확인해야 하며, 자동으로 PR을 생성하거나 병합하지 않습니다.', open: false };
  return null;
}
