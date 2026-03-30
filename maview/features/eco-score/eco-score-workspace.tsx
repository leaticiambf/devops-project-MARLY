"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { StatePanel } from "@/components/ui/state-panel";
import { ecoApi } from "@/lib/api/eco";
import { formatDateTime } from "@/lib/utils/format";
import { useAuth } from "@/providers/auth-provider";

const BADGE_ICONS = {
  FIRST_JOURNEY: "🚀",
  ECO_WARRIOR: "🌱",
  FREQUENT_TRAVELER: "🎯",
  CO2_SAVER: "💚",
  EXPLORER: "🗺️",
  COMMUTER: "🚇",
  GREEN_CHAMPION: "🏆",
  DISTANCE_MASTER: "📏",
} as const;

const BADGE_ALIASES: Record<string, keyof typeof BADGE_ICONS> = {
  "Green Starter": "FIRST_JOURNEY",
  "Metro Regular": "COMMUTER",
};

function resolveBadgeIcon(name: string, fallbackIcon?: string | null) {
  const mapped =
    BADGE_ICONS[name as keyof typeof BADGE_ICONS] ??
    BADGE_ICONS[BADGE_ALIASES[name] as keyof typeof BADGE_ICONS];

  if (mapped) {
    return mapped;
  }

  if (
    fallbackIcon &&
    (fallbackIcon.length <= 2 || /[^\w-]/.test(fallbackIcon))
  ) {
    return fallbackIcon;
  }

  return "🏅";
}

export function EcoScoreWorkspace() {
  const { user, token } = useAuth();

  const dashboardQuery = useQuery({
    queryKey: ["eco-dashboard", user?.userId],
    queryFn: () => ecoApi.getDashboard(user!.userId, token!),
    enabled: Boolean(user?.userId && token),
  });

  const earnedBadgeNames = useMemo(
    () => new Set((dashboardQuery.data?.earnedBadges ?? []).map((badge) => badge.name)),
    [dashboardQuery.data?.earnedBadges],
  );

  return (
    <div className="grid gap-6">
      <section className="rounded-[2rem] border border-line bg-surface px-6 py-6">
        <Badge variant="accent">Eco Dashboard</Badge>
        <h1 className="mt-5 page-title">See the impact of every better trip</h1>
        <p className="mt-4 page-copy">
          Track how much carbon you have saved, collect badges for better travel
          habits, and review the journeys that moved your score forward.
        </p>
      </section>

      {dashboardQuery.isLoading ? (
        <section className="rounded-[2rem] border border-line bg-surface px-6 py-6">
          <StatePanel
            eyebrow="Loading"
            title="Calculating your eco score"
            description="We’re gathering your savings, badges, and journey history."
          />
        </section>
      ) : dashboardQuery.error ? (
        <section className="rounded-[2rem] border border-line bg-surface px-6 py-6">
          <StatePanel
            eyebrow="Unavailable"
            title="We couldn’t load your eco score"
            description={dashboardQuery.error.message}
            tone="danger"
          />
        </section>
      ) : dashboardQuery.data ? (
        <>
          <section className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-[1.75rem] border border-line bg-surface px-5 py-5">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-secondary">
                Total CO2 saved
              </p>
              <p className="mt-4 text-4xl font-bold text-brand font-mono">
                {dashboardQuery.data.totalCo2Saved.toFixed(2)} kg
              </p>
            </div>
            <div className="rounded-[1.75rem] border border-line bg-surface px-5 py-5">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-secondary">
                Badges earned
              </p>
              <p className="mt-4 text-4xl font-bold text-brand font-mono">
                {dashboardQuery.data.badgeCount}
              </p>
            </div>
            <div className="rounded-[1.75rem] border border-line bg-surface px-5 py-5">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-secondary">
                Tracked journeys
              </p>
              <p className="mt-4 text-4xl font-bold text-brand font-mono">
                {dashboardQuery.data.history.length}
              </p>
            </div>
          </section>

          <section className="rounded-[2rem] border border-line bg-surface px-6 py-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Badge collection</h2>
                  <p className="mt-2 text-sm leading-6 text-secondary">
                    Every badge highlights a greener travel habit. Earned badges
                    stay highlighted while the rest show what you can work toward.
                  </p>
                </div>
                <Badge variant="muted">
                  {dashboardQuery.data.earnedBadges.length}/
                  {dashboardQuery.data.allBadges.length} collected
                </Badge>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {dashboardQuery.data.allBadges.map((badge) => {
                  const earned = earnedBadgeNames.has(badge.name);
                  const earnedBadge = dashboardQuery.data.earnedBadges.find(
                    (item) => item.name === badge.name,
                  );
                  return (
                    <div
                      key={badge.name}
                      className={
                        earned
                          ? "group relative overflow-hidden rounded-[1.75rem] border border-brand/30 bg-[linear-gradient(180deg,rgba(0,155,72,0.18),rgba(20,25,41,0.92))] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.28)]"
                          : "group relative overflow-hidden rounded-[1.75rem] border border-line bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(20,25,41,0.94))] p-4"
                      }
                    >
                      <div className="flex min-h-[17rem] flex-col justify-between">
                        <div
                          className="pointer-events-none absolute inset-x-0 top-0 h-20 opacity-80"
                          style={{
                            background: earned
                              ? "radial-gradient(circle at top, rgba(255,255,255,0.16), transparent 70%)"
                              : "radial-gradient(circle at top, rgba(255,255,255,0.08), transparent 70%)",
                          }}
                        />

                        <div className="relative flex items-start justify-between gap-3">
                          <Badge variant={earned ? "success" : "muted"}>
                            {earned ? "Earned" : "Locked"}
                          </Badge>
                          <span className="text-xs uppercase tracking-[0.22em] text-secondary">
                            Badge
                          </span>
                        </div>

                        <div className="relative flex flex-1 items-center justify-center py-5">
                          <div
                            className="flex h-28 w-28 items-center justify-center rounded-[2rem] text-5xl shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                            style={{
                              background: earned
                                ? "linear-gradient(180deg, rgba(0,155,72,0.28), rgba(0,155,72,0.08))"
                                : "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
                              border: `1px solid ${earned ? "rgba(0, 155, 72, 0.34)" : "rgba(255, 255, 255, 0.08)"}`,
                            }}
                          >
                            {resolveBadgeIcon(badge.name, badge.icon)}
                          </div>
                        </div>

                        <div
                          className={
                            earned
                              ? "relative rounded-[1.35rem] border border-brand/25 bg-[rgba(12,18,34,0.48)] p-4 backdrop-blur-sm"
                              : "relative rounded-[1.35rem] border border-line bg-[rgba(12,18,34,0.42)] p-4 backdrop-blur-sm"
                          }
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-base font-semibold text-foreground">{badge.name}</p>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-secondary">
                            {badge.description}
                          </p>
                          {earnedBadge?.earnedAt ? (
                            <p className="mt-3 text-xs uppercase tracking-[0.2em] text-secondary font-mono">
                              Earned {formatDateTime(earnedBadge.earnedAt)}
                            </p>
                          ) : (
                            <p className="mt-3 text-xs uppercase tracking-[0.2em] text-secondary font-mono">
                              Still locked
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
          </section>

          <section className="grid gap-6">
            <div className="rounded-[2rem] border border-line bg-surface px-6 py-6">
              <h2 className="text-2xl font-bold text-foreground">Journey history</h2>
              <div className="mt-5 grid gap-3">
                {dashboardQuery.data.history.length ? (
                  dashboardQuery.data.history.map((item) => (
                    <div
                      key={`${item.journeyId}-${item.timestamp}`}
                      className="rounded-xl border border-line bg-surface-strong p-4"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-foreground">
                            {item.origin} to {item.destination}
                          </p>
                          <p className="mt-1 text-sm text-secondary font-mono">
                            {item.distance.toFixed(0)} m travelled
                          </p>
                        </div>
                        <div className="rounded-lg bg-brand-soft border border-brand/20 px-4 py-3 text-right">
                          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">
                            CO2 saved
                          </p>
                          <p className="mt-1 font-bold text-brand font-mono">
                            {item.co2Saved.toFixed(2)} kg
                          </p>
                          <p className="mt-1 text-xs text-secondary font-mono">
                            {formatDateTime(item.timestamp)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <StatePanel
                    title="No eco history yet"
                    description="Once you complete journeys, this timeline will show the trips that built your score."
                  />
                )}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
