"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatePanel } from "@/components/ui/state-panel";
import { TransportMap, type TouristMapRestaurant } from "@/components/map/transport-map";
import {
  TRANSPORT_COLORS,
  concatTransportSegmentPolylines,
  fetchWalkingRoute,
  type TransportSegment,
  type TransportStop,
  type TransportType,
} from "@/components/map/map-utils";
import { tourismApi } from "@/lib/api/tourism";
import {
  MAP_RESTAURANT_MAX_VISIBLE,
  MAP_RESTAURANT_MIN_RATING,
  mergeTourismLists,
  pickRestaurantsForMap,
  suggestionStableKey,
} from "@/features/journey/tourist-route-sampling";
import { EXPLORE_CURRENT_LOCATION_LABEL } from "@/features/tourism/tourism-workspace";
import { googleTasksApi } from "@/lib/api/google";
import { journeysApi } from "@/lib/api/journeys";
import { usersApi } from "@/lib/api/users";
import type {
  JourneyPlanRequest,
  JourneyResponse,
  JourneyTaskOnRoute,
  LineInfo,
  StopInfo,
  TourismSuggestion,
} from "@/lib/types/api";
import {
  formatDateTime,
  formatDistance,
  formatDuration,
  formatProgress,
  formatTaskDateOnly,
  getLocalDateTimeInputValue,
  getTomorrowDateString,
  getTomorrowLocalDateTimeValue,
  isUuidString,
  normalizeLocalDateTimeForApi,
} from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import {
  forwardGeocodeMapbox,
  reverseGeocodeMapbox,
} from "@/lib/mapbox/reverse-geocode";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";

type PlannerState = {
  originQuery: string;
  destinationQuery: string;
  originApiQuery: string;
  destinationApiQuery: string;
  originLatitude: number | null;
  originLongitude: number | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  source: "EXPLORE_RESTAURANT" | null;
  departureTime: string;
  intermediateQuery: string;
  intermediateDepartureTime: string;
  ecoModeEnabled: boolean;
  wheelchairAccessible: boolean;
  namedComfortSettingId: string;
  includeTaskOptimization: boolean;
  touristModeEnabled: boolean;
};

function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface-strong px-4 py-3 text-left transition hover:border-brand/50"
    >
      <span>
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-secondary">
          {description}
        </span>
      </span>
      <span
        className={cn(
          "flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition",
          checked ? "bg-brand" : "bg-background",
        )}
      >
        <span
          className={cn(
            "h-5 w-5 rounded-full bg-white shadow transition",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}

function formatCoordPairForApi(lat: number, lng: number) {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

type ExploreRestaurantPlannerParse =
  | { ok: false; error: "missing_destination" | "missing_origin" }
  | { ok: true; overrides: Partial<PlannerState> };

function parseExploreRestaurantPlannerSearchParams(
  searchParams: URLSearchParams,
): ExploreRestaurantPlannerParse {
  const destinationFromParams = searchParams.get("destination")?.trim() ?? "";
  const destinationLat = Number(searchParams.get("destinationLat"));
  const destinationLng = Number(searchParams.get("destinationLng"));
  const hasDestinationCoordinates =
    Number.isFinite(destinationLat) && Number.isFinite(destinationLng);
  const coordinateDestinationQuery = hasDestinationCoordinates
    ? formatCoordPairForApi(destinationLat, destinationLng)
    : "";
  const destinationQuery =
    destinationFromParams || coordinateDestinationQuery;

  const originAddressParam = searchParams.get("originAddress")?.trim() ?? "";
  const originLat = Number(searchParams.get("originLat"));
  const originLng = Number(searchParams.get("originLng"));
  const hasOriginCoordinates =
    Number.isFinite(originLat) && Number.isFinite(originLng);
  const coordinateOriginQuery = hasOriginCoordinates
    ? formatCoordPairForApi(originLat, originLng)
    : "";

  const originQuery =
    originAddressParam && originAddressParam !== EXPLORE_CURRENT_LOCATION_LABEL
      ? originAddressParam
      : coordinateOriginQuery;

  if (!destinationQuery) {
    return { ok: false, error: "missing_destination" };
  }
  if (!originQuery) {
    return { ok: false, error: "missing_origin" };
  }

  return {
    ok: true,
    overrides: {
      originQuery,
      destinationQuery,
      originApiQuery: coordinateOriginQuery,
      destinationApiQuery: coordinateDestinationQuery,
      originLatitude: hasOriginCoordinates ? originLat : null,
      originLongitude: hasOriginCoordinates ? originLng : null,
      destinationLatitude: hasDestinationCoordinates ? destinationLat : null,
      destinationLongitude: hasDestinationCoordinates ? destinationLng : null,
      source: "EXPLORE_RESTAURANT",
      departureTime: getLocalDateTimeInputValue(),
      intermediateQuery: "",
      intermediateDepartureTime: "",
      includeTaskOptimization: false,
      ecoModeEnabled: false,
      namedComfortSettingId: "",
    },
  };
}

type PlanningOutcome = {
  journeys: JourneyResponse[];
  fallbackUsed: boolean;
  taskOptimizationAttempted: boolean;
};

function optionalComfortPresetUuid(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || !isUuidString(trimmed)) {
    return undefined;
  }
  return trimmed;
}

type JourneyTaskMarker = {
  id: string;
  title: string;
  coordinates: [number, number];
  addressHint?: string | null;
};

async function readBrowserLocation(options?: PositionOptions): Promise<{
  latitude: number;
  longitude: number;
} | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return null;
  }
  return await new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      () => resolve(null),
      options ?? { enableHighAccuracy: false, timeout: 2_500, maximumAge: 300_000 },
    );
  });
}

/** Lieu saisi côté planificateur / Google (`includedTasks`) quand l’API renvoie le lien. */
function includedLocationQueryForTask(
  journey: JourneyResponse,
  task: JourneyTaskOnRoute,
): string | null {
  const titleNorm = task.title.trim().toLowerCase();
  const byTaskId = journey.includedTasks.find(
    (it) => it.taskId != null && it.taskId === task.taskId,
  );
  const q1 = byTaskId?.locationQuery?.trim();
  if (q1) {
    return q1;
  }
  const byTitle = journey.includedTasks.find(
    (it) => it.title.trim().toLowerCase() === titleNorm,
  );
  const q2 = byTitle?.locationQuery?.trim();
  return q2 || null;
}

/** ID stable pour une `IncludedTask` (la clé de cache du géocodage). */
function includedTaskKey(t: JourneyResponse["includedTasks"][number]): string {
  return (
    t.taskId ||
    t.googleTaskId ||
    `${t.title.trim().toLowerCase()}::${(t.locationQuery ?? "").trim().toLowerCase()}`
  );
}

/**
 * Représentation unifiée d’une tâche visible sur le trajet :
 * - soit un waypoint d’optimisation (`includedTasks`, coords idéalement exactes backend),
 * - soit une tâche géolocalisée « à proximité » (`tasksOnRoute`).
 *
 * `coordinates` peut être `null` lorsqu'aucune source (backend, géocodage front, tasksOnRoute)
 * n'a fourni de position. L'entrée est alors conservée pour rester visible dans le panneau,
 * mais elle n'est pas rendue sur la carte.
 */
type ResolvedTaskCoordSource = "backend" | "fallback" | "onRoute" | "none";

type ResolvedJourneyTask = {
  id: string;
  title: string;
  coordinates: [number, number] | null;
  addressHint: string | null;
  /** True si c’est un waypoint effectif du trajet optimisé (justifie un vrai détour piéton). */
  isIncludedInPlan: boolean;
  /** Entrée `tasksOnRoute` associée si on en a une (utile pour `distanceMeters`, etc.). */
  onRoute: JourneyTaskOnRoute | null;
  /** D'où viennent les coordonnées (debug / UX). */
  coordSource: ResolvedTaskCoordSource;
};

/** Une des deux jambes piétonnes routées autour d'une tâche waypoint. */
type TaskWalkLeg = {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
};

type TaskWalkLegsByTaskId = Record<string, { to?: TaskWalkLeg; from?: TaskWalkLeg }>;

function resolveJourneyTasks(
  journey: JourneyResponse,
  fallbackCoordsByKey: Record<string, [number, number]> = {},
  opts: { includeWithoutCoords?: boolean } = {},
): ResolvedJourneyTask[] {
  const byKey = new Map<string, ResolvedJourneyTask>();

  for (const it of journey.includedTasks) {
    const key = includedTaskKey(it);
    const matchingOnRoute =
      (it.taskId ? journey.tasksOnRoute.find((t) => t.taskId === it.taskId) : null) ||
      journey.tasksOnRoute.find(
        (t) => t.title.trim().toLowerCase() === it.title.trim().toLowerCase(),
      ) ||
      null;

    let coords: [number, number] | null = null;
    let coordSource: ResolvedTaskCoordSource = "none";
    if (it.locationLat != null && it.locationLng != null) {
      coords = [it.locationLng, it.locationLat];
      coordSource = "backend";
    } else if (fallbackCoordsByKey[key]) {
      coords = fallbackCoordsByKey[key];
      coordSource = "fallback";
    } else if (
      matchingOnRoute?.locationLat != null &&
      matchingOnRoute.locationLng != null
    ) {
      coords = [matchingOnRoute.locationLng, matchingOnRoute.locationLat];
      coordSource = "onRoute";
    }

    if (!coords && !opts.includeWithoutCoords) continue;

    byKey.set(key, {
      id: key,
      title: it.title || "Tache",
      coordinates: coords,
      addressHint: it.locationQuery?.trim() || null,
      isIncludedInPlan: true,
      onRoute: matchingOnRoute,
      coordSource,
    });
  }

  for (const t of journey.tasksOnRoute) {
    if (t.locationLat == null || t.locationLng == null) continue;
    const alreadyCovered = Array.from(byKey.values()).some(
      (r) => r.onRoute?.taskId === t.taskId,
    );
    if (alreadyCovered) continue;
    byKey.set(t.taskId, {
      id: t.taskId,
      title: t.title,
      coordinates: [t.locationLng, t.locationLat],
      addressHint: null,
      isIncludedInPlan: false,
      onRoute: t,
      coordSource: "onRoute",
    });
  }

  const resolved = Array.from(byKey.values());

  if (
    typeof process !== "undefined" &&
    process.env.NODE_ENV !== "production" &&
    (journey.includedTasks.length > 0 || journey.tasksOnRoute.length > 0)
  ) {
    const summary = resolved.map((r) => ({
      id: r.id,
      title: r.title,
      coordSource: r.coordSource,
      isIncludedInPlan: r.isIncludedInPlan,
    }));
    console.debug("[journey] resolved tasks", {
      journeyId: journey.journeyId,
      includedTasksCount: journey.includedTasks.length,
      tasksOnRouteCount: journey.tasksOnRoute.length,
      resolved: summary,
    });
  }

  return resolved;
}

function resolveTaskAddressLine(
  task: ResolvedJourneyTask,
  geocodedByTaskId: Record<string, string>,
): string | null {
  if (task.addressHint) {
    return task.addressHint;
  }
  const onRouteId = task.onRoute?.taskId;
  const fromRev = onRouteId ? geocodedByTaskId[onRouteId]?.trim() : "";
  if (fromRev) {
    return fromRev;
  }
  if (task.coordinates) {
    return `${task.coordinates[1].toFixed(5)} · ${task.coordinates[0].toFixed(5)} (coordonnées GPS)`;
  }
  return null;
}

type JourneyWorkspaceProps = {
  mapboxToken: string | null;
};

const TASK_DETOUR_MIN_LEG_M = 3;

function planDistanceMeters(a: [number, number], b: [number, number]) {
  const avgLat = (a[1] + b[1]) / 2;
  const lngScale = 111_320 * Math.cos((avgLat * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * lngScale, (a[1] - b[1]) * 110_540);
}

/** Point le plus proche sur la polyligne (projection segment par segment, repère equirectangulaire). */
function closestPointOnPolyline(
  point: [number, number],
  line: [number, number][],
): [number, number] | null {
  if (line.length === 0) {
    return null;
  }
  if (line.length === 1) {
    return line[0] ?? null;
  }
  const latScale = 110_540;
  const lngScaleAtPoint = 111_320 * Math.cos((point[1] * Math.PI) / 180);
  const px = point[0] * lngScaleAtPoint;
  const py = point[1] * latScale;
  let best: [number, number] | null = null;
  let bestDistSq = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const s = line[i]!;
    const e = line[i + 1]!;
    const x1 = s[0] * lngScaleAtPoint;
    const y1 = s[1] * latScale;
    const x2 = e[0] * lngScaleAtPoint;
    const y2 = e[1] * latScale;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const segLenSq = dx * dx + dy * dy;
    const t =
      segLenSq <= 0
        ? 0
        : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / segLenSq));
    const qx = x1 + t * dx;
    const qy = y1 + t * dy;
    const dSq = (px - qx) ** 2 + (py - qy) ** 2;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      best = [s[0] + t * (e[0] - s[0]), s[1] + t * (e[1] - s[1])];
    }
  }
  return best;
}

/**
 * Sur une polyligne affichée, ancrage = sommet le plus proche de la projection perpendiculaire de la tâche
 * (toujours un point du LineString → pas de « trou » entre le tracé et le détour).
 */
function taskAnchorOnPolylineVertices(
  taskCoords: [number, number],
  line: [number, number][],
): [number, number] | null {
  if (line.length === 0) {
    return null;
  }
  if (line.length === 1) {
    return line[0] ?? null;
  }
  const projected = closestPointOnPolyline(taskCoords, line);
  if (!projected) {
    return line[line.length - 1] ?? null;
  }
  let bestVertex = line[0]!;
  let bestD = planDistanceMeters(projected, bestVertex);
  for (const v of line) {
    const d = planDistanceMeters(projected, v);
    if (d < bestD) {
      bestD = d;
      bestVertex = v;
    }
  }
  return bestVertex;
}

function fallbackTaskAnchorOnRoute(
  taskCoords: [number, number],
  routeSegments: TransportSegment[],
): [number, number] | null {
  let best: [number, number] | null = null;
  let bestTaskToAnchor = Infinity;
  for (const seg of routeSegments) {
    const a = taskAnchorOnPolylineVertices(taskCoords, seg.coordinates);
    if (!a) {
      continue;
    }
    const d = planDistanceMeters(taskCoords, a);
    if (d < bestTaskToAnchor) {
      bestTaskToAnchor = d;
      best = a;
    }
  }
  return best;
}

/** Même critère que l’ordre des étapes (tâche rangée après le segment le plus « proche »). */
function closestSegmentIndexForTask(
  task: JourneyTaskOnRoute,
  journey: JourneyResponse,
): number {
  if (task.locationLat == null || task.locationLng == null) {
    return 0;
  }
  const taskCoords: [number, number] = [task.locationLng, task.locationLat];
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let si = 0; si < journey.segments.length; si++) {
    for (const pt of journey.segments[si].points) {
      if (pt.latitude == null || pt.longitude == null) {
        continue;
      }
      const d = planDistanceMeters(taskCoords, [pt.longitude, pt.latitude]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = si;
      }
    }
  }
  return bestIdx;
}

function lastGeoPointOnJourneySegment(
  segment: JourneyResponse["segments"][number],
): [number, number] | null {
  const withGeo = segment.points.filter(
    (p) => p.latitude != null && p.longitude != null,
  );
  const last = withGeo[withGeo.length - 1];
  if (!last || last.longitude == null || last.latitude == null) {
    return null;
  }
  return [last.longitude, last.latitude];
}

function firstGeoPointOnJourneySegment(
  segment: JourneyResponse["segments"][number],
): [number, number] | null {
  for (const p of segment.points) {
    if (p.latitude != null && p.longitude != null) {
      return [p.longitude, p.latitude];
    }
  }
  return null;
}

/**
 * Contexte géographique d'une tâche waypoint : l'index du segment qui « contient »
 * la tâche, et les deux ancres piétonnes autour d'elle.
 */
type IncludedTaskWaypointAnchors = {
  coords: [number, number];
  segIdx: number;
  before: [number, number] | null;
  after: [number, number] | null;
};

function getIncludedTaskWaypointAnchors(
  journey: JourneyResponse,
  task: ResolvedJourneyTask,
): IncludedTaskWaypointAnchors | null {
  if (!task.isIncludedInPlan || !task.coordinates) return null;
  const coords = task.coordinates;
  const segIdx = closestSegmentIndexForTask(
    { locationLng: coords[0], locationLat: coords[1] } as JourneyTaskOnRoute,
    journey,
  );
  const beforeSeg = journey.segments[segIdx];
  const afterSeg = journey.segments[segIdx + 1] ?? null;
  return {
    coords,
    segIdx,
    before: beforeSeg ? lastGeoPointOnJourneySegment(beforeSeg) : null,
    after: afterSeg ? firstGeoPointOnJourneySegment(afterSeg) : null,
  };
}

function resultDuration(journey: JourneyResponse) {
  const fromDates =
    (new Date(journey.plannedArrival).getTime() -
      new Date(journey.plannedDeparture).getTime()) /
    1000;
  if (Number.isFinite(fromDates) && fromDates > 0) {
    return fromDates;
  }
  return journey.segments.reduce(
    (total, segment) => total + (segment.durationSeconds ?? 0),
    0,
  );
}

function segmentModeLabel(segment: JourneyResponse["segments"][number]) {
  return segment.transitMode || segment.segmentType || "LEG";
}

function segmentTitle(segment: JourneyResponse["segments"][number]) {
  const firstPoint = segment.points[0];
  const lastPoint = segment.points[segment.points.length - 1];
  const from = firstPoint?.name || segment.lineName || "Origin";
  const to = lastPoint?.name || segment.lineName || "Destination";
  return `${from} to ${to}`;
}

function segmentAccent(segment: JourneyResponse["segments"][number]) {
  if (segment.lineColor) {
    return `#${segment.lineColor.replace(/^#/, "")}`;
  }
  switch (segment.segmentType) {
    case "WALKING":
      return "#3b82f6";
    case "TRANSFER":
      return "#ffd100";
    default:
      return "#009b48";
  }
}

function getTransportTypeForSegment(
  segment: JourneyResponse["segments"][number],
): TransportType {
  const mode = segment.transitMode?.toLowerCase() ?? "";
  const segmentType = segment.segmentType.toLowerCase();

  if (segmentType.includes("walk") || mode.includes("walk")) {
    return "walking";
  }
  if (mode.includes("bus")) {
    return "bus";
  }
  if (mode.includes("metro") || mode.includes("subway")) {
    return "metro";
  }
  if (mode.includes("train") || mode.includes("rer") || mode.includes("rail")) {
    return "train";
  }
  if (segmentType.includes("transfer")) {
    return "walking";
  }

  return "train";
}

function buildMapDataForJourney(journey: JourneyResponse) {
  const segments: TransportSegment[] = [];
  const stopById = new Map<string, TransportStop>();

  const perSegmentGeoPoints: [number, number][][] = journey.segments.map(
    (segment) =>
      segment.points
        .filter((p) => p.latitude != null && p.longitude != null)
        .map((p) => [p.longitude!, p.latitude!] as [number, number]),
  );

  journey.segments.forEach((segment, segmentIndex) => {
    let coordinates = perSegmentGeoPoints[segmentIndex];

    if (coordinates.length < 2) {
      const inferred: [number, number][] = [];
      if (segmentIndex > 0) {
        const prev = perSegmentGeoPoints[segmentIndex - 1];
        if (prev.length) inferred.push(prev[prev.length - 1]);
      }
      inferred.push(...coordinates);
      if (segmentIndex < journey.segments.length - 1) {
        const next = perSegmentGeoPoints[segmentIndex + 1];
        if (next.length) inferred.push(next[0]);
      }
      const unique: [number, number][] = [];
      for (const c of inferred) {
        const last = unique[unique.length - 1];
        if (!last || last[0] !== c[0] || last[1] !== c[1]) unique.push(c);
      }
      coordinates = unique;
    }

    if (coordinates.length < 2) {
      return;
    }

    const transportType = getTransportTypeForSegment(segment);
    segments.push({
      id: segment.segmentId,
      label: segment.lineName || segmentModeLabel(segment),
      transportType,
      color:
        transportType === "walking"
          ? TRANSPORT_COLORS.walking
          : segmentAccent(segment),
      coordinates,
    });

    const pointsWithCoordinates = segment.points.filter(
      (point) => point.latitude != null && point.longitude != null,
    );

    if (pointsWithCoordinates.length) {
      pointsWithCoordinates.forEach((point, pointIndex) => {
        const id = point.pointId || `${point.longitude}-${point.latitude}`;
        const isJourneyFirstPoint = segmentIndex === 0 && pointIndex === 0;
        const isJourneyLastPoint =
          segmentIndex === journey.segments.length - 1 &&
          pointIndex === pointsWithCoordinates.length - 1;

        const nextType: TransportStop["type"] = isJourneyFirstPoint
          ? "origin"
          : isJourneyLastPoint
            ? "destination"
            : "interchange";
        const existing = stopById.get(id);
        const nextStop: TransportStop = {
          id,
          name: point.name || "Stop",
          address: point.name || null,
          coordinates: [point.longitude!, point.latitude!],
          type: nextType,
        };

        if (!existing) {
          stopById.set(id, nextStop);
          return;
        }

        if (existing.type === "interchange" && nextType !== "interchange") {
          stopById.set(id, nextStop);
        }
      });
    } else {
      const startCoord = coordinates[0];
      const endCoord = coordinates[coordinates.length - 1];
      const startId = `inferred-${startCoord[0]}-${startCoord[1]}`;
      const endId = `inferred-${endCoord[0]}-${endCoord[1]}`;
      if (!stopById.has(startId)) {
        stopById.set(startId, {
          id: startId,
          name: segment.points[0]?.name || "Depart marche",
          address: null,
          coordinates: startCoord,
          type: segmentIndex === 0 ? "origin" : "interchange",
        });
      }
      if (!stopById.has(endId)) {
        stopById.set(endId, {
          id: endId,
          name: segment.points[segment.points.length - 1]?.name || "Fin marche",
          address: null,
          coordinates: endCoord,
          type:
            segmentIndex === journey.segments.length - 1
              ? "destination"
              : "interchange",
        });
      }
    }
  });

  return {
    segments,
    stops: Array.from(stopById.values()),
  };
}

/**
 * Génère des segments piétons pour chaque tâche affichée :
 *
 * - `includedTasks` (waypoint optimisé) : deux legs piéton routés sur les rues
 *   (via Mapbox Directions, résolus async dans `taskWalkLegs`). Le premier leg
 *   relie la fin du segment qui précède la tâche à ses coordonnées, le second
 *   relie ses coordonnées au début du segment qui suit. Tant que la résolution
 *   async n'est pas terminée on affiche un fallback en ligne droite.
 * - `tasksOnRoute` non incluses : un unique détour depuis la polyligne la plus
 *   proche pour matérialiser le pas-de-côté.
 */
const WALKING_LEG_COLOR = "#3b82f6";

function buildTaskWalkingSegments(
  journey: JourneyResponse,
  resolvedTasks: ResolvedJourneyTask[],
  routeSegments: TransportSegment[],
  includedTaskAnchors: Record<string, IncludedTaskWaypointAnchors> = {},
  taskWalkLegs: TaskWalkLegsByTaskId = {},
): TransportSegment[] {
  const result: TransportSegment[] = [];
  if (!resolvedTasks.length || !routeSegments.length) {
    return result;
  }

  const pushLeg = (
    id: string,
    label: string,
    coordinates: [number, number][],
    approxMeters: number,
  ) => {
    if (approxMeters <= TASK_DETOUR_MIN_LEG_M) return;
    result.push({
      id,
      label,
      transportType: "walking",
      color: WALKING_LEG_COLOR,
      coordinates,
    });
  };

  for (const task of resolvedTasks) {
    const taskCoords = task.coordinates;
    if (!taskCoords) continue;
    const shortTitle = task.title.trim().slice(0, 42);
    const legLabel = shortTitle ? `Tache · ${shortTitle}` : "Tache · A pied";

    if (task.isIncludedInPlan) {
      const ctx = includedTaskAnchors[task.id];
      if (!ctx) continue;
      const legs = taskWalkLegs[task.id];

      if (ctx.before) {
        const toLeg = legs?.to;
        pushLeg(
          `task-walk-to-${task.id}`,
          `${legLabel} (aller)`,
          toLeg?.coordinates ?? [ctx.before, taskCoords],
          toLeg?.distanceMeters ?? planDistanceMeters(ctx.before, taskCoords),
        );
      }
      if (ctx.after) {
        const fromLeg = legs?.from;
        pushLeg(
          `task-walk-from-${task.id}`,
          `${legLabel} (retour)`,
          fromLeg?.coordinates ?? [taskCoords, ctx.after],
          fromLeg?.distanceMeters ?? planDistanceMeters(taskCoords, ctx.after),
        );
      }
      continue;
    }

    // Détour simple pour une tâche juste « sur route » (non waypoint).
    const segIdx = closestSegmentIndexForTask(
      { locationLng: taskCoords[0], locationLat: taskCoords[1] } as JourneyTaskOnRoute,
      journey,
    );
    const jSeg = journey.segments[segIdx];
    const transportSeg = routeSegments.find((s) => s.id === jSeg?.segmentId);

    let anchor: [number, number] | null = null;
    if (transportSeg?.coordinates.length) {
      anchor = taskAnchorOnPolylineVertices(taskCoords, transportSeg.coordinates);
    }
    if (!anchor && jSeg) {
      anchor = lastGeoPointOnJourneySegment(jSeg);
    }
    if (!anchor) {
      anchor = fallbackTaskAnchorOnRoute(taskCoords, routeSegments);
    }

    if (anchor) {
      pushLeg(
        `task-walk-${task.id}`,
        legLabel,
        [anchor, taskCoords],
        planDistanceMeters(anchor, taskCoords),
      );
    }
  }

  return result;
}

const ACTIVE_JOURNEY_STORAGE_KEY = "mavigo-active-journey";
const TOURIST_MODE_STORAGE_KEY = "maview-tourist-mode-enabled";
const ROUTE_TOURIST_SUGGESTIONS_STORAGE_KEY_PREFIX =
  "maview-route-tourist-suggestions:";

function persistActiveJourney(journey: JourneyResponse | null) {
  try {
    if (journey) {
      sessionStorage.setItem(ACTIVE_JOURNEY_STORAGE_KEY, JSON.stringify(journey));
    } else {
      sessionStorage.removeItem(ACTIVE_JOURNEY_STORAGE_KEY);
    }
  } catch {
    // sessionStorage unavailable or quota exceeded
  }
}

function restoreActiveJourney(): JourneyResponse | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_JOURNEY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as JourneyResponse;
  } catch {
    return null;
  }
}

function restoreTouristModeEnabled(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(TOURIST_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function persistTouristModeEnabled(enabled: boolean) {
  try {
    sessionStorage.setItem(TOURIST_MODE_STORAGE_KEY, String(enabled));
  } catch {
    // Ignore unavailable sessionStorage.
  }
}

function routeTouristSuggestionsStorageKey(journeyId: string, geometryKey: string) {
  return `${ROUTE_TOURIST_SUGGESTIONS_STORAGE_KEY_PREFIX}${journeyId}:${geometryKey}`;
}

function restoreRouteTouristSuggestions(storageKey: string): TourismSuggestion[] | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TourismSuggestion[]) : null;
  } catch {
    return null;
  }
}

function persistRouteTouristSuggestions(
  storageKey: string,
  suggestions: TourismSuggestion[],
) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(suggestions));
  } catch {
    // Ignore cache write failures.
  }
}

type StepItem =
  | { kind: "segment"; segment: JourneyResponse["segments"][number] }
  | { kind: "task"; task: ResolvedJourneyTask }
  | {
      kind: "taskWalk";
      direction: "to" | "from";
      task: ResolvedJourneyTask;
      distanceMeters: number | null;
      durationSeconds: number | null;
    };

function buildOrderedSteps(
  journey: JourneyResponse,
  resolvedTasks: ResolvedJourneyTask[],
  taskWalkLegs: TaskWalkLegsByTaskId = {},
): StepItem[] {
  const tasksBySegmentIdx = new Map<number, ResolvedJourneyTask[]>();
  const tasksWithoutCoords: ResolvedJourneyTask[] = [];

  for (const task of resolvedTasks) {
    if (!task.coordinates) {
      tasksWithoutCoords.push(task);
      continue;
    }
    const proxy = {
      locationLng: task.coordinates[0],
      locationLat: task.coordinates[1],
    } as JourneyTaskOnRoute;
    const bestIdx = closestSegmentIndexForTask(proxy, journey);
    const list = tasksBySegmentIdx.get(bestIdx) ?? [];
    list.push(task);
    tasksBySegmentIdx.set(bestIdx, list);
  }

  const items: StepItem[] = [];
  for (let i = 0; i < journey.segments.length; i++) {
    items.push({ kind: "segment", segment: journey.segments[i] });
    for (const t of tasksBySegmentIdx.get(i) ?? []) {
      // Pour les tâches waypoint on encadre le bloc TÂCHE par les deux jambes
      // piétonnes (aller/retour). Pour les tâches simplement "à proximité", on
      // conserve le rendu minimal (bloc TÂCHE seul).
      if (t.isIncludedInPlan && t.coordinates) {
        const legs = taskWalkLegs[t.id];
        items.push({
          kind: "taskWalk",
          direction: "to",
          task: t,
          distanceMeters: legs?.to?.distanceMeters ?? null,
          durationSeconds: legs?.to?.durationSeconds ?? null,
        });
        items.push({ kind: "task", task: t });
        items.push({
          kind: "taskWalk",
          direction: "from",
          task: t,
          distanceMeters: legs?.from?.distanceMeters ?? null,
          durationSeconds: legs?.from?.durationSeconds ?? null,
        });
      } else {
        items.push({ kind: "task", task: t });
      }
    }
  }
  // Tâches dont aucune position n'a pu être résolue : on les liste à la fin
  // pour qu'elles restent visibles dans le panneau.
  for (const t of tasksWithoutCoords) {
    items.push({ kind: "task", task: t });
  }
  return items;
}

function JourneySegmentsPanel({
  journey,
  resolvedTasks,
  taskWalkLegs,
  taskGeocodedAddresses = {},
  onFocusOnMap,
}: {
  journey: JourneyResponse;
  resolvedTasks: ResolvedJourneyTask[];
  taskWalkLegs?: TaskWalkLegsByTaskId;
  taskGeocodedAddresses?: Record<string, string>;
  /** Repère la carte sur ces coordonnées (lng, lat), ex. arrêt ou tâche géolocalisée. */
  onFocusOnMap?: (coordinates: [number, number]) => void;
}) {
  const steps = buildOrderedSteps(journey, resolvedTasks, taskWalkLegs);
  const hasPendingCoords =
    journey.includedTasks.length > 0 &&
    resolvedTasks.length > 0 &&
    resolvedTasks.every((t) => !t.coordinates);

  return (
    <div className="w-full rounded-xl bg-surface-strong border border-line p-5">
      {hasPendingCoords ? (
        <div className="mb-4 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          <strong className="font-semibold">Positions des tâches en cours de résolution.</strong>{" "}
          Si le point n’apparaît pas sur la carte, redémarre le backend Spring pour qu’il renvoie
          les coordonnées exactes, ou vérifie le token Mapbox.
        </div>
      ) : null}
      <div className="grid gap-0">
        {steps.map((step) => {
          if (step.kind === "task") {
            const task = step.task;
            const addressLine = resolveTaskAddressLine(task, taskGeocodedAddresses);
            const taskCoords: [number, number] | null = task.coordinates;
            const distanceMeters = task.onRoute?.distanceMeters ?? null;
            const taskBody = (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 border border-amber-400/60 px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-amber-200">
                    {task.isIncludedInPlan ? "TÂCHE · ARRÊT PLANIFIÉ" : "TÂCHE (à faire)"}
                  </span>
                  {!taskCoords ? (
                    <span className="inline-flex items-center rounded-full bg-amber-400/10 border border-amber-400/40 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-amber-200/80">
                      Position en cours…
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 font-semibold text-foreground text-sm">
                  {task.title}
                </p>
                {addressLine ? (
                  <p className="mt-1 text-xs text-amber-200/90 leading-snug">
                    {addressLine}
                  </p>
                ) : null}
                {task.isIncludedInPlan ? (
                  <p className="mt-1 text-xs text-amber-300/80 font-mono">
                    {taskCoords
                      ? "Étape intégrée à l’itinéraire — le trajet passe par cette adresse."
                      : "Position non encore géolocalisée — la tâche reste planifiée dans l’itinéraire."}
                  </p>
                ) : distanceMeters != null ? (
                  <p className="mt-1 text-xs text-secondary font-mono">
                    A pied · {formatDistance(distanceMeters)} du trajet
                  </p>
                ) : null}
                {onFocusOnMap && taskCoords ? (
                  <p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-secondary">
                    Voir sur la carte
                  </p>
                ) : null}
              </>
            );
            return (
              <div key={`task-${task.id}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-3 h-3 rounded-full shrink-0 bg-amber-400" />
                  <div
                    className="flex-1 my-1"
                    style={{ borderLeft: "2px dashed #fbbf24", width: 0 }}
                  />
                  <div className="w-3 h-3 rounded-full shrink-0 bg-amber-400" />
                </div>
                <div className="flex-1 pb-4 min-w-0">
                  {onFocusOnMap && taskCoords ? (
                    <button
                      type="button"
                      onClick={() => onFocusOnMap(taskCoords)}
                      className="w-full rounded-xl border border-transparent text-left transition hover:border-amber-400/35 hover:bg-amber-400/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 px-1 py-0.5 -mx-1"
                    >
                      {taskBody}
                    </button>
                  ) : (
                    taskBody
                  )}
                </div>
              </div>
            );
          }

          if (step.kind === "taskWalk") {
            const walkColor = "#3b82f6";
            const minutes =
              step.durationSeconds != null
                ? Math.max(1, Math.round(step.durationSeconds / 60))
                : null;
            const label =
              step.direction === "to"
                ? "À pied vers la tâche"
                : "À pied depuis la tâche";
            return (
              <div
                key={`task-walk-${step.task.id}-${step.direction}`}
                className="flex gap-3"
              >
                <div className="flex flex-col items-center">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: walkColor }}
                  />
                  <div
                    className="flex-1 my-1"
                    style={{ borderLeft: `2px dashed ${walkColor}`, width: 0 }}
                  />
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: walkColor }}
                  />
                </div>
                <div className="flex-1 pb-4 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em]"
                      style={{
                        color: walkColor,
                        borderColor: `${walkColor}66`,
                        backgroundColor: `${walkColor}1a`,
                      }}
                    >
                      À pied
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {label}
                  </p>
                  {step.distanceMeters != null && step.distanceMeters > 0 ? (
                    <p className="mt-1 text-xs text-secondary font-mono">
                      {formatDistance(step.distanceMeters)}
                      {minutes != null ? ` · ${minutes} min` : ""}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-secondary font-mono">
                      Tracé en cours de calcul…
                    </p>
                  )}
                </div>
              </div>
            );
          }

          const segment = step.segment;
          return (
            <div key={segment.segmentId} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: segmentAccent(segment) }}
                />
                <div
                  className="flex-1 my-1"
                  style={
                    segment.segmentType === "WALKING"
                      ? { borderLeft: `2px dashed ${segmentAccent(segment)}`, width: 0 }
                      : { width: "2px", backgroundColor: segmentAccent(segment) }
                  }
                />
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: segmentAccent(segment) }}
                />
              </div>
              <div className="flex-1 pb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {segment.lineName ? (
                    <span
                      className="transit-line-badge"
                      style={{ backgroundColor: segmentAccent(segment) }}
                    >
                      {segment.lineName}
                    </span>
                  ) : null}
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-secondary font-mono">
                    {segmentModeLabel(segment)}
                  </span>
                </div>
                <p className="mt-1 font-semibold text-foreground text-sm">
                  {segmentTitle(segment)}
                </p>
                <p className="mt-1 text-xs text-secondary font-mono">
                  {segment.scheduledDeparture
                    ? formatDateTime(segment.scheduledDeparture)
                    : "Unknown departure"}
                  {" · "}
                  {formatDuration(segment.durationSeconds)}
                  {segment.distanceMeters != null
                    ? ` · ${formatDistance(segment.distanceMeters)}`
                    : ""}
                </p>
                {segment.points.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {segment.points
                      .filter(
                        (point) =>
                          point.latitude != null && point.longitude != null,
                      )
                      .map((point) => {
                        const label = point.name?.trim() || "Arrêt";
                        const coords: [number, number] = [
                          point.longitude!,
                          point.latitude!,
                        ];
                        const stopKey = `${segment.segmentId}-${point.pointId}-${point.sequenceInSegment}`;
                        if (onFocusOnMap) {
                          return (
                            <button
                              key={stopKey}
                              type="button"
                              onClick={() => onFocusOnMap(coords)}
                              className="rounded-full border border-line bg-surface px-2.5 py-1 text-[0.68rem] font-semibold text-secondary transition hover:border-amber-400/50 hover:bg-amber-400/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45"
                              aria-label={`Voir ${label} sur la carte`}
                            >
                              {label}
                            </button>
                          );
                        }
                        return (
                          <span
                            key={stopKey}
                            className="rounded-full border border-line bg-surface px-2.5 py-1 text-[0.68rem] font-semibold text-secondary"
                          >
                            {label}
                          </span>
                        );
                      })}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JourneySegmentsStrip({ journey }: { journey: JourneyResponse }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {journey.segments.map((segment) => (
        <div
          key={segment.segmentId}
          className="min-w-[260px] max-w-[320px] rounded-2xl border border-line bg-surface-strong p-4"
        >
          <div className="flex items-center gap-2 flex-wrap">
            {segment.lineName ? (
              <span
                className="transit-line-badge"
                style={{ backgroundColor: segmentAccent(segment) }}
              >
                {segment.lineName}
              </span>
            ) : null}
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-secondary font-mono">
              {segmentModeLabel(segment)}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold leading-5 text-foreground">
            {segmentTitle(segment)}
          </p>
          <p className="mt-2 text-xs leading-5 text-secondary font-mono">
            {segment.scheduledDeparture
              ? formatDateTime(segment.scheduledDeparture)
              : "Unknown departure"}
            {" · "}
            {formatDuration(segment.durationSeconds)}
            {segment.distanceMeters != null
              ? ` · ${formatDistance(segment.distanceMeters)}`
              : ""}
          </p>
          {segment.points.length ? (
            <div className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-auto">
              {segment.points.map((point, pointIndex) => (
                <span
                  key={`${segment.segmentId}-${pointIndex}-${point.name}`}
                  className="rounded-full border border-line bg-surface px-2.5 py-1 text-[0.68rem] font-semibold text-secondary"
                >
                  {point.name?.trim() || "Arret"}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

async function completeIncludedGoogleTasks(
  journey: JourneyResponse,
  userId: string,
  token: string,
) {
  const includedGoogleTaskIds = journey.includedTasks
    .map((task) => task.googleTaskId)
    .filter((taskId): taskId is string => Boolean(taskId));

  if (!includedGoogleTaskIds.length) {
    return;
  }

  try {
    const defaultList = await googleTasksApi.getDefaultList(userId, token);
    await Promise.allSettled(
      includedGoogleTaskIds.map((taskId) =>
        googleTasksApi.completeTask(userId, defaultList.id, taskId, token),
      ),
    );
  } catch {
    // Journey completion should not fail because Google Tasks completion lagged.
  }
}

export function JourneyWorkspace({ mapboxToken }: JourneyWorkspaceProps) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const exploreRestaurantSearchKey = searchParams.toString();
  const isExploreRestaurantDeeplink = searchParams.get("exploreRestaurant") === "1";
  const { user, token } = useAuth();
  const { toast } = useToast();

  const [planner, setPlanner] = useState<PlannerState>({
    originQuery: "",
    destinationQuery: "",
    originApiQuery: "",
    destinationApiQuery: "",
    originLatitude: null,
    originLongitude: null,
    destinationLatitude: null,
    destinationLongitude: null,
    source: null,
    departureTime: getLocalDateTimeInputValue(),
    intermediateQuery: "",
    intermediateDepartureTime: "",
    ecoModeEnabled: false,
    wheelchairAccessible: false,
    namedComfortSettingId: "",
    includeTaskOptimization: false,
    touristModeEnabled: false,
  });
  const [results, setResults] = useState<JourneyResponse[]>([]);
  const [currentJourney, setCurrentJourney] = useState<JourneyResponse | null>(null);
  const [journeyMessage, setJourneyMessage] = useState<string | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [tripOptionsOpen, setTripOptionsOpen] = useState(false);
  const exploreRestaurantDeeplinkProcessedKeyRef = useRef("");
  const liveJourneyMapRef = useRef<HTMLDivElement>(null);
  const [journeyMapFlyTo, setJourneyMapFlyTo] = useState<{
    lng: number;
    lat: number;
    id: number;
  } | null>(null);

  const [routeTouristSuggestions, setRouteTouristSuggestions] = useState<
    TourismSuggestion[]
  >([]);
  const [routeTouristFetch, setRouteTouristFetch] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");

  useEffect(() => {
    setJourneyMapFlyTo(null);
  }, [currentJourney?.journeyId]);

  useEffect(() => {
    if (results.length && !currentJourney) {
      setTripOptionsOpen(true);
    }
  }, [currentJourney, results.length]);

  const handleJourneyStopFocusOnMap = useCallback((coordinates: [number, number]) => {
    setJourneyMapFlyTo({
      lng: coordinates[0],
      lat: coordinates[1],
      id: Date.now(),
    });
    requestAnimationFrame(() => {
      liveJourneyMapRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  useEffect(() => {
    if (isExploreRestaurantDeeplink) {
      return;
    }
    const restored = restoreActiveJourney();
    if (restored) setCurrentJourney(restored);
  }, [isExploreRestaurantDeeplink]);

  useEffect(() => {
    const restored = restoreTouristModeEnabled();
    if (!restored) {
      return;
    }
    setPlanner((current) =>
      current.touristModeEnabled ? current : { ...current, touristModeEnabled: true },
    );
  }, []);

  useEffect(() => {
    persistActiveJourney(currentJourney);
  }, [currentJourney]);

  useEffect(() => {
    persistTouristModeEnabled(planner.touristModeEnabled);
  }, [planner.touristModeEnabled]);
  const [disruptionMode, setDisruptionMode] = useState<"line" | "station" | null>(null);
  const [showOriginSuggestion, setShowOriginSuggestion] = useState(false);
  const [isResolvingCurrentLocation, setIsResolvingCurrentLocation] = useState(false);
  const [isReroutingFromLocation, setIsReroutingFromLocation] = useState(false);

  const googleLinked = Boolean(user?.googleAccountLinked);

  const comfortSettingsQuery = useQuery({
    queryKey: ["comfort-settings", user?.userId],
    queryFn: () => usersApi.listComfortSettings(user!.userId, token!),
    enabled: Boolean(user?.userId && token),
  });

  const suggestionsQuery = useQuery({
    queryKey: ["journey-suggestions", user?.userId, getTomorrowDateString()],
    queryFn: () =>
      googleTasksApi.listSuggestions(user!.userId, getTomorrowDateString(), token!),
    enabled: Boolean(
      user?.userId && token && googleLinked && !isExploreRestaurantDeeplink,
    ),
  });

  const linesQuery = useQuery({
    queryKey: ["journey-lines", currentJourney?.journeyId],
    queryFn: () => journeysApi.getLines(currentJourney!.journeyId, token!),
    enabled: Boolean(currentJourney?.journeyId && token && disruptionMode === "line"),
  });

  const stopsQuery = useQuery({
    queryKey: ["journey-stops", currentJourney?.journeyId],
    queryFn: () => journeysApi.getStops(currentJourney!.journeyId, token!),
    enabled: Boolean(
      currentJourney?.journeyId && token && disruptionMode === "station",
    ),
  });

  const planJourney = useMutation({
    mutationFn: async (
      plannerOverrides?: Partial<PlannerState>,
    ): Promise<PlanningOutcome> => {
      if (!user?.userId || !token) {
        throw new Error("An authenticated session is required.");
      }
      if (!isUuidString(user.userId)) {
        throw new Error(
          "Identifiant utilisateur invalide dans la session. Déconnectez-vous puis reconnectez-vous.",
        );
      }
      const effectivePlanner = {
        ...planner,
        ...plannerOverrides,
      };

      if (
        !effectivePlanner.originQuery.trim() ||
        !effectivePlanner.destinationQuery.trim()
      ) {
        throw new Error("Origin and destination are required.");
      }
      if (!effectivePlanner.departureTime) {
        throw new Error("Departure time is required.");
      }
      const departureTimeForApi = normalizeLocalDateTimeForApi(effectivePlanner.departureTime);
      if (!departureTimeForApi) {
        throw new Error("Departure time is required.");
      }

      const viaTimeRaw = effectivePlanner.intermediateDepartureTime?.trim();
      const intermediateDepartureTimeForApi =
        viaTimeRaw && effectivePlanner.intermediateQuery.trim()
          ? normalizeLocalDateTimeForApi(viaTimeRaw)
          : undefined;

      if (
        effectivePlanner.intermediateQuery.trim() &&
        viaTimeRaw &&
        intermediateDepartureTimeForApi &&
        intermediateDepartureTimeForApi <= departureTimeForApi
      ) {
        throw new Error("Via departure must be after the first departure.");
      }

      const comfortPresetId = optionalComfortPresetUuid(
        effectivePlanner.namedComfortSettingId,
      );

      const payload: JourneyPlanRequest = {
        journey: {
          userId: user.userId.trim(),
          originQuery:
            effectivePlanner.originApiQuery.trim() ||
            effectivePlanner.originQuery.trim(),
          destinationQuery:
            effectivePlanner.destinationApiQuery.trim() ||
            effectivePlanner.destinationQuery.trim(),
          originLatitude: effectivePlanner.originLatitude,
          originLongitude: effectivePlanner.originLongitude,
          destinationLatitude: effectivePlanner.destinationLatitude,
          destinationLongitude: effectivePlanner.destinationLongitude,
          source: effectivePlanner.source,
          departureTime: departureTimeForApi,
          ecoModeEnabled: effectivePlanner.ecoModeEnabled,
          wheelchairAccessible: effectivePlanner.wheelchairAccessible,
          intermediateQuery: effectivePlanner.intermediateQuery.trim() || undefined,
          intermediateDepartureTime: intermediateDepartureTimeForApi,
        },
        preferences: {
          comfortMode: Boolean(comfortPresetId),
          namedComfortSettingId: comfortPresetId,
        },
      };

      let requestPayload: JourneyPlanRequest = payload;
      let attemptedTaskOptimization = false;
      let fallbackUsed = false;
      if (effectivePlanner.includeTaskOptimization && googleLinked) {
        const taskDetails = await googleTasksApi.getTasksForJourney(user.userId, token);
        if (taskDetails.length) {
          attemptedTaskOptimization = true;
          requestPayload = {
            ...payload,
            journey: {
              ...payload.journey,
              taskDetails,
            },
          };
        }
      }

      const journeys = await journeysApi.plan(requestPayload, token);
      if (!journeys.length && attemptedTaskOptimization) {
        fallbackUsed = true;
        return {
          journeys: await journeysApi.plan(payload, token),
          fallbackUsed,
          taskOptimizationAttempted: attemptedTaskOptimization,
        };
      }
      return {
        journeys,
        fallbackUsed,
        taskOptimizationAttempted: attemptedTaskOptimization,
      };
    },
    onSuccess: ({ journeys, fallbackUsed, taskOptimizationAttempted }) => {
      if (isExploreRestaurantDeeplink && journeys.length) {
        const selected = journeys[0];
        setCurrentJourney(selected);
        setResults([]);
        setDisruptionMode(null);
        setJourneyMessage("Itinéraire vers le restaurant prêt sur la carte.");
        toast({
          title: "Itinéraire prêt",
          description: "La première option a été affichée automatiquement sur la carte.",
          variant: "success",
        });
        requestAnimationFrame(() => {
          liveJourneyMapRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
        return;
      }

      setCurrentJourney(null);
      setResults(journeys);
      setDisruptionMode(null);
      setJourneyMessage(
        journeys.length
          ? fallbackUsed
            ? `No suitable errand stop was found, so we loaded ${journeys.length} direct trip option${journeys.length > 1 ? "s" : ""} instead.`
            : `${journeys.length} trip option${journeys.length > 1 ? "s" : ""} ready to review.`
          : taskOptimizationAttempted
            ? "No route matched these constraints, even after retrying without errand stops."
            : "No trip matched these details.",
      );
      if (!journeys.length) {
        toast({
          title: "No trip found",
          description: "Try a nearby station, a different time, or fewer constraints.",
          variant: "error",
        });
      } else if (fallbackUsed) {
        toast({
          title: "Errand stop skipped",
          description: "We could not fit a task stop into this route, so standard trip options are shown instead.",
          variant: "success",
        });
      }
    },
    onError: (error) => {
      setJourneyMessage(null);
      toast({
        title: "Planning failed",
        description:
          error instanceof Error
            ? error.message
            : "The backend could not plan this journey.",
        variant: "error",
      });
    },
  });

  const startJourney = useMutation({
    mutationFn: async (journey: JourneyResponse) => {
      const started = await journeysApi.start(journey.journeyId, token!);
      return {
        ...started,
        includedTasks: journey.includedTasks,
      };
    },
    onSuccess: (journey) => {
      setCurrentJourney(journey);
      setResults([]);
      setJourneyMessage("Your live journey is now being tracked above.");
      toast({
        title: "Journey started",
        description: "You can now complete it, cancel it, or report a disruption.",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Start failed",
        description:
          error instanceof Error ? error.message : "Could not start the journey.",
        variant: "error",
      });
    },
  });

  const completeJourney = useMutation({
    mutationFn: async (journey: JourneyResponse) => {
      const completed = await journeysApi.complete(journey.journeyId, token!);
      await completeIncludedGoogleTasks(journey, user!.userId, token!);
      return completed;
    },
    onSuccess: (journey) => {
      setCurrentJourney(null);
      setDisruptionMode(null);
      setJourneyMessage(
        `${journey.originLabel} to ${journey.destinationLabel} completed successfully.`,
      );
      toast({
        title: "Journey completed",
        description:
          journey.newBadges.length > 0
            ? `${journey.newBadges.length} new badge(s) unlocked.`
            : "Nice work. Your progress has been saved.",
        variant: "success",
      });
      void queryClient.invalidateQueries({ queryKey: ["eco-dashboard"] });
    },
    onError: (error) => {
      toast({
        title: "Completion failed",
        description:
          error instanceof Error ? error.message : "Could not complete the journey.",
        variant: "error",
      });
    },
  });

  const cancelJourney = useMutation({
    mutationFn: (journeyId: string) => journeysApi.cancel(journeyId, token!),
    onSuccess: (journey) => {
      setCurrentJourney(null);
      setDisruptionMode(null);
      setJourneyMessage(
        `${journey.originLabel} to ${journey.destinationLabel} was cancelled.`,
      );
      toast({
        title: "Journey cancelled",
        description: "You can plan a new trip whenever you are ready.",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Cancellation failed",
        description:
          error instanceof Error ? error.message : "Could not cancel the journey.",
        variant: "error",
      });
    },
  });

  const reportLineDisruption = useMutation({
    mutationFn: (lineCode: string) =>
      journeysApi.reportLineDisruption(currentJourney!.journeyId, lineCode, token!),
    onSuccess: (result) => {
      setCurrentJourney(null);
      setResults(result.alternatives);
      setDisruptionMode(null);
      setJourneyMessage(
        result.alternatives.length
          ? `We found new route options after the ${result.disruptionType.toLowerCase()} disruption.`
          : "The disruption was recorded, but no good alternative was available right now.",
      );
      toast({
        title: "Disruption reported",
        description:
          result.alternatives.length > 0
            ? "Review the new route options below."
            : "Stay put for now or plan a fresh trip manually.",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Disruption report failed",
        description:
          error instanceof Error ? error.message : "Could not report the disruption.",
        variant: "error",
      });
    },
  });

  const reportStopDisruption = useMutation({
    mutationFn: (stopPointId: string) =>
      journeysApi.reportStationDisruption(
        currentJourney!.journeyId,
        stopPointId,
        token!,
      ),
    onSuccess: (result) => {
      setCurrentJourney(null);
      setResults(result.alternatives);
      setDisruptionMode(null);
      setJourneyMessage(
        result.alternatives.length
          ? "We found new route options after the station issue."
          : "The station issue was recorded, but no alternative route was available.",
      );
      toast({
        title: "Station disruption reported",
        description:
          result.alternatives.length > 0
            ? "A revised route is ready to review."
            : "Try adjusting the trip details or checking again shortly.",
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Disruption report failed",
        description:
          error instanceof Error ? error.message : "Could not report the disruption.",
        variant: "error",
      });
    },
  });

  const currentProgress = currentJourney
    ? formatProgress(
        currentJourney.actualDeparture || currentJourney.plannedDeparture,
        currentJourney.plannedArrival,
      )
    : 0;

  const suggestions = useMemo(
    () => (suggestionsQuery.data ?? []).filter((task) => task.locationQuery),
    [suggestionsQuery.data],
  );
  /** Coordonnées des `includedTasks[].locationQuery` (forward geocode, fallback si le
   *  backend ne renvoie pas `locationLat/Lng`). Doit être déclaré avant `resolvedJourneyTasks`
   *  qui le consomme. */
  const [includedTaskCoords, setIncludedTaskCoords] = useState<
    Record<string, [number, number]>
  >({});

  const includedTasksGeoKey = currentJourney
    ? `${currentJourney.journeyId}:${currentJourney.includedTasks
        .map((t) => `${includedTaskKey(t)}=${(t.locationQuery ?? "").trim()}`)
        .join(";")}`
    : "";

  useEffect(() => {
    if (!currentJourney || !mapboxToken) {
      setIncludedTaskCoords({});
      return;
    }
    const targets = currentJourney.includedTasks.filter(
      (t) =>
        (t.locationQuery ?? "").trim().length > 0 &&
        (t.locationLat == null || t.locationLng == null),
    );
    if (!targets.length) {
      setIncludedTaskCoords({});
      return;
    }

    const controller = new AbortController();
    setIncludedTaskCoords({});

    void (async () => {
      const acc: Record<string, [number, number]> = {};
      for (const t of targets) {
        if (controller.signal.aborted) break;
        const coords = await forwardGeocodeMapbox(
          t.locationQuery!,
          mapboxToken,
          controller.signal,
        );
        if (coords) {
          acc[includedTaskKey(t)] = coords;
        }
      }
      if (!controller.signal.aborted) {
        setIncludedTaskCoords(acc);
      }
    })();

    return () => controller.abort();
  }, [currentJourney, includedTasksGeoKey, mapboxToken]);

  const resolvedJourneyTasks = useMemo(
    () =>
      currentJourney
        ? resolveJourneyTasks(currentJourney, includedTaskCoords, {
            includeWithoutCoords: true,
          })
        : [],
    [currentJourney, includedTaskCoords],
  );

  /**
   * Contexte géographique (segIdx + ancres piétonnes) de chaque tâche waypoint,
   * indexé par `task.id`. Source unique pour `buildTaskWalkingSegments`, le
   * `useEffect` qui interroge Mapbox Directions, et la clef de cache qui évite
   * les refetch inutiles.
   */
  const includedTaskAnchors = useMemo<Record<string, IncludedTaskWaypointAnchors>>(
    () => {
      if (!currentJourney) return {};
      const out: Record<string, IncludedTaskWaypointAnchors> = {};
      for (const task of resolvedJourneyTasks) {
        const ctx = getIncludedTaskWaypointAnchors(currentJourney, task);
        if (ctx) out[task.id] = ctx;
      }
      return out;
    },
    [currentJourney, resolvedJourneyTasks],
  );

  /**
   * Pour chaque tâche waypoint, deux polylignes piétonnes routées sur les rues
   * (Mapbox Directions). `to` relie la fin du segment précédent aux coords de la
   * tâche, `from` relie les coords de la tâche au début du segment suivant.
   */
  const [taskWalkLegs, setTaskWalkLegs] = useState<TaskWalkLegsByTaskId>({});

  const taskWalkAnchorsKey = useMemo(() => {
    const parts: string[] = [currentJourney?.journeyId ?? ""];
    for (const [id, ctx] of Object.entries(includedTaskAnchors)) {
      parts.push(
        [
          id,
          ctx.coords.join(","),
          ctx.before?.join(",") ?? "-",
          ctx.after?.join(",") ?? "-",
        ].join("|"),
      );
    }
    return parts.join(";");
  }, [currentJourney?.journeyId, includedTaskAnchors]);

  useEffect(() => {
    if (!mapboxToken) {
      setTaskWalkLegs({});
      return;
    }
    const entries = Object.entries(includedTaskAnchors);
    if (!entries.length) {
      setTaskWalkLegs({});
      return;
    }

    const controller = new AbortController();
    setTaskWalkLegs({});

    const fetchLeg = async (
      from: [number, number] | null,
      to: [number, number] | null,
    ): Promise<TaskWalkLeg | undefined> => {
      if (!from || !to) return undefined;
      try {
        const r = await fetchWalkingRoute(from, to, mapboxToken, controller.signal);
        if (controller.signal.aborted || !r.coordinates.length) return undefined;
        return {
          coordinates: r.coordinates,
          distanceMeters: r.distanceMeters,
          durationSeconds: r.durationSeconds,
        };
      } catch {
        // Annulation ou erreur réseau : fallback ligne droite pris en charge
        // par `buildTaskWalkingSegments`.
        return undefined;
      }
    };

    void (async () => {
      const acc: TaskWalkLegsByTaskId = {};
      await Promise.all(
        entries.map(async ([taskId, ctx]) => {
          const [to, from] = await Promise.all([
            fetchLeg(ctx.before, ctx.coords),
            fetchLeg(ctx.coords, ctx.after),
          ]);
          acc[taskId] = { to, from };
        }),
      );
      if (!controller.signal.aborted) {
        setTaskWalkLegs(acc);
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskWalkAnchorsKey, mapboxToken]);

  const liveJourneyMapData = useMemo(() => {
    if (!currentJourney) return null;
    const base = buildMapDataForJourney(currentJourney);
    const tasksWithCoords = resolvedJourneyTasks.filter((t) => t.coordinates);
    const taskWalkSegments = buildTaskWalkingSegments(
      currentJourney,
      tasksWithCoords,
      base.segments,
      includedTaskAnchors,
      taskWalkLegs,
    );
    return {
      segments: [...base.segments, ...taskWalkSegments],
      stops: base.stops,
    };
  }, [currentJourney, resolvedJourneyTasks, includedTaskAnchors, taskWalkLegs]);

  const liveTouristRouteGeometryKey = useMemo(() => {
    if (!liveJourneyMapData?.segments.length) {
      return "";
    }
    return liveJourneyMapData.segments
      .map((segment) => {
        const coords = segment.coordinates;
        const head = coords[0];
        const tail = coords[coords.length - 1];
        return [
          segment.id,
          coords.length,
          head ? `${head[0]},${head[1]}` : "",
          tail ? `${tail[0]},${tail[1]}` : "",
        ].join(":");
      })
      .join("|");
  }, [liveJourneyMapData]);

  const liveJourneyMapDataRef = useRef(liveJourneyMapData);
  liveJourneyMapDataRef.current = liveJourneyMapData;

  const [taskGeocodedAddresses, setTaskGeocodedAddresses] = useState<
    Record<string, string>
  >({});

  const journeyTaskGeoKey = currentJourney
    ? `${currentJourney.journeyId}:${currentJourney.tasksOnRoute
        .map((t) =>
          [
            t.taskId,
            t.locationLat ?? "",
            t.locationLng ?? "",
            includedLocationQueryForTask(currentJourney, t) ?? "",
          ].join(":"),
        )
        .join(";")}`
    : "";

  useEffect(() => {
    if (!currentJourney || !mapboxToken) {
      setTaskGeocodedAddresses({});
      return;
    }

    const needReverse = currentJourney.tasksOnRoute.filter((t) => {
      if (t.locationLat == null || t.locationLng == null) {
        return false;
      }
      return !includedLocationQueryForTask(currentJourney, t);
    });

    if (!needReverse.length) {
      setTaskGeocodedAddresses({});
      return;
    }

    const controller = new AbortController();
    setTaskGeocodedAddresses({});

    void (async () => {
      const acc: Record<string, string> = {};
      for (const t of needReverse) {
        if (controller.signal.aborted) {
          break;
        }
        const addr = await reverseGeocodeMapbox(
          t.locationLng!,
          t.locationLat!,
          mapboxToken,
          controller.signal,
        );
        if (addr) {
          acc[t.taskId] = addr;
        }
      }
      if (!controller.signal.aborted) {
        setTaskGeocodedAddresses(acc);
      }
    })();

    return () => controller.abort();
  }, [currentJourney, journeyTaskGeoKey, mapboxToken]);

  const liveJourneyTaskMarkers = useMemo((): JourneyTaskMarker[] => {
    if (!currentJourney) {
      return [];
    }
    return resolvedJourneyTasks
      .filter(
        (task): task is ResolvedJourneyTask & { coordinates: [number, number] } =>
          task.coordinates !== null,
      )
      .map((task) => ({
        id: task.id,
        title: task.title,
        coordinates: task.coordinates,
        addressHint: resolveTaskAddressLine(task, taskGeocodedAddresses),
      }));
  }, [currentJourney, resolvedJourneyTasks, taskGeocodedAddresses]);

  useEffect(() => {
    if (!token || !planner.touristModeEnabled || !currentJourney) {
      setRouteTouristSuggestions([]);
      setRouteTouristFetch("idle");
      return;
    }
    const mapData = liveJourneyMapDataRef.current;
    if (!mapData?.segments.length) {
      setRouteTouristSuggestions([]);
      setRouteTouristFetch("idle");
      return;
    }

    const segments = mapData.segments;
    const journeyIdSnapshot = currentJourney.journeyId;
    const cacheKey = routeTouristSuggestionsStorageKey(
      journeyIdSnapshot,
      liveTouristRouteGeometryKey,
    );
    const cachedSuggestions = restoreRouteTouristSuggestions(cacheKey);
    const controller = new AbortController();
    if (cachedSuggestions) {
      setRouteTouristSuggestions(cachedSuggestions);
      setRouteTouristFetch("done");
    } else {
      setRouteTouristFetch("loading");
    }

    void (async () => {
      const fulfilledLists = (
        results: PromiseSettledResult<TourismSuggestion[]>[],
      ): TourismSuggestion[][] =>
        results.flatMap((result) =>
          result.status === "fulfilled" && Array.isArray(result.value)
            ? [result.value]
            : [],
        );

      try {
        const corridorLngLat = concatTransportSegmentPolylines(segments);

        const routeResults = await Promise.allSettled([
          tourismApi.restaurantsAlongJourney(journeyIdSnapshot, token),
          corridorLngLat.length >= 2
            ? tourismApi.restaurantsAlongCorridor(corridorLngLat, token)
            : Promise.resolve([] as TourismSuggestion[]),
        ]);

        if (controller.signal.aborted) {
          return;
        }

        const routeLists = fulfilledLists(routeResults);
        const routeMerged = mergeTourismLists(routeLists);
        const baseLists =
          routeMerged.length > 0 || !cachedSuggestions
            ? routeLists
            : [cachedSuggestions];
        const baseMerged = routeMerged.length > 0 ? routeMerged : (cachedSuggestions ?? []);
        setRouteTouristSuggestions(baseMerged);
        setRouteTouristFetch("done");
        if (routeMerged.length > 0 || !cachedSuggestions) {
          persistRouteTouristSuggestions(cacheKey, routeMerged);
        }

        const userGeo = await readBrowserLocation();
        if (controller.signal.aborted) {
          return;
        }

        let fromNearby: TourismSuggestion[] = [];
        if (
          userGeo &&
          Number.isFinite(userGeo.latitude) &&
          Number.isFinite(userGeo.longitude)
        ) {
          try {
            fromNearby = await tourismApi.nearbyRestaurants(
              {
                latitude: userGeo.latitude,
                longitude: userGeo.longitude,
                radiusMeters: 2500,
                limit: 10,
              },
              token,
            );
          } catch {
            fromNearby = [];
          }
        }

        if (controller.signal.aborted) {
          return;
        }

        const merged = mergeTourismLists([...baseLists, fromNearby]);

        setRouteTouristSuggestions(merged);
        setRouteTouristFetch("done");
        persistRouteTouristSuggestions(cacheKey, merged);
      } catch {
        if (controller.signal.aborted) {
          return;
        }
        if (cachedSuggestions) {
          setRouteTouristSuggestions(cachedSuggestions);
          setRouteTouristFetch("done");
          return;
        }
        setRouteTouristSuggestions([]);
        setRouteTouristFetch("error");
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, planner.touristModeEnabled, currentJourney?.journeyId, liveTouristRouteGeometryKey]);

  const liveTouristMapMarkers = useMemo((): TouristMapRestaurant[] => {
    if (!planner.touristModeEnabled || !routeTouristSuggestions.length) {
      return [];
    }
    const picked = pickRestaurantsForMap(routeTouristSuggestions);
    return picked.flatMap((s): TouristMapRestaurant[] => {
      if (s.latitude == null || s.longitude == null) {
        return [];
      }
      return [
        {
          id: suggestionStableKey(s),
          name: s.name,
          coordinates: [s.longitude, s.latitude],
          rating: s.rating,
          address: s.address,
          websiteUrl: s.websiteUrl,
        },
      ];
    });
  }, [planner.touristModeEnabled, routeTouristSuggestions]);

  const liveJourneyRouteTasksSummary = useMemo(() => {
    if (!currentJourney) {
      return null;
    }
    const onRoute = currentJourney.tasksOnRoute;
    if (!onRoute.length) {
      return null;
    }
    const withoutGeo = onRoute.filter(
      (t) => t.locationLat == null || t.locationLng == null,
    );
    return {
      onRoute,
      withoutGeo,
      includedInPlanCount: currentJourney.includedTasks.length,
    };
  }, [currentJourney]);

  const plannerIssues = useMemo(() => {
    const issues: string[] = [];

    if (!planner.originQuery.trim()) {
      issues.push("Add a departure point.");
    }
    if (!planner.destinationQuery.trim()) {
      issues.push("Add a destination.");
    }
    if (!planner.departureTime) {
      issues.push("Choose a departure time.");
    }
    if (
      planner.intermediateQuery &&
      planner.intermediateDepartureTime &&
      planner.intermediateDepartureTime <= planner.departureTime
    ) {
      issues.push("Your stopover departure must be later than the first departure.");
    }

    return issues;
  }, [planner]);

  const plannerNotices = useMemo(() => {
    const notices: string[] = [];

    if (planner.intermediateQuery && !planner.intermediateDepartureTime) {
      notices.push("Add a stopover departure time if you want the planner to respect that stop precisely.");
    }
    if (planner.includeTaskOptimization && !googleLinked) {
      notices.push("Connect Google Tasks to include errands in route planning.");
    }
    if (planner.touristModeEnabled) {
      notices.push(
        `Mode touriste : jusqu’à ${MAP_RESTAURANT_MAX_VISIBLE} restaurants sur la carte (note ≥ ${MAP_RESTAURANT_MIN_RATING}), choisis au hasard parmi les propositions géolocalisées ; après « Start journey », le serveur peut combiner trajet, corridor carte et géolocalisation (Yelp si clé configurée).`,
      );
    }

    return notices;
  }, [googleLinked, planner]);

  const homeAddressSuggestion = useMemo(() => {
    const homeAddress = user?.homeAddress?.trim();
    const originQuery = planner.originQuery.trim().toLowerCase();

    if (!homeAddress) {
      return null;
    }

    if (!originQuery) {
      return homeAddress;
    }

    if (homeAddress.toLowerCase().includes(originQuery) && homeAddress !== planner.originQuery.trim()) {
      return homeAddress;
    }

    return null;
  }, [planner.originQuery, user?.homeAddress]);

  function updatePlanner<K extends keyof PlannerState>(key: K, value: PlannerState[K]) {
    setPlanner((current) => ({
      ...current,
      [key]: value,
      ...(key === "originQuery"
        ? {
            originApiQuery: "",
            originLatitude: null,
            originLongitude: null,
            source: null,
          }
        : {}),
      ...(key === "destinationQuery"
        ? {
            destinationApiQuery: "",
            destinationLatitude: null,
            destinationLongitude: null,
            source: null,
          }
        : {}),
    }));
  }

  function selectSuggestion(locationQuery: string) {
    if (!locationQuery) {
      return;
    }
    if (!user?.homeAddress) {
      toast({
        title: "Home address missing",
        description: "Save a home address first so suggestions can prefill the planner.",
        variant: "error",
      });
      return;
    }

    setPlanner((current) => ({
      ...current,
      originQuery: user.homeAddress ?? "",
      destinationQuery: locationQuery,
      originApiQuery: "",
      destinationApiQuery: "",
      originLatitude: null,
      originLongitude: null,
      destinationLatitude: null,
      destinationLongitude: null,
      source: null,
      departureTime: getTomorrowLocalDateTimeValue(),
    }));
    toast({
      title: "Planner prefilled",
      description: "Tomorrow's suggestion has been added to the planner.",
      variant: "success",
    });
  }

  const resolveAddressFromCoordinates = useCallback(
    async (coordinates: [number, number]) => {
      const [longitude, latitude] = coordinates;
      let resolvedAddress = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      if (!mapboxToken) {
        return resolvedAddress;
      }

      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?language=fr&types=address,poi,place&limit=1&access_token=${encodeURIComponent(mapboxToken)}`,
      );
      if (!response.ok) {
        return resolvedAddress;
      }

      const data = (await response.json()) as {
        features?: Array<{ place_name?: string }>;
      };
      const placeName = data.features?.[0]?.place_name?.trim();
      if (placeName) {
        resolvedAddress = placeName;
      }
      return resolvedAddress;
    },
    [mapboxToken],
  );

  const handleCurrentLocationAsOrigin = useCallback(async () => {
    if (!navigator.geolocation) {
      toast({
        title: "Geolocation unavailable",
        description: "Your browser does not support geolocation.",
        variant: "error",
      });
      return;
    }

    setIsResolvingCurrentLocation(true);
    setShowOriginSuggestion(false);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12_000,
          maximumAge: 0,
        });
      });

      const nextOrigin = await resolveAddressFromCoordinates([
        position.coords.longitude,
        position.coords.latitude,
      ]);

      setPlanner((current) => ({
        ...current,
        originQuery: nextOrigin,
      }));
      toast({
        title: "Origin updated",
        description: "Your current location was added to From.",
        variant: "success",
      });
    } catch {
      toast({
        title: "Location failed",
        description: "Could not resolve your current location.",
        variant: "error",
      });
    } finally {
      setIsResolvingCurrentLocation(false);
    }
  }, [resolveAddressFromCoordinates, toast]);

  const handleRerouteFromCurrentLocation = useCallback(
    async (coordinates: [number, number]) => {
      setIsReroutingFromLocation(true);
      try {
        const originQuery = await resolveAddressFromCoordinates(coordinates);
        const destinationQuery =
          currentJourney?.destinationLabel || planner.destinationQuery;
        const departureTime = getLocalDateTimeInputValue();

        const overrides: Partial<PlannerState> = {
          originQuery,
          destinationQuery,
          departureTime,
          intermediateQuery: "",
          intermediateDepartureTime: "",
        };

        setPlanner((current) => ({
          ...current,
          ...overrides,
        }));
        setJourneyMessage("Recalcul de l'itineraire depuis votre position...");
        setCurrentJourney(null);
        setDisruptionMode(null);
        planJourney.mutate(overrides);
      } finally {
        setIsReroutingFromLocation(false);
      }
    },
    [
      currentJourney?.destinationLabel,
      planner.destinationQuery,
      planJourney,
      resolveAddressFromCoordinates,
    ],
  );

  useEffect(() => {
    if (!user?.userId || !token) {
      return;
    }

    if (!isExploreRestaurantDeeplink) {
      exploreRestaurantDeeplinkProcessedKeyRef.current = "";
      return;
    }

    if (
      exploreRestaurantDeeplinkProcessedKeyRef.current === exploreRestaurantSearchKey
    ) {
      return;
    }

    const consumeKey = () => {
      exploreRestaurantDeeplinkProcessedKeyRef.current = exploreRestaurantSearchKey;
    };

    const parsed = parseExploreRestaurantPlannerSearchParams(searchParams);

    if (!parsed.ok) {
      consumeKey();
      toast({
        title:
          parsed.error === "missing_destination" ? "Lien incomplet" : "Départ manquant",
        description:
          parsed.error === "missing_destination"
            ? "Le lien depuis Explore ne contient pas de destination (restaurant)."
            : "Relancez une recherche depuis Explore avec une adresse ou votre position, puis rouvrez la carte.",
        variant: "error",
      });
      return;
    }

    const { overrides } = parsed;

    consumeKey();

    persistActiveJourney(null);
    setCurrentJourney(null);
    setResults([]);
    setDisruptionMode(null);
    setRouteTouristSuggestions([]);
    setRouteTouristFetch("idle");
    setJourneyMapFlyTo(null);

    setPlanner((current) => ({
      ...current,
      ...overrides,
    }));

    setJourneyMessage("Depuis Explore : calcul automatique de l'itinéraire en cours...");

    toast({
      title: "Calcul lancé",
      description:
        "Départ et arrivée sont remplis depuis Explore, le trajet est en cours de calcul.",
      variant: "success",
    });

    planJourney.mutate(overrides);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- planJourney/toast non stables
  }, [
    exploreRestaurantSearchKey,
    isExploreRestaurantDeeplink,
    token,
    user?.userId,
  ]);

  if (!user || !token) {
    return null;
  }

  return (
    <div className="grid gap-6">
      <section className="hidden gap-6 xl:grid xl:grid-cols-[410px_minmax(0,1fr)]">
        <Card className="rounded-4xl xl:sticky xl:top-28 xl:max-h-[calc(100vh-8rem)] xl:overflow-auto">
          {currentJourney ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="success">Live journey</Badge>
                <Badge variant="muted">{currentJourney.status}</Badge>
              </div>
              <h1 className="mt-5 text-2xl font-bold tracking-tight text-foreground">
                Journey in progress
              </h1>
              <p className="mt-3 text-sm leading-6 text-secondary">
                {currentJourney.originLabel} to {currentJourney.destinationLabel}
              </p>
              <div className="mt-6 rounded-full bg-surface-strong border border-line p-2">
                <div
                  className="h-3 rounded-full bg-brand transition-[width]"
                  style={{ width: `${currentProgress}%` }}
                />
              </div>
              <p className="mt-2 text-xs font-bold uppercase tracking-[0.24em] text-secondary font-mono">
                Progress {currentProgress}%
              </p>
              {currentJourney.segments.length ? (
                <div className="mt-6">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">
                    Itinerary
                  </p>
                  <p className="mt-1 text-xs text-secondary">
                    Cliquez un arrêt ou une tâche géolocalisée pour centrer la carte.
                  </p>
                  <div className="mt-3">
                    <JourneySegmentsPanel
                      journey={currentJourney}
                      resolvedTasks={resolvedJourneyTasks}
                      taskWalkLegs={taskWalkLegs}
                      taskGeocodedAddresses={taskGeocodedAddresses}
                      onFocusOnMap={handleJourneyStopFocusOnMap}
                    />
                  </div>
                </div>
              ) : null}
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Button
                  onClick={() => completeJourney.mutate(currentJourney)}
                  disabled={completeJourney.isPending}
                >
                  Complete
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => cancelJourney.mutate(currentJourney.journeyId)}
                  disabled={cancelJourney.isPending}
                >
                  Cancel
                </Button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Button
                  variant="ghost"
                  onClick={() =>
                    setDisruptionMode((current) =>
                      current === "line" ? null : "line",
                    )
                  }
                >
                  Line issue
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    setDisruptionMode((current) =>
                      current === "station" ? null : "station",
                    )
                  }
                >
                  Station issue
                </Button>
              </div>
              <div className="mt-4 rounded-2xl border border-line bg-surface-strong p-4">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-secondary">
                  Disruption Support
                </p>
                <h2 className="mt-2 text-lg font-bold text-foreground">
                  {disruptionMode === "line"
                    ? "Choose the affected line"
                    : disruptionMode === "station"
                      ? "Choose the affected station"
                      : "Report an issue if this trip changes"}
                </h2>

                {disruptionMode === "line" ? (
                  <div className="mt-4 grid gap-3">
                    {linesQuery.isLoading ? (
                      <StatePanel
                        title="Loading journey lines"
                        description="Choose the affected line as soon as this list is ready."
                      />
                    ) : linesQuery.data?.length ? (
                      linesQuery.data.map((line: LineInfo) => (
                        <button
                          key={`${line.lineCode}-${line.mode}`}
                          type="button"
                          onClick={() => reportLineDisruption.mutate(line.lineCode)}
                          disabled={reportLineDisruption.isPending}
                          className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-3 text-left transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className="h-4 w-4 shrink-0 rounded-full"
                              style={{
                                backgroundColor: line.lineColor
                                  ? `#${line.lineColor}`
                                  : "#0c7c59",
                              }}
                            />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-foreground">
                                {line.lineCode || "Unknown line"}
                              </p>
                              <p className="truncate text-xs text-secondary">
                                {line.lineName}
                              </p>
                            </div>
                          </div>
                          <span className="ml-3 shrink-0 text-xs font-semibold text-secondary font-mono">
                            {line.mode}
                          </span>
                        </button>
                      ))
                    ) : (
                      <StatePanel
                        title="No line can be reported here"
                        description="This journey does not expose a supported line for disruption reporting."
                      />
                    )}
                  </div>
                ) : disruptionMode === "station" ? (
                  <div className="mt-4 grid gap-3">
                    {stopsQuery.isLoading ? (
                      <StatePanel
                        title="Loading journey stops"
                        description="Choose the affected stop as soon as this list is ready."
                      />
                    ) : stopsQuery.data?.length ? (
                      stopsQuery.data.map((stop: StopInfo) => (
                        <button
                          key={`${stop.stopPointId}-${stop.sequenceInJourney}`}
                          type="button"
                          onClick={() => reportStopDisruption.mutate(stop.stopPointId)}
                          disabled={reportStopDisruption.isPending}
                          className="rounded-xl border border-line bg-surface px-3 py-3 text-left transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <p className="truncate font-semibold text-foreground">
                            {stop.name}
                          </p>
                          <p className="mt-1 text-xs text-secondary">
                            Step {stop.sequenceInJourney + 1}
                            {stop.onLineCode ? ` · Line ${stop.onLineCode}` : ""}
                          </p>
                        </button>
                      ))
                    ) : (
                      <StatePanel
                        title="No stop can be reported here"
                        description="This journey does not expose a supported stop for disruption reporting."
                      />
                    )}
                  </div>
                ) : (
                  <StatePanel
                    className="mt-4"
                    title="Ready to report a change"
                    description="Choose Line issue or Station issue, then pick the affected item."
                  />
                )}
              </div>
            </>
          ) : (
            <>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="accent">Journey Planner</Badge>
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-surface-strong p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-secondary">
                  Google Tasks
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {googleLinked ? "Connected for route planning" : "Not connected"}
                </p>
                <p className="mt-1 text-xs leading-5 text-secondary">
                  {googleLinked
                    ? "Tasks can be included when they improve the route."
                    : "Connect Tasks to include errands in journeys."}
                </p>
              </div>
              <Link
                href="/tasks"
                className="inline-flex h-9 min-w-[76px] items-center justify-center rounded-full border border-line bg-background px-3 text-xs font-bold text-foreground"
              >
                {googleLinked ? "Manage" : "Connect"}
              </Link>
            </div>
          </div>
          <div className="mt-3 rounded-2xl border border-line bg-surface-strong p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-secondary">
                  Smart Suggestions
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  Tomorrow&apos;s likely trips
                </p>
                <p className="mt-1 text-xs leading-5 text-secondary">
                  Open task-based trip ideas and prefill the planner.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSuggestionsOpen(true)}
                className="inline-flex h-9 min-w-[76px] items-center justify-center rounded-full border border-line bg-background px-3 text-xs font-bold text-foreground"
              >
                Open
              </button>
            </div>
          </div>

          <h1 className="mt-5 text-2xl font-bold tracking-tight text-foreground">
            Plan the next trip
          </h1>
          <p className="mt-3 text-sm leading-6 text-secondary">
            Set a route, add optional preferences, then follow the live map.
          </p>

          <div className="mt-7 grid gap-5">
            <section className="grid gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">
                  Route
                </p>
                <p className="mt-1 text-xs text-secondary">Required trip details.</p>
              </div>
              <div className="grid gap-4">
                <div className="relative">
                  <Input
                    label="From"
                    value={planner.originQuery}
                    onChange={(event) => updatePlanner("originQuery", event.target.value)}
                    onFocus={() => setShowOriginSuggestion(true)}
                    onBlur={() => {
                      window.setTimeout(() => setShowOriginSuggestion(false), 120);
                    }}
                    placeholder="Gare de Lyon"
                    hint="Type an exact address or use your current location."
                    autoComplete="off"
                  />
                  {showOriginSuggestion ? (
                    <div className="absolute left-0 right-0 top-full z-20 mt-2 grid gap-2 rounded-2xl border border-line bg-surface p-2 text-left shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                      <button
                        type="button"
                        disabled={isResolvingCurrentLocation}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          void handleCurrentLocationAsOrigin();
                        }}
                        className="flex items-start justify-between rounded-xl px-3 py-2.5 transition hover:bg-surface-strong disabled:opacity-60"
                      >
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.22em] text-secondary">
                            Ma localisation
                          </p>
                          <p className="mt-1 text-sm font-medium text-foreground">
                            {isResolvingCurrentLocation
                              ? "Recuperation en cours..."
                              : "Utiliser ma position actuelle"}
                          </p>
                        </div>
                      </button>

                      {homeAddressSuggestion ? (
                        <button
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            updatePlanner("originQuery", homeAddressSuggestion);
                            setShowOriginSuggestion(false);
                          }}
                          className="flex items-start justify-between rounded-xl px-3 py-2.5 transition hover:bg-surface-strong"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold uppercase tracking-[0.22em] text-secondary">
                              Home
                            </p>
                            <p className="mt-1 truncate text-sm font-medium text-foreground">
                              {homeAddressSuggestion}
                            </p>
                          </div>
                          <span className="ml-4 text-xs uppercase tracking-[0.18em] text-secondary">
                            Use
                          </span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <Input
                  label="To"
                  value={planner.destinationQuery}
                  onChange={(event) =>
                    updatePlanner("destinationQuery", event.target.value)
                  }
                  placeholder="Chatelet"
                  hint="Destination address or station name."
                  autoComplete="off"
                />
                <Input
                  label="Departure"
                  type="datetime-local"
                  value={planner.departureTime}
                  onChange={(event) => updatePlanner("departureTime", event.target.value)}
                />
              </div>
            </section>

            <section className="grid gap-4 border-t border-line pt-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">
                  Optional stop
                </p>
                <p className="mt-1 text-xs text-secondary">
                  Add this only when you need a stopover.
                </p>
              </div>
              <div className="grid gap-4">
                <Input
                  label="Via stop"
                  value={planner.intermediateQuery}
                  onChange={(event) =>
                    updatePlanner("intermediateQuery", event.target.value)
                  }
                  placeholder="Optional stopover"
                />
                <Input
                  label="Via departure"
                  type="datetime-local"
                  value={planner.intermediateDepartureTime}
                  onChange={(event) =>
                    updatePlanner("intermediateDepartureTime", event.target.value)
                  }
                  hint="Only used when a via stop is set."
                />
              </div>
            </section>

            <section className="grid gap-4 border-t border-line pt-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">
                  Preferences
                </p>
                <p className="mt-1 text-xs text-secondary">
                  Turn on only what matters for this trip.
                </p>
              </div>
              <label className="grid gap-2 self-start text-sm font-medium text-secondary">
                <span>Comfort preset</span>
                <select
                  value={planner.namedComfortSettingId}
                  onChange={(event) =>
                    updatePlanner("namedComfortSettingId", event.target.value)
                  }
                  className="w-full appearance-none rounded-lg border border-line bg-surface-strong px-4 py-3 text-sm text-foreground font-mono outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
                >
                  <option value="">No preset</option>
                  {(comfortSettingsQuery.data ?? []).map((setting) => (
                    <option key={setting.id} value={setting.id}>
                      {setting.name}
                    </option>
                  ))}
                </select>
                {(comfortSettingsQuery.data?.length ?? 0) === 0 ? (
                  <span className="text-xs text-secondary">
                    Create presets from your profile menu in the top bar.
                  </span>
                ) : null}
              </label>
              <div className="grid gap-2 text-sm">
                <ToggleSwitch
                  checked={planner.ecoModeEnabled}
                  onChange={(checked) => updatePlanner("ecoModeEnabled", checked)}
                  label="Eco mode"
                  description="Prefer greener options."
                />
                <ToggleSwitch
                  checked={planner.wheelchairAccessible}
                  onChange={(checked) => updatePlanner("wheelchairAccessible", checked)}
                  label="Wheelchair access"
                  description="Prioritize accessible routes."
                />
                <ToggleSwitch
                  checked={planner.includeTaskOptimization}
                  onChange={(checked) =>
                    updatePlanner("includeTaskOptimization", checked)
                  }
                  label="Google Tasks stops"
                  description="Include useful errands when possible."
                />
                <ToggleSwitch
                  checked={planner.touristModeEnabled}
                  onChange={(checked) => updatePlanner("touristModeEnabled", checked)}
                  label="Tourist mode"
                  description="Show restaurants along the route."
                />
              </div>
            </section>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Button
              onClick={() => planJourney.mutate(undefined)}
              disabled={planJourney.isPending || plannerIssues.length > 0}
            >
              {planJourney.isPending ? "Planning..." : "Plan journey"}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                setPlanner((current) => ({
                  ...current,
                  departureTime: getLocalDateTimeInputValue(),
                }))
              }
            >
              Reset departure
            </Button>
          </div>

          {journeyMessage ? (
            <StatePanel
              className="mt-6"
              eyebrow="Planner update"
              title={journeyMessage}
            />
          ) : null}

          {plannerIssues.length ? (
            <StatePanel
              className="mt-4"
              eyebrow="Need to fix"
              title="Your trip details need a quick adjustment"
              description={plannerIssues.join(" ")}
              tone="danger"
            />
          ) : null}

          {plannerNotices.length ? (
            <StatePanel
              className="mt-4"
              eyebrow="Helpful note"
              title="A small change could improve this trip"
              description={plannerNotices.join(" ")}
              tone="success"
            />
          ) : null}
            </>
          )}
        </Card>

        <Card className="relative min-h-[680px] overflow-hidden rounded-4xl p-0">
          <div ref={liveJourneyMapRef} className="h-full min-h-[680px]">
            {currentJourney && liveJourneyMapData && liveJourneyMapData.segments.length ? (
              <TransportMap
                mapboxToken={mapboxToken}
                stops={liveJourneyMapData.stops}
                segments={liveJourneyMapData.segments}
                arrivalAddressQuery={currentJourney.destinationLabel}
                tasks={liveJourneyTaskMarkers}
                touristRestaurants={
                  planner.touristModeEnabled ? liveTouristMapMarkers : null
                }
                onRequestReroute={handleRerouteFromCurrentLocation}
                isRerouting={isReroutingFromLocation}
                flyToRequest={journeyMapFlyTo}
              />
            ) : (
              <div className="flex min-h-[680px] items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(0,155,72,0.14),transparent_38%)] px-6">
                <StatePanel
                  className="max-w-xl"
                  eyebrow="Map ready"
                  title="Plan and start a journey to see the live route"
                  description="The live map will show transport segments, stops, your position, tasks, tourist restaurants and rerouting controls once a journey is active."
                />
              </div>
            )}
          </div>
        </Card>
      </section>

      {suggestionsOpen ? (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close suggestions"
            onClick={() => setSuggestionsOpen(false)}
          />
          <aside className="absolute bottom-0 right-0 top-auto max-h-[86vh] w-full overflow-auto rounded-t-[2rem] border border-line bg-surface p-5 shadow-[0_20px_70px_rgba(0,0,0,0.42)] sm:bottom-5 sm:right-5 sm:top-5 sm:max-h-none sm:max-w-md sm:rounded-[2rem]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-secondary">
                  Smart Suggestions
                </p>
                <h2 className="mt-2 text-2xl font-bold text-foreground">
                  Tomorrow&apos;s likely trips
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSuggestionsOpen(false)}
                className="rounded-full border border-line bg-surface-strong px-3 py-2 text-sm font-bold text-foreground"
              >
                Close
              </button>
            </div>
            <Badge variant="accent" className="mt-4">
              {formatTaskDateOnly(getTomorrowDateString())}
            </Badge>

            <div className="mt-5 grid gap-3">
              {!googleLinked ? (
                <StatePanel
                  title="Connect Google Tasks to unlock suggestions"
                  description="When your Google account is linked, tomorrow's likely trips will appear here."
                  tone="warning"
                />
              ) : suggestionsQuery.isLoading ? (
                <StatePanel
                  eyebrow="Loading"
                  title="Looking ahead to tomorrow"
                  description="We're checking your upcoming tasks for trip ideas."
                />
              ) : suggestions.length ? (
                suggestions.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-xl border border-line bg-surface-strong p-4"
                  >
                    <p className="font-semibold text-foreground">
                      {task.title || "Untitled task"}
                    </p>
                    <p className="mt-1 text-sm text-secondary">
                      #{task.locationQuery}
                    </p>
                    <div className="mt-3 flex gap-3">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          selectSuggestion(task.locationQuery || "");
                          setSuggestionsOpen(false);
                        }}
                      >
                        Prefill planner
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <StatePanel
                  title="No suggested trip for tomorrow yet"
                  description="As soon as tomorrow's tasks contain useful route details, they'll appear here."
                />
              )}
            </div>
          </aside>
        </div>
      ) : null}

      <section className="grid gap-6 xl:hidden">
        <Card className="rounded-4xl">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="accent">Journey Planner</Badge>
            <Badge
              variant={googleLinked ? "success" : "muted"}
              className="hidden sm:inline-flex"
            >
              {googleLinked ? "Task-aware planning ready" : "Task sync optional"}
            </Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:hidden">
            <div className="rounded-2xl border border-line bg-surface-strong p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-secondary">
                    Google Tasks
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {googleLinked ? "Connected for route planning" : "Not connected"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-secondary">
                    {googleLinked
                      ? "Tasks can be included when they improve the route."
                      : "Connect Tasks from the Tasks page to include errands in journeys."}
                  </p>
                </div>
                <Link
                  href="/tasks"
                  className="rounded-full border border-line bg-background px-3 py-2 text-xs font-bold text-foreground"
                >
                  {googleLinked ? "Manage" : "Connect"}
                </Link>
              </div>
            </div>
          </div>
          <h1 className="mt-5 page-title">Plan the next trip</h1>
          <p className="mt-4 page-copy">
            Set the route, apply one saved comfort preset, and keep errands in
            the mix only when they actually help.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="relative">
              <Input
                label="From"
                value={planner.originQuery}
                onChange={(event) => updatePlanner("originQuery", event.target.value)}
                onFocus={() => setShowOriginSuggestion(true)}
                onBlur={() => {
                  window.setTimeout(() => setShowOriginSuggestion(false), 120);
                }}
                placeholder="Gare de Lyon"
                hint="Type an exact address or use your current location."
                autoComplete="off"
              />
              {showOriginSuggestion ? (
                <div className="absolute left-0 right-0 top-full z-20 mt-2 grid gap-2 rounded-2xl border border-line bg-surface p-2 text-left shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                  <button
                    type="button"
                    disabled={isResolvingCurrentLocation}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      void handleCurrentLocationAsOrigin();
                    }}
                    className="flex items-start justify-between rounded-xl px-3 py-2.5 transition hover:bg-surface-strong disabled:opacity-60"
                  >
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.22em] text-secondary">
                        Ma localisation
                      </p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {isResolvingCurrentLocation
                          ? "Recuperation en cours..."
                          : "Utiliser ma position actuelle"}
                      </p>
                    </div>
                  </button>

                  {homeAddressSuggestion ? (
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        updatePlanner("originQuery", homeAddressSuggestion);
                        setShowOriginSuggestion(false);
                      }}
                      className="flex items-start justify-between rounded-xl px-3 py-2.5 transition hover:bg-surface-strong"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-secondary">
                          Home
                        </p>
                        <p className="mt-1 truncate text-sm font-medium text-foreground">
                          {homeAddressSuggestion}
                        </p>
                      </div>
                      <span className="ml-4 text-xs uppercase tracking-[0.18em] text-secondary">
                        Use
                      </span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div>
              <Input
                label="To"
                value={planner.destinationQuery}
                onChange={(event) =>
                  updatePlanner("destinationQuery", event.target.value)
                }
                placeholder="Châtelet"
                hint="Destination address or station name."
                autoComplete="off"
              />
            </div>
            <Input
              label="Departure"
              type="datetime-local"
              value={planner.departureTime}
              onChange={(event) => updatePlanner("departureTime", event.target.value)}
            />
            <Input
              label="Via stop"
              value={planner.intermediateQuery}
              onChange={(event) =>
                updatePlanner("intermediateQuery", event.target.value)
              }
              placeholder="Optional stopover"
            />
            <Input
              label="Via departure"
              type="datetime-local"
              value={planner.intermediateDepartureTime}
              onChange={(event) =>
                updatePlanner("intermediateDepartureTime", event.target.value)
              }
              hint="Only used when a via stop is set."
            />
            <label className="grid gap-2 self-start text-sm font-medium text-secondary">
              <span>Comfort preset</span>
              <select
                value={planner.namedComfortSettingId}
                onChange={(event) =>
                  updatePlanner("namedComfortSettingId", event.target.value)
                }
                className="w-full appearance-none rounded-lg border border-line bg-surface-strong px-4 py-3 text-sm text-foreground font-mono outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
              >
                <option value="">No preset</option>
                {(comfortSettingsQuery.data ?? []).map((setting) => (
                  <option key={setting.id} value={setting.id}>
                    {setting.name}
                  </option>
                ))}
              </select>
              {(comfortSettingsQuery.data?.length ?? 0) === 0 ? (
                <span className="text-xs text-secondary">
                  Create presets from your profile menu in the top bar.
                </span>
              ) : null}
            </label>
          </div>

          <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            <ToggleSwitch
              checked={planner.ecoModeEnabled}
              onChange={(checked) => updatePlanner("ecoModeEnabled", checked)}
              label="Eco mode"
              description="Prefer greener options."
            />
            <ToggleSwitch
              checked={planner.wheelchairAccessible}
              onChange={(checked) => updatePlanner("wheelchairAccessible", checked)}
              label="Wheelchair access"
              description="Prioritize accessible routes."
            />
            <ToggleSwitch
              checked={planner.includeTaskOptimization}
              onChange={(checked) =>
                updatePlanner("includeTaskOptimization", checked)
              }
              label="Google Tasks stops"
              description="Include useful errands when possible."
            />
            <ToggleSwitch
              checked={planner.touristModeEnabled}
              onChange={(checked) => updatePlanner("touristModeEnabled", checked)}
              label="Tourist mode"
              description="Show restaurants along the route."
            />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              onClick={() => planJourney.mutate(undefined)}
              disabled={planJourney.isPending || plannerIssues.length > 0}
            >
              {planJourney.isPending ? "Planning..." : "Plan journey"}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                setPlanner((current) => ({
                  ...current,
                  departureTime: getLocalDateTimeInputValue(),
                }))
              }
            >
              Reset departure
            </Button>
          </div>

          {journeyMessage ? (
            <StatePanel
              className="mt-6"
              eyebrow="Planner update"
              title={journeyMessage}
            />
          ) : null}

          {plannerIssues.length ? (
            <StatePanel
              className="mt-4"
              eyebrow="Need to fix"
              title="Your trip details need a quick adjustment"
              description={plannerIssues.join(" ")}
              tone="danger"
            />
          ) : null}

          {plannerNotices.length ? (
            <StatePanel
              className="mt-4"
              eyebrow="Helpful note"
              title="A small change could improve this trip"
              description={plannerNotices.join(" ")}
              tone="success"
            />
          ) : null}
        </Card>

        <Card className="rounded-4xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-secondary">
                Smart Suggestions
              </p>
              <h2 className="mt-2 text-2xl font-bold text-foreground">Tomorrow&apos;s likely trips</h2>
            </div>
            <Badge variant="accent">{formatTaskDateOnly(getTomorrowDateString())}</Badge>
          </div>

          <div className="mt-5 grid gap-3">
            {!googleLinked ? (
              <StatePanel
                title="Connect Google Tasks to unlock suggestions"
                description="When your Google account is linked, tomorrow’s likely trips will appear here."
                tone="warning"
              />
            ) : suggestionsQuery.isLoading ? (
              <StatePanel
                eyebrow="Loading"
                title="Looking ahead to tomorrow"
                description="We’re checking your upcoming tasks for trip ideas."
              />
            ) : suggestions.length ? (
              suggestions.map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl border border-line bg-surface-strong p-4"
                >
                  <p className="font-semibold text-foreground">
                    {task.title || "Untitled task"}
                  </p>
                  <p className="mt-1 text-sm text-secondary">
                    #{task.locationQuery}
                  </p>
                  <div className="mt-3 flex gap-3">
                    <Button
                      variant="ghost"
                      onClick={() => selectSuggestion(task.locationQuery || "")}
                    >
                      Prefill planner
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <StatePanel
                title="No suggested trip for tomorrow yet"
                description="As soon as tomorrow’s tasks contain useful route details, they’ll appear here."
              />
            )}
          </div>
        </Card>
      </section>

      {currentJourney ? (
        <section className="xl:hidden">
          <Card className="rounded-4xl">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="accent">Live map</Badge>
              <Badge variant="muted">
                {currentJourney.originLabel} to {currentJourney.destinationLabel}
              </Badge>
            </div>
            <h2 className="mt-4 text-2xl font-bold text-foreground">
              Follow your active route on the map
            </h2>
            <p className="mt-2 text-sm text-secondary">
              Le marqueur bleu est votre position. Les segments colorés viennent du trajet. La pastille
              violette « ARRIVÉE » (avec le libellé de destination) et le losange sous l&apos;étiquette
              indiquent l&apos;adresse ou le lieu d&apos;arrivée saisi dans le planificateur, une fois
              géocodé. Le petit point orange sur le trajet TC marque souvent la fin du dernier segment
              transport ; ce n&apos;est pas forcément la même chose que l&apos;adresse d&apos;arrivée
              saisie. Un tracé bleu en pointillés relie le dernier arrêt bus, métro ou train à
              l&apos;arrivée. Les marqueurs ambre « TÂCHE » indiquent une étape à faire, avec titre et
              adresse. Si la tâche a été intégrée dans l&apos;itinéraire optimisé, elle est placée
              exactement sur le trajet ; sinon, un court tracé bleu relie le trajet à la tâche. Avec le
              mode touriste du planificateur, les pastilles « RESTAURANT » (sarcelle) signalent des
              établissements à proximité du tracé affiché (même flux que la page Explorer).
            </p>
            {liveJourneyRouteTasksSummary ? (
              <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm">
                <p className="font-semibold text-foreground">
                  Tâches sur ce trajet ({liveJourneyRouteTasksSummary.onRoute.length})
                </p>
                {liveJourneyRouteTasksSummary.includedInPlanCount > 0 ? (
                  <p className="mt-1 text-xs text-secondary">
                    {liveJourneyRouteTasksSummary.includedInPlanCount} prise(s) en compte dans
                    l&apos;itinéraire (optimisation des tâches).
                  </p>
                ) : null}
                <ul className="mt-2 list-disc space-y-2 pl-5 text-secondary">
                  {liveJourneyRouteTasksSummary.onRoute.map((t) => {
                    const resolved = resolvedJourneyTasks.find(
                      (r) => r.onRoute?.taskId === t.taskId || r.id === t.taskId,
                    );
                    const addr = resolved
                      ? resolveTaskAddressLine(resolved, taskGeocodedAddresses)
                      : null;
                    return (
                      <li key={t.taskId}>
                        <span className="font-medium text-foreground">
                          {t.title.trim() || "Sans titre"}
                        </span>
                        {t.locationLat == null || t.locationLng == null ? (
                          <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">
                            (pas de position sur la carte)
                          </span>
                        ) : null}
                        {addr ? (
                          <div className="mt-0.5 text-xs text-amber-100/90 leading-snug pl-0 list-none">
                            {addr}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {liveJourneyRouteTasksSummary.withoutGeo.length ? (
                  <p className="mt-2 text-xs text-secondary">
                    Sans coordonnées, la tâche apparaît ici mais pas sur la carte.
                  </p>
                ) : null}
              </div>
            ) : null}
            <div ref={liveJourneyMapRef} className="mt-6 scroll-mt-6">
              {liveJourneyMapData && liveJourneyMapData.segments.length ? (
                <TransportMap
                  mapboxToken={mapboxToken}
                  stops={liveJourneyMapData.stops}
                  segments={liveJourneyMapData.segments}
                  arrivalAddressQuery={currentJourney.destinationLabel}
                  tasks={liveJourneyTaskMarkers}
                  touristRestaurants={
                    planner.touristModeEnabled ? liveTouristMapMarkers : null
                  }
                  onRequestReroute={handleRerouteFromCurrentLocation}
                  isRerouting={isReroutingFromLocation}
                  flyToRequest={journeyMapFlyTo}
                />
              ) : (
                <StatePanel
                  title="Map data unavailable"
                  description="No geo coordinates were returned for this journey yet."
                  tone="warning"
                />
              )}
              {planner.touristModeEnabled ? (
                <p className="mt-3 text-xs text-secondary">
                  {routeTouristFetch === "loading"
                    ? "Recherche des restaurants le long du tracé affiché…"
                    : routeTouristFetch === "error"
                      ? "Les suggestions restaurant n’ont pas pu être chargées pour ce trajet."
                      : routeTouristFetch === "done" && liveTouristMapMarkers.length === 0
                        ? `Aucun restaurant affiché avec note ≥ ${MAP_RESTAURANT_MIN_RATING} (ou trop peu proches du corridor / sans note).`
                        : routeTouristFetch === "done" && liveTouristMapMarkers.length > 0
                          ? `${liveTouristMapMarkers.length} restaurant(s) sur la carte (max. ${MAP_RESTAURANT_MAX_VISIBLE}, note ≥ ${MAP_RESTAURANT_MIN_RATING}). Dézoomez pour voir uniquement les pastilles cliquables.`
                          : null}
                </p>
              ) : null}
            </div>
            {currentJourney.segments.length ? (
              <div className="mt-6">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">
                  Journey segments and stops
                </p>
                <p className="mt-1 text-xs text-secondary">
                  Cliquez un arrêt (pastille) ou une tâche géolocalisée pour centrer la carte sur ce point.
                </p>
                <div className="mt-3">
                  <JourneySegmentsPanel
                    journey={currentJourney}
                    resolvedTasks={resolvedJourneyTasks}
                    taskWalkLegs={taskWalkLegs}
                    taskGeocodedAddresses={taskGeocodedAddresses}
                    onFocusOnMap={handleJourneyStopFocusOnMap}
                  />
                </div>
              </div>
            ) : null}
          </Card>
        </section>
      ) : null}

      {currentJourney ? (
        <section className="grid gap-6 xl:hidden">
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="success">Live journey</Badge>
              <Badge variant="muted">{currentJourney.status}</Badge>
              {currentJourney.disruptionCount > 0 ? (
                <Badge variant="accent">
                  {currentJourney.disruptionCount} disruption{currentJourney.disruptionCount > 1 ? "s" : ""}
                </Badge>
              ) : null}
            </div>
            <h2 className="mt-4 text-3xl font-bold text-foreground">
              {currentJourney.originLabel} to {currentJourney.destinationLabel}
            </h2>
            <p className="mt-3 text-sm leading-6 text-secondary">
              Started {formatDateTime(currentJourney.actualDeparture || currentJourney.plannedDeparture)}
              . Planned arrival {formatDateTime(currentJourney.plannedArrival)}.
            </p>

            <div className="mt-6 rounded-full bg-surface-strong border border-line p-2">
              <div
                className="h-3 rounded-full bg-brand transition-[width]"
                style={{ width: `${currentProgress}%` }}
              />
            </div>
            <p className="mt-2 text-xs font-bold uppercase tracking-[0.24em] text-secondary font-mono">
              Progress {currentProgress}%
            </p>

            {currentJourney.segments.length ? (
              <div className="mt-6 hidden xl:block">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">
                  Journey segments and stops
                </p>
                <p className="mt-1 text-xs text-secondary">
                  Cliquez un arrêt ou une tâche géolocalisée pour centrer la carte sur ce point.
                </p>
                <div className="mt-3">
                  <JourneySegmentsPanel
                    journey={currentJourney}
                    resolvedTasks={resolvedJourneyTasks}
                    taskWalkLegs={taskWalkLegs}
                    taskGeocodedAddresses={taskGeocodedAddresses}
                    onFocusOnMap={handleJourneyStopFocusOnMap}
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                onClick={() => completeJourney.mutate(currentJourney)}
                disabled={completeJourney.isPending}
              >
                Complete journey
              </Button>
              <Button
                variant="ghost"
                onClick={() => cancelJourney.mutate(currentJourney.journeyId)}
                disabled={cancelJourney.isPending}
              >
                Cancel journey
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  setDisruptionMode((current) =>
                    current === "line" ? null : "line",
                  )
                }
              >
                Report line disruption
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  setDisruptionMode((current) =>
                    current === "station" ? null : "station",
                  )
                }
              >
                Report station disruption
              </Button>
            </div>

            {currentJourney.includedTasks.length ? (
              <div className="mt-6 rounded-xl bg-accent-soft border border-accent/20 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-accent">
                  Included Tasks
                </p>
                <div className="mt-3 grid gap-2">
                  {currentJourney.includedTasks.map((task) => (
                    <div
                      key={`${task.googleTaskId}-${task.title}`}
                      className="rounded-lg bg-surface border border-line px-4 py-3 text-sm text-foreground"
                    >
                      {task.title}
                      {task.locationQuery ? ` · ${task.locationQuery}` : ""}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>

          <Card>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-secondary">
              Disruption Support
            </p>
            <h3 className="mt-2 text-2xl font-bold text-foreground">
              {disruptionMode === "line"
                ? "Choose the affected line"
                : disruptionMode === "station"
                  ? "Choose the affected station"
                  : "Report an issue if this trip changes"}
            </h3>

            {disruptionMode === "line" ? (
              <div className="mt-5 grid gap-3">
                {linesQuery.isLoading ? (
                  <StatePanel
                    title="Loading journey lines"
                    description="Choose the affected line as soon as this list is ready."
                  />
                ) : linesQuery.data?.length ? (
                  linesQuery.data.map((line: LineInfo) => (
                    <button
                      key={`${line.lineCode}-${line.mode}`}
                      type="button"
                      onClick={() => reportLineDisruption.mutate(line.lineCode)}
                      className="flex items-center justify-between rounded-xl border border-line bg-surface-strong px-4 py-4 text-left transition hover:bg-surface"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="h-4 w-4 rounded-full"
                          style={{ backgroundColor: line.lineColor ? `#${line.lineColor}` : "#0c7c59" }}
                        />
                        <div>
                          <p className="font-semibold text-foreground">
                            {line.lineCode || "Unknown line"}
                          </p>
                          <p className="text-sm text-secondary">{line.lineName}</p>
                        </div>
                      </div>
                      <span className="text-sm text-secondary font-mono">{line.mode}</span>
                    </button>
                  ))
                ) : (
                  <StatePanel
                    title="No line can be reported here"
                    description="This journey does not expose a supported line for disruption reporting."
                  />
                )}
              </div>
            ) : disruptionMode === "station" ? (
              <div className="mt-5 grid gap-3">
                {stopsQuery.isLoading ? (
                  <StatePanel
                    title="Loading journey stops"
                    description="Choose the affected stop as soon as this list is ready."
                  />
                ) : stopsQuery.data?.length ? (
                  stopsQuery.data.map((stop: StopInfo) => (
                    <button
                      key={`${stop.stopPointId}-${stop.sequenceInJourney}`}
                      type="button"
                      onClick={() => reportStopDisruption.mutate(stop.stopPointId)}
                      className="rounded-xl border border-line bg-surface-strong px-4 py-4 text-left transition hover:bg-surface"
                    >
                      <p className="font-semibold text-foreground">{stop.name}</p>
                      <p className="mt-1 text-sm text-secondary">
                        Step {stop.sequenceInJourney + 1}
                        {stop.onLineCode ? ` · Line ${stop.onLineCode}` : ""}
                      </p>
                    </button>
                  ))
                ) : (
                  <StatePanel
                    title="No stop can be reported here"
                    description="This journey does not expose a supported stop for disruption reporting."
                  />
                )}
              </div>
            ) : (
              <StatePanel
                className="mt-5"
                title="Ready to report a change"
                description="Use the controls on the left to report a line or station issue. If we find an alternative, new trip options will appear below."
              />
            )}
          </Card>
        </section>
      ) : null}

      {results.length && tripOptionsOpen ? (
        <section className="fixed inset-0 z-50 overflow-auto bg-background/92 p-4 backdrop-blur-xl sm:p-6">
          <div className="mx-auto grid min-h-full max-w-7xl content-start gap-4">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-4 rounded-3xl border border-line bg-background/95 p-4 backdrop-blur-xl">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-secondary">
                Trip Options
              </p>
              <h2 className="mt-2 text-2xl font-bold text-foreground">Available itineraries</h2>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="accent">
                {results.length} option{results.length > 1 ? "s" : ""}
              </Badge>
              <button
                type="button"
                onClick={() => setTripOptionsOpen(false)}
                className="rounded-full border border-line bg-surface-strong px-4 py-2 text-sm font-bold text-foreground transition hover:border-brand/60"
              >
                Close
              </button>
            </div>
          </div>

          {results.map((journey, index) => (
            <Card key={journey.journeyId}>
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="muted">Option {index + 1}</Badge>
                    {planner.ecoModeEnabled ? <Badge variant="success">Eco mode</Badge> : null}
                    {planner.touristModeEnabled ? (
                      <Badge variant="muted">Mode touriste</Badge>
                    ) : null}
                    {planner.namedComfortSettingId ? (
                      <Badge variant="accent">Comfort preset</Badge>
                    ) : null}
                  </div>
                  <h3 className="mt-4 text-2xl font-bold text-foreground">
                    {journey.originLabel} to {journey.destinationLabel}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-secondary">
                    {formatDateTime(journey.plannedDeparture)} to{" "}
                    {formatDateTime(journey.plannedArrival)} ·{" "}
                    {formatDuration(resultDuration(journey))}
                  </p>

                  {journey.includedTasks.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {journey.includedTasks.map((task) => (
                        <span
                          key={`${task.googleTaskId}-${task.title}`}
                          className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-[#131518]"
                        >
                          {task.title}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {journey.tasksOnRoute.length ? (
                    <div className="mt-4 rounded-xl bg-brand-soft border border-brand/20 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.24em] text-brand">
                        Nearby tasks
                      </p>
                      <div className="mt-3 grid gap-2">
                        {journey.tasksOnRoute.map((task) => (
                          <div
                            key={`${task.taskId}-${task.title}`}
                            className="rounded-lg bg-surface border border-line px-4 py-3 text-sm text-foreground"
                          >
                            {task.title} · {formatDistance(task.distanceMeters)}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="w-full xl:max-w-3xl">
                  <JourneySegmentsStrip journey={journey} />
                  <div className="mt-5">
                    <Button
                      className="w-full"
                      onClick={() => {
                        startJourney.mutate(journey);
                        setTripOptionsOpen(false);
                      }}
                      disabled={startJourney.isPending}
                    >
                      {startJourney.isPending ? "Starting..." : "Start journey"}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          </div>
        </section>
      ) : null}

      {results.length && !currentJourney && !tripOptionsOpen ? (
        <button
          type="button"
          onClick={() => setTripOptionsOpen(true)}
          className="fixed bottom-28 right-4 z-40 rounded-full border border-line bg-brand px-5 py-3 text-sm font-bold text-white shadow-[0_18px_44px_rgba(0,0,0,0.35)] transition hover:bg-brand-strong lg:bottom-8 lg:right-8"
        >
          Show trip options
        </button>
      ) : null}
    </div>
  );
}
