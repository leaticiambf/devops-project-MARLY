export type DirectPathPreference =
  | "indifferent"
  | "none"
  | "only"
  | "only_with_alternatives";

export type ComfortProfile = {
  directPath: DirectPathPreference | null;
  requireAirConditioning: boolean | null;
  maxNbTransfers: number | null;
  maxWaitingDuration: number | null;
  maxWalkingDuration: number | null;
  wheelchairAccessible: boolean | null;
};

export type User = {
  userId: string;
  externalId: string | null;
  email: string;
  displayName: string;
  homeAddress: string | null;
  createdAt: string;
  googleAccountLinked: boolean;
  googleAccountEmail: string | null;
  googleAccountLinkedAt: string | null;
  comfortProfile: ComfortProfile | null;
  hasSeenComfortPrompt: boolean;
};

export type LoginResponse = {
  user: User;
  token: string;
};

export type RegisterRequest = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  passwordConfirm: string;
  homeAddress?: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type DefaultTaskList = {
  id: string;
  title: string;
};

export type TaskDetail = {
  id: string;
  title: string;
  locationQuery: string;
  lat: number;
  lng: number;
  completed: boolean;
};

export type GoogleTask = {
  id: string;
  title: string;
  notes?: string | null;
  status?: string | null;
  due?: string | null;
  completed?: string | boolean | null;
  updated?: string | null;
  locationQuery?: string | null;
};

export type NamedComfortSetting = {
  id: string;
  name: string;
  comfortProfile: ComfortProfile;
};

export type JourneyPlanRequest = {
  journey: {
    userId: string;
    originQuery: string;
    destinationQuery: string;
    originLatitude?: number | null;
    originLongitude?: number | null;
    destinationLatitude?: number | null;
    destinationLongitude?: number | null;
    source?: string | null;
    departureTime: string;
    ecoModeEnabled?: boolean;
    wheelchairAccessible?: boolean;
    intermediateQuery?: string | null;
    intermediateDepartureTime?: string | null;
    taskDetails?: TaskDetail[];
  };
  preferences?: {
    comfortMode: boolean;
    namedComfortSettingId?: string | null;
  };
};

export type JourneyPoint = {
  pointId: string;
  sequenceInSegment: number;
  pointType: string;
  name: string;
  primStopPointId: string | null;
  primStopAreaId: string | null;
  latitude: number | null;
  longitude: number | null;
  scheduledArrival: string | null;
  scheduledDeparture: string | null;
  disrupted: boolean;
};

export type JourneySegment = {
  segmentId: string;
  sequenceOrder: number;
  segmentType: string;
  transitMode: string | null;
  lineCode: string | null;
  lineName: string | null;
  lineColor: string | null;
  networkName: string | null;
  scheduledDeparture: string | null;
  scheduledArrival: string | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  hasAirConditioning: boolean | null;
  points: JourneyPoint[];
};

export type JourneyTaskOnRoute = {
  taskId: string;
  title: string;
  notes: string | null;
  locationLat: number | null;
  locationLng: number | null;
  distanceMeters: number | null;
};

export type IncludedTask = {
  taskId: string | null;
  title: string;
  locationQuery: string | null;
  additionalDurationSeconds: number | null;
  googleTaskId: string | null;
  /** Coordonnées GPS exactes du waypoint tâche (fournies par le backend, `UserTask.locationHint`). */
  locationLat: number | null;
  locationLng: number | null;
};

export type JourneyResponse = {
  journeyId: string;
  userId: string | null;
  originLabel: string;
  destinationLabel: string;
  plannedDeparture: string;
  plannedArrival: string;
  comfortModeEnabled: boolean;
  primItineraryId: string | null;
  status: string;
  actualDeparture: string | null;
  actualArrival: string | null;
  disruptionCount: number;
  summary: {
    totalSegments: number;
    totalPoints: number;
    transferCount: number;
    disruptedCount: number;
    linesUsed: string[];
  };
  segments: JourneySegment[];
  tasksOnRoute: JourneyTaskOnRoute[];
  includedTasks: IncludedTask[];
  baseDurationSeconds: number | null;
  newBadges: Array<{
    name: string;
    description: string;
    icon: string;
  }>;
  intermediateQuery: string | null;
  intermediateDepartureTime: string | null;
};

export type LineInfo = {
  lineCode: string;
  lineName: string;
  lineColor: string | null;
  mode: string;
};

export type StopInfo = {
  stopAreaId: string | null;
  stopPointId: string;
  name: string;
  sequenceInJourney: number;
  onLineCode: string | null;
};

export type RerouteResponse = {
  disruptionId: number;
  disruptionType: string;
  disruptedPoint: {
    name: string;
    stopAreaId: string | null;
    stopPointId: string | null;
  } | null;
  newOrigin: {
    name: string;
    stopAreaId: string | null;
    stopPointId: string | null;
  } | null;
  alternatives: JourneyResponse[];
};

export type EcoBadge = {
  name: string;
  description: string;
  icon: string;
  earnedAt: string;
};

export type EcoDashboard = {
  totalCo2Saved: number;
  badgeCount: number;
  earnedBadges: EcoBadge[];
  allBadges: Array<{
    name: string;
    description: string;
    icon: string;
  }>;
  history: Array<{
    journeyId: string;
    origin: string;
    destination: string;
    distance: number;
    co2Saved: number;
    timestamp: string;
  }>;
};

export type NearbyRestaurantParams = {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  limit?: number;
};

export type TourismSuggestion = {
  id: string;
  name: string;
  category: string;
  address: string | null;
  description: string | null;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: string | null;
  imageUrl: string | null;
  websiteUrl: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string;
  tags: string[];
};
