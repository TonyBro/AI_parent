export async function kvGetJson<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const v = await kv.get(key);
  if (!v) return null;
  return JSON.parse(v) as T;
}

export async function kvPutJson(kv: KVNamespace, key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
}






