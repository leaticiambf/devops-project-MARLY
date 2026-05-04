import { expect, type Page, type Route } from "@playwright/test";

import type {
  EcoDashboard,
  GoogleTask,
  JourneyResponse,
  NamedComfortSetting,
  TaskDetail,
  User,
} from "../../lib/types/api";

type MockOptions = {
  googleLinked?: boolean;
  userOverrides?: Partial<User>;
  planResponses?: JourneyResponse[][];
  initialTasks?: GoogleTask[];
  initialSuggestions?: GoogleTask[];
  initialJourneyTasks?: TaskDetail[];
  ecoDashboard?: EcoDashboard;
};

export type MockState = {
  user: User;
  planBodies: Array<Record<string, unknown>>;
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function buildUser(overrides: Partial<User> = {}): User {
  return {
    userId: "user-123",
    externalId: null,
    email: "jane@example.com",
    displayName: "Jane Doe",
    homeAddress: "12 Rue de Rivoli, Paris",
    createdAt: "2026-03-25T09:00:00.000Z",
    googleAccountLinked: true,
    googleAccountEmail: "jane@gmail.com",
    googleAccountLinkedAt: "2026-03-24T18:00:00.000Z",
    comfortProfile: null,
    hasSeenComfortPrompt: false,
    ...overrides,
  };
}

function buildJourney(
  journeyId: string,
  overrides: Partial<JourneyResponse> = {},
): JourneyResponse {
  const base: JourneyResponse = {
    journeyId,
    userId: "user-123",
    originLabel: "Gare de Lyon",
    destinationLabel: "Chatelet",
    plannedDeparture: "2026-03-26T08:00:00.000Z",
    plannedArrival: "2026-03-26T08:28:00.000Z",
    comfortModeEnabled: false,
    primItineraryId: "itinerary-1",
    status: "PLANNED",
    actualDeparture: null,
    actualArrival: null,
    disruptionCount: 0,
    summary: {
      totalSegments: 1,
      totalPoints: 2,
      transferCount: 0,
      disruptedCount: 0,
      linesUsed: ["A"],
    },
    segments: [
      {
        segmentId: `${journeyId}-segment-1`,
        sequenceOrder: 0,
        segmentType: "TRANSIT",
        transitMode: "METRO",
        lineCode: "A",
        lineName: "RER A",
        lineColor: "0C7C59",
        networkName: "RATP",
        scheduledDeparture: "2026-03-26T08:00:00.000Z",
        scheduledArrival: "2026-03-26T08:28:00.000Z",
        durationSeconds: 1680,
        distanceMeters: 6200,
        hasAirConditioning: true,
        points: [
          {
            pointId: `${journeyId}-point-1`,
            sequenceInSegment: 0,
            pointType: "ORIGIN",
            name: "Gare de Lyon",
            primStopPointId: "sp-1",
            primStopAreaId: "sa-1",
            latitude: 48.844,
            longitude: 2.373,
            scheduledArrival: null,
            scheduledDeparture: "2026-03-26T08:00:00.000Z",
            disrupted: false,
          },
          {
            pointId: `${journeyId}-point-2`,
            sequenceInSegment: 1,
            pointType: "DESTINATION",
            name: "Chatelet",
            primStopPointId: "sp-2",
            primStopAreaId: "sa-2",
            latitude: 48.858,
            longitude: 2.347,
            scheduledArrival: "2026-03-26T08:28:00.000Z",
            scheduledDeparture: null,
            disrupted: false,
          },
        ],
      },
    ],
    tasksOnRoute: [],
    includedTasks: [],
    baseDurationSeconds: 1680,
    newBadges: [],
    intermediateQuery: null,
    intermediateDepartureTime: null,
  };

  return {
    ...base,
    ...overrides,
  };
}

function buildEcoDashboard(): EcoDashboard {
  return {
    totalCo2Saved: 18.4,
    badgeCount: 1,
    earnedBadges: [
      {
        name: "Green Starter",
        description: "Complete your first low-carbon journey.",
        icon: "leaf",
        earnedAt: "2026-03-24T10:00:00.000Z",
      },
    ],
    allBadges: [
      {
        name: "Green Starter",
        description: "Complete your first low-carbon journey.",
        icon: "leaf",
      },
      {
        name: "Metro Regular",
        description: "Complete five public transport journeys.",
        icon: "train",
      },
    ],
    history: [
      {
        journeyId: "journey-eco-1",
        origin: "Bastille",
        destination: "La Defense",
        distance: 8400,
        co2Saved: 2.4,
        timestamp: "2026-03-23T09:15:00.000Z",
      },
    ],
  };
}

export async function seedSession(page: Page, userId = "user-123", token = "jwt-token") {
  await page.addInitScript(
    ([sessionUserId, sessionToken]) => {
      window.localStorage.setItem("mavigo_user_id", sessionUserId);
      window.localStorage.setItem("mavigo_token", sessionToken);
    },
    [userId, token] as const,
  );
}

export async function expectStoredSession(page: Page, userId = "user-123") {
  await expect
    .poll(async () =>
      page.evaluate(() => ({
        token: window.localStorage.getItem("mavigo_token"),
        userId: window.localStorage.getItem("mavigo_user_id"),
      })),
    )
    .toEqual({
      token: "jwt-token",
      userId,
    });
}

export async function installAppMocks(
  page: Page,
  options: MockOptions = {},
): Promise<MockState> {
  const user = buildUser({
    googleAccountLinked: options.googleLinked ?? true,
    googleAccountEmail: options.googleLinked === false ? null : "jane@gmail.com",
    ...options.userOverrides,
  });

  const state = {
    user,
    comfortSettings: [] as NamedComfortSetting[],
    tasks:
      options.initialTasks ??
      ([
        {
          id: "task-1",
          title: "Pick up parcel",
          locationQuery: "15 Rue Oberkampf, Paris",
          status: "needsAction",
          completed: false,
        },
        {
          id: "task-2",
          title: "Call insurance",
          status: "needsAction",
          completed: false,
        },
      ] satisfies GoogleTask[]),
    suggestions:
      options.initialSuggestions ??
      ([
        {
          id: "suggestion-1",
          title: "Morning meeting",
          locationQuery: "10 Avenue de l'Opera, Paris",
          status: "needsAction",
          completed: false,
        },
      ] satisfies GoogleTask[]),
    journeyTasks:
      options.initialJourneyTasks ?? [
        {
          id: "task-1",
          title: "Pick up parcel",
          locationQuery: "15 Rue Oberkampf, Paris",
          lat: 48.8654,
          lng: 2.3783,
          completed: false,
        },
      ],
    ecoDashboard: options.ecoDashboard ?? buildEcoDashboard(),
    planResponses: options.planResponses ?? [[buildJourney("journey-plan-1")]],
    planBodies: [] as Array<Record<string, unknown>>,
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname, searchParams } = url;
    const method = request.method();

    const readBody = () => {
      const body = request.postData();
      return body ? (JSON.parse(body) as Record<string, unknown>) : {};
    };

    if (pathname === "/api/users" && method === "POST") {
      const body = readBody();
      state.user = buildUser({
        ...state.user,
        email: String(body.email ?? state.user.email),
        displayName: `${body.firstName ?? "Jane"} ${body.lastName ?? "Doe"}`,
        homeAddress:
          typeof body.homeAddress === "string" && body.homeAddress.length > 0
            ? body.homeAddress
            : state.user.homeAddress,
      });

      return json(route, {
        token: "jwt-token",
        user: state.user,
      });
    }

    if (pathname === "/api/users/login" && method === "POST") {
      return json(route, {
        token: "jwt-token",
        user: state.user,
      });
    }

    if (pathname === `/api/users/${state.user.userId}` && method === "GET") {
      return json(route, state.user);
    }

    if (pathname === `/api/users/${state.user.userId}/home-address` && method === "PUT") {
      const body = readBody();
      state.user = {
        ...state.user,
        homeAddress: String(body.homeAddress ?? "").trim() || null,
      };
      return json(route, state.user);
    }

    if (pathname === `/api/users/${state.user.userId}/comfort-settings` && method === "GET") {
      return json(route, state.comfortSettings);
    }

    if (pathname === `/api/users/${state.user.userId}/comfort-settings` && method === "POST") {
      const body = readBody();
      const nextSetting: NamedComfortSetting = {
        id: `comfort-${state.comfortSettings.length + 1}`,
        name: String(body.name ?? "Preset"),
        comfortProfile: body.comfortProfile as NamedComfortSetting["comfortProfile"],
      };
      state.comfortSettings = [...state.comfortSettings, nextSetting];
      return json(route, nextSetting);
    }

    if (
      pathname.startsWith(`/api/users/${state.user.userId}/comfort-settings/`) &&
      method === "PUT"
    ) {
      const settingId = pathname.split("/").at(-1) ?? "";
      const body = readBody();
      state.comfortSettings = state.comfortSettings.map((setting) =>
        setting.id === settingId
          ? {
              ...setting,
              name: String(body.name ?? setting.name),
              comfortProfile: body.comfortProfile as NamedComfortSetting["comfortProfile"],
            }
          : setting,
      );
      return json(
        route,
        state.comfortSettings.find((setting) => setting.id === settingId),
      );
    }

    if (
      pathname.startsWith(`/api/users/${state.user.userId}/comfort-settings/`) &&
      method === "DELETE"
    ) {
      const settingId = pathname.split("/").at(-1) ?? "";
      state.comfortSettings = state.comfortSettings.filter(
        (setting) => setting.id !== settingId,
      );
      return json(route, {});
    }

    if (pathname === `/api/users/${state.user.userId}/comfort-prompt-seen` && method === "POST") {
      state.user = {
        ...state.user,
        hasSeenComfortPrompt: true,
      };
      return json(route, state.user);
    }

    if (pathname === "/api/auth/logout" && method === "POST") {
      return json(route, { ok: true });
    }

    if (
      pathname === `/api/google/tasks/users/${state.user.userId}/default-list` &&
      method === "GET"
    ) {
      return json(route, {
        id: "default-list",
        title: "My Tasks",
      });
    }

    if (
      pathname === `/api/google/tasks/users/${state.user.userId}/lists/default-list/tasks` &&
      method === "GET"
    ) {
      const includeCompleted = searchParams.get("includeCompleted") === "true";
      const tasks = includeCompleted
        ? state.tasks
        : state.tasks.filter((task) => task.status !== "completed");
      return json(route, tasks);
    }

    if (
      pathname.startsWith(
        `/api/google/tasks/users/${state.user.userId}/lists/default-list/tasks/`,
      ) &&
      pathname.endsWith("/complete") &&
      method === "PATCH"
    ) {
      const taskId = pathname.split("/").at(-2) ?? "";
      state.tasks = state.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: "completed",
              completed: "2026-03-25T10:30:00.000Z",
            }
          : task,
      );
      return json(route, { ok: true });
    }

    if (
      pathname.startsWith(
        `/api/google/tasks/users/${state.user.userId}/lists/default-list/tasks/`,
      ) &&
      method === "DELETE"
    ) {
      const taskId = pathname.split("/").at(-1) ?? "";
      state.tasks = state.tasks.filter((task) => task.id !== taskId);
      return route.fulfill({ status: 204 });
    }

    if (
      pathname === `/api/google/tasks/users/${state.user.userId}/suggestions` &&
      method === "GET"
    ) {
      return json(route, state.suggestions);
    }

    if (
      pathname === `/api/google/tasks/users/${state.user.userId}/for-journey` &&
      method === "GET"
    ) {
      return json(route, state.journeyTasks);
    }

    if (pathname === "/api/journeys" && method === "POST") {
      const body = readBody();
      state.planBodies.push(body);
      const nextResponse = state.planResponses.shift() ?? [buildJourney("journey-plan-fallback")];
      return json(route, nextResponse);
    }

    if (pathname === "/api/journeys/journey-plan-1/start" && method === "POST") {
      return json(
        route,
        buildJourney("journey-plan-1", {
          status: "IN_PROGRESS",
          actualDeparture: "2026-03-26T08:02:00.000Z",
        }),
      );
    }

    if (pathname === "/api/journeys/journey-plan-1/complete" && method === "POST") {
      return json(
        route,
        buildJourney("journey-plan-1", {
          status: "COMPLETED",
          actualDeparture: "2026-03-26T08:02:00.000Z",
          actualArrival: "2026-03-26T08:27:00.000Z",
          newBadges: [
            {
              name: "Green Starter",
              description: "Complete your first low-carbon journey.",
              icon: "leaf",
            },
          ],
        }),
      );
    }

    if (pathname === "/api/journeys/journey-plan-1/cancel" && method === "POST") {
      return json(
        route,
        buildJourney("journey-plan-1", {
          status: "CANCELLED",
        }),
      );
    }

    if (pathname === "/api/eco/dashboard" && method === "GET") {
      return json(route, state.ecoDashboard);
    }

    if (pathname.endsWith("/lines") && method === "GET") {
      return json(route, [
        {
          lineCode: "A",
          lineName: "RER A",
          lineColor: "0C7C59",
          mode: "RER",
        },
      ]);
    }

    if (pathname.endsWith("/stops") && method === "GET") {
      return json(route, [
        {
          stopAreaId: "sa-1",
          stopPointId: "sp-1",
          name: "Gare de Lyon",
          sequenceInJourney: 0,
          onLineCode: "A",
        },
      ]);
    }

    if (pathname.includes("/disruptions/line") || pathname.includes("/disruptions/station")) {
      return json(route, {
        disruptionId: 1,
        disruptionType: "LINE",
        disruptedPoint: null,
        newOrigin: null,
        alternatives: [buildJourney("journey-reroute-1")],
      });
    }

    return route.abort();
  });

  return {
    user: state.user,
    planBodies: state.planBodies,
  };
}
