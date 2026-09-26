const FARE = {
  bike: { base: 15, perKm: 6, min: 25 },
  erickshaw: { base: 20, perKm: 8, min: 30 },
  auto: { base: 30, perKm: 11, min: 45 },
  car: { base: 50, perKm: 14, min: 80 },
};

export const VEHICLE_TYPES = Object.keys(FARE);

const toRad = (d) => (d * Math.PI) / 180;

export function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Small in-memory cache: the same route requested repeatedly won't re-hit OSRM
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map();
const cacheKey = (a, b) =>
  [a.lat, a.lng, b.lat, b.lng].map((n) => n.toFixed(4)).join(",");

export async function getRoadDistanceKm(a, b) {
  const key = cacheKey(a, b);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return { km: hit.km, source: "osrm" };

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      const meters = data?.routes?.[0]?.distance;
      if (Number.isFinite(meters)) {
        const km = meters / 1000;
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
        cache.set(key, { km, expires: Date.now() + CACHE_TTL_MS });
        return { km, source: "osrm" };
      }
    }
  } catch {
    // fall through to fallback below
  }
  // The fallback is never cached, so we get the real distance as soon as OSRM is back
  return { km: haversineKm(a, b) * 1.3, source: "estimate" };
}

export function calcFare(type, km) {
  const c = FARE[type];
  const raw = c.base + c.perKm * km;
  return Math.max(c.min, Math.round(raw / 5) * 5);
}
