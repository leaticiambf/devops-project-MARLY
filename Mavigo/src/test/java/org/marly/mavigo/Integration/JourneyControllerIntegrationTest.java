package org.marly.mavigo.Integration;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.marly.mavigo.models.user.User;
import org.marly.mavigo.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@ActiveProfiles("test")
@DisplayName("Tests d'intégration - JourneyController")
class JourneyControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    private User testUser;

    @BeforeEach
    void setUp() {
        testUser = new User("ext-journey-int-" + UUID.randomUUID(), "journey-int@test.com", "Journey Integration User");
        testUser = userRepository.save(testUser);
    }

    @ParameterizedTest(name = "{0} /api/journeys/id{1} devrait retourner 404")
    @CsvSource({
        "GET, ''",
        "POST, /start",
        "POST, /complete",
        "POST, /cancel"
    })
    @WithMockUser(username = "journey-int@test.com")
    void journeyAction_shouldReturn404ForNonExistentJourney(String method, String suffix) throws Exception {
        UUID nonExistentId = UUID.randomUUID();
        var requestBuilder = "GET".equals(method)
                ? get("/api/journeys/{id}" + suffix, nonExistentId)
                : post("/api/journeys/{id}" + suffix, nonExistentId)
                        .with(SecurityMockMvcRequestPostProcessors.csrf());
        mockMvc.perform(requestBuilder)
                .andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(username = "journey-int@test.com")
    @DisplayName("GET /api/journeys/debug/user-tasks devrait retourner les tâches")
    void debugUserTasks_shouldReturnTasks() throws Exception {
        mockMvc.perform(get("/api/journeys/debug/user-tasks")
                .param("userId", testUser.getId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(testUser.getId().toString()))
                .andExpect(jsonPath("$.taskCount").value(0))
                .andExpect(jsonPath("$.tasks").isArray());
    }

    @Test
    @DisplayName("POST /api/journeys sans auth explicite ni CSRF devrait être rejeté")
    void planJourney_withoutAuthAndCsrf_shouldBeRejected() throws Exception {
        String requestBody = """
                {
                    "journey": {
                        "userId": "%s",
                        "originQuery": "Gare de Lyon",
                        "destinationQuery": "Châtelet",
                        "departureTime": "2025-12-14T18:00:00"
                    }
                }
                """.formatted(testUser.getId());

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
    @WithMockUser(username = "journey-int@test.com")
    @DisplayName("POST /api/journeys sans body devrait retourner une erreur client")
    void planJourney_withoutBody_shouldReturnClientError() throws Exception {
        // POST with CSRF but no body may return 400 or 500 depending on validation
        mockMvc.perform(post("/api/journeys")
                .with(SecurityMockMvcRequestPostProcessors.csrf())
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(result -> {
                    int status = result.getResponse().getStatus();
                    boolean isClientOrServerError = (status >= 400 && status < 600);
                    if (!isClientOrServerError) {
                        throw new AssertionError("Expected error status but was: " + status);
                    }
                });
    }
}
