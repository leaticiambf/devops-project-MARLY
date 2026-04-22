import type { Feature, FeatureCollection, GeoJsonProperties, LineString } from "geojson";
import type mapboxgl from "mapbox-gl";

export type TransportType = "walking" | "bus" | "metro" | "train";

export type TransportStop = {
  id: string;
  name: string;
  address?: string | null;
  coordinates: [number, number];
  type?: "origin" | "interchange" | "destination";
};

export type TransportSegment = {
  id: string;
  label: string;
  transportType: TransportType;
  color?: string;
  coordinates: [number, number][];
};

export const TRANSPORT_LABELS: Record<TransportType, string> = {
  walking: "Marche",
  bus: "Bus",
  metro: "Metro",
  train: "Train",
};

export const TRANSPORT_COLORS: Record<TransportType, string> = {
  walking: "#3b82f6",
  bus: "#ef4444",
  metro: "#22c55e",
  train: "#8b5cf6",
};

export const DEMO_STOPS: TransportStop[] = [
  { id: "stop-a", name: "Bastille", coordinates: [2.3694, 48.853], type: "origin" },
  { id: "stop-b", name: "Republique", coordinates: [2.3631, 48.8672], type: "interchange" },
  { id: "stop-c", name: "Gare du Nord", coordinates: [2.3553, 48.8809], type: "interchange" },
  { id: "stop-d", name: "La Defense", coordinates: [2.2386, 48.8924], type: "destination" },
];

export const DEMO_SEGMENTS: TransportSegment[] = [
  {
    id: "segment-walk-1",
    label: "Walk to bus stop",
    transportType: "walking",
    coordinates: [
      [2.3694, 48.853],
      [2.3664, 48.8582],
      [2.3631, 48.8672],
    ],
  },
  {
    id: "segment-bus-1",
    label: "Bus 91",
    transportType: "bus",
    coordinates: [
      [2.3631, 48.8672],
      [2.3604, 48.8715],
      [2.3553, 48.8809],
    ],
  },
  {
    id: "segment-metro-1",
    label: "Metro Line 2",
    transportType: "metro",
    coordinates: [
      [2.3553, 48.8809],
      [2.3335, 48.8866],
      [2.3102, 48.8898],
    ],
  },
  {
    id: "segment-train-1",
    label: "RER A",
    transportType: "train",
    coordinates: [
      [2.3102, 48.8898],
      [2.2732, 48.8917],
      [2.2386, 48.8924],
    ],
  },
];

export function getSegmentSourceId(segmentId: string) {
  return `transport-segment-source-${segmentId}`;
}

export function getSegmentLayerId(segmentId: string) {
  return `transport-segment-layer-${segmentId}`;
}

export function getSegmentLabelLayerId(segmentId: string) {
  return `transport-segment-label-${segmentId}`;
}

export function toSegmentFeature(segment: TransportSegment): Feature<LineString, GeoJsonProperties> {
  return {
    type: "Feature",
    properties: {
      id: segment.id,
      label: segment.label,
      transportType: segment.transportType,
    },
    geometry: {
      type: "LineString",
      coordinates: segment.coordinates,
    },
  };
}

export function toSegmentFeatureCollection(
  segment: TransportSegment,
): FeatureCollection<LineString, GeoJsonProperties> {
  return {
    type: "FeatureCollection",
    features: [toSegmentFeature(segment)],
  };
}

export function buildBoundsCoordinates(
  stops: TransportStop[],
  segments: TransportSegment[],
): [number, number][] {
  const stopCoordinates = stops.map((stop) => stop.coordinates);
  const segmentCoordinates = segments.flatMap((segment) => segment.coordinates);
  return [...stopCoordinates, ...segmentCoordinates];
}

export function createBoundsFromCoordinates(coordinates: [number, number][]) {
  if (!coordinates.length) {
    return null;
  }

  const [firstLng, firstLat] = coordinates[0];
  let minLng = firstLng;
  let maxLng = firstLng;
  let minLat = firstLat;
  let maxLat = firstLat;

  for (const [lng, lat] of coordinates) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ] as [[number, number], [number, number]];
}

type DirectionsApiResponse = {
  routes?: Array<{
    geometry?: { coordinates: [number, number][] };
    distance?: number;
    duration?: number;
  }>;
};

export type WalkingRouteResult = {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
};

export async function fetchWalkingRoute(
  from: [number, number],
  to: [number, number],
  token: string,
  signal?: AbortSignal,
): Promise<WalkingRouteResult> {
  const fallback: WalkingRouteResult = {
    coordinates: [from, to],
    distanceMeters: 0,
    durationSeconds: 0,
  };
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;
    const response = await fetch(url, { signal });
    if (!response.ok) return fallback;
    const data = (await response.json()) as DirectionsApiResponse;
    const route = data.routes?.[0];
    const coords = route?.geometry?.coordinates;
    if (!coords?.length) return fallback;
    return {
      coordinates: coords,
      distanceMeters: typeof route?.distance === "number" ? route.distance : 0,
      durationSeconds: typeof route?.duration === "number" ? route.duration : 0,
    };
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    return fallback;
  }
}

export function upsertSegmentOnMap(map: mapboxgl.Map, segment: TransportSegment) {
  const sourceId = getSegmentSourceId(segment.id);
  const lineLayerId = getSegmentLayerId(segment.id);
  const labelLayerId = getSegmentLabelLayerId(segment.id);
  const color = segment.color || TRANSPORT_COLORS[segment.transportType];
  const sourceData = toSegmentFeatureCollection(segment);

  const existingSource = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
  if (existingSource) {
    existingSource.setData(sourceData);
  } else {
    map.addSource(sourceId, {
      type: "geojson",
      data: sourceData,
    });
  }

  const isWalking = segment.transportType === "walking";

  if (!map.getLayer(lineLayerId)) {
    map.addLayer({
      id: lineLayerId,
      type: "line",
      source: sourceId,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": color,
        "line-width": isWalking ? 6 : 5,
        "line-opacity": isWalking ? 0.95 : 0.88,
        "line-dasharray": isWalking ? [0, 1.8] : [1, 0],
      },
    });
  } else {
    map.setPaintProperty(lineLayerId, "line-color", color);
    map.setPaintProperty(lineLayerId, "line-width", isWalking ? 6 : 5);
    map.setPaintProperty(lineLayerId, "line-opacity", isWalking ? 0.95 : 0.88);
    map.setPaintProperty(
      lineLayerId,
      "line-dasharray",
      isWalking ? [0, 1.8] : [1, 0],
    );
  }

  if (!map.getLayer(labelLayerId)) {
    map.addLayer({
      id: labelLayerId,
      type: "symbol",
      source: sourceId,
      layout: {
        "symbol-placement": "line-center",
        "text-field": ["get", "label"],
        "text-size": 11,
      },
      paint: {
        "text-color": "#e2e8f0",
        "text-halo-color": "#0f172a",
        "text-halo-width": 1.2,
      },
    });
  }
}
