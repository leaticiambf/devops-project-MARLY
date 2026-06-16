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
    <div className="grid gap-4 lg:gap-6">
      <section className="rounded-[1.25rem] border border-line bg-surface px-4 py-4 sm:rounded-[2rem] sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent" className="px-2.5 py-0.5 text-[0.62rem]">
            Eco Dashboard
          </Badge>
          <Badge variant="muted" className="px-2.5 py-0.5 text-[0.62rem]">
            CO2
          </Badge>
          <Badge variant="muted" className="px-2.5 py-0.5 text-[0.62rem]">
            Badges
          </Badge>
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
          Eco score
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary sm:mt-4 sm:text-base">
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
          <section className="grid grid-cols-3 gap-2 sm:gap-4">
            <div className="rounded-2xl border border-line bg-surface px-3 py-3 sm:rounded-[1.75rem] sm:px-5 sm:py-5">
              <p className="text-[0.58rem] font-bold uppercase tracking-[0.12em] text-secondary sm:text-xs sm:tracking-[0.28em]">
                Total CO2 saved
              </p>
              <p className="mt-2 text-lg font-bold text-brand font-mono sm:mt-4 sm:text-4xl">
                {dashboardQuery.data.totalCo2Saved.toFixed(2)} kg
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-surface px-3 py-3 sm:rounded-[1.75rem] sm:px-5 sm:py-5">
              <p className="text-[0.58rem] font-bold uppercase tracking-[0.12em] text-secondary sm:text-xs sm:tracking-[0.28em]">
                Badges earned
              </p>
              <p className="mt-2 text-lg font-bold text-brand font-mono sm:mt-4 sm:text-4xl">
                {dashboardQuery.data.badgeCount}
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-surface px-3 py-3 sm:rounded-[1.75rem] sm:px-5 sm:py-5">
              <p className="text-[0.58rem] font-bold uppercase tracking-[0.12em] text-secondary sm:text-xs sm:tracking-[0.28em]">
                Tracked journeys
              </p>
              <p className="mt-2 text-lg font-bold text-brand font-mono sm:mt-4 sm:text-4xl">
                {dashboardQuery.data.history.length}
              </p>
            </div>
          </section>

          <section className="rounded-[1.25rem] border border-line bg-surface px-4 py-4 sm:rounded-[2rem] sm:px-6 sm:py-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground sm:text-2xl">Badge collection</h2>
                  <p className="mt-1 text-xs leading-5 text-secondary sm:mt-2 sm:text-sm sm:leading-6">
                    Every badge highlights a greener travel habit. Earned badges
                    stay highlighted while the rest show what you can work toward.
                  </p>
                </div>
                <Badge variant="muted" className="px-2 py-0.5 text-[0.58rem] tracking-[0.12em] sm:px-3 sm:py-1 sm:text-[0.68rem]">
                  {dashboardQuery.data.earnedBadges.length}/
                  {dashboardQuery.data.allBadges.length} collected
                </Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-6 sm:gap-4 xl:grid-cols-3">
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
                          ? "group relative overflow-hidden rounded-2xl border border-brand/30 bg-[linear-gradient(180deg,rgba(0,155,72,0.18),rgba(20,25,41,0.92))] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.28)] sm:rounded-[1.75rem] sm:p-4"
                          : "group relative overflow-hidden rounded-2xl border border-line bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(20,25,41,0.94))] p-3 sm:rounded-[1.75rem] sm:p-4"
                      }
                    >
                      <div className="flex min-h-[11rem] flex-col justify-between sm:min-h-[17rem]">
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

                        <div className="relative flex flex-1 items-center justify-center py-3 sm:py-5">
                          <div
                            className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] sm:h-28 sm:w-28 sm:rounded-[2rem] sm:text-5xl"
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
                              ? "relative rounded-xl border border-brand/25 bg-[rgba(12,18,34,0.48)] p-3 backdrop-blur-sm sm:rounded-[1.35rem] sm:p-4"
                              : "relative rounded-xl border border-line bg-[rgba(12,18,34,0.42)] p-3 backdrop-blur-sm sm:rounded-[1.35rem] sm:p-4"
                          }
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-semibold text-foreground sm:text-base">{badge.name}</p>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-secondary sm:mt-2 sm:text-sm sm:leading-6">
                            {badge.description}
                          </p>
                          {earnedBadge?.earnedAt ? (
                            <p className="mt-2 text-[0.58rem] uppercase tracking-[0.12em] text-secondary font-mono sm:mt-3 sm:text-xs sm:tracking-[0.2em]">
                              Earned {formatDateTime(earnedBadge.earnedAt)}
                            </p>
                          ) : (
                            <p className="mt-2 text-[0.58rem] uppercase tracking-[0.12em] text-secondary font-mono sm:mt-3 sm:text-xs sm:tracking-[0.2em]">
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

          <section className="grid gap-4 sm:gap-6">
            <div className="rounded-[1.25rem] border border-line bg-surface px-4 py-4 sm:rounded-[2rem] sm:px-6 sm:py-6">
              <h2 className="text-lg font-bold text-foreground sm:text-2xl">Journey history</h2>
              <div className="mt-4 grid gap-3 sm:mt-5">
                {dashboardQuery.data.history.length ? (
                  dashboardQuery.data.history.map((item) => (
                    <div
                      key={`${item.journeyId}-${item.timestamp}`}
                      className="rounded-xl border border-line bg-surface-strong p-3 sm:p-4"
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
                        <div className="rounded-lg bg-brand-soft border border-brand/20 px-3 py-2 text-left sm:px-4 sm:py-3 sm:text-right">
                          <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-brand sm:text-xs sm:tracking-[0.2em]">
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
