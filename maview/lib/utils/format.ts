import type { GoogleTask } from "@/lib/types/api";

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

const shortDateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
});

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return dateTimeFormat.format(parsed);
}

export function isTaskCompleted(task: GoogleTask) {
  return String(task.status || "").toLowerCase() === "completed";
}

export function taskCompletedLabel(task: GoogleTask) {
  if (task.due) {
    return `Due ${formatDateTime(task.due)}`;
  }
  if (task.completed && typeof task.completed === "string") {
    return `Completed ${formatDateTime(task.completed)}`;
  }
  return "No due date";
}

export function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds < 0) {
    return "Unknown";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours && minutes) {
    return `${hours}h ${minutes}m`;
  }
  if (hours) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

export function formatDistance(meters: number | null | undefined) {
  if (meters == null) {
    return "Unknown distance";
  }
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

export function getLocalDateTimeInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function getTomorrowLocalDateTimeValue(hours = 8, minutes = 0) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(hours, minutes, 0, 0);
  return getLocalDateTimeInputValue(tomorrow);
}

export function getTomorrowDateString() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

export function formatProgress(startAt?: string | null, endAt?: string | null) {
  if (!startAt || !endAt) {
    return 0;
  }

  const now = Date.now();
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return 0;
  }
  if (now <= start) {
    return 0;
  }
  if (now >= end) {
    return 100;
  }
  return Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100)));
}

export function formatTaskDateOnly(value?: string | null) {
  if (!value) {
    return "Tomorrow";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return shortDateFormat.format(parsed);
}
