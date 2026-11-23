export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      /* ignore */
    }
    throw new Error(`HTTP ${res.status} dla ${url}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json()) as T;
}
