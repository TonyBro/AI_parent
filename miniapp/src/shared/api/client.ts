function getInitData(): string | null {
  // Telegram Mini App: prefer real initData, but allow local dev by passing
  // ?tma=<initData> or ?initData=<initData>, or storing it in localStorage.
  const fromTg = window.Telegram?.WebApp?.initData || null;
  if (fromTg) return fromTg;
  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get("tma") || url.searchParams.get("initData");
    if (fromQuery) {
      localStorage.setItem("tma_initData", fromQuery);
      return fromQuery;
    }
    const fromStore = localStorage.getItem("tma_initData");
    return fromStore || null;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const initData = getInitData();
  if (!initData) throw new Error("miniapp.error_missing_init_data");

  const headers: Record<string, string> = {
    ...(init.headers as any || {}),
    authorization: `tma ${initData}`,
  };

  if (!(init.body instanceof FormData)) {
    headers["content-type"] = "application/json";
  }

  const res = await fetch(path, {
    ...init,
    headers,
  });

  // Parse response as JSON
  const json = (await res.json().catch(() => ({}))) as any;
  
  if (!res.ok) {
    const errorMsg = json?.description || json?.reason || json?.error || `HTTP ${res.status}`;
    throw new Error(errorMsg);
  }
  return json as T;
}
