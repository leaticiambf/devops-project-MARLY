package org.marly.mavigo.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.util.Collections;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientService;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final OAuth2AuthorizedClientService authorizedClientService;
    private final WebClient googleOAuthClient;

    public AuthController(OAuth2AuthorizedClientService authorizedClientService) {
        this.authorizedClientService = authorizedClientService;
        this.googleOAuthClient = WebClient.builder()
                .baseUrl("https://oauth2.googleapis.com")
                .build();
    }

    @GetMapping("/login")
    public void login(HttpServletRequest request, HttpServletResponse response) throws Exception {
        String scope = URLEncoder.encode(
                "openid profile email https://www.googleapis.com/auth/tasks",
                StandardCharsets.UTF_8
        );

        String proto = headerOr(request.getHeader("X-Forwarded-Proto"), request.getScheme());
        String host = headerOr(request.getHeader("X-Forwarded-Host"), request.getServerName());
        String portHeader = request.getHeader("X-Forwarded-Port");
        String port = portHeader != null ? portHeader : String.valueOf(request.getServerPort());
        boolean defaultPort = ("http".equalsIgnoreCase(proto) && "80".equals(port))
                || ("https".equalsIgnoreCase(proto) && "443".equals(port));
        String base = proto + "://" + host + (defaultPort ? "" : ":" + port);

        String redirect = base
                + "/oauth2/authorization/google"
                + "?prompt=consent%20select_account"
                + "&access_type=offline"
                + "&include_granted_scopes=true"
                + "&scope=" + scope;

        response.sendRedirect(redirect);
    }

    private static String headerOr(String h, String fallback) {
        return (h == null || h.isBlank()) ? fallback : h;
    }

    @GetMapping("/status")
    public ResponseEntity<?> status(@AuthenticationPrincipal OidcUser user, Authentication auth) {
        if (auth == null || !auth.isAuthenticated() || user == null) {
            return ResponseEntity.status(401).body(Map.of("authenticated", false));
        }
        return ResponseEntity.ok(Map.of(
                "authenticated", true,
                "email", user.getEmail(),
                "name", user.getFullName()
        ));
    }

    @GetMapping("/debug/scopes")
    public ResponseEntity<?> debugScopes(@AuthenticationPrincipal OidcUser user, Authentication auth) {
        if (auth == null || !auth.isAuthenticated()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("authenticated", false));
        }
        OAuth2AuthorizedClient client = authorizedClientService.loadAuthorizedClient("google", auth.getName());
        Set<String> scopes = (client != null && client.getAccessToken() != null)
                ? client.getAccessToken().getScopes()
                : Set.of();
        java.util.Map<String, Object> response = new java.util.HashMap<>();
        response.put("authenticated", true);
        response.put("email", user != null ? user.getEmail() : null);
        response.put("scopes", scopes != null ? scopes : Collections.emptySet());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/logout")
    public ResponseEntity<?> strongLogout(HttpServletRequest request,
                                          HttpServletResponse response,
                                          Authentication authentication) {
        try {
            if (authentication != null) {
                String principalName = authentication.getName();
                OAuth2AuthorizedClient client =
                        authorizedClientService.loadAuthorizedClient("google", principalName);

                if (client != null) {
                    if (client.getAccessToken() != null) {
                        revokeGoogleToken(client.getAccessToken().getTokenValue());
                    }
                    if (client.getRefreshToken() != null) {
                        revokeGoogleToken(client.getRefreshToken().getTokenValue());
                    }
                    authorizedClientService.removeAuthorizedClient("google", principalName);
                }
            }

            new SecurityContextLogoutHandler().logout(request, response, authentication);

            ResponseCookie expired = ResponseCookie.from("JSESSIONID", "")
                    .path("/")
                    .httpOnly(true)
                    .maxAge(0)
                    .build();
            response.addHeader(HttpHeaders.SET_COOKIE, expired.toString());

            return ResponseEntity.ok(Map.of("ok", true));
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("ok", false, "error", e.getMessage()));
        }
    }

    private void revokeGoogleToken(String token) {
        try {
            googleOAuthClient.post()
                    .uri(uri -> uri.path("/revoke").queryParam("token", token).build())
                    .retrieve()
                    .toBodilessEntity()
                    .block();
        } catch (Exception ignore) {
        }
    }
}
