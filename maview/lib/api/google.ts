import { apiRequest } from "@/lib/api/fetcher";
import type { DefaultTaskList, GoogleTask, TaskDetail } from "@/lib/types/api";

export const googleTasksApi = {
  getDefaultList(userId: string, token: string) {
    return apiRequest<DefaultTaskList>(
      `/api/google/tasks/users/${userId}/default-list`,
      {
        method: "GET",
        token,
      },
    );
  },
  listTasks(
    userId: string,
    listId: string,
    options: { includeCompleted: boolean },
    token: string,
  ) {
    const params = new URLSearchParams({
      includeCompleted: String(options.includeCompleted),
    });

    return apiRequest<GoogleTask[]>(
      `/api/google/tasks/users/${userId}/lists/${encodeURIComponent(listId)}/tasks?${params.toString()}`,
      {
        method: "GET",
        token,
      },
    );
  },
  listSuggestions(userId: string, date: string, token: string) {
    return apiRequest<GoogleTask[]>(
      `/api/google/tasks/users/${userId}/suggestions?date=${encodeURIComponent(date)}`,
      {
        method: "GET",
        token,
      },
    );
  },
  getTasksForJourney(userId: string, token: string) {
    return apiRequest<
      Array<{
        id: string;
        title: string;
        locationQuery: string;
        locationHint?: { lat?: number; lng?: number } | null;
        completed?: boolean;
      }>
    >(
      `/api/google/tasks/users/${userId}/for-journey?includeCompleted=false`,
      {
        method: "GET",
        token,
      },
    ).then((tasks) =>
      tasks
        .map((task) => ({
          id: task.id,
          title: task.title,
          locationQuery: task.locationQuery,
          lat: task.locationHint?.lat,
          lng: task.locationHint?.lng,
          completed: Boolean(task.completed),
        }))
        .filter(
          (task): task is TaskDetail =>
            Boolean(
              task.id &&
                task.locationQuery &&
                typeof task.lat === "number" &&
                typeof task.lng === "number",
            ),
        ),
    );
  },
  completeTask(userId: string, listId: string, taskId: string, token: string) {
    return apiRequest<Record<string, unknown>>(
      `/api/google/tasks/users/${userId}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}/complete`,
      {
        method: "PATCH",
        token,
      },
    );
  },
  deleteTask(userId: string, listId: string, taskId: string, token: string) {
    return apiRequest<void>(
      `/api/google/tasks/users/${userId}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
      {
        method: "DELETE",
        token,
      },
    );
  },
};
