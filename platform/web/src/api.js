export class ApiError extends Error {
  constructor(message, code, status) { super(message); this.name = 'ApiError'; this.code = code; this.status = status; }
}

export async function api(path, { method = 'GET', body, csrfToken, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (csrfToken && method !== 'GET') headers['X-CSRF-Token'] = csrfToken;
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(path, {
      method, credentials: 'same-origin', headers, signal,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(method === 'GET' ? '서버에 연결하지 못했습니다. 연결 상태를 확인해 주세요.' : '응답을 확인하지 못했습니다. 목록에서 처리 여부를 확인한 뒤 다시 시도해 주세요.', 'CONNECTION_ERROR', 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(data?.error?.message || '요청을 처리하지 못했습니다.', data?.error?.code || 'REQUEST_FAILED', response.status);
  if (!data) throw new ApiError('서버 응답을 읽을 수 없습니다.', 'INVALID_RESPONSE', response.status);
  return data;
}
