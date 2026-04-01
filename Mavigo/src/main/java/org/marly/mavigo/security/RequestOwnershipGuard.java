package org.marly.mavigo.security;

import java.util.UUID;

import org.marly.mavigo.models.journey.Journey;
import org.marly.mavigo.models.user.User;
import org.marly.mavigo.repository.JourneyRepository;
import org.marly.mavigo.repository.UserRepository;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.OAuth2AuthenticatedPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import jakarta.persistence.EntityNotFoundException;

@Component
public class RequestOwnershipGuard {

    private final UserRepository userRepository;
    private final JourneyRepository journeyRepository;

    public RequestOwnershipGuard(UserRepository userRepository, JourneyRepository journeyRepository) {
        this.userRepository = userRepository;
        this.journeyRepository = journeyRepository;
    }

    public void requireUserAccess(UUID userId, Authentication authentication) {
        String email = currentUserEmail(authentication);
        if (!StringUtils.hasText(email)) {
            return;
        }

        User authenticatedUser = userRepository.findByEmail(email)
                .orElseThrow(() -> new AccessDeniedException("Authenticated user was not found"));

        if (!authenticatedUser.getId().equals(userId)) {
            throw new AccessDeniedException("You cannot access another user's data");
        }
    }

    public void requireJourneyAccess(UUID journeyId, Authentication authentication) {
        String email = currentUserEmail(authentication);
        if (!StringUtils.hasText(email)) {
            return;
        }

        User authenticatedUser = userRepository.findByEmail(email)
                .orElseThrow(() -> new AccessDeniedException("Authenticated user was not found"));

        Journey journey = journeyRepository.findById(journeyId)
                .orElseThrow(() -> new EntityNotFoundException("Journey not found with id: " + journeyId));

        if (journey.getUser() == null || !authenticatedUser.getId().equals(journey.getUser().getId())) {
            throw new AccessDeniedException("You cannot access another user's journey");
        }
    }

    private String currentUserEmail(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new AccessDeniedException("Authentication is required");
        }

        Object principal = authentication.getPrincipal();
        if (principal instanceof UserDetails userDetails) {
            String username = userDetails.getUsername();
            return username != null && username.contains("@") ? username : null;
        }
        if (principal instanceof OidcUser oidcUser) {
            return oidcUser.getEmail();
        }
        if (principal instanceof OAuth2AuthenticatedPrincipal oauthPrincipal) {
            Object email = oauthPrincipal.getAttribute("email");
            return email != null ? email.toString() : null;
        }

        String name = authentication.getName();
        return name != null && name.contains("@") ? name : null;
    }
}
