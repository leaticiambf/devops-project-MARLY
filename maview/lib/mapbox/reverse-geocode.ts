type GeocodeFeatureCollection = {
  features?: Array<{
    place_name?: string;
    center?: [number, number];
  }>;
};

export async function reverseGeocodeMapbox(
  lng: number,
  lat: number,
  token: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?language=fr&types=address,poi,place&limit=1&access_token=${encodeURIComponent(token)}`;
    const response = await fetch(url, { signal });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as GeocodeFeatureCollection;
    const name = data.features?.[0]?.place_name?.trim();
    return name || null;
  } catch (e) {
    if (signal?.aborted) {
      throw e;
    }
    return null;
  }
}

const FORWARD_CACHE_PREFIX = "maview:geocode:";

function readForwardFromCache(query: string): [number, number] | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(FORWARD_CACHE_PREFIX + query);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "number" &&
      typeof parsed[1] === "number"
    ) {
      return [parsed[0], parsed[1]] as [number, number];
    }
  } catch {
    // ignore
  }
  return null;
}

function writeForwardToCache(query: string, coords: [number, number]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(FORWARD_CACHE_PREFIX + query, JSON.stringify(coords));
  } catch {
    // ignore quota / availability
  }
}

/**
 * Forward geocoding (adresse / lieu → coordonnées). Renvoie [lng, lat] ou null.
 * Met en cache en `sessionStorage` pour éviter les appels répétés (ex. même `locationQuery` d'une tâche).
 */
export async function forwardGeocodeMapbox(
  query: string,
  token: string,
  signal?: AbortSignal,
): Promise<[number, number] | null> {
  const normalized = query.trim();
  if (!normalized) {
    return null;
  }

  const coordMatch = normalized.match(
    /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/,
  );
  if (coordMatch) {
    const lat = Number(coordMatch[1]);
    const lng = Number(coordMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return [lng, lat];
    }
  }

  const cached = readForwardFromCache(normalized);
  if (cached) {
    return cached;
  }

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(normalized)}.json?language=fr&limit=1&access_token=${encodeURIComponent(token)}`;
    const response = await fetch(url, { signal });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as GeocodeFeatureCollection;
    const center = data.features?.[0]?.center;
    if (!center || center.length !== 2) {
      return null;
    }
    const result: [number, number] = [center[0], center[1]];
    writeForwardToCache(normalized, result);
    return result;
  } catch (e) {
    if (signal?.aborted) {
      throw e;
    }
    return null;
  }
}
