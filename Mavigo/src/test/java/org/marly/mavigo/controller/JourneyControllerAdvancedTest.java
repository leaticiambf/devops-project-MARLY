package org.marly.mavigo.controller;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.marly.mavigo.config.CustomUserDetailsService;
import org.marly.mavigo.config.JwtUtils;
import org.marly.mavigo.config.SecurityConfig;
import org.marly.mavigo.filter.JwtFilter;
import org.marly.mavigo.models.journey.Journey;
import org.marly.mavigo.security.JwtAuthenticationFilter;
import org.marly.mavigo.security.JwtTokenService;
import org.marly.mavigo.security.RequestOwnershipGuard;
import org.marly.mavigo.models.journey.JourneyStatus;
import org.marly.mavigo.models.user.User;
import org.marly.mavigo.repository.UserRepository;
import org.marly.mavigo.repository.UserTaskRepository;
import org.marly.mavigo.repository.JourneyRepository;
import org.marly.mavigo.service.journey.JourneyManagementService;
import org.marly.mavigo.service.journey.JourneyOptimizationService;
import org.marly.mavigo.service.journey.JourneyOptimizationService.OptimizedJourneyResult;
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

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.junit.jupiter.api.BeforeEach;

import com.fasterxml.jackson.databind.ObjectMapper;

@WebMvcTest(JourneyController.class)
@Import(SecurityConfig.class)
@DisplayName("Tests avancés - JourneyController")
class JourneyControllerAdvancedTest {

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

    @Nested
    @DisplayName("Tests d'optimisation avec tâches")
    class TaskOptimizationTests {

        @Test
        @WithMockUser
        @DisplayName("planJourney avec taskDetails utilise l'optimisation")
        void planJourney_withTaskDetails_usesOptimization() throws Exception {
            // Given
            UUID userId = UUID.randomUUID();
            User user = new User("ext-123", "test@example.com", "Test User");
            user.setId(userId);

            Journey mockJourney = createMockJourney(user);
            OptimizedJourneyResult optimizedResult = new OptimizedJourneyResult(
                    mockJourney, List.of(), 3600, 4200);

            when(journeyOptimizationService.planOptimizedJourneyWithTaskDetails(any(), anyList()))
                    .thenReturn(List.of(optimizedResult));
            when(userTaskRepository.findByUser_Id(userId)).thenReturn(List.of());

            String requestBody = """
                    {
                        "journey": {
                            "userId": "%s",
                            "originQuery": "Gare de Lyon",
                            "destinationQuery": "Châtelet",
                            "departureTime": "2025-12-14T18:00:00",
                            "taskDetails": [
                                {"id": "task-1", "title": "Buy groceries", "locationQuery": "Monoprix Gare de Lyon"}
                            ]
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
        @DisplayName("planJourney avec taskIds utilise l'optimisation")
        void planJourney_withTaskIds_usesOptimization() throws Exception {
            // Given
            UUID userId = UUID.randomUUID();
            UUID taskId = UUID.randomUUID();
            User user = new User("ext-123", "test@example.com", "Test User");
            user.setId(userId);

            Journey mockJourney = createMockJourney(user);
            OptimizedJourneyResult optimizedResult = new OptimizedJourneyResult(
                    mockJourney, List.of(), 3600, 4200);

            when(journeyOptimizationService.planOptimizedJourneyWithTasks(any(), anyList()))
                    .thenReturn(List.of(optimizedResult));
            when(userTaskRepository.findByUser_Id(userId)).thenReturn(List.of());

            String requestBody = """
                    {
                        "journey": {
                            "userId": "%s",
                            "originQuery": "Gare de Lyon",
                            "destinationQuery": "Châtelet",
                            "departureTime": "2025-12-14T18:00:00",
                            "taskIds": ["%s"]
                        },
                        "preferences": {
                            "comfortMode": false
                        }
                    }
                    """.formatted(userId, taskId);

            // When/Then
            mockMvc.perform(post("/api/journeys")
                    .with(SecurityMockMvcRequestPostProcessors.csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestBody))
                    .andExpect(status().is2xxSuccessful());
        }

        @Test
        @WithMockUser
        @DisplayName("planJourney retourne au trajet normal si l'optimisation échoue")
        void planJourney_fallsBackWhenOptimizationFails() throws Exception {
            // Given
            UUID userId = UUID.randomUUID();
            User user = new User("ext-123", "test@example.com", "Test User");
            user.setId(userId);

            Journey mockJourney = createMockJourney(user);

            when(journeyOptimizationService.planOptimizedJourneyWithTaskDetails(any(), anyList()))
                    .thenReturn(List.of()); // Empty = optimization failed
            when(journeyPlanningService.planAndPersist(any(JourneyPlanningParameters.class)))
                    .thenReturn(List.of(mockJourney));
            when(userTaskRepository.findByUser_Id(userId)).thenReturn(List.of());

            String requestBody = """
                    {
                        "journey": {
                            "userId": "%s",
                            "originQuery": "Gare de Lyon",
                            "destinationQuery": "Châtelet",
                            "departureTime": "2025-12-14T18:00:00",
                            "taskDetails": [
                                {"id": "task-1", "title": "Test", "locationQuery": "Test Location"}
                            ]
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
    }

    @Nested
    @DisplayName("Tests de parsing departureTime")
    class DepartureTimeParsingTests {

        @ParameterizedTest(name = "planJourney accepte le format: {0}")
        @ValueSource(strings = {
                "2025-12-14T18:00:00+01:00",
                "2025-12-14T18:00:00",
                "2025-12-14T18:00",
                "2025-12-14T17:00:00Z"
        })
        @WithMockUser
        void planJourney_acceptsVariousDateTimeFormats(String departureTime) throws Exception {
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
                            "departureTime": "%s"
                        }
                    }
                    """.formatted(userId, departureTime);

            mockMvc.perform(post("/api/journeys")
                    .with(SecurityMockMvcRequestPostProcessors.csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestBody))
                    .andExpect(status().is2xxSuccessful());
        }
    }

    @Nested
    @DisplayName("Tests multi-stop (Via routing)")
    class MultiStopViaRoutingTests {

        @Test
        @WithMockUser
        @DisplayName("planJourney avec intermediateQuery utilise le via routing")
        void planJourney_withIntermediateQuery_usesViaRouting() throws Exception {
            UUID userId = UUID.randomUUID();
            User user = new User("ext-123", "test@example.com", "Test User");
            user.setId(userId);

            Journey leg1 = createMockJourney(user);
            leg1.setOriginLabel("Gare de Lyon");
            leg1.setDestinationLabel("Châtelet-Les Halles");
            Journey leg2 = createMockJourney(user);
            leg2.setOriginLabel("Châtelet-Les Halles");
            leg2.setDestinationLabel("Opéra");

            when(journeyPlanningService.planAndPersist(any(JourneyPlanningParameters.class)))
                    .thenReturn(List.of(leg1))
                    .thenReturn(List.of(leg2));
            when(journeyRepository.save(any(Journey.class))).thenAnswer(inv -> inv.getArgument(0));
            when(userTaskRepository.findByUser_Id(userId)).thenReturn(List.of());

            String requestBody = """
                    {
                        "journey": {
                            "userId": "%s",
                            "originQuery": "Gare de Lyon",
                            "destinationQuery": "Opéra",
                            "departureTime": "2025-12-14T18:00:00",
                            "intermediateQuery": "Châtelet-Les Halles"
                        },
                        "preferences": {
                            "comfortMode": false
                        }
                    }
                    """.formatted(userId);

            mockMvc.perform(post("/api/journeys")
                    .with(SecurityMockMvcRequestPostProcessors.csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestBody))
                    .andExpect(status().is2xxSuccessful())
                    .andExpect(jsonPath("$[0].intermediateQuery").value("Châtelet-Les Halles"));
        }

        @Test
        @WithMockUser
        @DisplayName("planJourney avec intermediateQuery et intermediateDepartureTime")
        void planJourney_withIntermediateQueryAndDepartureTime() throws Exception {
            UUID userId = UUID.randomUUID();
            User user = new User("ext-123", "test@example.com", "Test User");
            user.setId(userId);

            Journey leg1 = createMockJourney(user);
            Journey leg2 = createMockJourney(user);

            when(journeyPlanningService.planAndPersist(any(JourneyPlanningParameters.class)))
                    .thenReturn(List.of(leg1))
                    .thenReturn(List.of(leg2));
            when(journeyRepository.save(any(Journey.class))).thenAnswer(inv -> inv.getArgument(0));
            when(userTaskRepository.findByUser_Id(userId)).thenReturn(List.of());

            String requestBody = """
                    {
                        "journey": {
                            "userId": "%s",
                            "originQuery": "A",
                            "destinationQuery": "C",
                            "departureTime": "2025-12-14T18:00:00",
                            "intermediateQuery": "B",
                            "intermediateDepartureTime": "2025-12-14T19:00:00"
                        }
                    }
                    """.formatted(userId);

            mockMvc.perform(post("/api/journeys")
                    .with(SecurityMockMvcRequestPostProcessors.csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestBody))
                    .andExpect(status().is2xxSuccessful())
                    .andExpect(jsonPath("$[0].intermediateQuery").value("B"))
                    .andExpect(jsonPath("$[0].intermediateDepartureTime").exists());
        }

        @Test
        @WithMockUser
        @DisplayName("planJourney avec intermediateQuery blank n'utilise pas le via routing")
        void planJourney_withBlankIntermediateQuery_doesNotUseViaRouting() throws Exception {
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
                            "departureTime": "2025-12-14T18:00:00",
                            "intermediateQuery": "   "
                        }
                    }
                    """.formatted(userId);

            mockMvc.perform(post("/api/journeys")
                    .with(SecurityMockMvcRequestPostProcessors.csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestBody))
                    .andExpect(status().is2xxSuccessful());

            verify(journeyPlanningService).planAndPersist(any(JourneyPlanningParameters.class));
        }

        @Test
        @WithMockUser
        @DisplayName("planJourney via routing retourne vide si leg1 vide")
        void planJourney_viaRouting_returnsEmptyWhenLeg1Empty() throws Exception {
            UUID userId = UUID.randomUUID();
            User user = new User("ext-123", "test@example.com", "Test User");
            user.setId(userId);

            when(journeyPlanningService.planAndPersist(any(JourneyPlanningParameters.class)))
                    .thenReturn(List.of());
            when(userTaskRepository.findByUser_Id(userId)).thenReturn(List.of());

            String requestBody = """
                    {
                        "journey": {
                            "userId": "%s",
                            "originQuery": "Unknown Origin",
                            "destinationQuery": "Opéra",
                            "departureTime": "2025-12-14T18:00:00",
                            "intermediateQuery": "Châtelet"
                        }
                    }
                    """.formatted(userId);

            mockMvc.perform(post("/api/journeys")
                    .with(SecurityMockMvcRequestPostProcessors.csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestBody))
                    .andExpect(status().is2xxSuccessful())
                    .andExpect(jsonPath("$").isArray())
                    .andExpect(jsonPath("$.length()").value(0));
        }

        @Test
        @WithMockUser
        @DisplayName("planJourney via routing retourne vide si leg2 vide")
        void planJourney_viaRouting_returnsEmptyWhenLeg2Empty() throws Exception {
            UUID userId = UUID.randomUUID();
            User user = new User("ext-123", "test@example.com", "Test User");
            user.setId(userId);

            Journey leg1 = createMockJourney(user);

            when(journeyPlanningService.planAndPersist(any(JourneyPlanningParameters.class)))
                    .thenReturn(List.of(leg1))
                    .thenReturn(List.of());
            when(userTaskRepository.findByUser_Id(userId)).thenReturn(List.of());

            String requestBody = """
                    {
                        "journey": {
                            "userId": "%s",
                            "originQuery": "Gare de Lyon",
                            "destinationQuery": "Unknown Dest",
                            "departureTime": "2025-12-14T18:00:00",
                            "intermediateQuery": "Châtelet"
                        }
                    }
                    """.formatted(userId);

            mockMvc.perform(post("/api/journeys")
                    .with(SecurityMockMvcRequestPostProcessors.csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestBody))
                    .andExpect(status().is2xxSuccessful())
                    .andExpect(jsonPath("$").isArray())
                    .andExpect(jsonPath("$.length()").value(0));
        }

        @Test
        @WithMockUser
        @DisplayName("planJourney via routing inclut tasksOnRoute dans la réponse")
        void planJourney_viaRouting_includesTasksOnRoute() throws Exception {
            UUID userId = UUID.randomUUID();
            User user = new User("ext-123", "test@example.com", "Test User");
            user.setId(userId);

            Journey leg1 = createMockJourney(user);
            Journey leg2 = createMockJourney(user);

            when(journeyPlanningService.planAndPersist(any(JourneyPlanningParameters.class)))
                    .thenReturn(List.of(leg1))
                    .thenReturn(List.of(leg2));
            when(journeyRepository.save(any(Journey.class))).thenAnswer(inv -> inv.getArgument(0));
            when(userTaskRepository.findByUser_Id(userId)).thenReturn(List.of());

            String requestBody = """
                    {
                        "journey": {
                            "userId": "%s",
                            "originQuery": "A",
                            "destinationQuery": "C",
                            "departureTime": "2025-12-14T18:00:00",
                            "intermediateQuery": "B"
                        }
                    }
                    """.formatted(userId);

            mockMvc.perform(post("/api/journeys")
                    .with(SecurityMockMvcRequestPostProcessors.csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestBody))
                    .andExpect(status().is2xxSuccessful())
                    .andExpect(jsonPath("$[0].tasksOnRoute").isArray());
        }

        @Test
        @WithMockUser
        @DisplayName("intermediateQuery prioritaire sur taskIds pour le routing")
        void planJourney_intermediateQueryTakesPrecedenceOverTaskIds() throws Exception {
            UUID userId = UUID.randomUUID();
            UUID taskId = UUID.randomUUID();
            User user = new User("ext-123", "test@example.com", "Test User");
            user.setId(userId);

            Journey leg1 = createMockJourney(user);
            Journey leg2 = createMockJourney(user);

            when(journeyPlanningService.planAndPersist(any(JourneyPlanningParameters.class)))
                    .thenReturn(List.of(leg1))
                    .thenReturn(List.of(leg2));
            when(journeyRepository.save(any(Journey.class))).thenAnswer(inv -> inv.getArgument(0));
            when(userTaskRepository.findByUser_Id(userId)).thenReturn(List.of());

            String requestBody = """
                    {
                        "journey": {
                            "userId": "%s",
                            "originQuery": "A",
                            "destinationQuery": "C",
                            "departureTime": "2025-12-14T18:00:00",
                            "intermediateQuery": "B",
                            "taskIds": ["%s"]
                        }
                    }
                    """.formatted(userId, taskId);

            mockMvc.perform(post("/api/journeys")
                    .with(SecurityMockMvcRequestPostProcessors.csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestBody))
                    .andExpect(status().is2xxSuccessful())
                    .andExpect(jsonPath("$[0].intermediateQuery").value("B"));

            verify(journeyOptimizationService, never()).planOptimizedJourneyWithTasks(any(), anyList());
        }
    }

    @Nested
    @DisplayName("Tests sans tâches (trajet normal)")
    class NormalJourneyTests {

        @Test
        @WithMockUser
        @DisplayName("planJourney sans tâches n'utilise pas l'optimisation")
        void planJourney_withoutTasks_doesNotUseOptimization() throws Exception {
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
        @DisplayName("planJourney avec etape intermediaire utilise planViaJourney")
        void planJourney_withIntermediateQuery_usesViaRouting() throws Exception {
            // Given
            UUID userId = UUID.randomUUID();
            User user = new User("ext-123", "test@example.com", "Test User");
            user.setId(userId);

            Journey mockJourneyLeg1 = createMockJourney(user);
            mockJourneyLeg1.setOriginLabel("Gare de Lyon");
            mockJourneyLeg1.setDestinationLabel("Châtelet");
            org.marly.mavigo.models.journey.JourneySegment leg1Seg = new org.marly.mavigo.models.journey.JourneySegment(
                    mockJourneyLeg1, 0, org.marly.mavigo.models.journey.SegmentType.PUBLIC_TRANSPORT);
            leg1Seg.addPoint(new org.marly.mavigo.models.journey.JourneyPoint(leg1Seg, 0,
                    org.marly.mavigo.models.journey.JourneyPointType.ORIGIN, "Gare de Lyon"));
            mockJourneyLeg1.addSegment(leg1Seg);

            Journey mockJourneyLeg2 = createMockJourney(user);
            mockJourneyLeg2.setOriginLabel("Châtelet");
            mockJourneyLeg2.setDestinationLabel("Gare du Nord");
            org.marly.mavigo.models.journey.JourneySegment leg2Seg = new org.marly.mavigo.models.journey.JourneySegment(
                    mockJourneyLeg2, 0, org.marly.mavigo.models.journey.SegmentType.PUBLIC_TRANSPORT);
            leg2Seg.addPoint(new org.marly.mavigo.models.journey.JourneyPoint(leg2Seg, 0,
                    org.marly.mavigo.models.journey.JourneyPointType.DESTINATION, "Gare du Nord"));
            mockJourneyLeg2.addSegment(leg2Seg);

            when(userTaskRepository.findByUser_Id(userId)).thenReturn(List.of());

            // Mock leg 1: Gare de Lyon -> Châtelet
            when(journeyPlanningService.planAndPersist(argThat(p -> p != null && "Gare de Lyon".equals(p.originQuery())
                    && "Châtelet".equals(p.destinationQuery())))).thenReturn(List.of(mockJourneyLeg1));

            // Mock leg 2: Châtelet -> Gare du Nord
            when(journeyPlanningService.planAndPersist(argThat(p -> p != null && "Châtelet".equals(p.originQuery())
                    && "Gare du Nord".equals(p.destinationQuery())))).thenReturn(List.of(mockJourneyLeg2));

            when(journeyRepository.save(any(Journey.class))).thenAnswer(i -> {
                Journey j = i.getArgument(0);
                org.springframework.test.util.ReflectionTestUtils.setField(j, "id", UUID.randomUUID());
                return j;
            });

            String requestBody = """
                    {
                        "journey": {
                            "userId": "%s",
                            "originQuery": "Gare de Lyon",
                            "destinationQuery": "Gare du Nord",
                            "intermediateQuery": "Châtelet",
                            "intermediateDepartureTime": "2025-12-14T18:30:00",
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
                    .andExpect(jsonPath("$").isArray())
                    .andExpect(jsonPath("$[0].intermediateQuery").value("Châtelet"));
        }

        @Test
        @WithMockUser
        @DisplayName("planJourney avec etape intermediaire echoue si etape 1 vide")
        void planJourney_withIntermediateQuery_leg1Empty_returnsEmpty() throws Exception {
            // Given
            UUID userId = UUID.randomUUID();
            User user = new User("ext-123", "test@example.com", "Test User");
            user.setId(userId);

            when(userTaskRepository.findByUser_Id(userId)).thenReturn(List.of());

            when(journeyPlanningService.planAndPersist(any())).thenReturn(List.of());

            String requestBody = """
                    {
                        "journey": {
                            "userId": "%s",
                            "originQuery": "Gare de Lyon",
                            "destinationQuery": "Gare du Nord",
                            "intermediateQuery": "Châtelet",
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
                    .andExpect(jsonPath("$").isEmpty());
        }

        @Test
        @WithMockUser
        @DisplayName("planJourney avec etape intermediaire echoue si etape 2 vide")
        void planJourney_withIntermediateQuery_leg2Empty_returnsEmpty() throws Exception {
            // Given
            UUID userId = UUID.randomUUID();
            User user = new User("ext-123", "test@example.com", "Test User");
            user.setId(userId);

            Journey mockJourneyLeg1 = createMockJourney(user);

            when(userTaskRepository.findByUser_Id(userId)).thenReturn(List.of());

            // Mock leg 1 OK
            when(journeyPlanningService
                    .planAndPersist(argThat(p -> p != null && "Gare de Lyon".equals(p.originQuery()))))
                    .thenReturn(List.of(mockJourneyLeg1));

            // Mock leg 2 Empty
            when(journeyPlanningService.planAndPersist(argThat(p -> p != null && "Châtelet".equals(p.originQuery()))))
                    .thenReturn(List.of());

            String requestBody = """
                    {
                        "journey": {
                            "userId": "%s",
                            "originQuery": "Gare de Lyon",
                            "destinationQuery": "Gare du Nord",
                            "intermediateQuery": "Châtelet",
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
                    .andExpect(jsonPath("$").isEmpty());
        }
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
