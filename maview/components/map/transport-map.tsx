"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

import {
  buildBoundsCoordinates,
  createBoundsFromCoordinates,
  DEMO_SEGMENTS,
  DEMO_STOPS,
  fetchWalkingRoute,
  getSegmentLayerId,
  getSegmentLabelLayerId,
  getSegmentSourceId,
  toSegmentFeatureCollection,
  type TransportSegment,
  type TransportStop,
  upsertSegmentOnMap,
} from "@/components/map/map-utils";
import { Button } from "@/components/ui/button";

function escapeHtmlText(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type LocationStatus =
  | "idle"
  | "requesting"
  | "active"
  | "unsupported"
  | "denied"
  | "error";

type TransportMapProps = {
  mapboxToken: string | null;
  stops?: TransportStop[];
  segments?: TransportSegment[];
  /** Texte d’adresse ou lieu d’arrivée (ex. saisi au planificateur) : affiché comme un point distinct sur la carte. */
  arrivalAddressQuery?: string | null;
  tasks?: Array<{
    id: string;
    title: string;
    coordinates: [number, number];
    /** Libellé lieu / adresse (ex. saisi dans Google Tasks ou géocodage inverse). */
    addressHint?: string | null;
  }>;
  onRequestReroute?: (coordinates: [number, number]) => void;
  isRerouting?: boolean;
  /** Recentrage ponctuel (ex. clic sur un arrêt dans la liste du trajet). `id` doit changer à chaque demande. */
  flyToRequest?: { lng: number; lat: number; id: number } | null;
};

type GuidanceState = {
  onRoute: boolean;
  nearestSegmentLabel: string | null;
  nearestSegmentDistanceMeters: number | null;
  activeWalkingSegmentId: string | null;
  shouldSuggestReroute: boolean;
  message: string;
};

const DEFAULT_CENTER: [number, number] = [2.3522, 48.8566];
const ON_ROUTE_THRESHOLD_METERS = 60;
const ACTIVE_WALKING_THRESHOLD_METERS = 120;
const REROUTE_SUGGESTION_THRESHOLD_METERS = 1_000;
const APPROACH_SEGMENT_ID = "user-approach-walking";
const APPROACH_THRESHOLD_METERS = 30;
const LAST_MILE_TO_ARRIVAL_SEGMENT_ID = "last-mile-to-arrival-walking";
const LAST_MILE_MIN_DISTANCE_METERS = 12;

const TRANSIT_FOR_LAST_MILE: ReadonlySet<TransportSegment["transportType"]> = new Set([
  "bus",
  "metro",
  "train",
]);

function getLastTransitEndpoint(segments: TransportSegment[]): [number, number] | null {
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const seg = segments[i];
    if (!TRANSIT_FOR_LAST_MILE.has(seg.transportType)) {
      continue;
    }
    const coords = seg.coordinates;
    if (coords.length > 0) {
      return coords[coords.length - 1]!;
    }
  }
  const lastSeg = segments[segments.length - 1];
  const lastCoords = lastSeg?.coordinates;
  if (lastCoords?.length) {
    return lastCoords[lastCoords.length - 1]!;
  }
  return null;
}

type DeviceOrientationEventWithIOSPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function distanceBetweenPointsMeters(a: [number, number], b: [number, number]) {
  const avgLat = (a[1] + b[1]) / 2;
  const lngScale = 111_320 * Math.cos(toRad(avgLat));
  const latScale = 110_540;
  return Math.hypot((a[0] - b[0]) * lngScale, (a[1] - b[1]) * latScale);
}

function pointToSegmentDistanceMeters(
  point: [number, number],
  start: [number, number],
  end: [number, number],
) {
  const lngScale = 111_320 * Math.cos(toRad(point[1]));
  const latScale = 110_540;

  const px = point[0] * lngScale;
  const py = point[1] * latScale;
  const x1 = start[0] * lngScale;
  const y1 = start[1] * latScale;
  const x2 = end[0] * lngScale;
  const y2 = end[1] * latScale;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const segLengthSq = dx * dx + dy * dy;
  if (segLengthSq === 0) {
    return Math.hypot(px - x1, py - y1);
  }

  const t = Math.max(
    0,
    Math.min(1, ((px - x1) * dx + (py - y1) * dy) / segLengthSq),
  );
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function distanceToPolylineMeters(
  point: [number, number],
  lineCoordinates: [number, number][],
) {
  if (lineCoordinates.length < 2) {
    return Infinity;
  }

  let best = Infinity;
  for (let index = 0; index < lineCoordinates.length - 1; index += 1) {
    const distance = pointToSegmentDistanceMeters(
      point,
      lineCoordinates[index],
      lineCoordinates[index + 1],
    );
    if (distance < best) {
      best = distance;
    }
  }
  return best;
}

function getNearestSegment(point: [number, number], segments: TransportSegment[]) {
  let nearest: { segment: TransportSegment; distanceMeters: number } | null = null;
  for (const segment of segments) {
    const distanceMeters = distanceToPolylineMeters(point, segment.coordinates);
    if (!nearest || distanceMeters < nearest.distanceMeters) {
      nearest = { segment, distanceMeters };
    }
  }
  return nearest;
}

export function TransportMap({
  mapboxToken,
  stops: providedStops,
  segments: providedSegments,
  arrivalAddressQuery = null,
  tasks,
  onRequestReroute,
  isRerouting = false,
  flyToRequest = null,
}: TransportMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const stopMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const taskMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const arrivalAddressMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const isMapReadyRef = useRef(false);
  const autoLocateStartedRef = useRef(false);
  const previousUserCoordinatesRef = useRef<[number, number] | null>(null);
  const userMarkerArrowRef = useRef<HTMLDivElement | null>(null);
  const userHeadingRef = useRef(0);
  const deviceOrientationEnabledRef = useRef(false);
  const deviceOrientationHandlerRef = useRef<((event: DeviceOrientationEvent) => void) | null>(null);
  const walkingAbortRef = useRef<AbortController | null>(null);
  const lastMileAbortRef = useRef<AbortController | null>(null);
  const approachAbortRef = useRef<AbortController | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [, setLocationStatus] = useState<LocationStatus>("idle");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [userCoordinates, setUserCoordinates] = useState<[number, number] | null>(
    null,
  );
  const [guidance, setGuidance] = useState<GuidanceState>({
    onRoute: true,
    nearestSegmentLabel: null,
    nearestSegmentDistanceMeters: null,
    activeWalkingSegmentId: null,
    shouldSuggestReroute: false,
    message: "Localisation automatique en cours...",
  });
  const [arrivalAddressCoordinates, setArrivalAddressCoordinates] = useState<
    [number, number] | null
  >(null);

  const stops = useMemo(() => providedStops ?? DEMO_STOPS, [providedStops]);
  const segments = useMemo(
    () => providedSegments ?? DEMO_SEGMENTS,
    [providedSegments],
  );
  const bounds = useMemo(() => {
    const coordinates = buildBoundsCoordinates(stops, segments);
    if (arrivalAddressCoordinates) {
      coordinates.push(arrivalAddressCoordinates);
    }
    return createBoundsFromCoordinates(coordinates);
  }, [arrivalAddressCoordinates, segments, stops]);

  useEffect(() => {
    const query = arrivalAddressQuery?.trim();
    if (!query || !mapboxToken) {
      setArrivalAddressCoordinates(null);
      return;
    }

    const controller = new AbortController();
    void (async () => {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?limit=1&language=fr&types=address,poi,place,locality,neighborhood&access_token=${encodeURIComponent(mapboxToken)}`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          setArrivalAddressCoordinates(null);
          return;
        }
        const data = (await response.json()) as {
          features?: Array<{ center?: [number, number] }>;
        };
        const center = data.features?.[0]?.center;
        if (center?.length === 2) {
          setArrivalAddressCoordinates([center[0], center[1]]);
        } else {
          setArrivalAddressCoordinates(null);
        }
      } catch {
        if (!controller.signal.aborted) {
          setArrivalAddressCoordinates(null);
        }
      }
    })();

    return () => controller.abort();
  }, [arrivalAddressQuery, mapboxToken]);

  const updateUserHeading = useCallback((headingDegrees: number) => {
    const normalizedHeading = ((headingDegrees % 360) + 360) % 360;
    userHeadingRef.current = normalizedHeading;
    if (userMarkerArrowRef.current) {
      userMarkerArrowRef.current.style.transform = `rotate(${normalizedHeading}deg)`;
    }
  }, []);

  const buildUserMarkerElement = useCallback(() => {
    const root = document.createElement("div");
    root.style.position = "relative";
    root.style.width = "28px";
    root.style.height = "28px";
    root.style.display = "grid";
    root.style.placeItems = "center";

    const halo = document.createElement("div");
    halo.style.position = "absolute";
    halo.style.width = "28px";
    halo.style.height = "28px";
    halo.style.borderRadius = "999px";
    halo.style.background = "rgba(14,165,233,0.22)";

    const dot = document.createElement("div");
    dot.style.position = "absolute";
    dot.style.width = "12px";
    dot.style.height = "12px";
    dot.style.borderRadius = "999px";
    dot.style.background = "#0ea5e9";
    dot.style.border = "2px solid #ffffff";
    dot.style.boxShadow = "0 2px 10px rgba(2,6,23,0.38)";

    const arrow = document.createElement("div");
    arrow.style.position = "absolute";
    arrow.style.top = "1px";
    arrow.style.width = "0";
    arrow.style.height = "0";
    arrow.style.borderLeft = "5px solid transparent";
    arrow.style.borderRight = "5px solid transparent";
    arrow.style.borderBottom = "9px solid #0ea5e9";
    arrow.style.transformOrigin = "50% 14px";
    arrow.style.transition = "transform 220ms ease";
    arrow.style.filter = "drop-shadow(0 1px 2px rgba(2,6,23,0.5))";
    arrow.style.opacity = "0.96";

    root.appendChild(halo);
    root.appendChild(dot);
    root.appendChild(arrow);
    userMarkerArrowRef.current = arrow;

    return root;
  }, []);

  const getHeadingFromMovement = useCallback((next: [number, number]) => {
    const previous = previousUserCoordinatesRef.current;
    previousUserCoordinatesRef.current = next;
    if (!previous) {
      return null;
    }

    const deltaLng = next[0] - previous[0];
    const deltaLat = next[1] - previous[1];
    if (Math.abs(deltaLng) < 0.00001 && Math.abs(deltaLat) < 0.00001) {
      return null;
    }

    const headingRadians = Math.atan2(deltaLng, deltaLat);
    return (headingRadians * 180) / Math.PI;
  }, []);

  const addStopMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    stopMarkersRef.current.forEach((marker) => marker.remove());
    stopMarkersRef.current = stops.map((stop) => {
      const markerColor =
        stop.type === "origin"
          ? "#14b8a6"
          : stop.type === "destination"
            ? "#f97316"
            : "#f59e0b";
      const stopTypeLabel =
        stop.type === "origin"
          ? "Depart"
          : stop.type === "destination"
            ? "Arrivee"
            : "Arret";
      const addressLabel =
        stop.address?.trim() ||
        `${stop.coordinates[1].toFixed(5)}, ${stop.coordinates[0].toFixed(5)}`;

      const popup = new mapboxgl.Popup({
        offset: 10,
        closeButton: false,
      }).setHTML(
        `<div style="color:#111827;font-family:Arial,sans-serif;line-height:1.35;">
          <strong style="display:block;font-size:13px;color:#111827;">${stop.name}</strong>
          <span style="display:block;font-size:12px;color:#1f2937;">${stopTypeLabel}</span>
          <small style="display:block;font-size:11px;color:#374151;">Adresse: ${addressLabel}</small>
        </div>`,
      );

      const stopElement = document.createElement("button");
      stopElement.type = "button";
      stopElement.ariaLabel = stop.name;
      stopElement.style.width = "12px";
      stopElement.style.height = "12px";
      stopElement.style.borderRadius = "999px";
      stopElement.style.border = "2px solid rgba(255,255,255,0.95)";
      stopElement.style.background = markerColor;
      stopElement.style.boxShadow = "0 2px 10px rgba(0,0,0,0.35)";
      stopElement.style.padding = "0";
      stopElement.style.outline = "none";

      return new mapboxgl.Marker({
        element: stopElement,
        anchor: "center",
      })
        .setLngLat(stop.coordinates)
        .setPopup(popup)
        .addTo(map);
    });
  }, [stops]);

  const addTaskMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    taskMarkersRef.current.forEach((marker) => marker.remove());
    taskMarkersRef.current = (tasks ?? []).map((task) => {
      const hint = task.addressHint?.trim() || null;
      const taskPopupBody = (addrLine: string | null) =>
        `<div style="color:#111827;font-family:Arial,sans-serif;line-height:1.35;max-width:280px;">
          <strong style="display:block;font-size:11px;color:#b45309;letter-spacing:0.22em;">TÂCHE (à faire)</strong>
          <span style="display:block;font-size:12px;color:#1f2937;margin-top:6px;">${escapeHtmlText(task.title)}</span>
          <small style="display:block;font-size:11px;color:#374151;margin-top:6px;line-height:1.4;">${
            addrLine
              ? escapeHtmlText(addrLine)
              : "Chargement de l&apos;adresse…"
          }</small>
        </div>`;

      const popup = new mapboxgl.Popup({
        offset: 12,
        closeButton: false,
      }).setHTML(taskPopupBody(hint));

      if (mapboxToken && !hint) {
        void (async () => {
          try {
            const resp = await fetch(
              `https://api.mapbox.com/geocoding/v5/mapbox.places/${task.coordinates[0]},${task.coordinates[1]}.json?language=fr&types=address,poi,place&limit=1&access_token=${encodeURIComponent(mapboxToken)}`,
            );
            if (!resp.ok) return;
            const data = (await resp.json()) as {
              features?: Array<{ place_name?: string }>;
            };
            const addr = data.features?.[0]?.place_name?.trim();
            if (addr) {
              popup.setHTML(taskPopupBody(addr));
            }
          } catch {
            // geocoding failure is non-critical
          }
        })();
      }

      const root = document.createElement("div");
      root.style.display = "flex";
      root.style.flexDirection = "column";
      root.style.alignItems = "center";
      root.style.gap = "0";
      root.style.pointerEvents = "auto";
      root.style.filter = "drop-shadow(0 6px 14px rgba(2,6,23,0.55))";

      // --- Bannière (haut) : fond ambre vif + icône + TÂCHE + titre + adresse ---
      const banner = document.createElement("div");
      banner.style.display = "flex";
      banner.style.flexDirection = "column";
      banner.style.alignItems = "flex-start";
      banner.style.gap = "4px";
      banner.style.padding = "8px 12px 9px";
      banner.style.borderRadius = "12px";
      banner.style.border = "2px solid #fbbf24";
      banner.style.background =
        "linear-gradient(180deg, #f59e0b 0%, #d97706 100%)";
      banner.style.boxShadow =
        "0 6px 18px rgba(217,119,6,0.55), 0 0 0 3px rgba(255,255,255,0.18) inset";
      banner.style.maxWidth = "min(92vw, 280px)";
      banner.style.overflow = "hidden";
      banner.style.color = "#0f172a";

      const headerRow = document.createElement("div");
      headerRow.style.display = "flex";
      headerRow.style.alignItems = "center";
      headerRow.style.gap = "6px";
      headerRow.style.maxWidth = "100%";
      headerRow.style.minWidth = "0";

      const icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "📍";
      icon.style.fontSize = "14px";
      icon.style.lineHeight = "1";

      const label = document.createElement("span");
      label.textContent = "TÂCHE";
      label.style.flexShrink = "0";
      label.style.fontSize = "10px";
      label.style.fontWeight = "900";
      label.style.letterSpacing = "0.22em";
      label.style.color = "#1c1917";
      label.style.textShadow = "0 1px 0 rgba(255,255,255,0.35)";

      const titleEl = document.createElement("span");
      const maxTitle = 38;
      titleEl.textContent =
        task.title.length > maxTitle ? `${task.title.slice(0, maxTitle)}…` : task.title;
      titleEl.style.fontSize = "12px";
      titleEl.style.fontWeight = "800";
      titleEl.style.color = "#0f172a";
      titleEl.style.overflow = "hidden";
      titleEl.style.textOverflow = "ellipsis";
      titleEl.style.whiteSpace = "nowrap";
      titleEl.style.minWidth = "0";

      headerRow.appendChild(icon);
      headerRow.appendChild(label);
      headerRow.appendChild(titleEl);
      banner.appendChild(headerRow);

      if (hint) {
        const addrEl = document.createElement("div");
        const maxAddr = 110;
        addrEl.textContent =
          hint.length > maxAddr ? `${hint.slice(0, maxAddr)}…` : hint;
        addrEl.style.fontSize = "11px";
        addrEl.style.fontWeight = "600";
        addrEl.style.color = "#1c1917";
        addrEl.style.lineHeight = "1.35";
        addrEl.style.whiteSpace = "normal";
        addrEl.style.wordBreak = "break-word";
        banner.appendChild(addrEl);
      }

      // --- Flèche pointant vers le pin ---
      const arrow = document.createElement("div");
      arrow.style.width = "0";
      arrow.style.height = "0";
      arrow.style.borderLeft = "7px solid transparent";
      arrow.style.borderRight = "7px solid transparent";
      arrow.style.borderTop = "8px solid #d97706";
      arrow.style.marginTop = "-1px";

      // --- Pin au sol (cercle plein + halo pulsant) ---
      const pinWrap = document.createElement("div");
      pinWrap.style.position = "relative";
      pinWrap.style.width = "22px";
      pinWrap.style.height = "22px";
      pinWrap.style.display = "grid";
      pinWrap.style.placeItems = "center";
      pinWrap.style.marginTop = "2px";

      const halo = document.createElement("div");
      halo.style.position = "absolute";
      halo.style.width = "22px";
      halo.style.height = "22px";
      halo.style.borderRadius = "999px";
      halo.style.background = "rgba(251,191,36,0.45)";
      halo.style.animation = "mv-task-pulse 1.8s ease-out infinite";

      const dot = document.createElement("div");
      dot.style.position = "relative";
      dot.style.width = "14px";
      dot.style.height = "14px";
      dot.style.borderRadius = "999px";
      dot.style.background = "#f59e0b";
      dot.style.border = "3px solid #ffffff";
      dot.style.boxShadow =
        "0 0 0 2px #d97706, 0 4px 10px rgba(2,6,23,0.5)";

      pinWrap.appendChild(halo);
      pinWrap.appendChild(dot);

      root.appendChild(banner);
      root.appendChild(arrow);
      root.appendChild(pinWrap);

      return new mapboxgl.Marker({
        element: root,
        anchor: "bottom",
      })
        .setLngLat(task.coordinates)
        .setPopup(popup)
        .addTo(map);
    });
  }, [mapboxToken, tasks]);

  const upsertArrivalAddressMarker = useCallback(() => {
    const map = mapRef.current;
    arrivalAddressMarkerRef.current?.remove();
    arrivalAddressMarkerRef.current = null;

    const query = arrivalAddressQuery?.trim();
    if (!map || !arrivalAddressCoordinates || !query) {
      return;
    }

    const popup = new mapboxgl.Popup({
      offset: 18,
      closeButton: false,
    }).setHTML(
      `<div style="color:#111827;font-family:Arial,sans-serif;line-height:1.35;max-width:260px;">
        <strong style="display:block;font-size:11px;color:#6d28d9;letter-spacing:0.18em;">ARRIVÉE</strong>
        <span style="display:block;font-size:12px;color:#1f2937;margin-top:6px;">${escapeHtmlText(query)}</span>
        <small style="display:block;font-size:11px;color:#374151;margin-top:6px;">Destination saisie dans le planificateur (géocodée sur la carte).</small>
      </div>`,
    );

    const root = document.createElement("div");
    root.style.display = "flex";
    root.style.flexDirection = "column";
    root.style.alignItems = "center";
    root.style.gap = "5px";
    root.style.pointerEvents = "auto";

    const pill = document.createElement("div");
    pill.style.display = "inline-flex";
    pill.style.alignItems = "center";
    pill.style.gap = "8px";
    pill.style.padding = "6px 12px";
    pill.style.borderRadius = "999px";
    pill.style.border = "2px solid rgba(167,139,250,0.75)";
    pill.style.background = "rgba(15,23,42,0.95)";
    pill.style.boxShadow = "0 10px 24px rgba(2,6,23,0.38)";
    pill.style.backdropFilter = "blur(6px)";
    pill.style.whiteSpace = "nowrap";
    pill.style.maxWidth = "min(92vw, 320px)";
    pill.style.overflow = "hidden";

    const pillLabel = document.createElement("span");
    pillLabel.textContent = "ARRIVÉE";
    pillLabel.style.fontSize = "10px";
    pillLabel.style.fontWeight = "900";
    pillLabel.style.letterSpacing = "0.2em";
    pillLabel.style.color = "#c4b5fd";

    const pillTitle = document.createElement("span");
    const maxDest = 40;
    pillTitle.textContent =
      query.length > maxDest ? `${query.slice(0, maxDest)}…` : query;
    pillTitle.style.fontSize = "11px";
    pillTitle.style.fontWeight = "600";
    pillTitle.style.color = "#f8fafc";
    pillTitle.style.overflow = "hidden";
    pillTitle.style.textOverflow = "ellipsis";

    pill.appendChild(pillLabel);
    pill.appendChild(pillTitle);

    const pin = document.createElement("button");
    pin.type = "button";
    pin.setAttribute("aria-label", `Destination (arrivée): ${query}`);
    pin.style.width = "0";
    pin.style.height = "0";
    pin.style.padding = "0";
    pin.style.border = "none";
    pin.style.background = "transparent";
    pin.style.cursor = "pointer";
    pin.style.filter = "drop-shadow(0 4px 12px rgba(2,6,23,0.45))";

    const diamond = document.createElement("div");
    diamond.style.width = "20px";
    diamond.style.height = "20px";
    diamond.style.background = "#7c3aed";
    diamond.style.border = "2px solid rgba(255,255,255,0.95)";
    diamond.style.transform = "rotate(45deg)";
    diamond.style.borderRadius = "3px";
    diamond.style.boxShadow = "0 0 0 1px rgba(124,58,237,0.35)";

    pin.appendChild(diamond);
    root.appendChild(pill);
    root.appendChild(pin);

    arrivalAddressMarkerRef.current = new mapboxgl.Marker({
      element: root,
      anchor: "bottom",
    })
      .setLngLat(arrivalAddressCoordinates)
      .setPopup(popup)
      .addTo(map);
  }, [arrivalAddressCoordinates, arrivalAddressQuery]);

  const upsertRouteSegments = useCallback(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    segments.forEach((segment) => {
      upsertSegmentOnMap(map, segment);
    });
  }, [segments]);

  const removeApproachSegment = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const sourceId = getSegmentSourceId(APPROACH_SEGMENT_ID);
    const lineLayerId = getSegmentLayerId(APPROACH_SEGMENT_ID);
    const labelLayerId = getSegmentLabelLayerId(APPROACH_SEGMENT_ID);
    if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
    if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  }, []);

  const removeLastMileToArrivalSegment = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const sourceId = getSegmentSourceId(LAST_MILE_TO_ARRIVAL_SEGMENT_ID);
    const lineLayerId = getSegmentLayerId(LAST_MILE_TO_ARRIVAL_SEGMENT_ID);
    const labelLayerId = getSegmentLabelLayerId(LAST_MILE_TO_ARRIVAL_SEGMENT_ID);
    if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
    if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  }, []);

  const upsertLastMileToArrivalSegment = useCallback(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const query = arrivalAddressQuery?.trim();
    if (!mapboxToken || !arrivalAddressCoordinates || !query) {
      lastMileAbortRef.current?.abort();
      lastMileAbortRef.current = null;
      removeLastMileToArrivalSegment();
      return;
    }

    const fromCoord = getLastTransitEndpoint(segments);
    if (!fromCoord) {
      removeLastMileToArrivalSegment();
      return;
    }

    if (
      distanceBetweenPointsMeters(fromCoord, arrivalAddressCoordinates) <
      LAST_MILE_MIN_DISTANCE_METERS
    ) {
      removeLastMileToArrivalSegment();
      return;
    }

    const lastMileSegment: TransportSegment = {
      id: LAST_MILE_TO_ARRIVAL_SEGMENT_ID,
      label: "A pied vers l'arrivee",
      transportType: "walking",
      color: "#3b82f6",
      coordinates: [fromCoord, arrivalAddressCoordinates],
    };
    upsertSegmentOnMap(map, lastMileSegment);

    lastMileAbortRef.current?.abort();
    const controller = new AbortController();
    lastMileAbortRef.current = controller;

    void (async () => {
      try {
        const realRoute = await fetchWalkingRoute(
          fromCoord,
          arrivalAddressCoordinates,
          mapboxToken,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        const currentMap = mapRef.current;
        if (!currentMap) return;
        const src = currentMap.getSource(
          getSegmentSourceId(LAST_MILE_TO_ARRIVAL_SEGMENT_ID),
        ) as mapboxgl.GeoJSONSource | undefined;
        if (src) {
          src.setData(
            toSegmentFeatureCollection({
              ...lastMileSegment,
              coordinates: realRoute.coordinates,
            }),
          );
        }
      } catch {
        /* annulation : ne pas appliquer de fallback sur la couche */
      }
    })();
  }, [
    arrivalAddressCoordinates,
    arrivalAddressQuery,
    mapboxToken,
    removeLastMileToArrivalSegment,
    segments,
  ]);

  const upsertApproachSegment = useCallback(
    (userCoords: [number, number]) => {
      const map = mapRef.current;
      if (!map || !stops.length) return;

      const firstStop = stops.find((s) => s.type === "origin") ?? stops[0];
      const distance = distanceBetweenPointsMeters(userCoords, firstStop.coordinates);

      if (distance <= APPROACH_THRESHOLD_METERS) {
        approachAbortRef.current?.abort();
        approachAbortRef.current = null;
        removeApproachSegment();
        return;
      }

      const approachSegment: TransportSegment = {
        id: APPROACH_SEGMENT_ID,
        label: "A pied",
        transportType: "walking",
        color: "#3b82f6",
        coordinates: [userCoords, firstStop.coordinates],
      };
      upsertSegmentOnMap(map, approachSegment);

      if (!mapboxToken) return;

      approachAbortRef.current?.abort();
      const controller = new AbortController();
      approachAbortRef.current = controller;

      void (async () => {
        try {
          const realRoute = await fetchWalkingRoute(
            userCoords,
            firstStop.coordinates,
            mapboxToken,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          const currentMap = mapRef.current;
          if (!currentMap) return;
          const src = currentMap.getSource(
            getSegmentSourceId(APPROACH_SEGMENT_ID),
          ) as mapboxgl.GeoJSONSource | undefined;
          if (src) {
            src.setData(
              toSegmentFeatureCollection({
                ...approachSegment,
                coordinates: realRoute.coordinates,
              }),
            );
          }
        } catch {
          /* annulation ou erreur réseau : garder le dernier tracé affiché si la requête est annulée */
        }
      })();
    },
    [mapboxToken, removeApproachSegment, stops],
  );

  const applyLiveSegmentStyles = useCallback(
    (activeWalkingSegmentId: string | null) => {
      const map = mapRef.current;
      if (!map) {
        return;
      }

      segments.forEach((segment) => {
        const lineLayerId = getSegmentLayerId(segment.id);
        if (!map.getLayer(lineLayerId)) {
          return;
        }

        const isWalking = segment.transportType === "walking";
        const isActiveWalking = isWalking && segment.id === activeWalkingSegmentId;
        map.setPaintProperty(
          lineLayerId,
          "line-width",
          isActiveWalking ? 8 : isWalking ? 6 : 5,
        );
        map.setPaintProperty(
          lineLayerId,
          "line-opacity",
          isActiveWalking ? 1 : isWalking ? 0.92 : 0.86,
        );
      });
    },
    [segments],
  );

  const updateLiveGuidance = useCallback(
    (position: [number, number]) => {
      if (!segments.length) {
        setGuidance({
          onRoute: true,
          nearestSegmentLabel: null,
          nearestSegmentDistanceMeters: null,
          activeWalkingSegmentId: null,
          shouldSuggestReroute: false,
          message: "Aucun segment de trajet disponible.",
        });
        return;
      }

      const nearest = getNearestSegment(position, segments);
      if (!nearest) {
        return;
      }

      const onRoute = nearest.distanceMeters <= ON_ROUTE_THRESHOLD_METERS;
      const nearestWalking = getNearestSegment(
        position,
        segments.filter((segment) => segment.transportType === "walking"),
      );
      const activeWalkingSegmentId =
        nearestWalking && nearestWalking.distanceMeters <= ACTIVE_WALKING_THRESHOLD_METERS
          ? nearestWalking.segment.id
          : null;
      const shouldSuggestReroute =
        nearest.distanceMeters > REROUTE_SUGGESTION_THRESHOLD_METERS;

      applyLiveSegmentStyles(activeWalkingSegmentId);

      let message = "Vous etes sur le bon chemin.";
      if (shouldSuggestReroute) {
        message = `Vous etes eloigne de l'itineraire (${Math.round(nearest.distanceMeters)} m).`;
      } else if (nearest.segment.transportType === "walking" || activeWalkingSegmentId) {
        message = `Continuez a pied vers ${nearest.segment.label}.`;
      } else {
        message = `Suivez le segment ${nearest.segment.label}.`;
      }

      setGuidance({
        onRoute,
        nearestSegmentLabel: nearest.segment.label,
        nearestSegmentDistanceMeters: nearest.distanceMeters,
        activeWalkingSegmentId,
        shouldSuggestReroute,
        message,
      });
    },
    [applyLiveSegmentStyles, segments],
  );

  const fitMapToTransportData = useCallback(() => {
    const map = mapRef.current;
    if (!map || !bounds) {
      return;
    }

    map.fitBounds(bounds, {
      padding: 72,
      duration: 700,
      maxZoom: 13.5,
    });
  }, [bounds]);

  const upsertUserMarker = useCallback(
    (
      nextCoordinates: [number, number],
      shouldCenter: boolean,
      headingDegrees: number | null,
    ) => {
      const map = mapRef.current;
      if (!map) {
        return;
      }

      if (!userMarkerRef.current) {
        userMarkerRef.current = new mapboxgl.Marker({
          element: buildUserMarkerElement(),
          anchor: "center",
        })
          .setLngLat(nextCoordinates)
          .addTo(map);
      }

      userMarkerRef.current.setLngLat(nextCoordinates);

      if (headingDegrees != null && Number.isFinite(headingDegrees)) {
        updateUserHeading(headingDegrees);
      }

      if (shouldCenter) {
        map.flyTo({
          center: nextCoordinates,
          zoom: Math.max(map.getZoom(), 14),
          essential: true,
        });
      }
    },
    [buildUserMarkerElement, updateUserHeading],
  );

  const handlePositionUpdate = useCallback(
    (position: GeolocationPosition, shouldCenter: boolean) => {
      const nextCoordinates: [number, number] = [
        position.coords.longitude,
        position.coords.latitude,
      ];
      const sensorHeading = position.coords.heading;
      const headingFromSensor =
        sensorHeading != null && Number.isFinite(sensorHeading)
          ? sensorHeading
          : null;
      const headingFromMovement =
        headingFromSensor == null
          ? getHeadingFromMovement(nextCoordinates)
          : null;
      const heading = headingFromSensor ?? headingFromMovement ?? userHeadingRef.current;

      setLocationStatus("active");
      setLocationError(null);
      setUserCoordinates(nextCoordinates);
      upsertUserMarker(nextCoordinates, shouldCenter, heading);
      updateLiveGuidance(nextCoordinates);
      upsertApproachSegment(nextCoordinates);
    },
    [getHeadingFromMovement, updateLiveGuidance, upsertApproachSegment, upsertUserMarker],
  );

  const handleLocationError = useCallback((error: GeolocationPositionError) => {
    if (error.code === error.PERMISSION_DENIED) {
      setLocationStatus("denied");
      setLocationError("Permission de geolocalisation refusee.");
      return;
    }

    setLocationStatus("error");
    setLocationError(error.message || "Impossible de recuperer la geolocalisation.");
  }, []);

  const startLocationTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus("unsupported");
      setLocationError("La geolocalisation n'est pas supportee par ce navigateur.");
      return;
    }

    setLocationStatus("requesting");
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => handlePositionUpdate(position, true),
      handleLocationError,
      {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 0,
      },
    );

    if (watchIdRef.current == null) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => handlePositionUpdate(position, false),
        handleLocationError,
        {
          enableHighAccuracy: true,
          timeout: 15_000,
          maximumAge: 3_000,
        },
      );
    }
  }, [handleLocationError, handlePositionUpdate]);

  const enableDeviceOrientationTracking = useCallback(
    async (triggeredByUserGesture: boolean) => {
      if (typeof window === "undefined" || deviceOrientationEnabledRef.current) {
        return;
      }
      if (!("DeviceOrientationEvent" in window)) {
        return;
      }

      const deviceOrientationCtor =
        window.DeviceOrientationEvent as DeviceOrientationEventWithIOSPermission;
      if (typeof deviceOrientationCtor.requestPermission === "function") {
        if (!triggeredByUserGesture) {
          return;
        }
        try {
          const permission = await deviceOrientationCtor.requestPermission();
          if (permission !== "granted") {
            return;
          }
        } catch {
          return;
        }
      }

      const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
        const webkitHeading = (
          event as DeviceOrientationEvent & { webkitCompassHeading?: number }
        ).webkitCompassHeading;
        if (typeof webkitHeading === "number" && Number.isFinite(webkitHeading)) {
          updateUserHeading(webkitHeading);
          return;
        }

        if (typeof event.alpha === "number" && Number.isFinite(event.alpha)) {
          updateUserHeading(360 - event.alpha);
        }
      };

      deviceOrientationHandlerRef.current = handleDeviceOrientation;
      window.addEventListener("deviceorientation", handleDeviceOrientation, true);
      deviceOrientationEnabledRef.current = true;
    },
    [updateUserHeading],
  );

  const resolveWalkingDirections = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapboxToken) return;

    walkingAbortRef.current?.abort();
    const controller = new AbortController();
    walkingAbortRef.current = controller;

    const walkingToResolve = segments.filter((s) => s.transportType === "walking");
    if (!walkingToResolve.length) return;

    void (async () => {
      for (const seg of walkingToResolve) {
        if (controller.signal.aborted) break;
        const from = seg.coordinates[0];
        const to = seg.coordinates[seg.coordinates.length - 1];
        let route: [number, number][];
        try {
          const result = await fetchWalkingRoute(from, to, mapboxToken, controller.signal);
          route = result.coordinates;
        } catch {
          if (controller.signal.aborted) break;
          continue;
        }
        if (controller.signal.aborted) break;
        const src = map.getSource(
          getSegmentSourceId(seg.id),
        ) as mapboxgl.GeoJSONSource | undefined;
        if (src) {
          src.setData(toSegmentFeatureCollection({ ...seg, coordinates: route }));
        }
      }
    })();
  }, [mapboxToken, segments]);

  const centerOnUser = useCallback(async () => {
    await enableDeviceOrientationTracking(true);
    if (userCoordinates) {
      upsertUserMarker(userCoordinates, true, userHeadingRef.current);
      return;
    }

    startLocationTracking();
  }, [
    enableDeviceOrientationTracking,
    startLocationTracking,
    upsertUserMarker,
    userCoordinates,
  ]);

  useEffect(() => {
    if (!mapboxToken || mapRef.current || !containerRef.current) {
      return;
    }

    mapboxgl.accessToken = mapboxToken;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: DEFAULT_CENTER,
      zoom: 11.3,
      attributionControl: true,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      isMapReadyRef.current = true;
      setMapReady(true);
      upsertRouteSegments();
      addStopMarkers();
      addTaskMarkers();
      upsertArrivalAddressMarker();
      upsertLastMileToArrivalSegment();
      fitMapToTransportData();
      resolveWalkingDirections();
      if (!autoLocateStartedRef.current) {
        autoLocateStartedRef.current = true;
        startLocationTracking();
      }
      void enableDeviceOrientationTracking(false);
    });

    return () => {
      isMapReadyRef.current = false;
      setMapReady(false);
      approachAbortRef.current?.abort();
      approachAbortRef.current = null;
      lastMileAbortRef.current?.abort();
      lastMileAbortRef.current = null;
      removeApproachSegment();
      removeLastMileToArrivalSegment();
      stopMarkersRef.current.forEach((marker) => marker.remove());
      stopMarkersRef.current = [];
      taskMarkersRef.current.forEach((marker) => marker.remove());
      taskMarkersRef.current = [];
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      arrivalAddressMarkerRef.current?.remove();
      arrivalAddressMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [mapboxToken]); // eslint-disable-line react-hooks/exhaustive-deps -- carte montée une seule fois

  useEffect(() => {
    if (!mapReady || !isMapReadyRef.current) {
      return;
    }
    applyLiveSegmentStyles(guidance.activeWalkingSegmentId);
  }, [applyLiveSegmentStyles, guidance.activeWalkingSegmentId, mapReady]);

  useEffect(() => {
    if (!mapReady || !flyToRequest || !mapRef.current) {
      return;
    }
    const map = mapRef.current;
    map.flyTo({
      center: [flyToRequest.lng, flyToRequest.lat],
      zoom: Math.max(map.getZoom(), 15.25),
      duration: 1000,
      essential: true,
    });
  }, [mapReady, flyToRequest?.id, flyToRequest?.lat, flyToRequest?.lng]);

  useEffect(() => {
    if (!isMapReadyRef.current) {
      return;
    }

    upsertRouteSegments();
    addStopMarkers();
    addTaskMarkers();
    upsertArrivalAddressMarker();
    upsertLastMileToArrivalSegment();
    resolveWalkingDirections();
  }, [
    addStopMarkers,
    addTaskMarkers,
    resolveWalkingDirections,
    upsertArrivalAddressMarker,
    upsertLastMileToArrivalSegment,
    upsertRouteSegments,
  ]);

  useEffect(() => {
    return () => {
      walkingAbortRef.current?.abort();
      if (watchIdRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (deviceOrientationHandlerRef.current) {
        window.removeEventListener(
          "deviceorientation",
          deviceOrientationHandlerRef.current,
          true,
        );
        deviceOrientationHandlerRef.current = null;
      }
      deviceOrientationEnabledRef.current = false;
    };
  }, []);

  if (!mapboxToken) {
    return (
      <div className="rounded-xl border border-danger/40 bg-danger/10 px-5 py-4 text-sm text-foreground">
        <p className="font-semibold">Token Mapbox manquant.</p>
        <p className="mt-1 text-secondary">
          Ajoutez la variable <code>VITE_MAPBOX_TOKEN</code> dans l&apos;environnement du frontend.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={fitMapToTransportData}>
          Voir tout le trajet
        </Button>
      </div>
      {locationError ? <p className="text-sm text-danger">{locationError}</p> : null}
      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          guidance.shouldSuggestReroute
            ? "border-danger/50 bg-danger/10 text-foreground"
            : guidance.onRoute
              ? "border-brand/40 bg-brand-soft text-foreground"
              : "border-accent/40 bg-accent-soft text-foreground"
        }`}
      >
        <p className="font-semibold">
          {guidance.shouldSuggestReroute
            ? "Itineraire a recalculer"
            : guidance.onRoute
              ? "Sur le bon chemin"
              : "Ecart leger a l'itineraire"}
        </p>
        <p className="mt-1">{guidance.message}</p>
        {guidance.nearestSegmentLabel ? (
          <p className="mt-1 text-secondary">
            Segment le plus proche: {guidance.nearestSegmentLabel}
            {guidance.nearestSegmentDistanceMeters != null
              ? ` (${Math.round(guidance.nearestSegmentDistanceMeters)} m)`
              : ""}
          </p>
        ) : null}
        {guidance.shouldSuggestReroute && userCoordinates && onRequestReroute ? (
          <div className="mt-3">
            <Button
              variant="danger"
              disabled={isRerouting}
              onClick={() => onRequestReroute(userCoordinates)}
            >
              {isRerouting
                ? "Recalcul en cours..."
                : "Recalculer depuis ma localisation"}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface-strong">
        <div ref={containerRef} className="h-120 w-full" />
        <button
          type="button"
          aria-label="Recentrer sur ma position"
          onClick={() => {
            void centerOnUser();
          }}
          className="absolute bottom-4 right-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-background/90 text-foreground shadow-[0_10px_24px_rgba(2,6,23,0.35)] backdrop-blur transition hover:scale-[1.03] hover:bg-background"
        >
          <span className="text-lg leading-none">⌖</span>
        </button>
      </div>
    </div>
  );
}
