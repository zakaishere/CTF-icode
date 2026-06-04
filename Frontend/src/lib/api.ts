import { logger } from "@/lib/logger";

export function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return "http://backend:8080";
  }
  return "";
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("icode_ctf_token");
}

export function setToken(token: string) {
  localStorage.setItem("icode_ctf_token", token);
}

export function clearToken() {
  localStorage.removeItem("icode_ctf_token");
}

// ── Structured error ────────────────────────────────────────────────────────

export interface ApiErrorBody {
  status:      number;
  code:        string;
  message:     string;
  fieldErrors?: Record<string, string>;
  path?:       string;
  timestamp?:  string;
}

export class ApiException extends Error {
  status:        number;
  code:          string;
  fieldErrors?:  Record<string, string>;
  /** Seconds to wait before retrying (populated from X-Rate-Limit-Retry-After-Seconds). */
  retryAfter?:   number;

  constructor(err: ApiErrorBody, retryAfter?: number) {
    super(err.message);
    this.name        = "ApiException";
    this.status      = err.status;
    this.code        = err.code;
    this.fieldErrors = err.fieldErrors;
    this.retryAfter  = retryAfter;
  }

  isValidationError() { return this.status === 400 && !!this.fieldErrors; }
  isNotFound()        { return this.status === 404; }
  isConflict()        { return this.status === 409; }
  isRateLimited()     { return this.status === 429; }
  isServerError()     { return this.status >= 500; }
  isAuthError()       { return this.status === 401; }
  isForbidden()       { return this.status === 403; }
}

// ── Core client ─────────────────────────────────────────────────────────────

async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {},
  config?: { silentErrors?: boolean }
): Promise<T> {
  const token  = getToken();
  const method = options.method ?? "GET";
  const url    = `${getApiBaseUrl()}${endpoint}`;
  const start  = Date.now();

  logger.debug("API", `→ ${method} ${endpoint}`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { cache: "no-store", ...options, headers });
  const duration = Date.now() - start;
  logger.api(method, endpoint, res.status, duration);

  if (res.ok) {
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return {} as T;
    const data = JSON.parse(text);
    return data as T;
  }

  let errBody: ApiErrorBody;
  try {
    const raw = await res.json();
    errBody = {
      status:     raw.status      ?? res.status,
      code:       raw.code        ?? "ERROR",
      message:    raw.message     ?? raw.error ?? `Request failed with status ${res.status}`,
      fieldErrors:raw.fieldErrors ?? undefined,
      path:       raw.path        ?? endpoint,
      timestamp:  raw.timestamp   ?? new Date().toISOString(),
    };
  } catch {
    errBody = {
      status:    res.status,
      code:      "PARSE_ERROR",
      message:   `Server error ${res.status}: ${res.statusText}`,
      path:      endpoint,
      timestamp: new Date().toISOString(),
    };
  }

  // Parse the Retry-After header supplied by the rate limiter.
  const retryAfterRaw = res.headers.get("X-Rate-Limit-Retry-After-Seconds");
  const retryAfter    = retryAfterRaw ? parseInt(retryAfterRaw, 10) : undefined;

  // Only log rate-limit errors at debug level — they're expected during burst
  // activity and should not spam the error console.
  if (errBody.status === 429) {
    logger.debug("API", `← ${method} ${endpoint} [429] rate limited; retry in ${retryAfter ?? "?"}s`);
  } else {
    logger.error("API", `← ${method} ${endpoint} [${errBody.status}] ${errBody.code}: ${errBody.message}`, errBody);
  }

  if (!config?.silentErrors) {
    showErrorToast(errBody);
  }

  throw new ApiException(errBody, retryAfter);
}

function showErrorToast(err: ApiErrorBody) {
  import("@/components/ui/PSPToast").then(({ toast }) => {
    switch (err.status) {
      case 400:
        if (err.fieldErrors) return;
        toast.warning("Action not allowed", err.message);
        break;
      case 401: {
        // Only treat as "session expired" when the user had a token (was logged in).
        // A 401 on /api/auth/* means wrong credentials — don't redirect, don't clear state.
        const isAuthEndpoint = typeof window !== "undefined" && window.location.pathname === "/auth";
        const hasToken = typeof window !== "undefined" && !!localStorage.getItem("icode_ctf_token");
        if (hasToken && !isAuthEndpoint) {
          toast.error("Session expired", "Please sign in again to continue.");
          localStorage.removeItem("icode_ctf_token");
          localStorage.removeItem("icode_ctf_role");
          localStorage.removeItem("icode_ctf_userId");
          localStorage.removeItem("icode_ctf_email");
          localStorage.removeItem("icode_ctf_username");
          document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
          document.cookie = "role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
          setTimeout(() => { window.location.href = "/"; }, 2000);
        }
        break;
      }
      case 403:
        toast.error("Access denied", err.message || "You don't have permission to do that.");
        break;
      case 404:
        toast.warning("Not found", err.message);
        break;
      case 409:
        toast.warning("Conflict", err.message);
        break;
      case 429:
        // Rate-limited — don't show a disruptive toast; the polling hooks will
        // back off automatically. Only warn if the user triggered the request.
        break;
      default:
        toast.error("Something went wrong", "We're having trouble completing your request. Please try again.");
    }
  }).catch(() => { /* toast unavailable */ });
}

// ── Auth ────────────────────────────────────────────────────────────────────

export interface RegisterPlayerRequest {
  username: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  role: string;
  userId: string;
  email: string;
  username: string;
}

export const registerPlayer = (data: RegisterPlayerRequest) =>
  apiClient<{ message: string }>("/api/auth/register", { method: "POST", body: JSON.stringify(data) });

export const login = (data: LoginRequest) =>
  apiClient<LoginResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(data) });

export const verifyEmail = (email: string, otpCode: string) =>
  apiClient<{ message: string }>("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ email, otpCode }) });

export const resendVerification = (email: string) =>
  apiClient<{ message: string }>("/api/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) });

export const forgotPassword = (email: string) =>
  apiClient<{ message: string }>("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });

export const resetPassword = (email: string, otpCode: string, newPassword: string) =>
  apiClient<{ message: string }>("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ email, otpCode, newPassword }) });

// ── CTF ──────────────────────────────────────────────────────────────────────

export interface CTFHintDTO {
  id: string;
  cost: number;
  text: string | null;
}

export interface CTFChallengeDTO {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  basePoints: number;
  currentPoints: number;
  flagFormat: string;
  requiresInstance: boolean;
  dockerImage: string | null;
  dockerExposedPort: number | null;
  connectionType: "HTTP" | "TCP" | null;
  downloadableFileUrl: string | null;
  downloadableFileName: string | null;
  hints: CTFHintDTO[];
  maxAttempts: number | null;
  isActive: boolean;
  createdAt: string;
  solvedByMe: boolean;
  solveCount: number;
  myUnlockedHints: string[];
  myAttempts: number;
  hasActiveInstance: boolean;
}

export interface CTFSubmitResponse {
  correct: boolean;
  message: string;
  pointsAwarded: number | null;
  attemptsUsed: number;
  maxAttempts: number | null;
}

export interface CTFSubmission {
  id: string;
  challengeId: string;
  userId: string;
  submittedValue: string;
  isCorrect: boolean;
  attemptNumber: number;
  submittedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface CTFInstanceResponse {
  instanceId:       string;
  connectionType:   "HTTP" | "TCP" | null;
  connectionString: string | null;
  accessUrl:        string | null;
  expiresAt:        string;
  status:           string;
  message:          string | null;
  renewalCount:     number;
}

export interface CTFInstanceWebSocketMessage {
  instanceId:       string;
  status:           "RUNNING" | "FAILED" | "EXPIRED";
  connectionType?:  "HTTP" | "TCP";
  connectionString?: string;
  accessUrl?:       string;
  expiresAt?:       string;
  renewalCount?:    number;
  error?:           string;
}

export interface CTFResourceConfig {
  id: number;
  maxConcurrentInstances: number;
  maxInstancesPerUser: number;
  maxInstanceDurationMinutes: number;
  containerMemoryLimitMb: number;
  containerCpuPercent: number;
  cleanupIntervalSeconds: number;
  updatedBy: string | null;
  updatedAt: string | null;
}

export const getCTFChallenges = (category?: string, difficulty?: string) => {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (difficulty) params.set("difficulty", difficulty);
  const qs = params.toString();
  return apiClient<CTFChallengeDTO[]>(`/api/ctf/challenges${qs ? "?" + qs : ""}`, { method: "GET" });
};

export const getCTFChallenge = (id: string) =>
  apiClient<CTFChallengeDTO>(`/api/ctf/challenges/${id}`, { method: "GET" });

export const submitCTFFlag = (challengeId: string, flag: string) =>
  apiClient<CTFSubmitResponse>(`/api/ctf/challenges/${challengeId}/submit`, {
    method: "POST",
    body: JSON.stringify({ flag }),
  }, { silentErrors: true });

export const getMyCTFSubmissions = (challengeId: string) =>
  apiClient<CTFSubmission[]>(`/api/ctf/challenges/${challengeId}/my-submissions`, { method: "GET" });

export const unlockCTFHint = (
  challengeId: string,
  hintId: string,
  opts?: { competitionId?: string; teamId?: string },
) => {
  const qs = new URLSearchParams();
  if (opts?.competitionId) qs.set("competitionId", opts.competitionId);
  if (opts?.teamId)        qs.set("teamId",        opts.teamId);
  const query = qs.toString() ? `?${qs}` : "";
  return apiClient<{ id: string; cost: number; text: string }>(
    `/api/ctf/challenges/${challengeId}/hints/${hintId}/unlock${query}`,
    { method: "POST" },
  );
};

export const getCtfInstanceStatus = (challengeId: string, teamId?: string) => {
  const qs = new URLSearchParams({ challengeId });
  if (teamId) qs.set("teamId", teamId);
  return apiClient<CTFInstanceResponse | null>(
    `/api/ctf/instances/status?${qs}`,
    { method: "GET" },
    { silentErrors: true }
  );
};

export const startCTFInstance = (
  challengeId: string,
  opts?: { competitionId?: string; teamId?: string }
) =>
  apiClient<CTFInstanceResponse>(`/api/ctf/instances/start`, {
    method: "POST",
    body: JSON.stringify({ challengeId, ...opts }),
  });

export const renewCTFInstance = (_challengeId: string, instanceId: string) =>
  apiClient<CTFInstanceResponse>(`/api/ctf/instances/${instanceId}/renew`, { method: "POST" });

export const stopCTFInstance = (_challengeId: string, instanceId: string) =>
  apiClient<void>(`/api/ctf/instances/${instanceId}`, { method: "DELETE" });

export const getCTFAdminConfig = () =>
  apiClient<CTFResourceConfig>("/api/ctf/admin/config", { method: "GET" });

export const updateCTFAdminConfig = (data: Partial<CTFResourceConfig>) =>
  apiClient<CTFResourceConfig>("/api/ctf/admin/config", {
    method: "PUT",
    body: JSON.stringify(data),
  });

// ── Admin CTF challenge management ───────────────────────────────────────────

export interface CTFHintRequest {
  cost: number;
  text: string;
}

export interface CTFChallengeCreateRequest {
  title:              string;
  description:        string;
  category:           string;
  difficulty:         string;
  basePoints:         number;
  flagType?:          "STATIC" | "DYNAMIC";
  plainFlag?:         string;
  flagFormat?:        string;
  requiresInstance?:  boolean;
  dockerImage?:       string;
  dockerExposedPort?: number;
  containerEnvVars?:  string;
  dockerFlagEnv?:     string;
  connectionType?:    "HTTP" | "TCP";
  dockerEnvVars?:     Record<string, string>;
  dockerMemoryMb?:    number;
  dockerCpuPercent?:  number;
  dockerPidsLimit?:   number;
  downloadableFileUrl?:  string;
  downloadableFileName?: string;
  mediaUrl?:             string;
  maxAttempts?:       number;
  isActive?:          boolean;
  hints?:             CTFHintRequest[];
}

export interface CTFChallengeUpdateRequest {
  title?:             string;
  description?:       string;
  category?:          string;
  difficulty?:        string;
  basePoints?:        number;
  flagType?:          "STATIC" | "DYNAMIC";
  plainFlag?:         string;
  flagFormat?:        string;
  requiresInstance?:  boolean;
  dockerImage?:       string;
  dockerExposedPort?: number;
  containerEnvVars?:  string;
  dockerFlagEnv?:     string;
  connectionType?:    "HTTP" | "TCP";
  dockerEnvVars?:     Record<string, string>;
  dockerMemoryMb?:    number;
  dockerCpuPercent?:  number;
  dockerPidsLimit?:   number;
  downloadableFileUrl?:  string;
  downloadableFileName?: string;
  mediaUrl?:             string;
  maxAttempts?:       number;
  isActive?:          boolean;
  hints?:             CTFHintRequest[];
}

export interface CTFChallengeResponse {
  id:                  string;
  title:               string;
  description:         string;
  category:            string;
  difficulty:          string;
  basePoints:          number;
  flagType:            "STATIC" | "DYNAMIC";
  flagFormat:          string;
  requiresInstance:    boolean;
  dockerImage:         string | null;
  dockerExposedPort:   number | null;
  containerEnvVars:    string | null;
  dockerFlagEnv:       string | null;
  connectionType:      "HTTP" | "TCP" | null;
  dockerEnvVars:       Record<string, string> | null;
  dockerMemoryMb:      number | null;
  dockerCpuPercent:    number | null;
  dockerPidsLimit:     number | null;
  downloadableFileUrl: string | null;
  downloadableFileName: string | null;
  hints:               { id: string; cost: number; text: string }[];
  maxAttempts:         number | null;
  isActive:            boolean;
  authorId:            string;
  createdAt:           string;
  updatedAt:           string;
  solveCount:          number;
  attemptCount:        number;
}

export interface CTFChallengeDetailResponse extends CTFChallengeResponse {
  recentSolves: {
    userId:          string;
    userDisplayName: string;
    solvedAt:        string;
    pointsAwarded:   number;
  }[];
  recentSubmissions: {
    id:                   string;
    userId:               string;
    userDisplayName:      string;
    correct:              boolean;
    submittedValueMasked: string;
    submittedAt:          string;
  }[];
}

export const getAdminCTFChallenges = (
  category?: string,
  difficulty?: string,
  status?: string,
) => {
  const params = new URLSearchParams();
  if (category)   params.set("category",   category);
  if (difficulty) params.set("difficulty", difficulty);
  if (status)     params.set("status",     status);
  const qs = params.toString();
  return apiClient<CTFChallengeResponse[]>(
    `/api/admin/ctf/challenges${qs ? "?" + qs : ""}`,
    { method: "GET" },
  );
};

export const getAdminCTFChallenge = (id: string) =>
  apiClient<CTFChallengeDetailResponse>(`/api/admin/ctf/challenges/${id}`, { method: "GET" });

export const createAdminCTFChallenge = (data: CTFChallengeCreateRequest) =>
  apiClient<CTFChallengeResponse>("/api/admin/ctf/challenges", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateAdminCTFChallenge = (id: string, data: CTFChallengeUpdateRequest) =>
  apiClient<CTFChallengeResponse>(`/api/admin/ctf/challenges/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

export const toggleAdminCTFChallenge = (id: string) =>
  apiClient<CTFChallengeResponse>(`/api/admin/ctf/challenges/${id}/toggle-active`, {
    method: "PATCH",
  });

export const deleteAdminCTFChallenge = (id: string) =>
  apiClient<{ message: string }>(`/api/admin/ctf/challenges/${id}`, { method: "DELETE" });

// keep legacy aliases so copied components don't break immediately
export const getTeacherCTFChallenges  = getAdminCTFChallenges;
export const getTeacherCTFChallenge   = getAdminCTFChallenge;
export const createTeacherCTFChallenge = createAdminCTFChallenge;
export const updateTeacherCTFChallenge = updateAdminCTFChallenge;
export const toggleTeacherCTFChallenge = toggleAdminCTFChallenge;
export const deleteTeacherCTFChallenge = deleteAdminCTFChallenge;

// ── CTF Competitions ──────────────────────────────────────────────────────────

export type CTFCompetitionStatus = "UPCOMING" | "ACTIVE" | "PAUSED" | "FROZEN" | "ENDED";

export interface CTFCompetitionDTO {
  id:           string;
  title:        string;
  description:  string | null;
  startTime:    string | null;
  endTime:      string | null;
  computedEndTime: string | null;
  maxTeamSize:  number;
  minTeamSize:  number;
  scoringMode:  "STATIC" | "DYNAMIC";
  visibility:   "PUBLIC" | "ACCESS_CODE" | "INVITE_ONLY";
  bannerUrl:    string | null;
  coverImageUrl: string | null;
  active:       boolean;
  started:      boolean;
  ended:        boolean;
  timingMode:      "SCHEDULED" | "DURATION" | "MANUAL" | "REGISTRATION";
  durationHours:   number | null;
  manuallyStarted: boolean;
  manuallyEnded:   boolean;
  status:           CTFCompetitionStatus;
  isPaused:         boolean;
  isFrozen:         boolean;
  pausedAt:         string | null;
  frozenAt:         string | null;
  registrationOpen: boolean;
  canEnterArena:    boolean;
  myTeam:           CTFTeamResponse | null;
}

export interface CTFCompetitionStatusPayload {
  id:               string;
  status:           CTFCompetitionStatus;
  startTime:        string | null;
  endTime:          string | null;
  myTeamId:         string | null;
  canEnterArena:    boolean;
  registrationOpen: boolean;
  participantCount: number;
  teamCount:        number;
  isPaused:         boolean;
  isFrozen:         boolean;
  pausedAt:         string | null;
  frozenAt:         string | null;
}

export interface CTFChallengeListResponse {
  status:          CTFCompetitionStatus;
  message:         string | null;
  challenges:      CTFCompetitionChallengeDTO[];
  categoryCounts:  Record<string, number> | null;
}

export interface CTFTeamMemberDTO {
  userId:             string;
  displayName:        string;
  role:               "CAPTAIN" | "MEMBER";
  joinedAt:           string;
  solveCount?:        number;
  pointsContributed?: number;
}

export interface CTFTeamResponse {
  id:            string;
  competitionId: string;
  name:          string;
  inviteCode:    string;
  avatarColor:   string;
  captainId:     string;
  members:       CTFTeamMemberDTO[];
  solveCount:    number;
  totalPoints:   number;
}

export interface CTFChallengeSolverDTO {
  teamId:       string;
  teamName:     string;
  avatarColor:  string;
  solvedAt:     string;
  bloodPosition?: number | null;
  bloodBonus?:    number | null;
}

export interface CTFTeamSolveEntryDTO {
  challengeId:    string;
  challengeTitle: string;
  category:       string;
  currentPoints:  number;
  solvedAt:       string;
}

export interface CTFTeamProfileDTO {
  id:           string;
  competitionId: string;
  name:         string;
  avatarColor:  string;
  captainId:    string;
  rank:         number;
  totalPoints:  number;
  solveCount:   number;
  members:      CTFTeamMemberDTO[];
  solves:       CTFTeamSolveEntryDTO[];
}

export interface CTFScoreboardEntryDTO {
  rank:         number;
  teamId:       string;
  teamName:     string;
  avatarColor:  string;
  totalPoints:  number;
  solveCount:   number;
  membersCount: number;
  lastSolveAt:  string | null;
}

export interface CTFScoreTimelineDTO {
  teams: {
    teamId:      string;
    teamName:    string;
    accentColor: string;
    points:      { time: string; score: number }[];
  }[];
  competitionStart: string | null;
  competitionEnd:   string | null;
}

export interface CTFFeedEventDTO {
  competitionId:  string;
  teamId:         string;
  teamName:       string;
  avatarColor:    string;
  challengeId:    string;
  challengeTitle: string;
  pointsAwarded:  number;
  solvedAt:       string;
}

export interface CTFCompetitionChallengeDTO {
  id:                  string;
  title:               string;
  authorName?:         string | null;
  description:         string;
  category:            string;
  difficulty:          "EASY" | "MEDIUM" | "HARD";
  basePoints:          number;
  currentPoints?:      number;
  flagFormat:          string;
  flagType?:           "STATIC" | "DYNAMIC";
  requiresInstance:    boolean;
  dockerImage?:        string | null;
  dockerExposedPort?:  number | null;
  connectionType?:     "HTTP" | "TCP" | null;
  dockerFlagEnv?:      string | null;
  dockerEnvVars?:      Record<string, string> | null;
  dockerMemoryMb?:     number | null;
  dockerCpuPercent?:   number | null;
  dockerPidsLimit?:    number | null;
  downloadableFileUrl: string | null;
  downloadableFileName:string | null;
  mediaUrl?:           string | null;
  hints:               CTFHintDTO[];
  maxAttempts:         number | null;
  isActive:            boolean;
  isHidden?:           boolean | null;
  solveCount:          number;
  solvedByMe:          boolean;
  myHintPenalty?:      number;
  bloodBonusEnabled?:  boolean;
  firstBloodBonus?:    number | null;
  secondBloodBonus?:   number | null;
  thirdBloodBonus?:    number | null;
}

export interface CTFCompetitionSubmitResponse {
  correct:          boolean;
  message:          string;
  pointsAwarded:    number | null;
  newRank:          number | null;
  attemptsUsed:     number;
  attemptsRemaining: number | null;
  lockedOut:        boolean;
}

export interface CTFAttemptDTO {
  id:            string;
  submittedAt:   string;
  correct:       boolean;
  flagMasked:    string;
  attemptNumber: number;
}

export const getMyCtfAttempts = (competitionId: string, challengeId: string) =>
  apiClient<CTFAttemptDTO[]>(
    `/api/ctf/competitions/${competitionId}/challenges/${challengeId}/my-attempts`,
    { method: "GET" },
    { silentErrors: true },
  );

export const getCtfCompetitions = () =>
  apiClient<CTFCompetitionDTO[]>("/api/ctf/competitions", { method: "GET" });

export const joinCtfByAccessCode = (accessCode: string) =>
  apiClient<CTFCompetitionDTO>("/api/ctf/competitions/join", {
    method: "POST",
    body: JSON.stringify({ accessCode }),
  }, { silentErrors: true });

export const getCtfCompetition = (id: string) =>
  apiClient<CTFCompetitionDTO>(`/api/ctf/competitions/${id}`, { method: "GET" });

export const getCtfCompetitionChallenges = (competitionId: string) =>
  apiClient<CTFChallengeListResponse>(`/api/ctf/competitions/${competitionId}/challenges`, { method: "GET" });

export const getCtfCompetitionStatus = (competitionId: string) =>
  apiClient<CTFCompetitionStatusPayload>(`/api/ctf/competitions/${competitionId}/status`, { method: "GET" }, { silentErrors: true });

// ── CTF Notifications ────────────────────────────────────────────────────────

export type CTFNotificationType =
  | "COMPETITION_STARTED"
  | "COMPETITION_PAUSED"
  | "COMPETITION_RESUMED"
  | "COMPETITION_ENDING_SOON"
  | "COMPETITION_ENDED"
  | "NEW_CHALLENGE"
  | "CHALLENGE_UPDATED"
  | "HINT_ADDED"
  | "SCOREBOARD_FROZEN"
  | "SCOREBOARD_UNFROZEN"
  | "TEAM_DISQUALIFIED"
  | "CUSTOM";

export interface CTFNotificationDTO {
  id:             string;
  competitionId:  string | null;
  type:           CTFNotificationType;
  title:          string;
  body:           string | null;
  metadata:       Record<string, unknown> | null;
  sentAt:         string;
}

export const getCtfNotifications = (competitionId: string) =>
  apiClient<CTFNotificationDTO[]>(`/api/ctf/competitions/${competitionId}/notifications`, { method: "GET" }, { silentErrors: true });

export const broadcastAdminCtfMessage = (competitionId: string, title: string, body: string) =>
  apiClient<CTFNotificationDTO>(
    `/api/admin/ctf/competitions/${competitionId}/notify`,
    { method: "POST", body: JSON.stringify({ title, body }) },
  );

// legacy alias
export const broadcastTeacherCtfMessage = broadcastAdminCtfMessage;

export const getChallengeSolvers = (competitionId: string, challengeId: string) =>
  apiClient<CTFChallengeSolverDTO[]>(
    `/api/ctf/competitions/${competitionId}/challenges/${challengeId}/solvers`,
    { method: "GET" },
  );

export const getCtfTeamProfile = (competitionId: string, teamId: string) =>
  apiClient<CTFTeamProfileDTO>(
    `/api/ctf/competitions/${competitionId}/teams/${teamId}/profile`,
    { method: "GET" },
  );

export const getCtfScoreboard = (competitionId: string) =>
  apiClient<CTFScoreboardEntryDTO[]>(`/api/ctf/competitions/${competitionId}/scoreboard`, { method: "GET" });

export const getCtfScoreboardLive = (competitionId: string) =>
  apiClient<CTFScoreboardEntryDTO[]>(`/api/ctf/admin/competitions/${competitionId}/scoreboard/live`, { method: "GET" });

export const getCtfScoreboardGraph = (competitionId: string, topN = 10) =>
  apiClient<CTFScoreTimelineDTO>(
    `/api/ctf/competitions/${competitionId}/scoreboard/graph?topN=${topN}`,
    { method: "GET" },
  );

export const getCtfFeed = (competitionId: string) =>
  apiClient<CTFFeedEventDTO[]>(`/api/ctf/competitions/${competitionId}/feed`, { method: "GET" });

export const submitCtfCompetitionFlag = (competitionId: string, challengeId: string, flag: string) =>
  apiClient<CTFCompetitionSubmitResponse>(
    `/api/ctf/competitions/${competitionId}/challenges/${challengeId}/submit`,
    { method: "POST", body: JSON.stringify({ flag }) },
    { silentErrors: true }
  );

export const getCtfMyTeam = (competitionId: string) =>
  apiClient<CTFTeamResponse | null>(`/api/ctf/competitions/${competitionId}/teams/mine`,
    { method: "GET" }, { silentErrors: true });

export const createCtfTeam = (competitionId: string, data: { name: string; avatarColor?: string }) =>
  apiClient<CTFTeamResponse>(`/api/ctf/competitions/${competitionId}/teams`, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const joinCtfTeam = (competitionId: string, inviteCode: string) =>
  apiClient<CTFTeamResponse>(`/api/ctf/competitions/${competitionId}/teams/join`, {
    method: "POST",
    body: JSON.stringify({ inviteCode }),
  });

export const leaveCtfTeam = (competitionId: string) =>
  apiClient<void>(`/api/ctf/competitions/${competitionId}/teams/mine/leave`, { method: "DELETE" });

export const kickCtfTeamMember = (competitionId: string, targetUserId: string) =>
  apiClient<void>(`/api/ctf/competitions/${competitionId}/teams/mine/kick/${targetUserId}`, { method: "DELETE" });

export const transferCtfCaptaincy = (competitionId: string, newCaptainId: string) =>
  apiClient<CTFTeamResponse>(`/api/ctf/competitions/${competitionId}/teams/mine/transfer`, {
    method: "POST",
    body: JSON.stringify({ newCaptainId }),
  });

// ── Admin: CTF Competition management ────────────────────────────────────────

export interface CTFCompetitionCreateRequest {
  title:              string;
  description?:       string;
  timingMode?:        "SCHEDULED" | "DURATION" | "MANUAL" | "REGISTRATION";
  startTime?:         string;
  endTime?:           string;
  durationHours?:     number;
  registrationOpen?:  boolean;
  maxTeamSize?:       number;
  minTeamSize?:       number;
  scoringMode?:       "STATIC" | "DYNAMIC";
  dynamicMinPoints?:  number;
  dynamicDecayFactor?: number;
  visibility?:        "PUBLIC" | "ACCESS_CODE" | "INVITE_ONLY";
  accessCode?:        string;
  bannerUrl?:         string;
}

export type CTFCompetitionUpdateRequest = Partial<CTFCompetitionCreateRequest> & {
  isActive?: boolean;
};

export const listAdminCtfCompetitions = () =>
  apiClient<CTFCompetitionDTO[]>("/api/admin/ctf/competitions", { method: "GET" });

export const getAdminCtfCompetition = (id: string) =>
  apiClient<CTFCompetitionDTO>(`/api/admin/ctf/competitions/${id}`, { method: "GET" });

export const createAdminCtfCompetition = (data: CTFCompetitionCreateRequest) =>
  apiClient<CTFCompetitionDTO>("/api/admin/ctf/competitions", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateAdminCtfCompetition = (id: string, data: CTFCompetitionUpdateRequest) =>
  apiClient<CTFCompetitionDTO>(`/api/admin/ctf/competitions/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

export async function uploadCtfCoverImage(
  id: string,
  file: File,
): Promise<{ coverImageUrl: string }> {
  const base = getApiBaseUrl();
  const token = getToken();
  const fd = new FormData();
  fd.append("image", file);
  const res = await fetch(`${base}/api/admin/ctf/competitions/${id}/cover`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "Upload failed");
    throw new Error(msg);
  }
  return res.json();
}

export const pauseAdminCtfCompetition = (id: string) =>
  apiClient<CTFCompetitionDTO>(`/api/admin/ctf/competitions/${id}/pause`, { method: "POST" });

export const resumeAdminCtfCompetition = (id: string) =>
  apiClient<CTFCompetitionDTO>(`/api/admin/ctf/competitions/${id}/resume`, { method: "POST" });

export const freezeAdminCtfCompetition = (id: string) =>
  apiClient<CTFCompetitionDTO>(`/api/admin/ctf/competitions/${id}/freeze`, { method: "POST" });

export const unfreezeAdminCtfCompetition = (id: string) =>
  apiClient<CTFCompetitionDTO>(`/api/admin/ctf/competitions/${id}/unfreeze`, { method: "POST" });

export const startManualCtfCompetition = (id: string) =>
  apiClient<CTFCompetitionDTO>(`/api/admin/ctf/competitions/${id}/start`, { method: "POST" });

export const endAdminCtfCompetition = (id: string) =>
  apiClient<CTFCompetitionDTO>(`/api/admin/ctf/competitions/${id}/end`, { method: "POST" });

// legacy aliases so copied components still compile
export const listTeacherCtfCompetitions   = listAdminCtfCompetitions;
export const getTeacherCtfCompetition     = getAdminCtfCompetition;
export const createTeacherCtfCompetition  = createAdminCtfCompetition;
export const updateTeacherCtfCompetition  = updateAdminCtfCompetition;
export const pauseTeacherCtfCompetition   = pauseAdminCtfCompetition;
export const resumeTeacherCtfCompetition  = resumeAdminCtfCompetition;
export const freezeTeacherCtfCompetition  = freezeAdminCtfCompetition;
export const unfreezeTeacherCtfCompetition = unfreezeAdminCtfCompetition;
export const endTeacherCtfCompetition     = endAdminCtfCompetition;

// ── Admin: per-competition challenge management ───────────────────────────────

export interface TeacherCtfChallengeCreateRequest {
  title:                string;
  description:          string;
  authorName?:          string;
  category:             string;
  difficulty:           "EASY" | "MEDIUM" | "HARD";
  basePoints:           number;
  flagType?:            "STATIC" | "DYNAMIC";
  plainFlag?:           string;
  flagFormat?:          string;
  requiresInstance?:    boolean;
  dockerImage?:         string;
  dockerExposedPort?:   number;
  containerEnvVars?:    string;
  dockerFlagEnv?:       string;
  connectionType?:      "HTTP" | "TCP";
  dockerEnvVars?:       Record<string, string>;
  dockerMemoryMb?:      number;
  dockerCpuPercent?:    number;
  dockerPidsLimit?:     number;
  downloadableFileUrl?: string;
  downloadableFileName?:string;
  mediaUrl?:            string;
  maxAttempts?:         number | null;
  isActive?:            boolean;
  hints?:               { cost: number; text: string }[];
  bloodBonusEnabled?:   boolean;
  firstBloodBonus?:     number;
  secondBloodBonus?:    number;
  thirdBloodBonus?:     number;
}

export type TeacherCtfChallengeUpdateRequest = Partial<Omit<TeacherCtfChallengeCreateRequest, "plainFlag">>;

export const getTeacherCtfCompetitionChallenges = (competitionId: string) =>
  apiClient<CTFCompetitionChallengeDTO[]>(
    `/api/admin/ctf/competitions/${competitionId}/challenges`,
    { method: "GET" },
  );

export const addTeacherCtfChallenge = (competitionId: string, data: TeacherCtfChallengeCreateRequest) =>
  apiClient<CTFCompetitionChallengeDTO>(`/api/admin/ctf/competitions/${competitionId}/challenges`, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateTeacherCtfChallenge = (
  competitionId: string, challengeId: string, data: TeacherCtfChallengeUpdateRequest,
) =>
  apiClient<CTFCompetitionChallengeDTO>(
    `/api/admin/ctf/competitions/${competitionId}/challenges/${challengeId}`,
    { method: "PUT", body: JSON.stringify(data) },
  );

export const rotateTeacherCtfChallengeFlag = (
  competitionId: string, challengeId: string, newFlag: string,
) =>
  apiClient<CTFCompetitionChallengeDTO>(
    `/api/admin/ctf/competitions/${competitionId}/challenges/${challengeId}/flag`,
    { method: "PATCH", body: JSON.stringify({ newFlag }) },
  );

export const revealTeacherCtfChallenge = (competitionId: string, challengeId: string) =>
  apiClient<CTFCompetitionChallengeDTO>(
    `/api/admin/ctf/competitions/${competitionId}/challenges/${challengeId}/reveal`,
    { method: "POST" },
  );

export const hideTeacherCtfChallenge = (competitionId: string, challengeId: string) =>
  apiClient<CTFCompetitionChallengeDTO>(
    `/api/admin/ctf/competitions/${competitionId}/challenges/${challengeId}/hide`,
    { method: "POST" },
  );

export const addTeacherCtfHint = (
  competitionId: string, challengeId: string, hint: { cost: number; text: string },
) =>
  apiClient<CTFCompetitionChallengeDTO>(
    `/api/admin/ctf/competitions/${competitionId}/challenges/${challengeId}/hints`,
    { method: "POST", body: JSON.stringify(hint) },
  );

export const deleteTeacherCtfHint = (
  competitionId: string, challengeId: string, hintId: string,
) =>
  apiClient<CTFCompetitionChallengeDTO>(
    `/api/admin/ctf/competitions/${competitionId}/challenges/${challengeId}/hints/${hintId}`,
    { method: "DELETE" },
  );

// ── Admin: challenge library ──────────────────────────────────────────────────

export interface CTFLibraryChallengeDTO {
  id:                  string;
  title:               string;
  description:         string;
  category:            string;
  difficulty:          "EASY" | "MEDIUM" | "HARD";
  basePoints:          number;
  flagType?:           "STATIC" | "DYNAMIC";
  flagFormat:          string;
  requiresInstance:    boolean;
  dockerImage?:        string | null;
  dockerExposedPort?:  number | null;
  connectionType?:     "HTTP" | "TCP" | null;
  dockerFlagEnv?:      string | null;
  dockerEnvVars?:      Record<string, string> | null;
  dockerMemoryMb?:     number | null;
  dockerCpuPercent?:   number | null;
  dockerPidsLimit?:    number | null;
  downloadableFileUrl: string | null;
  hints:               CTFHintDTO[];
  maxAttempts:         number | null;
  buildStatus?:        string | null;
  builtImageTag?:      string | null;
  useCount:            number;
  createdAt:           string;
}

export const getCtfLibrary = () =>
  apiClient<CTFLibraryChallengeDTO[]>("/api/admin/ctf/library", { method: "GET" });

export const createCtfLibraryChallenge = (data: TeacherCtfChallengeCreateRequest) =>
  apiClient<CTFLibraryChallengeDTO>("/api/admin/ctf/library", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateCtfLibraryChallenge = (id: string, data: TeacherCtfChallengeCreateRequest) =>
  apiClient<CTFLibraryChallengeDTO>(`/api/admin/ctf/library/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

export const addLibraryChallengeToCompetition = (libraryId: string, competitionId: string) =>
  apiClient<CTFCompetitionChallengeDTO>(`/api/admin/ctf/library/${libraryId}/add-to/${competitionId}`, {
    method: "POST",
  });

export const deleteCtfLibraryChallenge = (libraryId: string) =>
  apiClient<void>(`/api/admin/ctf/library/${libraryId}`, { method: "DELETE" });

// ── Admin: management dashboard reads ────────────────────────────────────────

export interface CTFTeacherOverviewDTO {
  competitionId: string;
  title: string;
  status: CTFCompetitionStatus;
  startTime: string;
  endTime: string;
  pausedAt: string | null;
  frozenAt: string | null;
  isPaused: boolean;
  isFrozen: boolean;
  teamCount: number;
  participantCount: number;
  solveCount: number;
  attemptCount: number;
  cheatCount: number;
  challengeCount: number;
  hiddenChallengeCount: number;
  recentEvents: {
    type: "SOLVE" | "CHEAT" | "NEW_TEAM";
    at: string;
    teamName: string;
    avatarColor: string;
    detail: string;
    points: number | null;
  }[];
}

export interface CTFTeacherTeamDTO {
  id: string;
  name: string;
  avatarColor: string;
  captainId: string | null;
  captainName: string | null;
  members: CTFTeamMemberDTO[];
  totalPoints: number;
  solveCount: number;
  lastSolveAt: string | null;
  createdAt: string;
  isDisqualified: boolean;
  disqualifiedAt: string | null;
  disqualifiedReason: string | null;
}

export interface CTFTeacherSubmissionDTO {
  id: string;
  teamId: string;
  teamName: string;
  avatarColor: string;
  challengeId: string;
  challengeTitle: string;
  challengeCategory: string | null;
  solvedByUserId: string | null;
  solvedByName: string;
  pointsAwarded: number;
  correct: boolean;
  cheatFlagged: boolean;
  submittedValue: string | null;
  at: string;
}

export interface CTFTeacherCheatDTO {
  id: string;
  competitionId: string;
  challengeId: string;
  challengeTitle: string;
  challengeCategory: string | null;
  submittingTeamId: string;
  submittingTeamName: string;
  submittingTeamAccentColor: string | null;
  submittingUserId: string | null;
  submittingUserName: string | null;
  submittingUserEmail: string | null;
  sourceTeamId: string;
  sourceTeamName: string;
  sourceTeamAccentColor: string | null;
  submittedValue: string;
  detectedAt: string;
  dismissed: boolean;
  dismissedByUsername: string | null;
  submittingTeamDisqualified: boolean;
}

export const getTeacherCtfOverview = (id: string) =>
  apiClient<CTFTeacherOverviewDTO>(`/api/admin/ctf/competitions/${id}/overview`, { method: "GET" });

export const getTeacherCtfTeams = (id: string) =>
  apiClient<CTFTeacherTeamDTO[]>(`/api/admin/ctf/competitions/${id}/teams`, { method: "GET" });

export const getTeacherCtfSubmissions = (id: string, limit = 200) =>
  apiClient<CTFTeacherSubmissionDTO[]>(
    `/api/admin/ctf/competitions/${id}/submissions?limit=${limit}`, { method: "GET" });

export const getTeacherCtfCheats = (id: string) =>
  apiClient<CTFTeacherCheatDTO[]>(`/api/admin/ctf/competitions/${id}/cheats`, { method: "GET" });

export const dismissTeacherCtfCheat = (id: string, cheatId: string) =>
  apiClient<CTFTeacherCheatDTO>(
    `/api/admin/ctf/competitions/${id}/cheats/${cheatId}/dismiss`, { method: "POST" });

export const disqualifyTeacherCtfTeam = (id: string, teamId: string, reason?: string) =>
  apiClient<CTFTeacherTeamDTO>(
    `/api/admin/ctf/competitions/${id}/teams/${teamId}/disqualify`,
    { method: "POST", body: JSON.stringify({ reason: reason ?? null }) },
  );

export async function downloadTeacherCtfCheatsExport(id: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${getApiBaseUrl()}/api/admin/ctf/competitions/${id}/cheats/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") ?? "";
  const m = cd.match(/filename="?([^"]+)"?/);
  const filename = m?.[1] ?? `cheats-${id}.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadTeacherCtfExport(id: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${getApiBaseUrl()}/api/admin/ctf/competitions/${id}/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") ?? "";
  const m = cd.match(/filename="?([^"]+)"?/);
  const filename = m?.[1] ?? `ctf-export-${id}.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ── Challenge build / packaging ───────────────────────────────────────────────

export interface CTFChallengeBuildDTO {
  id: string;
  challengeId: string;
  sourceType: "ZIP" | "REGISTRY";
  zipOriginalName: string | null;
  registryUrl: string | null;
  builtImageTag: string | null;
  buildStatus: "PENDING" | "BUILDING" | "READY" | "FAILED" | "PULLING" | "OUTDATED";
  buildLog: string | null;
  buildStartedAt: string | null;
  buildFinishedAt: string | null;
  imageSizeMb: number | null;
  version: number;
  errorMessage: string | null;
}

export interface CTFBuildWebSocketMessage {
  buildId: string;
  challengeId: string;
  status: "BUILDING" | "PULLING" | "READY" | "FAILED";
  imageTag: string | null;
  imageSizeMb: number | null;
  error: string | null;
  detectedPort?: number | null;
}

export const uploadCTFChallengeZip = (
  _competitionId: string,
  challengeId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ buildId: string; status: string; message: string }> => {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);
  const url = `${getApiBaseUrl()}/api/admin/ctf/challenges/${challengeId}/upload`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error("Invalid server response")); }
      } else {
        let message = `Upload failed: ${xhr.status}`;
        try {
          const raw = JSON.parse(xhr.responseText);
          message = raw.message ?? raw.error ?? message;
        } catch { /* ignore */ }
        reject(new Error(message));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(form);
  });
};

export const setCTFChallengeRegistry = (challengeId: string, registryUrl: string) =>
  apiClient<{ buildId: string; status: string; message: string }>(
    `/api/admin/ctf/challenges/${challengeId}/registry`,
    { method: "POST", body: JSON.stringify({ registryUrl }) },
  );

export const getCTFChallengeBuildStatus = (challengeId: string) =>
  apiClient<CTFChallengeBuildDTO>(
    `/api/admin/ctf/challenges/${challengeId}/build-status`,
    { method: "GET" },
  );

export const getCTFChallengeBuildLog = (challengeId: string) =>
  apiClient<string>(`/api/admin/ctf/challenges/${challengeId}/build-log`, { method: "GET" });
