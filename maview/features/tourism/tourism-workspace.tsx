"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatePanel } from "@/components/ui/state-panel";
import { tourismApi } from "@/lib/api/tourism";
import {
  forwardGeocodeMapbox,
  reverseGeocodeMapbox,
} from "@/lib/mapbox/reverse-geocode";
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

type TourismWorkspaceProps = {
  mapboxToken: string | null;
};

const EXPLORE_SEARCH_STORAGE_KEY = "maview-explore-restaurant-search";

export const EXPLORE_CURRENT_LOCATION_LABEL = "Ma position actuelle";

type StoredExploreSearch = {
  addressQuery: string;
  radiusMeters: string;
  results: TourismSuggestion[];
  originCoords: { latitude: number; longitude: number } | null;
  feedbackPanel: {
    title: string;
    description: string;
    tone?: "neutral" | "success" | "warning" | "danger";
  } | null;
};

function restoreExploreSearch(): StoredExploreSearch | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(EXPLORE_SEARCH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredExploreSearch;
    const oc = parsed.originCoords;
    const originCoords =
      oc &&
      typeof oc.latitude === "number" &&
      typeof oc.longitude === "number" &&
      Number.isFinite(oc.latitude) &&
      Number.isFinite(oc.longitude)
        ? { latitude: oc.latitude, longitude: oc.longitude }
        : null;
    return {
      addressQuery: parsed.addressQuery ?? "",
      radiusMeters: parsed.radiusMeters ?? "1200",
      results: Array.isArray(parsed.results) ? parsed.results : [],
      originCoords,
      feedbackPanel: parsed.feedbackPanel ?? null,
    };
  } catch {
    return null;
  }
}

function persistExploreSearch(search: StoredExploreSearch | null) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (search) {
      sessionStorage.setItem(EXPLORE_SEARCH_STORAGE_KEY, JSON.stringify(search));
    } else {
      sessionStorage.removeItem(EXPLORE_SEARCH_STORAGE_KEY);
    }
  } catch {
    // Ignore unavailable sessionStorage.
  }
}

function buildRestaurantDestination(item: TourismSuggestion) {
  return item.address?.trim() || item.name.trim() || `${item.latitude}, ${item.longitude}`;
}

function buildJourneyRestaurantHref(
  item: TourismSuggestion,
  originAddress: string,
  originCoords: { latitude: number; longitude: number } | null,
) {
  const params = new URLSearchParams({
    exploreRestaurant: "1",
    destination: buildRestaurantDestination(item),
  });

  const trimmedOrigin = originAddress.trim();
  if (trimmedOrigin) {
    params.set("originAddress", trimmedOrigin);
  }
  if (originCoords) {
    params.set("originLat", String(originCoords.latitude));
    params.set("originLng", String(originCoords.longitude));
  }

  if (item.latitude != null && item.longitude != null) {
    params.set("destinationLat", String(item.latitude));
    params.set("destinationLng", String(item.longitude));
  }

  return `/?${params.toString()}`;
}

export function TourismWorkspace({ mapboxToken }: TourismWorkspaceProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [restoredSearch] = useState(() => restoreExploreSearch());
  const [addressQuery, setAddressQuery] = useState(restoredSearch?.addressQuery ?? "");
  const [radiusMeters, setRadiusMeters] = useState(restoredSearch?.radiusMeters ?? "1200");
  const [results, setResults] = useState<TourismSuggestion[]>(
    restoredSearch?.results ?? [],
  );
  const [originCoords, setOriginCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(restoredSearch?.originCoords ?? null);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [feedbackPanel, setFeedbackPanel] = useState<{
    title: string;
    description: string;
    tone?: "neutral" | "success" | "warning" | "danger";
  } | null>(restoredSearch?.feedbackPanel ?? null);

  useEffect(() => {
    persistExploreSearch({
      addressQuery,
      radiusMeters,
      results,
      originCoords,
      feedbackPanel,
    });
  }, [addressQuery, feedbackPanel, originCoords, radiusMeters, results]);

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
    onSuccess: (data, variables) => {
      setOriginCoords({
        latitude: variables.latitude,
        longitude: variables.longitude,
      });
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

  function resetSearch() {
    searchMutation.reset();
    setAddressQuery("");
    setRadiusMeters("1200");
    setResults([]);
    setFeedbackPanel(null);
    setIsResolvingAddress(false);
    setIsLocating(false);
    setOriginCoords(null);
    persistExploreSearch(null);
  }

  async function searchFromAddress() {
    const normalizedAddress = addressQuery.trim();
    if (!normalizedAddress) {
      setFeedbackPanel({
        title: "Address is required",
        description: "Enter an address before searching for restaurants around it.",
        tone: "warning",
      });
      return;
    }

    if (!mapboxToken) {
      setFeedbackPanel({
        title: "Address search unavailable",
        description: "Mapbox is not configured, so this address cannot be converted to coordinates.",
        tone: "danger",
      });
      toast({
        title: "Address search unavailable",
        description: "Mapbox is not configured for this environment.",
        variant: "error",
      });
      return;
    }

    setIsResolvingAddress(true);
    setFeedbackPanel(null);

    try {
      const coordinates = await forwardGeocodeMapbox(normalizedAddress, mapboxToken);
      if (!coordinates) {
        throw new Error("We could not find coordinates for this address.");
      }

      searchMutation.mutate({
        latitude: coordinates[1],
        longitude: coordinates[0],
      });
    } catch (error) {
      setResults([]);
      setFeedbackPanel({
        title: "Address search failed",
        description:
          error instanceof Error
            ? error.message
            : "The address could not be converted to coordinates.",
        tone: "danger",
      });
      toast({
        title: "Address search failed",
        description:
          error instanceof Error
            ? error.message
            : "The address could not be converted to coordinates.",
        variant: "error",
      });
    } finally {
      setIsResolvingAddress(false);
    }
  }

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
    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const resolvedAddress = mapboxToken
          ? await reverseGeocodeMapbox(longitude, latitude, mapboxToken)
          : null;

        if (resolvedAddress) {
          setAddressQuery(resolvedAddress);
        } else {
          setAddressQuery(EXPLORE_CURRENT_LOCATION_LABEL);
          toast({
            title: "Adresse exacte indisponible",
            description:
              "La recherche utilise votre position, mais l'adresse n'a pas pu être résolue.",
            variant: "error",
          });
        }
        searchMutation.mutate({ latitude, longitude });
        setIsLocating(false);
      },
      (error) => {
        setResults([]);
        setIsLocating(false);
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
      <section>
        <Card className="rounded-4xl">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="accent">Tourist Mode</Badge>
            <Badge variant="muted">Places to eat</Badge>
          </div>

          <h1 className="mt-5 page-title">Find a good place to eat nearby</h1>
          <p className="mt-4 page-copy">
            Enter an address and we&apos;ll pull together nearby restaurant options
            that are easy to compare at a glance.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <Input
              label="Address"
              value={addressQuery}
              onChange={(event) => setAddressQuery(event.target.value)}
              placeholder="12 rue de Rivoli, Paris"
              hint="Restaurants will be searched around this address."
              autoComplete="street-address"
            />
            <Input
              label="Radius in meters"
              value={radiusMeters}
              onChange={(event) =>
                setRadiusMeters(event.target.value.replace(/[^\d]/g, ""))
              }
              placeholder="1200"
              hint="Pick how far to search around the address."
              inputMode="numeric"
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              onClick={() => void searchFromAddress()}
              disabled={searchMutation.isPending || isResolvingAddress || isLocating}
            >
              {searchMutation.isPending || isResolvingAddress ? (
                <span className="inline-flex items-center gap-2">
                  <LoadingSpinner className="h-4 w-4" />
                  {isResolvingAddress ? "Resolving address..." : "Searching..."}
                </span>
              ) : (
                "Find restaurants from this address"
              )}
            </Button>
            <Button
              onClick={locateAndSearch}
              disabled={searchMutation.isPending || isResolvingAddress || isLocating}
              variant="ghost"
            >
              {isLocating ? (
                <span className="inline-flex items-center gap-2">
                  <LoadingSpinner className="h-4 w-4" />
                  Locating...
                </span>
              ) : (
                "Use my current location"
              )}
            </Button>
            <Button
              onClick={resetSearch}
              disabled={searchMutation.isPending || isResolvingAddress || isLocating}
              variant="ghost"
            >
              Reset search
            </Button>
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
            description="We&apos;re checking the requested area."
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
                        <Link
                          href={buildJourneyRestaurantHref(item, addressQuery, originCoords)}
                        >
                          Open map
                        </Link>
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
            title="Search an address to see nearby restaurants"
            description="Your short list will appear here once Mavigo finds restaurants around the selected area."
          />
        )}
      </section>
    </div>
  );
}
