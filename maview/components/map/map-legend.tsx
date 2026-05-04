import { TRANSPORT_COLORS, TRANSPORT_LABELS, type TransportType } from "@/components/map/map-utils";

const TRANSPORT_ORDER: TransportType[] = ["walking", "bus", "metro", "train"];

export function MapLegend() {
  return (
    <aside className="rounded-xl border border-line bg-surface/95 p-4 shadow-[0_8px_28px_rgba(0,0,0,0.28)] backdrop-blur">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">Legend</p>
      <ul className="mt-3 grid gap-2">
        {TRANSPORT_ORDER.map((type) => (
          <li key={type} className="flex items-center gap-3 text-sm text-foreground">
            <span
              className="h-3.5 w-3.5 rounded-full border border-white/15"
              style={{ backgroundColor: TRANSPORT_COLORS[type] }}
              aria-hidden
            />
            <span>{TRANSPORT_LABELS[type]}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
