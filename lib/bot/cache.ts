import type { DomainDb } from "@/lib/domain/ports";
import type { BotCatalog, KbEntry } from "./ports";

/** A tiny TTL cache with explicit invalidation. */
export function ttlCache<T>(ttlMs: number, load: () => Promise<T>) {
  let value: { v: T; at: number } | null = null;
  let inflight: Promise<T> | null = null;
  return {
    async get(now = Date.now()): Promise<T> {
      if (value && now - value.at < ttlMs) return value.v;
      inflight ??= load()
        .then((v) => {
          value = { v, at: Date.now() };
          return v;
        })
        .finally(() => {
          inflight = null;
        });
      return inflight;
    },
    invalidate() {
      value = null;
    },
  };
}

const DEFAULT_TTL_MS = 60_000;
const invalidators = new Set<() => void>();

/** Call after the owner edits the fleet, locations, aliases or the knowledge base. */
export function invalidateBotCaches(): void {
  for (const fn of invalidators) fn();
}

const domainCache = new WeakMap<DomainDb, DomainDb>();

/**
 * Wraps the display-only list reads (fleet, categories, locations) in a short
 * TTL cache. Availability, prices and every booking write still hit the real
 * database — only "what cars/locations exist" is cached.
 */
export function cachedDomainDb(db: DomainDb, ttlMs = DEFAULT_TTL_MS): DomainDb {
  const existing = domainCache.get(db);
  if (existing) return existing;
  const vehicles = ttlCache(ttlMs, () => db.listActiveVehicles({}));
  const categories = ttlCache(ttlMs, () => db.listVehicleCategories());
  const locations = ttlCache(ttlMs, () => db.listActiveLocations());
  invalidators.add(() => {
    vehicles.invalidate();
    categories.invalidate();
    locations.invalidate();
  });
  const wrapped: DomainDb = {
    ...db,
    async listActiveVehicles(filter) {
      if (!filter.categoryId && !filter.homeLocationId) return vehicles.get();
      return db.listActiveVehicles(filter);
    },
    listVehicleCategories: () => categories.get(),
    listActiveLocations: () => locations.get(),
  };
  domainCache.set(db, wrapped);
  return wrapped;
}

const catalogCache = new WeakMap<BotCatalog, BotCatalog>();

export function cachedCatalog(
  catalog: BotCatalog,
  ttlMs = DEFAULT_TTL_MS,
): BotCatalog {
  const existing = catalogCache.get(catalog);
  if (existing) return existing;
  const kb = ttlCache<KbEntry[]>(ttlMs, () => catalog.listKnowledge());
  const aliases = ttlCache(ttlMs, () => catalog.listLocationAliases());
  invalidators.add(() => {
    kb.invalidate();
    aliases.invalidate();
  });
  const wrapped: BotCatalog = {
    listKnowledge: () => kb.get(),
    listLocationAliases: () => aliases.get(),
    searchKnowledge: (q, lang, limit) =>
      catalog.searchKnowledge(q, lang, limit),
  };
  catalogCache.set(catalog, wrapped);
  return wrapped;
}
