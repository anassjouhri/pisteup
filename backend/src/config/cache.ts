interface Entry { value: string; expires: number | null }

class Cache {
  private store = new Map<string, Entry>()

  get(key: string): string | null {
    const e = this.store.get(key)
    if (!e) return null
    if (e.expires && Date.now() > e.expires) { this.store.delete(key); return null }
    return e.value
  }

  set(key: string, value: string, ttlSeconds?: number): void {
    this.store.set(key, { value, expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null })
  }

  del(key: string): void { this.store.delete(key) }
}

export const cache = new Cache()
setInterval(() => {
  const now = Date.now()
  for (const [k, e] of (cache as any).store.entries()) {
    if (e.expires && now > e.expires) (cache as any).store.delete(k)
  }
}, 5 * 60 * 1000)
