package org.marly.mavigo.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.marly.mavigo.controller.dto.ComfortProfileRequest;
import org.marly.mavigo.controller.dto.NamedComfortSettingRequest;
import org.marly.mavigo.models.user.ComfortProfile;
import org.marly.mavigo.models.user.User;
import org.marly.mavigo.repository.UserRepository;
import org.marly.mavigo.repository.NamedComfortSettingRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "test-integration@example.com")
class UserControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private NamedComfortSettingRepository namedComfortSettingRepository;

    @Autowired
    private ObjectMapper objectMapper;

    private User testUser;

    @BeforeEach
    void setUp() {
        testUser = new User("ext-test", "test-integration@example.com", "Integration Test User");
        testUser = userRepository.save(testUser);
    }

    @Test
    void createNamedComfortSetting_works() throws Exception {
        NamedComfortSettingRequest request = new NamedComfortSettingRequest(
                "My Commute",
                new ComfortProfileRequest("only", true, 1, 600, 300, null));

        mockMvc.perform(post("/api/users/{userId}/comfort-settings", testUser.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("My Commute"))
                .andExpect(jsonPath("$.comfortProfile.directPath").value("only"));

        assertThat(namedComfortSettingRepository.findAll()).hasSize(1);
    }

    @Test
    void listNamedComfortSettings_returnsEmptyListInitially() throws Exception {
        mockMvc.perform(get("/api/users/{userId}/comfort-settings", testUser.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void markComfortPromptSeen_updatesUserFlag() throws Exception {
        assertThat(testUser.getHasSeenComfortPrompt()).isFalse();

        mockMvc.perform(post("/api/users/{userId}/comfort-prompt-seen", testUser.getId()))
                .andExpect(status().isOk());

        User updatedUser = userRepository.findById(testUser.getId()).orElseThrow();
        assertThat(updatedUser.getHasSeenComfortPrompt()).isTrue();
    }

    @Test
    void updateHomeAddress_setsValue() throws Exception {
        String payload = "{\"homeAddress\":\"12 Rue de Rivoli, Paris\"}";

        mockMvc.perform(put("/api/users/{userId}/home-address", testUser.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content(payload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.homeAddress").value("12 Rue de Rivoli, Paris"));

        User updated = userRepository.findById(testUser.getId()).orElseThrow();
        assertThat(updated.getHomeAddress()).isEqualTo("12 Rue de Rivoli, Paris");
    }

    @Test
    void updateHomeAddress_clearsWhenBlank() throws Exception {
        testUser.setHomeAddress("Existing address");
        testUser = userRepository.save(testUser);

        String payload = "{\"homeAddress\":\"   \"}";

        mockMvc.perform(put("/api/users/{userId}/home-address", testUser.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content(payload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.homeAddress").isEmpty());

        User updated = userRepository.findById(testUser.getId()).orElseThrow();
        assertThat(updated.getHomeAddress()).isNull();
    }

    @Test
    void deleteNamedComfortSetting_removesFromDb() throws Exception {
        org.marly.mavigo.models.user.NamedComfortSetting ns = new org.marly.mavigo.models.user.NamedComfortSetting(
                "To Delete", new ComfortProfile(), testUser);
        ns = namedComfortSettingRepository.save(ns);

        mockMvc.perform(delete("/api/users/{userId}/comfort-settings/{settingId}", testUser.getId(), ns.getId()))
                .andExpect(status().isNoContent());

        assertThat(namedComfortSettingRepository.existsById(ns.getId())).isFalse();
    }
}
