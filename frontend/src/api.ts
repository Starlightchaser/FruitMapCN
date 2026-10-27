import type { FilterState } from './types';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  signal?: AbortSignal,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init, signal });
  if (!response.ok) {
    let message = '服务暂时不可用，请稍后重试。';
    try {
      const data = await response.json();
      if (typeof data.detail === 'string') message = data.detail;
    } catch {
      /* Keep a readable fallback for non-JSON server errors. */
    }
    if (response.status === 401) window.dispatchEvent(new Event('fruitmap:unauthorized'));
    throw new ApiError(response.status, message);
  }
  return response.json();
}
export function query(filters: FilterState, extra: Record<string, string | number> = {}): string {
  const params = new URLSearchParams();
  Object.entries({ ...filters, ...extra }).forEach(([key, value]) => {
    if (value !== '' && value !== null) params.set(key, String(value));
  });
  return params.toString();
}
export function safeSource(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
