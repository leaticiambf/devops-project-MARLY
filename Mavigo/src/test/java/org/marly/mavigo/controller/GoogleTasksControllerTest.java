package org.marly.mavigo.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.marly.mavigo.client.google.dto.TaskListDto;
import org.marly.mavigo.client.prim.PrimApiClient;
import org.marly.mavigo.client.prim.model.PrimCoordinates;
import org.marly.mavigo.client.prim.model.PrimPlace;
import org.marly.mavigo.models.task.UserTask;
import org.marly.mavigo.models.task.TaskSource;
import org.marly.mavigo.models.user.User;
import org.marly.mavigo.repository.UserTaskRepository;
import org.marly.mavigo.service.user.UserService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientService;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.ExchangeFunction;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GoogleTasksControllerTest {

    private WebClient googleApiWebClient;
    private OAuth2AuthorizedClientService authorizedClientService;
    private UserService userService;
    private UserTaskRepository userTaskRepository;
    private PrimApiClient primApiClient;

    private GoogleTasksController controller;

    @BeforeEach
    void setup() {
        ExchangeFunction exchangeFunction = request -> {
            String path = request.url().getPath();

            if ("GET".equals(request.method().name()) && "/users/@me/lists".equals(path)) {
                String json = "{\"items\":[{\"id\":\"list-1\",\"title\":\"Default\"}]}";
                return Mono.just(ClientResponse.create(HttpStatus.OK)
                        .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                        .body(json)
                        .build());
            }

            if ("GET".equals(request.method().name()) && path.contains("/lists/") && path.endsWith("/tasks")) {
                String json = """
                        {
                          "items": [
                            {
                              "id": "task-1",
                              "title": "Buy shoes",
                              "notes": "Remember this\\n#mavigo: Chatelet",
                              "status": "needsAction",
                              "due": "2025-01-02T00:00:00Z"
                            },
                            {
                              "id": "task-2",
                              "title": "No location tag",
                              "notes": "Just a task",
                              "status": "needsAction",
                              "due": "2025-01-02T00:00:00Z"
                            },
                            {
                              "id": "task-3",
                              "title": "Other day",
                              "notes": "#mavigo: Nation",
                              "status": "needsAction",
                              "due": "2025-01-03T00:00:00Z"
                            }
                          ]
                        }
                        """;
                return Mono.just(ClientResponse.create(HttpStatus.OK)
                        .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                        .body(json)
                        .build());
            }

            if (("POST".equals(request.method().name()) || "PATCH".equals(request.method().name())) && path.contains("/lists/") && path.contains("/tasks/")) {
                String json = "{\"id\":\"g-task-123\",\"title\":\"dummy\"}";
                return Mono.just(ClientResponse.create(HttpStatus.OK)
                        .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                        .body(json)
                        .build());
            }

            if ("DELETE".equals(request.method().name()) && path.contains("/lists/") && path.contains("/tasks/")) {
                return Mono.just(ClientResponse.create(HttpStatus.NO_CONTENT).build());
            }

            return Mono.just(ClientResponse.create(HttpStatus.NOT_FOUND).build());
        };

        this.googleApiWebClient = WebClient.builder().exchangeFunction(exchangeFunction).build();
        this.authorizedClientService = mock(OAuth2AuthorizedClientService.class);
        this.userService = mock(UserService.class);
        this.userTaskRepository = mock(UserTaskRepository.class);
        this.primApiClient = mock(PrimApiClient.class);

        this.controller = new GoogleTasksController(
                googleApiWebClient,
                authorizedClientService,
                userService,
                userTaskRepository,
                primApiClient);
    }

    @Test
    void controllerShouldInstantiate() {
        assertNotNull(controller);
    }

    @Test
    void suggestionsForUser_returnsLocationTasksForDate() {
        UUID userId = UUID.randomUUID();
        User user = new User("ext-1", "test@example.com", "Test");
        user.setId(userId);
        user.setGoogleAccountSubject("sub-123");

        when(userService.getUser(userId)).thenReturn(user);
        when(authorizedClientService.loadAuthorizedClient("google", "sub-123"))
                .thenReturn(buildAuthorizedClient("sub-123"));
        when(userTaskRepository.findByUser_Id(userId)).thenReturn(Collections.emptyList());
        when(userTaskRepository.save(any(UserTask.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        PrimPlace place = new PrimPlace("place-1", "Chatelet", null, null, null, new PrimCoordinates(48.858, 2.347));
        when(primApiClient.searchPlaces(anyString())).thenReturn(List.of(place));

        LocalDate target = LocalDate.of(2025, 1, 2);
        List<Map<String, Object>> suggestions = controller.suggestionsForUser(userId, target);

        assertEquals(1, suggestions.size());
        assertEquals("Chatelet", suggestions.get(0).get("locationQuery"));
    }

    @Test
    void tasksForUser_returnsAllTasks() {
        UUID userId = UUID.randomUUID();
        User user = new User("ext-1", "test@example.com", "Test");
        user.setId(userId);
        user.setGoogleAccountSubject("sub-123");

        when(userService.getUser(userId)).thenReturn(user);
        when(authorizedClientService.loadAuthorizedClient("google", "sub-123"))
                .thenReturn(buildAuthorizedClient("sub-123"));

        List<Map<String, Object>> tasks = controller.tasksForUser(userId, "list-1", null, false);

        assertNotNull(tasks);
        assertEquals(3, tasks.size());
        assertEquals("Buy shoes", tasks.get(0).get("title"));
    }

    @Test
    void completeTaskForUser_executesSuccessfully() {
        UUID userId = UUID.randomUUID();
        User user = new User("ext-1", "test@example.com", "Test");
        user.setId(userId);
        user.setGoogleAccountSubject("sub-123");

        when(userService.getUser(userId)).thenReturn(user);
        when(authorizedClientService.loadAuthorizedClient("google", "sub-123"))
                .thenReturn(buildAuthorizedClient("sub-123"));

        Map<String, Object> result = controller.completeTaskForUser(userId, "list-1", "task-1");
        assertNotNull(result);
        assertEquals("g-task-123", result.get("id"));
    }

    @Test
    void listsForUser_returnsLists() {
        UUID userId = UUID.randomUUID();
        User user = new User("ext-1", "test@example.com", "Test");
        user.setId(userId);
        user.setGoogleAccountSubject("sub-123");

        when(userService.getUser(userId)).thenReturn(user);
        when(authorizedClientService.loadAuthorizedClient("google", "sub-123"))
                .thenReturn(buildAuthorizedClient("sub-123"));

        List<TaskListDto> lists = controller.listsForUser(userId, 50, null);
        assertNotNull(lists);
        assertFalse(lists.isEmpty());
        assertEquals("list-1", lists.get(0).id());
    }

    @Test
    void deleteTaskForUser_executesSuccessfully() {
        UUID userId = UUID.randomUUID();
        User user = new User("ext-1", "test@example.com", "Test");
        user.setId(userId);
        user.setGoogleAccountSubject("sub-123");

        when(userService.getUser(userId)).thenReturn(user);
        when(authorizedClientService.loadAuthorizedClient("google", "sub-123"))
                .thenReturn(buildAuthorizedClient("sub-123"));

        ResponseEntity<Void> response = controller.deleteTaskForUser(userId, "list-1", "task-1");
        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
    }

    @Test
    void me_returnsPrincipalAttributes() {
        org.springframework.security.oauth2.core.OAuth2AuthenticatedPrincipal principal = mock(org.springframework.security.oauth2.core.OAuth2AuthenticatedPrincipal.class);
        when(principal.getAttribute("sub")).thenReturn("sub-123");
        when(principal.getAttribute("email")).thenReturn("test@example.com");
        when(principal.getAttribute("name")).thenReturn("Test User");
        when(principal.getAttribute("iss")).thenReturn("google");

        Map<String, Object> result = controller.me(principal);
        assertEquals("sub-123", result.get("sub"));
        assertEquals("test@example.com", result.get("email"));
    }

    @Test
    void me_throwsUnauthorizedIfPrincipalNull() {
        org.springframework.web.server.ResponseStatusException ex = assertThrows(org.springframework.web.server.ResponseStatusException.class, 
            () -> controller.me(null));
        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
    }

    @Test
    void token_returnsTokenDetails() {
        OAuth2AuthorizedClient client = buildAuthorizedClient("sub-123");
        Map<String, Object> result = controller.token(client);
        assertNotNull(result.get("scopes"));
        assertNotNull(result.get("expiresAt"));
    }

    @Test
    void defaultListForUser_returnsFirstList() {
        UUID userId = UUID.randomUUID();
        User user = new User("ext-1", "test@example.com", "Test");
        user.setId(userId);
        user.setGoogleAccountSubject("sub-123");

        when(userService.getUser(userId)).thenReturn(user);
        when(authorizedClientService.loadAuthorizedClient("google", "sub-123"))
                .thenReturn(buildAuthorizedClient("sub-123"));

        Map<String, Object> result = controller.defaultListForUser(userId);
        assertEquals("list-1", result.get("id"));
        assertEquals("Default", result.get("title"));
    }

    @Test
    void localTasks_returnsRepositoryTasks() {
        UUID userId = UUID.randomUUID();
        User user = new User("ext-1", "test@example.com", "Test");
        user.setId(userId);

        UserTask task = new UserTask(user, "g123", TaskSource.GOOGLE_TASKS, "Local Task");
        
        when(userTaskRepository.findByUser_Id(userId)).thenReturn(List.of(task));

        List<Map<String, Object>> result = controller.localTasks(userId);
        assertEquals(1, result.size());
        assertEquals("Local Task", result.get(0).get("title"));
    }

    @Test
    void tasksForJourney_resolvesCoordinates() {
        UUID userId = UUID.randomUUID();
        User user = new User("ext-1", "test@example.com", "Test");
        user.setId(userId);
        user.setGoogleAccountSubject("sub-123");

        when(userService.getUser(userId)).thenReturn(user);
        when(authorizedClientService.loadAuthorizedClient("google", "sub-123"))
                .thenReturn(buildAuthorizedClient("sub-123"));

        PrimPlace place = new PrimPlace("sa-1", "Chatelet", null, null, null, new PrimCoordinates(48.858, 2.347));
        when(primApiClient.searchPlaces("Chatelet")).thenReturn(List.of(place));

        List<Map<String, Object>> result = controller.tasksForJourney(userId, false);
        
        // Task 1 in setup has #mavigo: Chatelet
        assertEquals(1, result.size());
        Map<String, Object> task = result.get(0);
        assertEquals("task-1", task.get("id"));
        assertEquals("Chatelet", task.get("locationQuery"));
        Map<String, Object> hint = (Map<String, Object>) task.get("locationHint");
        assertEquals(48.858, hint.get("lat"));
    }

    @Test
    void linkGoogleAccount_returnsSuccessHtml() {
        UUID userId = UUID.randomUUID();
        org.springframework.security.oauth2.core.OAuth2AuthenticatedPrincipal principal = mock(org.springframework.security.oauth2.core.OAuth2AuthenticatedPrincipal.class);
        when(principal.getAttribute("sub")).thenReturn("sub-123");
        when(principal.getAttribute("email")).thenReturn("test@example.com");

        User user = new User("gu123", "test@example.com", "Test User");
        user.setGoogleAccountEmail("test@example.com");
        when(userService.linkGoogleAccount(eq(userId), any())).thenReturn(user);

        ResponseEntity<String> response = controller.linkGoogleAccount(userId, principal);
        assertEquals(HttpStatus.FOUND, response.getStatusCode());
        assertTrue(response.getHeaders().getLocation().toString().contains("/google-link-complete"));
        assertTrue(response.getHeaders().getLocation().toString().contains("Test+User"));
    }

    @Test
    void linkGoogleAccount_returnsConflictHtmlOnError() {
        UUID userId = UUID.randomUUID();
        org.springframework.security.oauth2.core.OAuth2AuthenticatedPrincipal principal = mock(org.springframework.security.oauth2.core.OAuth2AuthenticatedPrincipal.class);
        when(principal.getAttribute("sub")).thenReturn("sub-123");

        when(userService.linkGoogleAccount(eq(userId), any())).thenThrow(new RuntimeException("Link failed"));

        ResponseEntity<String> response = controller.linkGoogleAccount(userId, principal);
        assertEquals(HttpStatus.FOUND, response.getStatusCode());
        assertTrue(response.getHeaders().getLocation().toString().contains("/google-link-error"));
        assertTrue(response.getHeaders().getLocation().toString().contains("Link+failed"));
    }

    private OAuth2AuthorizedClient buildAuthorizedClient(String subject) {
        ClientRegistration registration = ClientRegistration.withRegistrationId("google")
                .clientId("test-client-id")
                .clientSecret("test-client-secret")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
                .scope("openid")
                .authorizationUri("https://example.com/auth")
                .tokenUri("https://example.com/token")
                .userInfoUri("https://example.com/userinfo")
                .userNameAttributeName("sub")
                .clientName("google")
                .build();

        OAuth2AccessToken token = new OAuth2AccessToken(
                OAuth2AccessToken.TokenType.BEARER,
                "token",
                Instant.now(),
                Instant.now().plusSeconds(3600));

        return new OAuth2AuthorizedClient(registration, subject, token);
    }
}
