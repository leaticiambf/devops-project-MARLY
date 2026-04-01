package org.marly.mavigo.filter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.marly.mavigo.config.CustomUserDetailsService;
import org.marly.mavigo.config.JwtUtils;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import io.jsonwebtoken.JwtException;
import jakarta.servlet.ServletException;

class JwtFilterTest {

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void doFilterInternal_skipsWhenAuthorizationHeaderMissing() throws ServletException, IOException {
        CustomUserDetailsService uds = mock(CustomUserDetailsService.class);
        JwtUtils jwtUtils = mock(JwtUtils.class);
        JwtFilter filter = new JwtFilter(uds, jwtUtils);

        filter.doFilterInternal(new MockHttpServletRequest(), new MockHttpServletResponse(), new MockFilterChain());

        assertNull(SecurityContextHolder.getContext().getAuthentication());
        verify(uds, never()).loadUserByUsername(org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void doFilterInternal_setsAuthenticationWhenTokenValid() throws ServletException, IOException {
        CustomUserDetailsService uds = mock(CustomUserDetailsService.class);
        JwtUtils jwtUtils = mock(JwtUtils.class);
        JwtFilter filter = new JwtFilter(uds, jwtUtils);

        UserDetails userDetails = new User("user@example.com", "pwd", List.of());
        when(jwtUtils.extractUsername("jwt-token")).thenReturn("user@example.com");
        when(uds.loadUserByUsername("user@example.com")).thenReturn(userDetails);
        when(jwtUtils.validateToken("jwt-token", userDetails)).thenReturn(true);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer jwt-token");

        filter.doFilterInternal(request, new MockHttpServletResponse(), new MockFilterChain());

        assertTrue(SecurityContextHolder.getContext().getAuthentication() instanceof UsernamePasswordAuthenticationToken);
        assertEquals(userDetails, SecurityContextHolder.getContext().getAuthentication().getPrincipal());
    }

    @Test
    void doFilterInternal_ignoresInvalidTokenExtractionErrors() throws ServletException, IOException {
        CustomUserDetailsService uds = mock(CustomUserDetailsService.class);
        JwtUtils jwtUtils = mock(JwtUtils.class);
        JwtFilter filter = new JwtFilter(uds, jwtUtils);

        when(jwtUtils.extractUsername("bad-token")).thenThrow(new JwtException("bad"));

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer bad-token");

        filter.doFilterInternal(request, new MockHttpServletResponse(), new MockFilterChain());

        assertNull(SecurityContextHolder.getContext().getAuthentication());
        verify(uds, never()).loadUserByUsername(org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void doFilterInternal_overridesExistingAuthenticationWithValidBearer() throws ServletException, IOException {
        CustomUserDetailsService uds = mock(CustomUserDetailsService.class);
        JwtUtils jwtUtils = mock(JwtUtils.class);
        JwtFilter filter = new JwtFilter(uds, jwtUtils);

        UserDetails newUserDetails = new User("new-user", "pwd", List.of());
        when(jwtUtils.extractUsername("jwt-token")).thenReturn("new-user");
        when(uds.loadUserByUsername("new-user")).thenReturn(newUserDetails);
        when(jwtUtils.validateToken("jwt-token", newUserDetails)).thenReturn(true);

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("existing-user", null));

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer jwt-token");

        filter.doFilterInternal(request, new MockHttpServletResponse(), new MockFilterChain());

        assertEquals(newUserDetails, SecurityContextHolder.getContext().getAuthentication().getPrincipal());
    }

    @Test
    void doFilterInternal_ignoresUnknownUserFromToken() throws ServletException, IOException {
        CustomUserDetailsService uds = mock(CustomUserDetailsService.class);
        JwtUtils jwtUtils = mock(JwtUtils.class);
        JwtFilter filter = new JwtFilter(uds, jwtUtils);

        when(jwtUtils.extractUsername("stale-token")).thenReturn("ghost@example.com");
        when(uds.loadUserByUsername("ghost@example.com"))
                .thenThrow(new UsernameNotFoundException("missing"));

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer stale-token");

        filter.doFilterInternal(request, new MockHttpServletResponse(), new MockFilterChain());

        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }
}
