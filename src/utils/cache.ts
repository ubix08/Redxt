/**
 * Enhanced Multi-Level Caching System
 * Implements LRU cache with compression and smart invalidation
 */

import type { CachedContent, CacheStats, CacheStrategy } from '../types';

// ============================================================================
// LRU CACHE IMPLEMENTATION
// ============================================================================

class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;
  private evictionCallback?: (key: K, value: V) => void;
  
  constructor(maxSize: number, evictionCallback?: (key: K, value: V) => void) {
    this.maxSize = maxSize;
    this.evictionCallback = evictionCallback;
  }
  
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }
  
  set(key: K, value: V): void {
    // Remove if exists (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    
    // Add to end
    this.cache.set(key, value);
    
    // Evict oldest if over capacity
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      const firstValue = this.cache.get(firstKey);
      this.cache.delete(firstKey);
      
      if (this.evictionCallback && firstValue !== undefined) {
        this.evictionCallback(firstKey, firstValue);
      }
    }
  }
  
  has(key: K): boolean {
    return this.cache.has(key);
  }
  
  delete(key: K): boolean {
    return this.cache.delete(key);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  size(): number {
    return this.cache.size;
  }
  
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }
}

// ============================================================================
// COMPRESSION UTILITIES
// ============================================================================

function compress(text: string): string {
  // Simple run-length encoding for demonstration
  // In production, use proper compression like pako (zlib)
  let compressed = '';
  let count = 1;
  
  for (let i = 0; i < text.length; i++) {
    if (text[i] === text[i + 1]) {
      count++;
    } else {
      if (count > 3) {
        compressed += `${text[i]}${count}`;
      } else {
        compressed += text[i].repeat(count);
      }
      count = 1;
    }
  }
  
  return compressed;
}

function decompress(compressed: string): string {
  // Simple run-length decoding
  let text = '';
  let i = 0;
  
  while (i < compressed.length) {
    const char = compressed[i];
    let numStr = '';
    let j = i + 1;
    
    // Check if next characters are digits
    while (j < compressed.length && /\d/.test(compressed[j])) {
      numStr += compressed[j];
      j++;
    }
    
    if (numStr) {
      // Repeat character
      text += char.repeat(parseInt(numStr, 10));
      i = j;
    } else {
      // Single character
      text += char;
      i++;
    }
  }
  
  return text;
}

function shouldCompress(text: string, threshold: number): boolean {
  return text.length > threshold;
}

// ============================================================================
// ENHANCED CONTENT CACHE
// ============================================================================

export class EnhancedContentCache {
  private domCache: LRUCache<string, CachedContent>;
  private screenshotCache: LRUCache<string, CachedContent>;
  private apiCache: LRUCache<string, CachedContent>;
  
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalSize: 0,
    hitRate: 0,
  };
  
  private strategy: CacheStrategy;
  
  constructor(strategy: Partial<CacheStrategy> = {}) {
    this.strategy = {
      enabled: strategy.enabled ?? true,
      maxSize: strategy.maxSize ?? 100,
      ttl: strategy.ttl ?? 300000, // 5 minutes
      compressionEnabled: strategy.compressionEnabled ?? true,
      compressionThreshold: strategy.compressionThreshold ?? 10000, // 10KB
      warmingEnabled: strategy.warmingEnabled ?? false,
    };
    
    const evictionCallback = () => {
      this.stats.evictions++;
    };
    
    this.domCache = new LRUCache(this.strategy.maxSize, evictionCallback);
    this.screenshotCache = new LRUCache(Math.floor(this.strategy.maxSize / 2), evictionCallback);
    this.apiCache = new LRUCache(this.strategy.maxSize, evictionCallback);
  }
  
  /**
   * Get content from cache
   */
  get(key: string, type: 'dom' | 'screenshot' | 'api' = 'dom'): string | null {
    if (!this.strategy.enabled) {
      return null;
    }
    
    const cache = this.getCacheByType(type);
    const cached = cache.get(key);
    
    if (!cached) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }
    
    // Check if expired
    if (Date.now() - cached.timestamp > this.strategy.ttl) {
      cache.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }
    
    // Hit!
    this.stats.hits++;
    cached.hits++;
    this.updateHitRate();
    
    // Decompress if needed
    return cached.compressed ? decompress(cached.content) : cached.content;
  }
  
  /**
   * Set content in cache
   */
  set(key: string, content: string, type: 'dom' | 'screenshot' | 'api' = 'dom'): void {
    if (!this.strategy.enabled) {
      return;
    }
    
    const cache = this.getCacheByType(type);
    
    // Determine if we should compress
    const shouldCompr = this.strategy.compressionEnabled && 
                        shouldCompress(content, this.strategy.compressionThreshold);
    
    const finalContent = shouldCompr ? compress(content) : content;
    const size = finalContent.length;
    
    const cached: CachedContent = {
      content: finalContent,
      compressed: shouldCompr,
      timestamp: Date.now(),
      hits: 0,
      size,
    };
    
    cache.set(key, cached);
    this.updateTotalSize();
  }
  
  /**
   * Check if key exists in cache
   */
  has(key: string, type: 'dom' | 'screenshot' | 'api' = 'dom'): boolean {
    if (!this.strategy.enabled) {
      return false;
    }
    
    const cache = this.getCacheByType(type);
    return cache.has(key);
  }
  
  /**
   * Delete from cache
   */
  delete(key: string, type: 'dom' | 'screenshot' | 'api' = 'dom'): boolean {
    const cache = this.getCacheByType(type);
    const result = cache.delete(key);
    this.updateTotalSize();
    return result;
  }
  
  /**
   * Clear specific cache or all caches
   */
  clear(type?: 'dom' | 'screenshot' | 'api'): void {
    if (type) {
      this.getCacheByType(type).clear();
    } else {
      this.domCache.clear();
      this.screenshotCache.clear();
      this.apiCache.clear();
    }
    this.updateTotalSize();
  }
  
  /**
   * Smart cache invalidation on navigation
   */
  onNavigate(newUrl: string, oldUrl?: string): void {
    if (!oldUrl) {
      this.clear('dom');
      return;
    }
    
    const newDomain = this.extractDomain(newUrl);
    const oldDomain = this.extractDomain(oldUrl);
    
    // Same domain - only clear DOM cache
    if (newDomain === oldDomain) {
      this.clear('dom');
    } else {
      // Different domain - clear everything
      this.clear();
    }
  }
  
  /**
   * Warm cache with common patterns
   */
  async warmCache(url: string, fetcher: (pattern: string) => Promise<string>): Promise<void> {
    if (!this.strategy.warmingEnabled) {
      return;
    }
    
    const commonPatterns = ['nav', 'header', 'footer', 'main', 'sidebar'];
    
    for (const pattern of commonPatterns) {
      try {
        const cacheKey = `${url}#${pattern}`;
        if (!this.has(cacheKey, 'dom')) {
          const content = await fetcher(pattern);
          this.set(cacheKey, content, 'dom');
        }
      } catch (error) {
        // Ignore warming errors
        console.warn(`Failed to warm cache for pattern ${pattern}:`, error);
      }
    }
  }
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }
  
  /**
   * Get cache size info
   */
  getSizeInfo(): {
    dom: number;
    screenshot: number;
    api: number;
    total: number;
  } {
    return {
      dom: this.domCache.size(),
      screenshot: this.screenshotCache.size(),
      api: this.apiCache.size(),
      total: this.domCache.size() + this.screenshotCache.size() + this.apiCache.size(),
    };
  }
  
  /**
   * Prune expired entries
   */
  pruneExpired(): number {
    let pruned = 0;
    const now = Date.now();
    
    const pruneCache = (cache: LRUCache<string, CachedContent>) => {
      const keys = Array.from(cache.keys());
      for (const key of keys) {
        const cached = cache.get(key);
        if (cached && now - cached.timestamp > this.strategy.ttl) {
          cache.delete(key);
          pruned++;
        }
      }
    };
    
    pruneCache(this.domCache);
    pruneCache(this.screenshotCache);
    pruneCache(this.apiCache);
    
    this.updateTotalSize();
    return pruned;
  }
  
  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================
  
  private getCacheByType(type: 'dom' | 'screenshot' | 'api'): LRUCache<string, CachedContent> {
    switch (type) {
      case 'dom':
        return this.domCache;
      case 'screenshot':
        return this.screenshotCache;
      case 'api':
        return this.apiCache;
    }
  }
  
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }
  
  private updateTotalSize(): void {
    let totalSize = 0;
    
    const addSize = (cache: LRUCache<string, CachedContent>) => {
      for (const key of cache.keys()) {
        const cached = cache.get(key);
        if (cached) {
          totalSize += cached.size;
        }
      }
    };
    
    addSize(this.domCache);
    addSize(this.screenshotCache);
    addSize(this.apiCache);
    
    this.stats.totalSize = totalSize;
  }
  
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createContentCache(strategy?: Partial<CacheStrategy>): EnhancedContentCache {
  return new EnhancedContentCache(strategy);
}
