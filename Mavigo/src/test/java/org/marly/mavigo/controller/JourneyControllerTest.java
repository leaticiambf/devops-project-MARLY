package org.marly.mavigo.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.marly.mavigo.service.journey.JourneyActionResult;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.marly.mavigo.models.task.UserTask;
import org.marly.mavigo.models.task.TaskSource;
import org.marly.mavigo.repository.JourneyRepository;
import org.marly.mavigo.config.CustomUserDetailsService;
import org.marly.mavigo.config.JwtUtils;
import org.marly.mavigo.config.SecurityConfig;
import org.marly.mavigo.filter.JwtFilter;
import org.marly.mavigo.security.JwtAuthenticationFilter;
import org.marly.mavigo.security.JwtTokenService;
import org.marly.mavigo.security.RequestOwnershipGuard;
import org.marly.mavigo.models.journey.Journey;
import org.marly.mavigo.models.journey.JourneyStatus;
import org.marly.mavigo.models.user.User;
import org.marly.mavigo.repository.UserRepository;
import org.marly.mavigo.repository.UserTaskRepository;
import org.marly.mavigo.service.journey.JourneyManagementService;
import org.marly.mavigo.service.journey.JourneyOptimizationService;
import org.marly.mavigo.service.journey.JourneyPlanningService;
import org.marly.mavigo.service.journey.TaskOnRouteService;
import org.marly.mavigo.service.journey.dto.JourneyPlanningParameters;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.util.ReflectionTestUtils;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.junit.jupiter.api.BeforeEach;

import com.fasterxml.jackson.databind.ObjectMapper;

@WebMvcTest(JourneyController.class)
@Import(SecurityConfig.class)
@DisplayName("Tests unitaires - JourneyController")
class JourneyControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private JourneyPlanningService journeyPlanningService;

    @MockitoBean
    private UserTaskRepository userTaskRepository;

    @MockitoBean
    private UserRepository userRepository;

    @MockitoBean
    private TaskOnRouteService taskOnRouteService;

    @MockitoBean
    private JourneyManagementService journeyManagementService;

    @MockitoBean
    private JourneyOptimizationService journeyOptimizationService;

    @MockitoBean
    private JourneyRepository journeyRepository;

    @MockitoBean
    private ClientRegistrationRepository clientRegistrationRepository;

    @MockitoBean
    private CustomUserDetailsService customUserDetailsService;

    @MockitoBean
    private JwtUtils jwtUtils;

    @MockitoBean
    private JwtTokenService jwtTokenService;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @MockitoBean
    private JwtFilter jwtFilter;

    @MockitoBean
    private RequestOwnershipGuard requestOwnershipGuard;

    @BeforeEach
    void setupFilter() throws ServletException, IOException {
        doAnswer(invocation -> {
            HttpServletRequest request = invocation.getArgument(0);
            HttpServletResponse response = invocation.getArgument(1);
            FilterChain chain = invocation.getArgument(2);
            chain.doFilter(request, response);
            return null;
        }).when(jwtFilter).doFilter(any(HttpServletRequest.class), any(HttpServletResponse.class),
                any(FilterChain.class));

        doAnswer(invocation -> {
            HttpServletRequest request = invocation.getArgument(0);
            HttpServletResponse response = invocation.getArgument(1);
            FilterChain chain = invocation.getArgument(2);
            chain.doFilter(request, response);
            return null;
        }).when(jwtAuthenticationFilter).doFilter(any(HttpServletRequest.class), any(HttpServletResponse.class),
                any(FilterChain.class));
    }

    @Test
    @WithMockUser
    @DisplayName("POST /api/journeys devrait créer un nouveau trajet")
    void planJourney_shouldCreateNewJourney() throws Exception {
        // Given
        UUID userId = UUID.randomUUID();
        User user = new User("ext-123", "test@example.com", "Test User");
        user.setId(userId);

        Journey mockJourney = createMockJourney(user);

        when(journeyPlanningService.planAndPersist(any(JourneyPlanningParameters.class)))
                .thenReturn(List.of(mockJourney));
        when(userTaskRepository.findByUser_Id(userId)).thenReturn(List.of());

        String requestBody = """
                {
                    "journey": {
                        "userId": "%s",
                        "originQuery": "Gare de Lyon",
                        "destinationQuery": "Châtelet",
                        "departureTime": "2025-12-14T18:00:00"
                    },
                    "preferences": {
                        "comfortMode": false
                    }
                }
                """.formatted(userId);

        // When/Then
        mockMvc.perform(post("/api/journeys")
                .with(SecurityMockMvcRequestPostProcessors.csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestBody))
                .andExpect(status().is2xxSuccessful());
    }

    @Test
    @WithMockUser
    @DisplayName("POST /api/journeys avec préférences de confort devrait créer un trajet confort")
    void planJourney_withComfortPreferences_shouldCreateComfortJourney() throws Exception {
        // Given
        UUID userId = UUID.randomUUID();
        UUID comfortSettingId = UUID.randomUUID();
        User user = new User("ext-123", "test@example.com", "Test User");
        user.setId(userId);

        Journey mockJourney = createMockJourney(user);
        mockJourney.setComfortModeEnabled(true);

        when(journeyPlanningService.planAndPersist(any(JourneyPlanningParameters.class)))
                .thenReturn(List.of(mockJourney));
        when(userTaskRepository.findByUser_Id(userId)).thenReturn(List.of());

        String requestBody = """
                {
                    "journey": {
                        "userId": "%s",
                        "originQuery": "Gare de Lyon",
                        "destinationQuery": "Châtelet",
                        "departureTime": "2025-12-14T18:00:00"
                    },
                    "preferences": {
                        "comfortMode": true,
                        "namedComfortSettingId": "%s"
                    }
                }
                """.formatted(userId, comfortSettingId);

        // When/Then
        mockMvc.perform(post("/api/journeys")
                .with(SecurityMockMvcRequestPostProcessors.csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestBody))
                .andExpect(status().is2xxSuccessful());
    }

    @Test
    @WithMockUser
    @DisplayName("POST /api/journeys/{id}/start devrait démarrer un trajet")
    void startJourney_shouldStartJourney() throws Exception {
        // Given
        UUID journeyId = UUID.randomUUID();
        User user = new User("ext-123", "test@example.com", "Test User");
        Journey mockJourney = createMockJourney(user);
        mockJourney.setStatus(JourneyStatus.IN_PROGRESS);

        when(journeyManagementService.startJourney(journeyId))
                .thenReturn(new JourneyActionResult(mockJourney, java.util.Collections.emptyList()));

        // When/Then
        mockMvc.perform(post("/api/journeys/{id}/start", journeyId)
                .with(SecurityMockMvcRequestPostProcessors.csrf()))
                .andExpect(status().isOk());
    }

    @Test
    @WithMockUser
    @DisplayName("POST /api/journeys/{id}/complete devrait compléter un trajet")
    void completeJourney_shouldCompleteJourney() throws Exception {
        // Given
        UUID journeyId = UUID.randomUUID();
        User user = new User("ext-123", "test@example.com", "Test User");
        Journey mockJourney = createMockJourney(user);
        mockJourney.setStatus(JourneyStatus.COMPLETED);

        when(journeyManagementService.completeJourney(journeyId))
                .thenReturn(new JourneyActionResult(mockJourney, java.util.Collections.emptyList()));

        // When/Then
        mockMvc.perform(post("/api/journeys/{id}/complete", journeyId)
                .with(SecurityMockMvcRequestPostProcessors.csrf()))
                .andExpect(status().isOk());
    }

    @Test
    @WithMockUser
    @DisplayName("POST /api/journeys/{id}/cancel devrait annuler un trajet")
    void cancelJourney_shouldCancelJourney() throws Exception {
        // Given
        UUID journeyId = UUID.randomUUID();
        User user = new User("ext-123", "test@example.com", "Test User");
        Journey mockJourney = createMockJourney(user);
        mockJourney.setStatus(JourneyStatus.CANCELLED);

        when(journeyManagementService.cancelJourney(journeyId)).thenReturn(mockJourney);

        // When/Then
        mockMvc.perform(post("/api/journeys/{id}/cancel", journeyId)
                .with(SecurityMockMvcRequestPostProcessors.csrf()))
                .andExpect(status().isOk());
    }

    @Test
    @WithMockUser
    @DisplayName("GET /api/journeys/{id} devrait retourner un trajet")
    void getJourney_shouldReturnJourney() throws Exception {
        // Given
        UUID journeyId = UUID.randomUUID();
        User user = new User("ext-123", "test@example.com", "Test User");
        Journey mockJourney = createMockJourney(user);

        when(journeyManagementService.getJourney(journeyId)).thenReturn(mockJourney);

        // When/Then
        mockMvc.perform(get("/api/journeys/{id}", journeyId))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("POST /api/journeys sans authentification ni CSRF devrait être rejeté")
    void planJourney_withoutAuthAndCsrf_shouldBeRejected() throws Exception {
        UUID userId = UUID.randomUUID();
        User user = new User("ext-123", "test@example.com", "Test User");
        user.setId(userId);
        Journey mockJourney = createMockJourney(user);
        when(journeyPlanningService.planAndPersist(any(JourneyPlanningParameters.class)))
                .thenReturn(List.of(mockJourney));

        String requestBody = """
                {
                    "journey": {
                        "userId": "%s",
                        "originQuery": "Gare de Lyon",
                        "destinationQuery": "Châtelet",
                        "departureTime": "2025-12-14T18:00:00"
                    }
                }
                """.formatted(userId);

        mockMvc.perform(post("/api/journeys")
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestBody))
                .andExpect(result -> {
                    int status = result.getResponse().getStatus();
                    boolean rejected = (status >= 300 && status < 500);
                    if (!rejected) {
                        throw new AssertionError("Expected a rejected request but was: " + status);
                    }
                });
    }

    @Test
    @WithMockUser
    @DisplayName("GET /api/journeys/debug/user-tasks avec détails devrait couvrir la lambda")
    void debugUserTasks_withDetails_shouldCoverLambda() throws Exception {
        // Given
        UUID userId = UUID.randomUUID();
        User user = new User("ext-123", "test@example.com", "Test User");
        user.setId(userId);
        UserTask task = new UserTask(user, "source-1", TaskSource.GOOGLE_TASKS, "Title");
        task.setLocationHint(new org.marly.mavigo.models.shared.GeoPoint(48.8, 2.3));
        ReflectionTestUtils.setField(task, "id", UUID.randomUUID());

        when(userTaskRepository.findByUser_Id(userId)).thenReturn(List.of(task));

        // When/Then
        mockMvc.perform(get("/api/journeys/debug/user-tasks")
                .param("userId", userId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.taskCount").value(1))
                .andExpect(jsonPath("$.tasks[0].title").value("Title"));
    }

    @Test
    @WithMockUser
    @DisplayName("POST /api/journeys/debug/seed-task-near-gare-de-lyon devrait créer une tâche")
    void seedTaskNearGareDeLyon_shouldCreateTask() throws Exception {
        // Given
        UUID userId = UUID.randomUUID();
        User user = new User("ext-123", "test@example.com", "Test User");
        user.setId(userId);

        when(userRepository.findById(userId)).thenReturn(java.util.Optional.of(user));
        when(userTaskRepository.save(any(UserTask.class))).thenAnswer(i -> {
            UserTask t = i.getArgument(0);
            ReflectionTestUtils.setField(t, "id", UUID.randomUUID());
            return t;
        });

        String requestBody = """
                {
                    "userId": "%s",
                    "title": "Milk"
                }
                """.formatted(userId);

        // When/Then
        mockMvc.perform(post("/api/journeys/debug/seed-task-near-gare-de-lyon")
                .with(SecurityMockMvcRequestPostProcessors.csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.seeded").value(true))
                .andExpect(jsonPath("$.title").value("Milk"));
    }

    @Test
    @WithMockUser
    @DisplayName("DELETE /api/journeys/all devrait tout supprimer")
    void deleteAllJourneys_shouldWork() throws Exception {
        mockMvc.perform(delete("/api/journeys/all")
                .with(SecurityMockMvcRequestPostProcessors.csrf()))
                .andExpect(status().isNoContent());

        verify(journeyManagementService).clearAllData();
    }

    @Test
    @WithMockUser
    @DisplayName("POST /api/journeys avec date invalide devrait retourner 400")
    void planJourney_withInvalidDate_shouldReturn400() throws Exception {
        String requestBody = """
                {
                    "journey": {
                        "userId": "%s",
                        "originQuery": "A",
                        "destinationQuery": "B",
                        "departureTime": "invalid-date"
                    }
                }
                """.formatted(UUID.randomUUID());

        mockMvc.perform(post("/api/journeys")
                .with(SecurityMockMvcRequestPostProcessors.csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestBody))
                .andExpect(status().isBadRequest());
    }

    @Test
    @WithMockUser
    @DisplayName("planJourney avec tâches sur la route devrait couvrir calculateTasksOnRoute")
    void planJourney_withTasksOnRoute_shouldCoverCalculate() throws Exception {
        // Given
        UUID userId = UUID.randomUUID();
        User user = new User("ext-123", "test@example.com", "Test User");
        user.setId(userId);
        Journey mockJourney = createMockJourney(user);

        UserTask task = new UserTask(user, "t1", TaskSource.GOOGLE_TASKS, "Task 1");
        task.setLocationHint(new org.marly.mavigo.models.shared.GeoPoint(48.8, 2.3));
        task.setCompleted(false);

        when(journeyPlanningService.planAndPersist(any())).thenReturn(List.of(mockJourney));
        when(userTaskRepository.findByUser_Id(any())).thenReturn(List.of(task));
        when(taskOnRouteService.extractRoutePoints(any()))
                .thenReturn(List.of(new org.marly.mavigo.models.shared.GeoPoint(48.8, 2.3)));
        when(taskOnRouteService.densify(any(), anyInt()))
                .thenReturn(List.of(new org.marly.mavigo.models.shared.GeoPoint(48.8, 2.3)));
        when(taskOnRouteService.minDistanceMetersToPolyline(any(), any())).thenReturn(10.0);

        String requestBody = """
                {
                    "journey": {
                        "userId": "%s",
                        "originQuery": "Gare de Lyon",
                        "destinationQuery": "Châtelet",
                        "departureTime": "2025-12-14T18:00:00"
                    }
                }
                """.formatted(userId);

        // When/Then
        mockMvc.perform(post("/api/journeys")
                .with(SecurityMockMvcRequestPostProcessors.csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestBody))
                .andExpect(status().is2xxSuccessful())
                .andExpect(jsonPath("$[0].tasksOnRoute").isArray())
                .andExpect(jsonPath("$[0].tasksOnRoute[0].title").value("Task 1"));
    }

    // Helper methods

    private Journey createMockJourney(User user) {
        Journey journey = new Journey(
                user,
                "Gare de Lyon",
                "Châtelet",
                OffsetDateTime.now(),
                OffsetDateTime.now().plusHours(1));
        journey.setStatus(JourneyStatus.PLANNED);
        return journey;
    }
}
