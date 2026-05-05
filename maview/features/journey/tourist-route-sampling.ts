import type { TourismSuggestion } from "@/lib/types/api";

export const MAP_RESTAURANT_MIN_RATING = 4.3;

export const MAP_RESTAURANT_MAX_VISIBLE = 10;

export function suggestionStableKey(s: TourismSuggestion): string {
  const id = s.id?.trim();
  if (id) {
    return id;
  }
  const lat = s.latitude ?? 0;
  const lng = s.longitude ?? 0;
  return `${s.name.trim().toLowerCase()}@${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export function mergeTourismLists(lists: TourismSuggestion[][]): TourismSuggestion[] {
  const byKey = new Map<string, TourismSuggestion>();
  for (const list of lists) {
    for (const item of list ?? []) {
      if (!item) {
        continue;
      }
      const key = suggestionStableKey(item);
      if (!byKey.has(key)) {
        byKey.set(key, item);
      }
    }
  }
  return [...byKey.values()];
}

export function pickRestaurantsForMap(
  suggestions: TourismSuggestion[],
): TourismSuggestion[] {
  const eligible = suggestions.filter(
    (s) =>
      s.latitude != null &&
      s.longitude != null &&
      s.rating != null &&
      s.rating >= MAP_RESTAURANT_MIN_RATING,
  );

  const shuffled = [...eligible];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = shuffled[i]!;
    const b = shuffled[j]!;
    shuffled[i] = b;
    shuffled[j] = a;
  }

  return shuffled.slice(0, MAP_RESTAURANT_MAX_VISIBLE);
}
