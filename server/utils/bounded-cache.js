// ── Bounded in-memory cache ──────────────────────────────────
// Plain object caches in this app grew without limit (every distinct search
// query, track analysis, or lyric lookup stayed in RAM forever). On a 1GB Pi
// that slowly eats the heap. BoundedCache keeps at most `max` entries with an
// optional TTL and evicts the oldest (insertion order) when full.

class BoundedCache {
  constructor({ max = 50, ttl = 0 } = {}) {
    this.max = max
    this.ttl = ttl          // ms; 0 = never expires
    this.map = new Map()    // key → { value, t }
  }

  get(key) {
    const entry = this.map.get(key)
    if (!entry) return undefined
    if (this.ttl && Date.now() - entry.t > this.ttl) {
      this.map.delete(key)
      return undefined
    }
    // Refresh recency (move to newest position)
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.value
  }

  set(key, value) {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, { value, t: Date.now() })
    // Evict oldest until within bounds
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value
      this.map.delete(oldest)
    }
  }

  get size() { return this.map.size }
}

module.exports = BoundedCache
