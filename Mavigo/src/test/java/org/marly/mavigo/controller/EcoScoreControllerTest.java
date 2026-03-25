package org.marly.mavigo.controller;

import org.junit.jupiter.api.Test;
import org.marly.mavigo.config.CustomUserDetailsService;
import org.marly.mavigo.config.JwtUtils;
import org.marly.mavigo.controller.dto.EcoScoreResponse;
import org.marly.mavigo.models.tracking.Badge;
import org.marly.mavigo.models.tracking.JourneyActivity;
import org.marly.mavigo.models.tracking.UserBadge;
import org.marly.mavigo.security.JwtTokenService;
import org.marly.mavigo.security.RequestOwnershipGuard;
import org.marly.mavigo.service.tracking.GamificationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(EcoScoreController.class)
class EcoScoreControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private GamificationService gamificationService;

    @MockitoBean
    private ClientRegistrationRepository clientRegistrationRepository;

    @MockitoBean
    private CustomUserDetailsService customUserDetailsService;

    @MockitoBean
    private JwtUtils jwtUtils;

    @MockitoBean
    private JwtTokenService jwtTokenService;

    @MockitoBean
    private RequestOwnershipGuard requestOwnershipGuard;

    @Test
    @WithMockUser
    void getDashboard_shouldReturnDashboardData() throws Exception {
        UUID userId = UUID.randomUUID();
        Badge badge = new Badge("Eco-Beginner", "First journey", "🌱");
        UserBadge userBadge = new UserBadge(userId, badge.getId(), OffsetDateTime.now());
        userBadge.setBadge(badge);

        JourneyActivity activity = new JourneyActivity(userId, UUID.randomUUID(), "Origin", "Dest", 1000, 0.2,
                OffsetDateTime.now());

        when(gamificationService.getTotalCo2Saved(any(UUID.class))).thenReturn(0.2);
        when(gamificationService.getUserBadges(any(UUID.class))).thenReturn(List.of(userBadge));
        when(gamificationService.getAllSystemBadges()).thenReturn(List.of(badge));
        when(gamificationService.getJourneyHistory(any(UUID.class))).thenReturn(List.of(activity));

        mockMvc.perform(get("/api/eco/dashboard")
                .param("userId", userId.toString())
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalCo2Saved").value(0.2))
                .andExpect(jsonPath("$.badgeCount").value(1))
                .andExpect(jsonPath("$.earnedBadges[0].name").value("Eco-Beginner"))
                .andExpect(jsonPath("$.allBadges[0].name").value("Eco-Beginner"))
                .andExpect(jsonPath("$.history[0].distance").value(1000.0));
    }
}
