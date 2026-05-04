"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatePanel } from "@/components/ui/state-panel";
import { tourismApi } from "@/lib/api/tourism";
import type { TourismSuggestion } from "@/lib/types/api";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";

function formatPriceLevel(priceLevel: string | null) {
  if (!priceLevel) {
    return null;
  }

  const tier = priceLevel.length;
  const euroLevel = "€".repeat(tier);

  return `${euroLevel} (${tier}/4)`;
}

function getSourceBadge(source: string) {
  if (source === "yelp") {
    return {
      label: "Live Yelp",
      variant: "accent" as const,
    };
  }

  return {
    label: "Paris pick",
    variant: "muted" as const,
  };
}

function LoadingSpinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  );
}

export function TourismWorkspace() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [radiusMeters, setRadiusMeters] = useState("1200");
  const [results, setResults] = useState<TourismSuggestion[]>([]);
  const [coordinatesLabel, setCoordinatesLabel] = useState<string | null>(null);
  const [feedbackPanel, setFeedbackPanel] = useState<{
    title: string;
    description: string;
    tone?: "neutral" | "success" | "warning" | "danger";
  } | null>(null);

  const searchMutation = useMutation({
    mutationFn: async ({
      latitude,
      longitude,
    }: {
      latitude: number;
      longitude: number;
    }) => {
      if (!token) {
        throw new Error("An authenticated session is required.");
      }

      const parsedRadius = Number(radiusMeters);

      return tourismApi.nearbyRestaurants(
        {
          latitude,
          longitude,
          radiusMeters: Number.isFinite(parsedRadius) && parsedRadius > 0 ? parsedRadius : 1200,
          limit: 6,
        },
        token,
      );
    },
    onSuccess: (data) => {
      setResults(data);
      setFeedbackPanel(
        data.length
          ? null
          : {
              title: "No restaurants found nearby",
              description:
                "Try widening the search area or moving to a busier part of Paris.",
              tone: "warning",
            },
      );
      toast({
        title: data.length ? "Restaurants ready" : "No restaurant found",
        description: data.length
          ? `Loaded ${data.length} nearby restaurant${data.length > 1 ? "s" : ""}.`
          : "Try increasing the search radius.",
        variant: data.length ? "success" : "error",
      });
    },
    onError: (error) => {
      setResults([]);
      setFeedbackPanel({
        title: "Restaurant search failed",
        description:
          error instanceof Error
            ? error.message
            : "The nearby restaurant request could not be completed.",
        tone: "danger",
      });
      toast({
        title: "Restaurant search failed",
        description:
          error instanceof Error
            ? error.message
            : "The nearby restaurant request could not be completed.",
        variant: "error",
      });
    },
  });

  function locateAndSearch() {
    if (!navigator.geolocation) {
      setFeedbackPanel({
        title: "Location is unavailable",
        description: "This browser cannot provide your current position.",
        tone: "warning",
      });
      toast({
        title: "Geolocation unavailable",
        description: "This browser cannot provide your current position.",
        variant: "error",
      });
      return;
    }

    setFeedbackPanel(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCoordinatesLabel(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        searchMutation.mutate({ latitude, longitude });
      },
      (error) => {
        setResults([]);
        setFeedbackPanel({
          title: "Location access is needed",
          description:
            error.message || "Allow location access so we can search nearby restaurants.",
          tone: "warning",
        });
        toast({
          title: "Location permission needed",
          description:
            error.message || "Allow location access so we can find nearby restaurants.",
          variant: "error",
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-[2rem]">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="accent">Tourist Mode</Badge>
            <Badge variant="muted">Places to eat</Badge>
          </div>

          <h1 className="mt-5 page-title">Find a good place to eat nearby</h1>
          <p className="mt-4 page-copy">
            Share your location and we&apos;ll pull together nearby restaurant
            options that are easy to compare at a glance.
          </p>

          <div className="mt-8 max-w-sm">
            <Input
              label="Radius in meters"
              value={radiusMeters}
              onChange={(event) =>
                setRadiusMeters(event.target.value.replace(/[^\d]/g, ""))
              }
              placeholder="1200"
              hint="Pick how far to search. Everything else comes from your location."
              inputMode="numeric"
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={locateAndSearch} disabled={searchMutation.isPending}>
              {searchMutation.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <LoadingSpinner className="h-4 w-4" />
                  Searching...
                </span>
              ) : (
                "Find restaurants near me"
              )}
            </Button>
          </div>

          {coordinatesLabel ? (
            <StatePanel
              className="mt-5"
              eyebrow="Search area"
              title={coordinatesLabel}
              description="We&apos;ll use this location to look for restaurants around you."
            />
          ) : null}
        </Card>

        <Card className="rounded-[2rem]">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-secondary">
            Guide
          </p>
          <h2 className="mt-2 text-2xl font-bold text-foreground">
            What happens next
          </h2>

          <div className="mt-5 grid gap-3">
            <StatePanel
              eyebrow="1"
              title="Share your location"
              description="Your browser asks for permission so the search can start from where you are."
            />
            <StatePanel
              eyebrow="2"
              title="We check nearby options"
              description="Mavigo looks within your chosen radius and gathers restaurant suggestions."
              tone="success"
            />
            <StatePanel
              eyebrow="3"
              title="You get a short list"
              description="The strongest nearby options are shown first so the page stays easy to scan."
            />
          </div>
        </Card>
      </section>

      <section className="grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-secondary">
              Nearby restaurants
            </p>
            <h2 className="mt-2 text-2xl font-bold text-foreground">
              Places worth checking
            </h2>
          </div>
          {results.length ? (
            <Badge variant="accent">
              {results.length} result{results.length > 1 ? "s" : ""}
            </Badge>
          ) : null}
        </div>

        {searchMutation.isPending ? (
          <StatePanel
            eyebrow="Searching"
            title="Finding nearby places to eat"
            description="We&apos;re checking the area around your current location."
            actions={
              <div className="inline-flex items-center gap-3 rounded-full border border-line bg-surface-strong px-4 py-2 text-sm font-medium text-foreground">
                <LoadingSpinner />
                <span>Waiting for Yelp to respond</span>
              </div>
            }
          />
        ) : results.length ? (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {results.map((item) => {
              const sourceBadge = getSourceBadge(item.source);

              return (
                <Card key={`${item.source}-${item.id}`} className="rounded-[1.75rem]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={sourceBadge.variant}>{sourceBadge.label}</Badge>
                        <Badge variant="muted">{item.category}</Badge>
                      </div>
                      <h3 className="mt-4 text-xl font-bold text-foreground">
                        {item.name}
                      </h3>
                    </div>
                    {item.rating != null ? (
                      <div className="rounded-full bg-accent px-3 py-1 text-sm font-bold text-[#0c1222]">
                        {item.rating.toFixed(1)}
                      </div>
                    ) : null}
                  </div>

                  <p className="mt-4 text-sm leading-6 text-secondary">
                    {item.description || "A reliable nearby restaurant with solid reviews."}
                  </p>

                  <div className="mt-5 grid gap-3 text-sm text-secondary">
                    {item.address ? <p>{item.address}</p> : null}
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {item.reviewCount != null ? <p>{item.reviewCount} reviews</p> : null}
                      {item.priceLevel ? (
                        <p>Price: {formatPriceLevel(item.priceLevel)}</p>
                      ) : null}
                    </div>
                    {item.phone ? <p>{item.phone}</p> : null}
                  </div>

                  {item.tags.length ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {item.tags.map((tag) => (
                        <span
                          key={`${item.id}-${tag}`}
                          className="rounded-full bg-surface-strong px-3 py-1 text-xs font-semibold text-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-6 flex flex-wrap gap-3">
                    {item.websiteUrl ? (
                      <Button asChild>
                        <a href={item.websiteUrl} target="_blank" rel="noreferrer">
                          View details
                        </a>
                      </Button>
                    ) : null}
                    {item.latitude != null && item.longitude != null ? (
                      <Button asChild variant="ghost">
                        <a
                          href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open map
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : feedbackPanel ? (
          <StatePanel
            title={feedbackPanel.title}
            description={feedbackPanel.description}
            tone={feedbackPanel.tone}
          />
        ) : (
          <StatePanel
            title="Use your location to see nearby restaurants"
            description="Your short list will appear here once the browser shares your position."
          />
        )}
      </section>
    </div>
  );
}
