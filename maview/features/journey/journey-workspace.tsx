"use client";

import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatePanel } from "@/components/ui/state-panel";
import { googleTasksApi } from "@/lib/api/google";
import { journeysApi } from "@/lib/api/journeys";
import { usersApi } from "@/lib/api/users";
import type {
  JourneyPlanRequest,
  JourneyResponse,
  LineInfo,
  StopInfo,
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
} from "@/lib/utils/format";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";

type PlannerState = {
  originQuery: string;
  destinationQuery: string;
  departureTime: string;
  intermediateQuery: string;
  intermediateDepartureTime: string;
  ecoModeEnabled: boolean;
  wheelchairAccessible: boolean;
  namedComfortSettingId: string;
  includeTaskOptimization: boolean;
};

type PlanningOutcome = {
  journeys: JourneyResponse[];
  fallbackUsed: boolean;
  taskOptimizationAttempted: boolean;
};

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
      return "#7d8590";
    case "TRANSFER":
      return "#ffd100";
    default:
      return "#009b48";
  }
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

export function JourneyWorkspace() {
  const queryClient = useQueryClient();
  const { user, token } = useAuth();
  const { toast } = useToast();

  const [planner, setPlanner] = useState<PlannerState>({
    originQuery: "",
    destinationQuery: "",
    departureTime: getLocalDateTimeInputValue(),
    intermediateQuery: "",
    intermediateDepartureTime: "",
    ecoModeEnabled: false,
    wheelchairAccessible: false,
    namedComfortSettingId: "",
    includeTaskOptimization: false,
  });
  const [results, setResults] = useState<JourneyResponse[]>([]);
  const [currentJourney, setCurrentJourney] = useState<JourneyResponse | null>(null);
  const [journeyMessage, setJourneyMessage] = useState<string | null>(null);
  const [disruptionMode, setDisruptionMode] = useState<"line" | "station" | null>(null);
  const [showOriginSuggestion, setShowOriginSuggestion] = useState(false);

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
    enabled: Boolean(user?.userId && token && googleLinked),
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
    mutationFn: async (): Promise<PlanningOutcome> => {
      if (!user?.userId || !token) {
        throw new Error("An authenticated session is required.");
      }

      if (!planner.originQuery.trim() || !planner.destinationQuery.trim()) {
        throw new Error("Origin and destination are required.");
      }
      if (!planner.departureTime) {
        throw new Error("Departure time is required.");
      }
      if (
        planner.intermediateQuery &&
        planner.intermediateDepartureTime &&
        planner.intermediateDepartureTime <= planner.departureTime
      ) {
        throw new Error("Via departure must be after the first departure.");
      }

      const payload: JourneyPlanRequest = {
        journey: {
          userId: user.userId,
          originQuery: planner.originQuery.trim(),
          destinationQuery: planner.destinationQuery.trim(),
          departureTime: planner.departureTime,
          ecoModeEnabled: planner.ecoModeEnabled,
          wheelchairAccessible: planner.wheelchairAccessible,
          intermediateQuery: planner.intermediateQuery.trim() || undefined,
          intermediateDepartureTime:
            planner.intermediateDepartureTime || undefined,
        },
        preferences: {
          comfortMode: Boolean(planner.namedComfortSettingId),
          namedComfortSettingId: planner.namedComfortSettingId || undefined,
        },
      };

      let requestPayload: JourneyPlanRequest = payload;
      let attemptedTaskOptimization = false;
      let fallbackUsed = false;
      if (planner.includeTaskOptimization && googleLinked) {
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
      departureTime: getTomorrowLocalDateTimeValue(),
    }));
    toast({
      title: "Planner prefilled",
      description: "Tomorrow's suggestion has been added to the planner.",
      variant: "success",
    });
  }

  if (!user || !token) {
    return null;
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="rounded-[2rem]">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="accent">Journey Planner</Badge>
            <Badge variant={googleLinked ? "success" : "muted"}>
              {googleLinked ? "Task-aware planning ready" : "Task sync optional"}
            </Badge>
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
                autoComplete="off"
              />
              {showOriginSuggestion && homeAddressSuggestion ? (
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    updatePlanner("originQuery", homeAddressSuggestion);
                    setShowOriginSuggestion(false);
                  }}
                  className="absolute left-0 right-0 top-full z-20 mt-2 flex items-start justify-between rounded-2xl border border-line bg-surface px-4 py-3 text-left shadow-[0_18px_40px_rgba(0,0,0,0.28)] transition hover:border-brand/30 hover:bg-surface-strong"
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
            <Input
              label="To"
              value={planner.destinationQuery}
              onChange={(event) =>
                updatePlanner("destinationQuery", event.target.value)
              }
              placeholder="Châtelet"
            />
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

          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-3 rounded-lg bg-surface-strong border border-line px-4 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={planner.ecoModeEnabled}
                onChange={(event) =>
                  updatePlanner("ecoModeEnabled", event.target.checked)
                }
              />
              Eco mode
            </label>
            <label className="flex items-center gap-3 rounded-lg bg-surface-strong border border-line px-4 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={planner.wheelchairAccessible}
                onChange={(event) =>
                  updatePlanner("wheelchairAccessible", event.target.checked)
                }
              />
              Wheelchair access
            </label>
            <label className="flex items-center gap-3 rounded-lg bg-surface-strong border border-line px-4 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={planner.includeTaskOptimization}
                onChange={(event) =>
                  updatePlanner("includeTaskOptimization", event.target.checked)
                }
              />
              Include Google Tasks stops
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              onClick={() => planJourney.mutate()}
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

        <Card className="rounded-[2rem]">
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
        <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
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

      {results.length ? (
        <section className="grid gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-secondary">
                Trip Options
              </p>
              <h2 className="mt-2 text-2xl font-bold text-foreground">Available itineraries</h2>
            </div>
            <Badge variant="accent">
              {results.length} option{results.length > 1 ? "s" : ""}
            </Badge>
          </div>

          {results.map((journey, index) => (
            <Card key={journey.journeyId}>
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="muted">Option {index + 1}</Badge>
                    {planner.ecoModeEnabled ? <Badge variant="success">Eco mode</Badge> : null}
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

                <div className="w-full max-w-sm rounded-xl bg-surface-strong border border-line p-5">
                  <div className="grid gap-0">
                    {journey.segments.map((segment) => (
                      <div key={segment.segmentId} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
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
                            className="w-3 h-3 rounded-full flex-shrink-0"
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
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5">
                    <Button
                      className="w-full"
                      onClick={() => startJourney.mutate(journey)}
                      disabled={startJourney.isPending}
                    >
                      {startJourney.isPending ? "Starting..." : "Start journey"}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  );
}
