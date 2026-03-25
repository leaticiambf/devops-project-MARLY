package org.marly.mavigo.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.List;
import java.util.UUID;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.marly.mavigo.config.CustomUserDetailsService;
import org.marly.mavigo.config.JwtUtils;
import org.marly.mavigo.config.SecurityConfig;
import org.marly.mavigo.security.JwtAuthenticationFilter;
import org.marly.mavigo.filter.JwtFilter;
import org.marly.mavigo.controller.dto.CreateUserRequest;
import org.marly.mavigo.controller.dto.UpdateUserRequest;
import org.marly.mavigo.models.user.User;
import org.marly.mavigo.security.RequestOwnershipGuard;
import org.marly.mavigo.service.user.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.ObjectMapper;

@WebMvcTest(UserController.class)
@Import(SecurityConfig.class)
@DisplayName("Tests unitaires - UserController")
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private UserService userService;

    @MockitoBean
    private JwtUtils jwtUtils;

    @MockitoBean
    private CustomUserDetailsService customUserDetailsService;

    @MockitoBean
    private JwtFilter jwtFilter;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

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
        }).when(jwtFilter).doFilter(any(HttpServletRequest.class), any(HttpServletResponse.class), any(FilterChain.class));

        doAnswer(invocation -> {
            HttpServletRequest request = invocation.getArgument(0);
            HttpServletResponse response = invocation.getArgument(1);
            FilterChain chain = invocation.getArgument(2);
            chain.doFilter(request, response);
            return null;
        }).when(jwtAuthenticationFilter).doFilter(any(HttpServletRequest.class), any(HttpServletResponse.class), any(FilterChain.class));
    }

    @Test
    @DisplayName("POST /api/users (createUser) devrait retourner 201 quand tout est OK")
    void createUser_works() throws Exception {
        CreateUserRequest request = new CreateUserRequest("John", "Doe", "john@example.com", "password", "password", "Paris");
        User user = new User("ext-1", "john@example.com", "John Doe");
        user.setId(UUID.randomUUID());
        
        when(userService.createUserFromRegistration(anyString(), anyString(), anyString(), anyString(), anyString()))
            .thenReturn(user);
        when(jwtUtils.generateToken(anyString())).thenReturn("mock-token");

        mockMvc.perform(post("/api/users")
                .with(SecurityMockMvcRequestPostProcessors.csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token").value("mock-token"))
                .andExpect(jsonPath("$.user.email").value("john@example.com"));
    }

    @Test
    @DisplayName("POST /api/users (createUser) devrait échouer si mots de passe différents")
    void createUser_passwordMismatch_throws() throws Exception {
        CreateUserRequest request = new CreateUserRequest("John", "Doe", "john@example.com", "password", "wrong", "Paris");

        mockMvc.perform(post("/api/users")
                .with(SecurityMockMvcRequestPostProcessors.csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest()); // GlobalExceptionHandler should catch IllegalArgumentException
    }

    @Test
    @DisplayName("POST /api/users/login devrait retourner 200")
    void login_works() throws Exception {
        String requestBody = """
                {
                    "email": "john@example.com",
                    "password": "password"
                }
                """;
        User user = new User("ext-1", "john@example.com", "John Doe");
        user.setId(UUID.randomUUID());

        when(userService.login("john@example.com", "password")).thenReturn(user);
        when(jwtUtils.generateToken("john@example.com")).thenReturn("mock-token");

        mockMvc.perform(post("/api/users/login")
                .with(SecurityMockMvcRequestPostProcessors.csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("mock-token"));
    }

    @Test
    @WithMockUser
    @DisplayName("GET /api/users/{userId} devrait retourner l'utilisateur")
    void getUser_works() throws Exception {
        UUID userId = UUID.randomUUID();
        User user = new User("ext-1", "john@example.com", "John Doe");
        user.setId(userId);

        when(userService.getUser(userId)).thenReturn(user);

        mockMvc.perform(get("/api/users/{userId}", userId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(userId.toString()));
    }

    @Test
    @WithMockUser
    @DisplayName("PUT /api/users/{userId} devrait maj l'utilisateur")
    void updateUser_works() throws Exception {
        UUID userId = UUID.randomUUID();
        User user = new User("ext-1", "john@example.com", "John Doe");
        user.setId(userId);
        
        UpdateUserRequest request = new UpdateUserRequest("ext-1", "jane@example.com", "Jane Doe", "New Address");
        
        when(userService.getUser(userId)).thenReturn(user);
        when(userService.updateUser(any(User.class))).thenAnswer(i -> i.getArgument(0));

        mockMvc.perform(put("/api/users/{userId}", userId)
                .with(SecurityMockMvcRequestPostProcessors.csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("Jane Doe"));
    }

    @Test
    @WithMockUser
    @DisplayName("PUT /api/users/{userId}/home-address devrait maj l'adresse")
    void updateHomeAddress_works() throws Exception {
        UUID userId = UUID.randomUUID();
        User user = new User("ext-1", "john@example.com", "John Doe");
        user.setId(userId);
        
        when(userService.getUser(userId)).thenReturn(user);
        when(userService.updateUser(any(User.class))).thenAnswer(i -> i.getArgument(0));

        mockMvc.perform(put("/api/users/{userId}/home-address", userId)
                .with(SecurityMockMvcRequestPostProcessors.csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"homeAddress\": \"New Address\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.homeAddress").value("New Address"));
    }

    @Test
    @WithMockUser
    @DisplayName("DELETE /api/users/{userId} devrait supprimer l'utilisateur")
    void deleteUser_works() throws Exception {
        UUID userId = UUID.randomUUID();
        mockMvc.perform(delete("/api/users/{userId}", userId)
                .with(SecurityMockMvcRequestPostProcessors.csrf()))
                .andExpect(status().isNoContent());
        
        verify(userService).deleteUser(userId);
    }

    @Test
    @WithMockUser
    @DisplayName("GET /api/users/{userId}/comfort-profile devrait retourner le profil")
    void getComfortProfile_works() throws Exception {
        UUID userId = UUID.randomUUID();
        User user = new User("ext-1", "john@example.com", "John Doe");
        user.setId(userId);
        user.setComfortProfile(new org.marly.mavigo.models.user.ComfortProfile());
        
        when(userService.getUser(userId)).thenReturn(user);

        mockMvc.perform(get("/api/users/{userId}/comfort-profile", userId))
                .andExpect(status().isOk());
    }

    @Test
    @WithMockUser
    @DisplayName("PUT /api/users/{userId}/comfort-profile devrait maj le profil")
    void updateComfortProfile_works() throws Exception {
        UUID userId = UUID.randomUUID();
        User user = new User("ext-1", "john@example.com", "John Doe");
        user.setId(userId);
        user.setComfortProfile(new org.marly.mavigo.models.user.ComfortProfile());
        
        when(userService.getUser(userId)).thenReturn(user);
        when(userService.updateUser(any(User.class))).thenAnswer(i -> i.getArgument(0));

        String content = """
                {
                    "directPath": "indifferent",
                    "requireAirConditioning": true,
                    "maxNbTransfers": 2,
                    "maxWaitingDuration": 10,
                    "maxWalkingDuration": 15,
                    "wheelchairAccessible": false
                }
                """;

        mockMvc.perform(put("/api/users/{userId}/comfort-profile", userId)
                .with(SecurityMockMvcRequestPostProcessors.csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(content))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requireAirConditioning").value(true));
    }

    @Test
    @WithMockUser
    @DisplayName("DELETE /api/users/{userId}/comfort-profile devrait reset le profil")
    void deleteComfortProfile_works() throws Exception {
        UUID userId = UUID.randomUUID();
        User user = new User("ext-1", "john@example.com", "John Doe");
        user.setId(userId);

        when(userService.getUser(userId)).thenReturn(user);

        mockMvc.perform(delete("/api/users/{userId}/comfort-profile", userId)
                .with(SecurityMockMvcRequestPostProcessors.csrf()))
                .andExpect(status().isNoContent());
        
        verify(userService).updateUser(any(User.class));
    }

    @Test
    @WithMockUser
    @DisplayName("POST /api/users/{userId}/comfort-settings devrait ajouter un setting")
    void addNamedComfortSetting_works() throws Exception {
        UUID userId = UUID.randomUUID();
        User user = new User("ext-1", "john@example.com", "John Doe");
        user.setId(userId);
        
        org.marly.mavigo.models.user.NamedComfortSetting setting = new org.marly.mavigo.models.user.NamedComfortSetting(
                "Work", new org.marly.mavigo.models.user.ComfortProfile(), user);
        ReflectionTestUtils.setField(setting, "id", UUID.randomUUID());
        user.addNamedComfortSetting(setting);

        when(userService.addNamedComfortSetting(eq(userId), anyString(), any())).thenReturn(user);

        String content = """
                {
                    "name": "Work",
                    "comfortProfile": {
                        "directPath": "indifferent",
                        "requireAirConditioning": false,
                        "maxNbTransfers": 2,
                        "maxWaitingDuration": 10,
                        "maxWalkingDuration": 15,
                        "wheelchairAccessible": false
                    }
                }
                """;

        mockMvc.perform(post("/api/users/{userId}/comfort-settings", userId)
                .with(SecurityMockMvcRequestPostProcessors.csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(content))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Work"));
    }

    @Test
    @WithMockUser
    @DisplayName("POST /api/users/{userId}/comfort-prompt-seen devrait maj le flag")
    void markComfortPromptAsSeen_works() throws Exception {
        UUID userId = UUID.randomUUID();
        User user = new User("ext-1", "john@example.com", "John Doe");
        user.setId(userId);
        
        when(userService.markComfortPromptAsSeen(userId)).thenReturn(user);

        mockMvc.perform(post("/api/users/{userId}/comfort-prompt-seen", userId)
                .with(SecurityMockMvcRequestPostProcessors.csrf()))
                .andExpect(status().isOk());
    }

    @Test
    @WithMockUser
    @DisplayName("DELETE /api/users/{userId}/comfort-settings/{settingId} devrait supprimer")
    void deleteNamedComfortSetting_works() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID settingId = UUID.randomUUID();

        mockMvc.perform(delete("/api/users/{userId}/comfort-settings/{settingId}", userId, settingId)
                .with(SecurityMockMvcRequestPostProcessors.csrf()))
                .andExpect(status().isNoContent());

        verify(userService).deleteNamedComfortSetting(userId, settingId);
    }

    @Test
    @WithMockUser
    @DisplayName("GET /api/users/{userId}/comfort-settings devrait retourner la liste")
    void getNamedComfortSettings_works() throws Exception {
        UUID userId = UUID.randomUUID();
        User user = new User("ext-1", "john@example.com", "John Doe");
        user.setId(userId);
        
        org.marly.mavigo.models.user.NamedComfortSetting setting = new org.marly.mavigo.models.user.NamedComfortSetting(
                "Work", new org.marly.mavigo.models.user.ComfortProfile(), user);
        ReflectionTestUtils.setField(setting, "id", UUID.randomUUID());
        user.addNamedComfortSetting(setting);

        when(userService.getUser(userId)).thenReturn(user);

        mockMvc.perform(get("/api/users/{userId}/comfort-settings", userId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Work"));
    }

    @Test
    @WithMockUser
    @DisplayName("PUT /api/users/{userId}/comfort-settings/{settingId} devrait maj")
    void updateNamedComfortSetting_works() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID settingId = UUID.randomUUID();
        User user = new User("ext-1", "john@example.com", "John Doe");
        user.setId(userId);
        
        org.marly.mavigo.models.user.NamedComfortSetting setting = new org.marly.mavigo.models.user.NamedComfortSetting(
                "Work", new org.marly.mavigo.models.user.ComfortProfile(), user);
        ReflectionTestUtils.setField(setting, "id", settingId);
        user.addNamedComfortSetting(setting); // Add initial setting

        // Mock update: change name to "Home" in the returned user
        when(userService.updateNamedComfortSetting(eq(userId), eq(settingId), anyString(), any()))
            .thenAnswer(invocation -> {
                setting.setName("Home"); // update logic simulation
                return user;
            });

        String content = """
                {
                    "name": "Home",
                    "comfortProfile": {
                        "directPath": "indifferent",
                        "requireAirConditioning": false,
                        "maxNbTransfers": 2,
                        "maxWaitingDuration": 10,
                        "maxWalkingDuration": 15,
                        "wheelchairAccessible": false
                    }
                }
                """;

        mockMvc.perform(put("/api/users/{userId}/comfort-settings/{settingId}", userId, settingId)
                .with(SecurityMockMvcRequestPostProcessors.csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(content))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Home"));
    }
}
