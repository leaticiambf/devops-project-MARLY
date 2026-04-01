package org.marly.mavigo.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import io.jsonwebtoken.JwtException;
import lombok.RequiredArgsConstructor;
import org.marly.mavigo.config.CustomUserDetailsService;
import org.marly.mavigo.config.JwtUtils;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@RequiredArgsConstructor
public class JwtFilter extends OncePerRequestFilter {

    private final CustomUserDetailsService customUserDetailsService;
    private final JwtUtils jwtUtils;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
        final String authHeader = request.getHeader("Authorization");

        String username = null;
        String jwt = null;
        boolean bearerAttempted = false;

        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            bearerAttempted = true;
            jwt = authHeader.substring(7);
            try {
                username = jwtUtils.extractUsername(jwt);
            } catch (JwtException | IllegalArgumentException ex) {
                // Token invalide ou expiré : on ignore et on laisse la requête continuer sans authentification JWT
                username = null;
                jwt = null;
            }
        }

        if (username != null) {
            try {
                UserDetails userDetails = customUserDetailsService.loadUserByUsername(username);

                if (jwt != null && jwtUtils.validateToken(jwt, userDetails)) {
                    // Prefer an explicit Bearer token over any existing session-based
                    // authentication, such as the OAuth popup session used to link Google.
                    UsernamePasswordAuthenticationToken authenticationToken = new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
                    authenticationToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(authenticationToken);
                }
            } catch (UsernameNotFoundException ex) {
                // Stale token for a deleted/nonexistent user: continue request as anonymous.
            }
        } else if (bearerAttempted) {
            // When a Bearer token is explicitly sent but is invalid, do not fall back
            // to any unrelated session authentication that may exist in the browser.
            SecurityContextHolder.clearContext();
        }

        filterChain.doFilter(request,response);

    }
}
