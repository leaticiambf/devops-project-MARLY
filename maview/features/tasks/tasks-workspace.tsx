"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

  const journeyTasksQuery = useQuery({
    queryKey: ["google-journey-tasks", user?.userId],
    queryFn: () => googleTasksApi.getTasksForJourney(user!.userId, token!),
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
        description: "Google Tasks was updated through the Spring proxy.",
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
        description: "The default Google list was refreshed.",
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
          title: "Google linked",
          description: "The popup completed and session state was refreshed.",
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
      return "Google Tasks not linked yet.";
    }
    return user.googleAccountEmail || "Linked through Spring OAuth.";
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
        description: "Allow popups to complete Google Tasks linking.",
        variant: "error",
      });
    }
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={googleLinked ? "success" : "accent"}>
              {googleLinked ? "Google Linked" : "Google Pending"}
            </Badge>
            <Badge variant="muted">Popup OAuth</Badge>
          </div>
          <h1 className="mt-5 page-title">Google Tasks stays same-origin</h1>
          <p className="mt-4 page-copy">
            This page validates the migration’s hardest substrate: the popup
            flow still talks to Spring OAuth endpoints, but the browser only sees
            the frontend origin.
          </p>
          <div className="mt-6 rounded-[24px] bg-white/75 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
              Linked Account
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{linkedStatus}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              The popup still uses the Spring OAuth session, but the browser only
              ever talks to the frontend origin.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={openGooglePopup}>Link Google Tasks</Button>
            <Button
              variant="ghost"
              onClick={() => refreshUser()}
              disabled={!user?.userId}
            >
              Refresh status
            </Button>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Default List
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                {defaultListQuery.data?.title || "Waiting for link"}
              </h2>
            </div>
            <label className="flex items-center gap-3 rounded-full bg-white/70 px-4 py-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={includeCompleted}
                onChange={(event) => setIncludeCompleted(event.target.checked)}
              />
              Include completed
            </label>
          </div>

          {defaultListQuery.isLoading ? (
            <p className="mt-6 text-sm text-slate-600">Loading default list...</p>
          ) : defaultListQuery.error ? (
            <p className="mt-6 text-sm text-danger">
              {defaultListQuery.error.message}
            </p>
          ) : !googleLinked ? (
            <p className="mt-6 text-sm text-slate-600">
              Link a Google account to load task data through the proxy.
            </p>
          ) : null}

          <div className="mt-6 grid gap-4">
            {tasksQuery.isLoading ? (
              <p className="text-sm text-slate-600">Loading tasks...</p>
            ) : tasksQuery.error ? (
              <p className="text-sm text-danger">{tasksQuery.error.message}</p>
            ) : tasksQuery.data?.length ? (
              tasksQuery.data.map((task) => {
                const completed = isTaskCompleted(task);
                return (
                  <div
                    key={task.id}
                    className="rounded-[24px] border border-line bg-white/75 p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">
                          {task.title || "Untitled task"}
                        </h3>
                        <p className="mt-2 text-sm text-slate-600">
                          {task.locationQuery
                            ? `#mavigo: ${task.locationQuery}`
                            : "No Mavigo location tag"}
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
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
              <p className="text-sm text-slate-600">
                No tasks loaded from the default Google list.
              </p>
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Journey Optimization Feed
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                Tasks with `#mavigo:` locations
              </h2>
            </div>
            <Badge variant="accent">
              {journeyTasksQuery.data?.length ?? 0} usable
            </Badge>
          </div>

          <div className="mt-5 grid gap-3">
            {journeyTasksQuery.isLoading ? (
              <p className="text-sm text-slate-600">
                Loading task-optimization candidates...
              </p>
            ) : journeyTasksQuery.error ? (
              <p className="text-sm text-danger">
                {journeyTasksQuery.error.message}
              </p>
            ) : journeyTasksQuery.data?.length ? (
              journeyTasksQuery.data.map((task) => (
                <div
                  key={task.id}
                  className="rounded-[24px] border border-line bg-white/80 p-4"
                >
                  <p className="font-semibold text-slate-900">{task.title}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {task.locationQuery}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {task.lat.toFixed(4)}, {task.lng.toFixed(4)}
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-[24px] bg-white/70 p-4 text-sm text-slate-600">
                No Google task currently has enough location data to participate
                in journey optimization.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Tomorrow Suggestions
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                Suggested trips for {formatTaskDateOnly(getTomorrowDateString())}
              </h2>
            </div>
            <Badge variant="muted">
              {suggestionsQuery.data?.length ?? 0} tasks
            </Badge>
          </div>

          <div className="mt-5 grid gap-3">
            {suggestionsQuery.isLoading ? (
              <p className="text-sm text-slate-600">Loading tomorrow&apos;s tasks...</p>
            ) : suggestionsQuery.error ? (
              <p className="text-sm text-danger">
                {suggestionsQuery.error.message}
              </p>
            ) : suggestionsQuery.data?.length ? (
              suggestionsQuery.data.map((task) => (
                <div
                  key={task.id}
                  className="rounded-[24px] border border-line bg-white/80 p-4"
                >
                  <p className="font-semibold text-slate-900">
                    {task.title || "Untitled task"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {task.locationQuery || "No Mavigo location tag"}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {taskCompletedLabel(task)}
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-[24px] bg-white/70 p-4 text-sm text-slate-600">
                No location-tagged tasks are scheduled for tomorrow.
              </p>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
