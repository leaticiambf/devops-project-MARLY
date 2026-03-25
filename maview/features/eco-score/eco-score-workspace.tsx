"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
        <h1 className="mt-5 page-title">Backend DTOs now render through Next</h1>
        <p className="mt-4 page-copy">
          The eco-score page is already using the shared typed API client. It is
          a smaller parity target than journeys, so it helps validate the shared
          data layer before the heavy migration step.
        </p>
      </Card>

      {dashboardQuery.isLoading ? (
        <Card>
          <p className="text-sm text-slate-600">Loading eco metrics...</p>
        </Card>
      ) : dashboardQuery.error ? (
        <Card>
          <p className="text-sm text-danger">{dashboardQuery.error.message}</p>
        </Card>
      ) : dashboardQuery.data ? (
        <>
          <section className="grid gap-6 lg:grid-cols-3">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Total CO2 saved
              </p>
              <p className="mt-4 text-4xl font-semibold">
                {dashboardQuery.data.totalCo2Saved.toFixed(2)} kg
              </p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Earned badges
              </p>
              <p className="mt-4 text-4xl font-semibold">
                {dashboardQuery.data.badgeCount}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                History entries
              </p>
              <p className="mt-4 text-4xl font-semibold">
                {dashboardQuery.data.history.length}
              </p>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <h2 className="text-2xl font-semibold">Unlocked badges</h2>
              <div className="mt-5 grid gap-3">
                {dashboardQuery.data.earnedBadges.length ? (
                  dashboardQuery.data.earnedBadges.map((badge) => (
                    <div
                      key={`${badge.name}-${badge.earnedAt}`}
                      className="rounded-[24px] bg-white/80 p-4"
                    >
                      <p className="font-semibold">{badge.name}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {badge.description}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-600">
                    No badges earned yet on this account.
                  </p>
                )}
              </div>
            </Card>

            <Card>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold">Badge system</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    This page now renders both earned and locked badges instead of
                    treating the dashboard like a summary-only endpoint.
                  </p>
                </div>
                <Badge variant="muted">
                  {dashboardQuery.data.earnedBadges.length}/
                  {dashboardQuery.data.allBadges.length} unlocked
                </Badge>
              </div>
              <div className="mt-5 grid gap-3">
                {dashboardQuery.data.allBadges.map((badge) => {
                  const earned = earnedBadgeNames.has(badge.name);
                  return (
                    <div
                      key={badge.name}
                      className="rounded-[24px] bg-white/80 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold">{badge.name}</p>
                        <Badge variant={earned ? "success" : "muted"}>
                          {earned ? "Earned" : "Locked"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {badge.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>
          </section>

          <section className="grid gap-6">
            <Card>
              <h2 className="text-2xl font-semibold">Journey activity</h2>
              <div className="mt-5 grid gap-3">
                {dashboardQuery.data.history.length ? (
                  dashboardQuery.data.history.map((item) => (
                    <div
                      key={`${item.journeyId}-${item.timestamp}`}
                      className="rounded-[24px] bg-white/80 p-4"
                    >
                      <p className="font-semibold">
                        {item.origin} to {item.destination}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {item.distance.toFixed(0)} m, {item.co2Saved.toFixed(2)} kg
                        saved
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                        {formatDateTime(item.timestamp)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-600">
                    Eco history is empty for this user.
                  </p>
                )}
              </div>
            </Card>
          </section>
        </>
      ) : null}
    </div>
  );
}
