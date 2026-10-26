import { useCallback, useEffect, useState } from 'react';
import { request } from './api';
export function useResource<T>(url: string | null) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string }>({
    data: null,
    loading: !!url,
    error: '',
  });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((x) => x + 1), []);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    setState({ data: null, loading: true, error: '' });
    request<T>(url, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, loading: false, error: '' });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({ data: null, loading: false, error: error.message });
      });
    return () => controller.abort();
  }, [url, revision]);
  return { ...state, retry };
}
