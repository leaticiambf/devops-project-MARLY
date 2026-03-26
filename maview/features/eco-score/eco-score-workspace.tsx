"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatePanel } from "@/components/ui/state-panel";
import { ecoApi } from "@/lib/api/eco";
import { formatDateTime } from "@/lib/utils/format";
import { useAuth } from "@/providers/auth-provider";

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
      <Card>
        <Badge variant="accent">Eco Dashboard</Badge>
        <h1 className="mt-5 page-title">See the impact of every better trip</h1>
        <p className="mt-4 page-copy">
          Track how much carbon you have saved, collect badges for better travel
          habits, and review the journeys that moved your score forward.
        </p>
      </Card>

      {dashboardQuery.isLoading ? (
        <Card>
          <StatePanel
            eyebrow="Loading"
            title="Calculating your eco score"
            description="We’re gathering your savings, badges, and journey history."
          />
        </Card>
      ) : dashboardQuery.error ? (
        <Card>
          <StatePanel
            eyebrow="Unavailable"
            title="We couldn’t load your eco score"
            description={dashboardQuery.error.message}
            tone="danger"
          />
        </Card>
      ) : dashboardQuery.data ? (
        <>
          <section className="grid gap-6 lg:grid-cols-3">
            <Card>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-secondary">
                Total CO2 saved
              </p>
              <p className="mt-4 text-4xl font-bold text-brand font-mono">
                {dashboardQuery.data.totalCo2Saved.toFixed(2)} kg
              </p>
            </Card>
            <Card>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-secondary">
                Badges earned
              </p>
              <p className="mt-4 text-4xl font-bold text-brand font-mono">
                {dashboardQuery.data.badgeCount}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-secondary">
                Tracked journeys
              </p>
              <p className="mt-4 text-4xl font-bold text-brand font-mono">
                {dashboardQuery.data.history.length}
              </p>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-2xl font-bold text-foreground">Earned badges</h2>
                <Badge variant="success">{dashboardQuery.data.badgeCount} earned</Badge>
              </div>
              <div className="mt-5 grid gap-3">
                {dashboardQuery.data.earnedBadges.length ? (
                  dashboardQuery.data.earnedBadges.map((badge) => (
                    <div
                      key={`${badge.name}-${badge.earnedAt}`}
                      className="rounded-xl border border-brand/30 bg-brand-soft p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                          style={{ backgroundColor: '#009b48', border: '2px solid #009b48', color: 'white' }}
                        >
                          {badge.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-foreground">{badge.name}</p>
                            <Badge variant="success">Unlocked</Badge>
                          </div>
                          <p className="mt-1 text-sm text-secondary">
                            {badge.description}
                          </p>
                          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-secondary font-mono">
                            Earned {formatDateTime(badge.earnedAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <StatePanel
                    title="Your first badge is still ahead"
                    description="Complete a few eligible journeys and your first unlocked badge will appear here."
                  />
                )}
              </div>
            </Card>

            <Card>
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
              <div className="mt-5 grid gap-3">
                {dashboardQuery.data.allBadges.map((badge) => {
                  const earned = earnedBadgeNames.has(badge.name);
                  return (
                    <div
                      key={badge.name}
                      className="rounded-xl border border-line bg-surface-strong p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                          style={{
                            backgroundColor: earned ? '#009b48' : 'transparent',
                            border: `2px solid ${earned ? '#009b48' : '#2a2d33'}`,
                            color: earned ? 'white' : '#7d8590',
                          }}
                        >
                          {badge.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-foreground">{badge.name}</p>
                            <Badge variant={earned ? "success" : "muted"}>
                              {earned ? "Earned" : "Locked"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-secondary">
                            {badge.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </section>

          <section className="grid gap-6">
            <Card>
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
            </Card>
          </section>
        </>
      ) : null}
    </div>
  );
}
