package org.marly.mavigo.controller;

import java.util.UUID;

import org.marly.mavigo.config.JwtUtils;
import org.marly.mavigo.controller.dto.ComfortProfileRequest;
import org.marly.mavigo.controller.dto.ComfortProfileResponse;
import org.marly.mavigo.controller.dto.CreateUserRequest;
import org.marly.mavigo.controller.dto.NamedComfortSettingRequest;
import org.marly.mavigo.controller.dto.NamedComfortSettingResponse;
import org.marly.mavigo.controller.dto.UpdateUserRequest;
import org.marly.mavigo.controller.dto.UserResponse;
import org.marly.mavigo.models.user.ComfortProfile;
import org.marly.mavigo.models.user.User;
import org.marly.mavigo.security.RequestOwnershipGuard;
import org.marly.mavigo.service.user.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;
    private final JwtUtils jwtUtils;
    private final RequestOwnershipGuard requestOwnershipGuard;

    public UserController(UserService userService, JwtUtils jwtUtils) {
        this(userService, jwtUtils, null);
    }

    @Autowired
    public UserController(UserService userService, JwtUtils jwtUtils, RequestOwnershipGuard requestOwnershipGuard) {
        this.userService = userService;
        this.jwtUtils = jwtUtils;
        this.requestOwnershipGuard = requestOwnershipGuard;
    }

    @PostMapping
    public ResponseEntity<LoginResponse> createUser(@Valid @RequestBody CreateUserRequest request) {
        if (!request.password().equals(request.passwordConfirm())) {
            throw new IllegalArgumentException("Password and confirmation do not match");
        }
        String home = StringUtils.hasText(request.homeAddress()) ? request.homeAddress().trim() : null;
        User created = userService.createUserFromRegistration(
                request.firstName().trim(),
                request.lastName().trim(),
                request.email().trim(),
                request.password(),
                home);
        String token = jwtUtils.generateToken(created.getEmail());
        return ResponseEntity.status(HttpStatus.CREATED).body(new LoginResponse(UserResponse.from(created), token));
    }

    @PostMapping("/login")
    public LoginResponse login(@RequestBody LoginRequest request) {
        String email = request != null && request.email() != null ? request.email().trim() : "";
        String password = request != null ? request.password() : "";
        User user = userService.login(email, password);
        String token = jwtUtils.generateToken(user.getEmail());
        return new LoginResponse(UserResponse.from(user), token);
    }

    public record LoginRequest(String email, String password) {
    }

    public record LoginResponse(UserResponse user, String token) {
    }

    @GetMapping("/{userId}")
    public UserResponse getUser(@PathVariable UUID userId, Authentication authentication) {
        requireUserAccess(userId, authentication);
        return UserResponse.from(userService.getUser(userId));
    }

    @PutMapping("/{userId}")
    public UserResponse updateUser(@PathVariable UUID userId, @Valid @RequestBody UpdateUserRequest request,
            Authentication authentication) {
        requireUserAccess(userId, authentication);
        User existing = userService.getUser(userId);
        request.apply(existing);
        User updated = userService.updateUser(existing);
        return UserResponse.from(updated);
    }

    @PutMapping("/{userId}/home-address")
    public UserResponse updateHomeAddress(@PathVariable UUID userId, @RequestBody HomeAddressRequest request,
            Authentication authentication) {
        requireUserAccess(userId, authentication);
        User existing = userService.getUser(userId);
        String value = request != null ? request.homeAddress() : null;
        value = value != null ? value.trim() : null;
        if (!StringUtils.hasText(value)) {
            value = null;
        }
        existing.setHomeAddress(value);
        User updated = userService.updateUser(existing);
        return UserResponse.from(updated);
    }

    public record HomeAddressRequest(String homeAddress) {
    }

    @DeleteMapping("/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteUser(@PathVariable UUID userId, Authentication authentication) {
        requireUserAccess(userId, authentication);
        userService.deleteUser(userId);
    }

    @GetMapping("/{userId}/comfort-profile")
    public ComfortProfileResponse getComfortProfile(@PathVariable UUID userId, Authentication authentication) {
        requireUserAccess(userId, authentication);
        User user = userService.getUser(userId);
        return ComfortProfileResponse.from(user.getComfortProfile());
    }

    @PutMapping("/{userId}/comfort-profile")
    public ComfortProfileResponse updateComfortProfile(
            @PathVariable UUID userId,
            @Valid @RequestBody ComfortProfileRequest request,
            Authentication authentication) {
        requireUserAccess(userId, authentication);
        User user = userService.getUser(userId);

        ComfortProfile profile = user.getComfortProfile();
        if (profile == null) {
            profile = new ComfortProfile();
            user.setComfortProfile(profile);
        }

        profile.setDirectPath(request.directPath());
        profile.setRequireAirConditioning(request.requireAirConditioning());
        profile.setMaxNbTransfers(request.maxNbTransfers());
        profile.setMaxWaitingDuration(request.maxWaitingDuration());
        profile.setMaxWalkingDuration(request.maxWalkingDuration());
        profile.setWheelchairAccessible(request.wheelchairAccessible());

        User updated = userService.updateUser(user);
        return ComfortProfileResponse.from(updated.getComfortProfile());
    }

    @DeleteMapping("/{userId}/comfort-profile")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteComfortProfile(@PathVariable UUID userId, Authentication authentication) {
        requireUserAccess(userId, authentication);
        User user = userService.getUser(userId);
        user.setComfortProfile(new ComfortProfile());
        userService.updateUser(user);
    }

    @GetMapping("/{userId}/comfort-settings")
    public java.util.List<NamedComfortSettingResponse> getNamedComfortSettings(@PathVariable UUID userId,
            Authentication authentication) {
        requireUserAccess(userId, authentication);
        User user = userService.getUser(userId);
        return user.getNamedComfortSettings().stream()
                .map(NamedComfortSettingResponse::from)
                .toList();
    }

    @PostMapping("/{userId}/comfort-settings")
    public NamedComfortSettingResponse addNamedComfortSetting(
            @PathVariable UUID userId,
            @Valid @RequestBody NamedComfortSettingRequest request,
            Authentication authentication) {
        requireUserAccess(userId, authentication);
        ComfortProfile profile = new ComfortProfile();
        profile.setDirectPath(request.comfortProfile().directPath());
        profile.setRequireAirConditioning(request.comfortProfile().requireAirConditioning());
        profile.setMaxNbTransfers(request.comfortProfile().maxNbTransfers());
        profile.setMaxWaitingDuration(request.comfortProfile().maxWaitingDuration());
        profile.setMaxWalkingDuration(request.comfortProfile().maxWalkingDuration());
        profile.setWheelchairAccessible(request.comfortProfile().wheelchairAccessible());

        User updated = userService.addNamedComfortSetting(userId, request.name(), profile);
        return updated.getNamedComfortSettings().stream()
                .filter(s -> s.getName().equals(request.name()))
                .findFirst()
                .map(NamedComfortSettingResponse::from)
                .orElseThrow(() -> new RuntimeException("Failed to find created setting"));
    }

    @PutMapping("/{userId}/comfort-settings/{settingId}")
    public NamedComfortSettingResponse updateNamedComfortSetting(
            @PathVariable UUID userId,
            @PathVariable UUID settingId,
            @Valid @RequestBody NamedComfortSettingRequest request,
            Authentication authentication) {
        requireUserAccess(userId, authentication);
        ComfortProfile profile = new ComfortProfile();
        profile.setDirectPath(request.comfortProfile().directPath());
        profile.setRequireAirConditioning(request.comfortProfile().requireAirConditioning());
        profile.setMaxNbTransfers(request.comfortProfile().maxNbTransfers());
        profile.setMaxWaitingDuration(request.comfortProfile().maxWaitingDuration());
        profile.setMaxWalkingDuration(request.comfortProfile().maxWalkingDuration());
        profile.setWheelchairAccessible(request.comfortProfile().wheelchairAccessible());

        User updated = userService.updateNamedComfortSetting(userId, settingId, request.name(), profile);

        return updated.getNamedComfortSettings().stream()
                .filter(s -> s.getId().equals(settingId))
                .findFirst()
                .map(NamedComfortSettingResponse::from)
                .orElseThrow(() -> new RuntimeException("Failed to find updated setting"));
    }

    @PostMapping("/{userId}/comfort-prompt-seen")
    public UserResponse markComfortPromptAsSeen(@PathVariable UUID userId, Authentication authentication) {
        requireUserAccess(userId, authentication);
        User updated = userService.markComfortPromptAsSeen(userId);
        return UserResponse.from(updated);
    }

    @DeleteMapping("/{userId}/comfort-settings/{settingId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteNamedComfortSetting(@PathVariable UUID userId, @PathVariable UUID settingId,
            Authentication authentication) {
        requireUserAccess(userId, authentication);
        userService.deleteNamedComfortSetting(userId, settingId);
    }

    private void requireUserAccess(UUID userId, Authentication authentication) {
        if (requestOwnershipGuard != null) {
            requestOwnershipGuard.requireUserAccess(userId, authentication);
        }
    }
}
