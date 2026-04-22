"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TransportMap } from "@/components/map/transport-map";

type TransportMapWorkspaceProps = {
  mapboxToken: string | null;
};

export function TransportMapWorkspace({ mapboxToken }: TransportMapWorkspaceProps) {
  return (
    <section className="grid gap-6">
      <Card className="rounded-4xl">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="accent">Map Demo</Badge>
          <Badge variant="muted">Live location + colored routes</Badge>
        </div>
        <h1 className="mt-5 page-title">Interactive Transport Map</h1>
        <p className="mt-4 page-copy">
          Visualisez des arrets, des segments de trajet par mode de transport et votre
          position en temps reel avec geolocalisation.
        </p>

        <div className="mt-8">
          <TransportMap mapboxToken={mapboxToken} />
        </div>
      </Card>
    </section>
  );
}
