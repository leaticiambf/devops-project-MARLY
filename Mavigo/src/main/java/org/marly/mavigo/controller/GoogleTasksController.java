package org.marly.mavigo.controller;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.marly.mavigo.client.google.dto.TaskDto;
import org.marly.mavigo.client.google.dto.TaskListDto;
import org.marly.mavigo.client.google.dto.TasksListsResponse;
import org.marly.mavigo.client.google.dto.TasksPage;
import org.marly.mavigo.client.prim.PrimApiClient;
import org.marly.mavigo.client.prim.model.PrimPlace;
import org.marly.mavigo.models.shared.GeoPoint;
import org.marly.mavigo.models.user.User;
import org.marly.mavigo.repository.UserTaskRepository;
import org.marly.mavigo.security.RequestOwnershipGuard;
import org.marly.mavigo.service.user.UserService;
import org.marly.mavigo.service.user.dto.GoogleAccountLink;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientService;
import org.springframework.security.oauth2.client.annotation.RegisteredOAuth2AuthorizedClient;
import static org.springframework.security.oauth2.client.web.reactive.function.client.ServletOAuth2AuthorizedClientExchangeFilterFunction.oauth2AuthorizedClient;
import org.springframework.security.oauth2.core.OAuth2AuthenticatedPrincipal;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.HtmlUtils;

@RestController
@RequestMapping("/api/google/tasks")
public class GoogleTasksController {

    /**
     * Balise de localisation dans les tâches Google.
     * Exemple dans le titre ou les notes :
     * "Acheter du lait #loc:Gare de Lyon"
     */
    private static final Pattern LOCATION_TAG = Pattern.compile("(?i)#mavigo:\\s*([^\\n#]+)");
    private static final String COMPLETED_FIELD = "completed";
    private static final String STATUS_COMPLETED = "completed";
    private static final String LOCATION_QUERY_KEY = "locationQuery";

    private final WebClient googleApiWebClient;
    private final OAuth2AuthorizedClientService authorizedClientService;

    private final UserService userService;
    private final UserTaskRepository userTaskRepository;
    private final PrimApiClient primApiClient;
    private final RequestOwnershipGuard requestOwnershipGuard;

    @Value("${app.frontend.base-url:http://localhost:3000}")
    private String frontendBaseUrl = "http://localhost:3000";

    @Autowired
    public GoogleTasksController(
            WebClient googleApiWebClient,
            OAuth2AuthorizedClientService authorizedClientService,
            UserService userService,
            UserTaskRepository userTaskRepository,
            PrimApiClient primApiClient) {
        this(googleApiWebClient, authorizedClientService, userService, userTaskRepository, primApiClient, null);
    }

    public GoogleTasksController(
            WebClient googleApiWebClient,
            OAuth2AuthorizedClientService authorizedClientService,
            UserService userService,
            UserTaskRepository userTaskRepository,
            PrimApiClient primApiClient,
            RequestOwnershipGuard requestOwnershipGuard) {
        this.googleApiWebClient = googleApiWebClient;
        this.authorizedClientService = authorizedClientService;
        this.userService = userService;
        this.userTaskRepository = userTaskRepository;
        this.primApiClient = primApiClient;
        this.requestOwnershipGuard = requestOwnershipGuard;
    }

    // -----------------------------
    // ME (debug)
    // -----------------------------
    @GetMapping("/me/lists")
    public List<TaskListDto> listsForMe(
            @RegisteredOAuth2AuthorizedClient("google") OAuth2AuthorizedClient authorizedClient,
            @RequestParam(required = false) Integer pageSize,
            @RequestParam(required = false) String pageToken) {
        return fetchLists(authorizedClient, pageSize, pageToken);
    }

    @GetMapping("/me/lists/{listId}/tasks")
    public List<TaskDto> tasksForMe(
            @RegisteredOAuth2AuthorizedClient("google") OAuth2AuthorizedClient authorizedClient,
            @PathVariable String listId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(defaultValue = "false") boolean includeCompleted) {
        return fetchTasks(authorizedClient, listId, date, includeCompleted);
    }

    @GetMapping("/me")
    public Map<String, Object> me(@AuthenticationPrincipal OAuth2AuthenticatedPrincipal principal) {
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Missing Google principal");
        }
        return Map.of(
                "sub", principal.getAttribute("sub"),
                "email", principal.getAttribute("email"),
                "name", principal.getAttribute("name"),
                "issuer", principal.getAttribute("iss"));
    }

    @GetMapping("/token")
    public Map<String, Object> token(@RegisteredOAuth2AuthorizedClient("google") OAuth2AuthorizedClient client) {
        if (client == null || client.getAccessToken() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Missing Google authorized client");
        }
        return Map.of(
                "scopes", client.getAccessToken().getScopes(),
                "expiresAt", client.getAccessToken().getExpiresAt());
    }

    // -----------------------------
    // USER endpoints (used by your front)
    // -----------------------------
    @GetMapping("/users/{userId}/lists")
    public List<TaskListDto> listsForUser(
            @PathVariable UUID userId,
            @RequestParam(required = false) Integer pageSize,
            @RequestParam(required = false) String pageToken,
            Authentication authentication) {
        requireUserAccess(userId, authentication);
        OAuth2AuthorizedClient client = requireAuthorizedClientForUser(userId);
        return fetchLists(client, pageSize, pageToken);
    }

    public List<TaskListDto> listsForUser(UUID userId, Integer pageSize, String pageToken) {
        return listsForUser(userId, pageSize, pageToken, null);
    }

    @GetMapping("/users/{userId}/default-list")
    public Map<String, Object> defaultListForUser(@PathVariable UUID userId, Authentication authentication) {
        requireUserAccess(userId, authentication);
        OAuth2AuthorizedClient client = requireAuthorizedClientForUser(userId);
        List<TaskListDto> lists = fetchLists(client, 50, null);

        if (lists == null || lists.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No task list found on Google account");
        }

        TaskListDto chosen = lists.get(0); // simplest: first list as default
        return Map.of("id", chosen.id(), "title", chosen.title());
    }

    public Map<String, Object> defaultListForUser(UUID userId) {
        return defaultListForUser(userId, null);
    }

    /**
     * Récupère les tâches depuis Google Tasks uniquement (aucun stockage local).
     * Les balises #mavigo: dans titre/notes sont extraites pour affichage (locationQuery) sans persistance.
     */
    @GetMapping("/users/{userId}/lists/{listId}/tasks")
    public List<Map<String, Object>> tasksForUser(
            @PathVariable UUID userId,
            @PathVariable String listId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(defaultValue = "false") boolean includeCompleted,
            Authentication authentication) {
        requireUserAccess(userId, authentication);
        OAuth2AuthorizedClient client = requireAuthorizedClientForUser(userId);
        List<TaskDto> googleTasks = fetchTasks(client, listId, date, includeCompleted);
        return googleTasks.stream()
                .map(this::taskDtoToResponseMap)
                .toList();
    }

    public List<Map<String, Object>> tasksForUser(UUID userId, String listId, LocalDate date, boolean includeCompleted) {
        return tasksForUser(userId, listId, date, includeCompleted, null);
    }

    /**
     * Suggestions basées uniquement sur les tâches Google (balise #mavigo:), sans stockage local.
     */
    @GetMapping("/users/{userId}/suggestions")
    public List<Map<String, Object>> suggestionsForUser(
            @PathVariable UUID userId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            Authentication authentication) {
        requireUserAccess(userId, authentication);
        OAuth2AuthorizedClient client = requireAuthorizedClientForUser(userId);

        List<TaskListDto> lists = fetchLists(client, 50, null);
        if (lists == null || lists.isEmpty()) {
            return List.of();
        }

        String listId = lists.get(0).id();
        LocalDate targetDate = date != null ? date : LocalDate.now().plusDays(1);

        List<TaskDto> googleTasks = fetchTasks(client, listId, targetDate, false);
        if (googleTasks == null || googleTasks.isEmpty()) {
            return List.of();
        }

        return googleTasks.stream()
                .map(this::taskDtoToResponseMap)
                .filter(task -> {
                    Object locationQuery = task.get(LOCATION_QUERY_KEY);
                    return locationQuery != null && StringUtils.hasText(String.valueOf(locationQuery));
                })
                .toList();
    }

    public List<Map<String, Object>> suggestionsForUser(UUID userId, LocalDate date) {
        return suggestionsForUser(userId, date, null);
    }

    /**
     * Convertit une TaskDto Google en Map pour la réponse API (sans accès BDD).
     * La balise #mavigo: dans titre/notes est extraite pour locationQuery (affichage uniquement).
     */
    private Map<String, Object> taskDtoToResponseMap(TaskDto dto) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", dto.id());
        m.put("title", dto.title());
        m.put("notes", dto.notes());
        m.put("status", dto.status());
        m.put("due", dto.due());
        m.put(COMPLETED_FIELD, dto.completed());
        m.put("updated", dto.updated());
        String locationQuery = extractLocationTag(dto);
        if (StringUtils.hasText(locationQuery)) {
            m.put(LOCATION_QUERY_KEY, locationQuery);
        }
        return m;
    }

    /**
     * Extrait la balise #mavigo:... à partir des notes (description) ou du titre
     * d'une tâche Google.
     * Priorité : notes d'abord, puis titre si pas trouvé.
     * Exemple supporté : "Description de la tâche\n#mavigo: Gare de Lyon"
     */
    private String extractLocationTag(TaskDto dto) {
        String notes = dto.notes() == null ? "" : dto.notes();
        String title = dto.title() == null ? "" : dto.title();

        // Chercher d'abord dans les notes (description)
        Matcher m = LOCATION_TAG.matcher(notes);
        if (m.find()) {
            String raw = m.group(1);
            return raw == null ? null : raw.trim();
        }

        // Si pas trouvé dans les notes, chercher dans le titre
        m = LOCATION_TAG.matcher(title);
        if (m.find()) {
            String raw = m.group(1);
            return raw == null ? null : raw.trim();
        }

        return null;
    }

    @GetMapping("/users/{userId}/local")
    public List<Map<String, Object>> localTasks(@PathVariable UUID userId, Authentication authentication) {
        requireUserAccess(userId, authentication);
        return userTaskRepository.findByUser_Id(userId)
                .stream()
                .map(t -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", t.getId());
                    m.put("source", t.getSource());
                    m.put("googleTaskId", t.getSourceTaskId());
                    m.put("title", t.getTitle());
                    m.put("notes", t.getNotes());
                    m.put("dueAt", t.getDueAt());
                    m.put("completed", t.isCompleted());

                    if (t.getLocationHint() != null) {
                        m.put("locationHint", Map.of(
                                "lat", t.getLocationHint().getLatitude(),
                                "lng", t.getLocationHint().getLongitude()));
                    } else {
                        m.put("locationHint", null);
                    }
                    m.put(LOCATION_QUERY_KEY, t.getLocationQuery());
                    return m;
                })
                .toList();
    }

    public List<Map<String, Object>> localTasks(UUID userId) {
        return localTasks(userId, null);
    }

    /**
     * Tâches depuis Google uniquement, avec #mavigo: et géocodage, sans stockage en base.
     * Utilisé pour l’optimisation de trajet (les tâches sont envoyées dans taskDetails).
     */
    @GetMapping("/users/{userId}/for-journey")
    public List<Map<String, Object>> tasksForJourney(@PathVariable UUID userId,
            @RequestParam(defaultValue = "false") boolean includeCompleted,
            Authentication authentication) {
        requireUserAccess(userId, authentication);
        OAuth2AuthorizedClient client = requireAuthorizedClientForUser(userId);
        List<TaskListDto> lists = fetchLists(client, 50, null);
        if (lists == null || lists.isEmpty()) {
            return List.of();
        }
        String listId = lists.get(0).id();
        List<TaskDto> googleTasks = fetchTasks(client, listId, null, includeCompleted);
        if (googleTasks == null) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (TaskDto dto : googleTasks) {
            if (dto == null || dto.id() == null) continue;
            String locationQuery = extractLocationTag(dto);
            if (!StringUtils.hasText(locationQuery)) continue;
            boolean completed = Boolean.TRUE.equals(dto.completed());
            GeoPoint hint = null;
            try {
                hint = resolveGeoPointFromQuery(locationQuery);
            } catch (Exception ignored) {
            }
            if (hint == null || !hint.isComplete()) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", dto.id());
            m.put("title", dto.title() != null ? dto.title() : "");
            m.put(LOCATION_QUERY_KEY, locationQuery);
            m.put("locationHint", Map.of("lat", hint.getLatitude(), "lng", hint.getLongitude()));
            m.put(COMPLETED_FIELD, completed);
            out.add(m);
        }
        return out;
    }

    public List<Map<String, Object>> tasksForJourney(UUID userId, boolean includeCompleted) {
        return tasksForJourney(userId, includeCompleted, null);
    }

    @GetMapping(value = "/link", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> linkGoogleAccount(
            @RequestParam UUID userId,
            @AuthenticationPrincipal OAuth2AuthenticatedPrincipal principal) {

        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Missing Google principal");
        }

        String subject = principal.getAttribute("sub");
        if (!StringUtils.hasText(subject)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Google subject not present");
        }

        String email = principal.getAttribute("email");

        try {
            User linkedUser = userService.linkGoogleAccount(userId, new GoogleAccountLink(subject, email));
            String redirectUrl = buildFrontendLinkResultUrl(
                    "/google-link-complete",
                    linkedUser.getDisplayName(),
                    linkedUser.getGoogleAccountEmail(),
                    null);
            return ResponseEntity.status(HttpStatus.FOUND)
                    .header("Location", redirectUrl)
                    .build();
        } catch (Exception e) {
            String redirectUrl = buildFrontendLinkResultUrl(
                    "/google-link-error",
                    null,
                    null,
                    e.getMessage());
            return ResponseEntity.status(HttpStatus.FOUND)
                    .header("Location", redirectUrl)
                    .build();
        }
    }

    /**
     * Marquer une tâche comme complétée (Google Tasks uniquement, pas de mise à jour locale).
     */
    @PatchMapping("/users/{userId}/lists/{listId}/tasks/{taskId}/complete")
    public Map<String, Object> completeTaskForUser(
            @PathVariable UUID userId,
            @PathVariable String listId,
            @PathVariable String taskId,
            Authentication authentication) {

        requireUserAccess(userId, authentication);

        OAuth2AuthorizedClient client = requireAuthorizedClientForUser(userId);

        try {
            Map<String, Object> patch = new java.util.HashMap<>();
            patch.put("status", STATUS_COMPLETED);
            patch.put(COMPLETED_FIELD, Instant.now().toString());

            Map<String, Object> response = googleApiWebClient.patch()
                    .uri(b -> b.path("/lists/{taskListId}/tasks/{taskId}").build(listId, taskId))
                    .attributes(oauth2AuthorizedClient(client))
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(patch)
                    .retrieve()
                    .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {
                    })
                    .block();

            return response == null ? Map.of("ok", true) : response;

        } catch (WebClientResponseException e) {
            throw new ResponseStatusException(
                    HttpStatus.valueOf(e.getStatusCode().value()),
                    "Google Tasks API error: " + e.getResponseBodyAsString(),
                    e);
        }
    }

    public Map<String, Object> completeTaskForUser(UUID userId, String listId, String taskId) {
        return completeTaskForUser(userId, listId, taskId, null);
    }

    /**
     * ✅ New: delete task
     */
    @DeleteMapping("/users/{userId}/lists/{listId}/tasks/{taskId}")
    public ResponseEntity<Void> deleteTaskForUser(
            @PathVariable UUID userId,
            @PathVariable String listId,
            @PathVariable String taskId,
            Authentication authentication) {

        requireUserAccess(userId, authentication);

        OAuth2AuthorizedClient client = requireAuthorizedClientForUser(userId);

        try {
            googleApiWebClient.delete()
                    .uri(b -> b.path("/lists/{taskListId}/tasks/{taskId}").build(listId, taskId))
                    .attributes(oauth2AuthorizedClient(client))
                    .retrieve()
                    .toBodilessEntity()
                    .block();

            return ResponseEntity.noContent().build();

        } catch (WebClientResponseException e) {
            throw new ResponseStatusException(
                    HttpStatus.valueOf(e.getStatusCode().value()),
                    "Google Tasks API error: " + e.getResponseBodyAsString(),
                    e);
        }
    }

    public ResponseEntity<Void> deleteTaskForUser(UUID userId, String listId, String taskId) {
        return deleteTaskForUser(userId, listId, taskId, null);
    }

    private void requireUserAccess(UUID userId, Authentication authentication) {
        if (requestOwnershipGuard != null) {
            requestOwnershipGuard.requireUserAccess(userId, authentication);
        }
    }

    // -----------------------------
    // Internal helpers
    // -----------------------------
    private List<TaskListDto> fetchLists(OAuth2AuthorizedClient authorizedClient, Integer pageSize, String pageToken) {
        try {
            TasksListsResponse resp = googleApiWebClient.get()
                    .uri(uri -> uri.path("/users/@me/lists")
                            .queryParam("maxResults", pageSize == null ? 50 : pageSize)
                            .queryParamIfPresent("pageToken", Optional.ofNullable(pageToken))
                            .build())
                    .attributes(oauth2AuthorizedClient(authorizedClient))
                    .retrieve()
                    .bodyToMono(TasksListsResponse.class)
                    .block();

            return (resp == null || resp.items() == null) ? List.of() : resp.items();

        } catch (WebClientResponseException e) {
            throw new ResponseStatusException(
                    HttpStatus.valueOf(e.getStatusCode().value()),
                    "Google Tasks API error: " + e.getResponseBodyAsString(),
                    e);
        }
    }

    private List<TaskDto> fetchTasks(OAuth2AuthorizedClient authorizedClient, String listId, LocalDate date,
            boolean includeCompleted) {
        try {
            TasksPage resp = googleApiWebClient.get()
                    .uri(b -> b.path("/lists/{taskListId}/tasks")
                            .queryParam("maxResults", 100)
                            .queryParam("showHidden", false)
                            .queryParam("showDeleted", false)
                            .queryParam("showCompleted", includeCompleted)
                            .build(listId))
                    .attributes(oauth2AuthorizedClient(authorizedClient))
                    .retrieve()
                    .bodyToMono(TasksPage.class)
                    .block();

            List<TaskDto> items = (resp == null || resp.items() == null) ? List.of() : resp.items();

            if (date != null) {
                items = items.stream().filter(t -> isDueOnDate(t.due(), date)).toList();
            }
            if (!includeCompleted) {
                items = items.stream()
                        .filter(t -> t.status() == null || !STATUS_COMPLETED.equalsIgnoreCase(t.status()))
                        .toList();
            }

            return items;

        } catch (WebClientResponseException e) {
            throw new ResponseStatusException(
                    HttpStatus.valueOf(e.getStatusCode().value()),
                    "Google Tasks API error: " + e.getResponseBodyAsString(),
                    e);
        } catch (Exception e) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Tasks endpoint failed: " + e.getMessage(),
                    e);
        }
    }

    private OAuth2AuthorizedClient requireAuthorizedClientForUser(UUID userId) {
        User user = userService.getUser(userId);

        String subject = user.getGoogleAccountSubject();
        if (!StringUtils.hasText(subject)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "User has no Google account linked. Use /api/google/tasks/link first.");
        }

        OAuth2AuthorizedClient client = authorizedClientService.loadAuthorizedClient("google", subject);
        if ((client == null || client.getAccessToken() == null) && StringUtils.hasText(user.getGoogleAccountEmail())) {
            client = authorizedClientService.loadAuthorizedClient("google", user.getGoogleAccountEmail());
        }
        if (client == null || client.getAccessToken() == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "No Google OAuth2 client stored for this user. Re-link Google Tasks.");
        }

        return client;
    }

    private GeoPoint resolveGeoPointFromQuery(String query) {
        try {
            List<PrimPlace> places = primApiClient.searchPlaces(query);
            if (places == null || places.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No location found for: " + query);
            }

            for (PrimPlace p : places) {
                if (p == null)
                    continue;
                var coords = p.coordinates() != null
                        ? p.coordinates()
                        : (p.stopArea() != null ? p.stopArea().coordinates()
                                : (p.stopPoint() != null ? p.stopPoint().coordinates() : null));
                if (coords != null && coords.latitude() != null && coords.longitude() != null) {
                    return new GeoPoint(coords.latitude(), coords.longitude());
                }
            }

            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No usable coordinates for: " + query);

        } catch (WebClientResponseException e) {
            if (e.getStatusCode().value() == 401) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                        "PRIM unauthorized (check PRIM API credentials / header)", e);
            }
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "PRIM error: " + e.getResponseBodyAsString(), e);
        }
    }

    private boolean isDueOnDate(String due, LocalDate target) {
        if (due == null || due.isBlank())
            return false;

        try {
            Instant instant = Instant.parse(due);
            LocalDate asUtc = instant.atZone(ZoneOffset.UTC).toLocalDate();
            return asUtc.equals(target);
        } catch (Exception ignore) {
            try {
                LocalDate onlyDate = LocalDate.parse(due);
                return onlyDate.equals(target);
            } catch (Exception ignore2) {
                return false;
            }
        }
    }

    private String buildFrontendLinkResultUrl(
            String path,
            String displayName,
            String email,
            String errorMessage) {
        StringBuilder url = new StringBuilder(frontendBaseUrl);
        if (!frontendBaseUrl.endsWith("/")) {
            url.append("/");
        }
        url.append(path.startsWith("/") ? path.substring(1) : path);

        List<String> params = new ArrayList<>();
        if (StringUtils.hasText(displayName)) {
            params.add("name=" + encodeQueryParam(displayName));
        }
        if (StringUtils.hasText(email)) {
            params.add("email=" + encodeQueryParam(email));
        }
        if (StringUtils.hasText(errorMessage)) {
            params.add("error=" + encodeQueryParam(errorMessage));
        }

        if (!params.isEmpty()) {
            url.append("?").append(String.join("&", params));
        }

        return url.toString();
    }

    private String encodeQueryParam(String value) {
        return java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8);
    }
}
