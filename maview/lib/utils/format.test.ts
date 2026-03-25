import { describe, expect, it, vi } from "vitest";

import {
  formatDistance,
  formatDuration,
  formatProgress,
  getTomorrowDateString,
  isTaskCompleted,
  taskCompletedLabel,
} from "@/lib/utils/format";

describe("format helpers", () => {
  it("formats distances in meters and kilometers", () => {
    expect(formatDistance(245)).toBe("245 m");
    expect(formatDistance(1850)).toBe("1.9 km");
  });

  it("formats durations from seconds", () => {
    expect(formatDuration(600)).toBe("10m");
    expect(formatDuration(4500)).toBe("1h 15m");
  });

  it("detects Google completed task status", () => {
    expect(isTaskCompleted({ id: "1", title: "Done", status: "completed" })).toBe(
      true,
    );
    expect(taskCompletedLabel({ id: "2", title: "Later" })).toBe("No due date");
  });

  it("returns a bounded progress percentage", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-24T10:30:00.000Z"));

    expect(
      formatProgress("2026-03-24T10:00:00.000Z", "2026-03-24T11:00:00.000Z"),
    ).toBe(50);

    vi.useRealTimers();
  });

  it("builds tomorrow's ISO date string", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-24T08:00:00.000Z"));

    expect(getTomorrowDateString()).toBe("2026-03-25");

    vi.useRealTimers();
  });
});
