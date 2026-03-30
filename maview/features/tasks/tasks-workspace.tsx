"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatePanel } from "@/components/ui/state-panel";
import { googleTasksApi } from "@/lib/api/google";
import {
  formatTaskDateOnly,
  getTomorrowDateString,
  isTaskCompleted,
  taskCompletedLabel,
} from "@/lib/utils/format";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";

export function TasksWorkspace() {
  const queryClient = useQueryClient();
  const { user, token, refreshUser } = useAuth();
  const { toast } = useToast();
  const [includeCompleted, setIncludeCompleted] = useState(false);

  const googleLinked = Boolean(user?.googleAccountLinked);
  const canQueryTasks = Boolean(user?.userId && token && googleLinked);

  const defaultListQuery = useQuery({
    queryKey: ["google-default-list", user?.userId],
    queryFn: () => googleTasksApi.getDefaultList(user!.userId, token!),
    enabled: canQueryTasks,
    staleTime: 30_000,
  });

  const tasksQuery = useQuery({
    queryKey: [
      "google-tasks",
      user?.userId,
      defaultListQuery.data?.id,
      includeCompleted,
    ],
    queryFn: () =>
      googleTasksApi.listTasks(
        user!.userId,
        defaultListQuery.data!.id,
        { includeCompleted },
        token!,
      ),
    enabled: canQueryTasks && Boolean(defaultListQuery.data?.id),
  });

  const suggestionsQuery = useQuery({
    queryKey: ["google-suggestions", user?.userId, getTomorrowDateString()],
    queryFn: () =>
      googleTasksApi.listSuggestions(
        user!.userId,
        getTomorrowDateString(),
        token!,
    ),
    enabled: canQueryTasks,
  });

  const completeTask = useMutation({
    mutationFn: (taskId: string) =>
      googleTasksApi.completeTask(
        user!.userId,
        defaultListQuery.data!.id,
        taskId,
        token!,
      ),
    onSuccess: async () => {
      toast({
        title: "Task completed",
        description: "The task was marked as done.",
        variant: "success",
      });
      await queryClient.invalidateQueries({ queryKey: ["google-tasks"] });
    },
    onError: (error) => {
      toast({
        title: "Completion failed",
        description:
          error instanceof Error ? error.message : "Task update failed.",
        variant: "error",
      });
    },
  });

  const deleteTask = useMutation({
    mutationFn: (taskId: string) =>
      googleTasksApi.deleteTask(
        user!.userId,
        defaultListQuery.data!.id,
        taskId,
        token!,
      ),
    onSuccess: async () => {
      toast({
        title: "Task deleted",
        description: "The task was removed from your list.",
        variant: "success",
      });
      await queryClient.invalidateQueries({ queryKey: ["google-tasks"] });
    },
    onError: (error) => {
      toast({
        title: "Delete failed",
        description:
          error instanceof Error ? error.message : "Task delete failed.",
        variant: "error",
      });
    },
  });

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) {
        return;
      }
      if (event.data?.type === "GOOGLE_TASKS_LINKED") {
        void refreshUser();
        void queryClient.invalidateQueries({ queryKey: ["google-default-list"] });
        toast({
          title: "Google Tasks connected",
          description: "Your task list is ready to use.",
          variant: "success",
        });
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [queryClient, refreshUser, toast]);

  const linkedStatus = useMemo(() => {
    if (!user) {
      return "No authenticated user.";
    }
    if (!googleLinked) {
      return "Connect Google Tasks to sync errands and route-aware reminders.";
    }
    return user.googleAccountEmail || "Google Tasks is connected.";
  }, [googleLinked, user]);

  function openGooglePopup() {
    if (!user?.userId) {
      return;
    }
    const popup = window.open(
      `/api/google/tasks/link?userId=${encodeURIComponent(user.userId)}`,
      "googleTasksLink",
      "width=600,height=700",
    );

    if (!popup) {
      toast({
        title: "Popup blocked",
        description: "Allow popups to finish connecting Google Tasks.",
        variant: "error",
      });
    }
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-[2rem]">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={googleLinked ? "success" : "accent"}>
              {googleLinked ? "Google Tasks connected" : "Connection needed"}
            </Badge>
            <Badge variant="muted">Task sync</Badge>
          </div>
          <h1 className="mt-5 page-title text-foreground">My Tasks</h1>
          <p className="mt-4 page-copy">
            Keep the errands that matter close to route planning, without
            turning this page into another dashboard.
          </p>
          <div className="mt-6 rounded-lg bg-surface-strong border border-line p-5">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-secondary font-mono">
              Linked Account
            </p>
            <p className="mt-2 text-sm leading-6 text-foreground font-mono">{linkedStatus}</p>
            <p className="mt-2 text-sm leading-6 text-secondary">
              Once connected, Mavigo can load your tasks, suggest tomorrow&apos;s
              trips, and include eligible stops in route planning.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={openGooglePopup}>Link Google Tasks</Button>
          </div>
        </Card>

        <Card className="rounded-[2rem]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-secondary">
                Main Task List
              </p>
              <h2 className="mt-2 text-2xl font-bold text-foreground">
                {defaultListQuery.data?.title || "Connect Google Tasks to load a list"}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="accent">
                {tasksQuery.data?.filter((task) => Boolean(task.locationQuery)).length ?? 0} ready
              </Badge>
              <label className="flex items-center gap-3 rounded-lg bg-surface-strong border border-line px-4 py-2 text-sm font-medium text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeCompleted}
                  onChange={(event) => setIncludeCompleted(event.target.checked)}
                />
                Include completed
              </label>
            </div>
          </div>

          {defaultListQuery.isLoading ? (
            <StatePanel
              className="mt-6"
              eyebrow="Loading"
              title="Opening your task list"
              description="We’re fetching your main Google Tasks list."
            />
          ) : defaultListQuery.error ? (
            <StatePanel
              className="mt-6"
              eyebrow="Task list unavailable"
              title="We couldn’t load your task list"
              description={defaultListQuery.error.message}
              tone="danger"
            />
          ) : !googleLinked ? (
            <StatePanel
              className="mt-6"
              eyebrow="Connection required"
              title="Connect Google Tasks first"
              description="Once linked, your main task list will appear here."
              tone="warning"
            />
          ) : null}

          <div className="mt-6 grid gap-4">
            {tasksQuery.isLoading ? (
              <StatePanel
                eyebrow="Loading"
                title="Fetching tasks"
                description="Your list is on the way."
              />
            ) : tasksQuery.error ? (
              <StatePanel
                eyebrow="Tasks unavailable"
                title="We couldn’t load this task list"
                description={tasksQuery.error.message}
                tone="danger"
              />
            ) : tasksQuery.data?.length ? (
              tasksQuery.data.map((task) => {
                const completed = isTaskCompleted(task);
                return (
                  <div
                    key={task.id}
                    className="rounded-xl border border-line bg-surface-strong p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-foreground">
                            {task.title || "Untitled task"}
                          </h3>
                          {task.locationQuery ? (
                            <Badge variant="success">Route-ready</Badge>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm text-secondary">
                          {task.locationQuery
                            ? `Route tag: ${task.locationQuery}`
                            : "No route tag added yet"}
                        </p>
                        <p className="mt-2 text-sm text-secondary font-mono">
                          {taskCompletedLabel(task)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          disabled={completed || completeTask.isPending}
                          onClick={() => completeTask.mutate(task.id)}
                        >
                          {completed ? "Completed" : "Complete"}
                        </Button>
                        <Button
                          variant="danger"
                          disabled={deleteTask.isPending}
                          onClick={() => deleteTask.mutate(task.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <StatePanel
                eyebrow="Nothing queued"
                title="No tasks in this list yet"
                description="Add a task in Google Tasks and refresh this page to bring it into Mavigo."
              />
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-6">
        <Card className="rounded-[2rem]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-secondary">
                Tomorrow Suggestions
              </p>
              <h2 className="mt-2 text-2xl font-bold text-foreground">
                Suggested trips for {formatTaskDateOnly(getTomorrowDateString())}
              </h2>
            </div>
            <Badge variant="muted">
              {suggestionsQuery.data?.length ?? 0} tasks
            </Badge>
          </div>

          <div className="mt-5 grid gap-3">
            {suggestionsQuery.isLoading ? (
              <StatePanel
                eyebrow="Loading"
                title="Looking ahead to tomorrow"
                description="We’re checking upcoming tasks that may turn into trips."
              />
            ) : suggestionsQuery.error ? (
              <StatePanel
                eyebrow="Unavailable"
                title="Tomorrow’s suggestions are unavailable"
                description={suggestionsQuery.error.message}
                tone="danger"
              />
            ) : suggestionsQuery.data?.length ? (
              suggestionsQuery.data.map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl border border-line bg-surface-strong p-4"
                >
                  <p className="font-semibold text-foreground">
                    {task.title || "Untitled task"}
                  </p>
                  <p className="mt-1 text-sm text-secondary">
                    {task.locationQuery || "No Mavigo location tag"}
                  </p>
                  <p className="mt-1 text-sm text-secondary font-mono">
                    {taskCompletedLabel(task)}
                  </p>
                </div>
              ))
            ) : (
              <StatePanel
                eyebrow="All clear"
                title="No suggested trip for tomorrow yet"
                description="When tomorrow’s tasks include useful location details, they’ll show up here."
              />
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
