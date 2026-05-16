package org.marly.mavigo.config;

import static org.springframework.security.config.Customizer.withDefaults;

import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

import jakarta.servlet.http.HttpServletRequest;
import org.marly.mavigo.filter.JwtFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtFilter jwtFilter;

    public SecurityConfig(JwtFilter jwtFilter) {
        this.jwtFilter = jwtFilter;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public OAuth2AuthorizationRequestResolver googleAuthRequestResolver(ClientRegistrationRepository clientRepo) {
        DefaultOAuth2AuthorizationRequestResolver base = new DefaultOAuth2AuthorizationRequestResolver(
                clientRepo, "/oauth2/authorization");

        base.setAuthorizationRequestCustomizer(builder -> {
            Set<String> scopes = new HashSet<>(Arrays.asList(
                    "openid", "profile", "email", "https://www.googleapis.com/auth/tasks"));
            builder.scopes(scopes);
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("prompt", "consent select_account");
            params.put("access_type", "offline");
            params.put("include_granted_scopes", "true");
            builder.additionalParameters(params);
        });

        return new OAuth2AuthorizationRequestResolver() {
            @Override
            public OAuth2AuthorizationRequest resolve(HttpServletRequest request) {
                return base.resolve(request);
            }

            @Override
            public OAuth2AuthorizationRequest resolve(HttpServletRequest request,
                    String clientRegistrationId) {
                return base.resolve(request, clientRegistrationId);
            }
        };
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
            OAuth2AuthorizationRequestResolver googleAuthRequestResolver) throws Exception {
        http
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info")
                        .permitAll()
                        .requestMatchers("/favicon.ico")
                        .permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/users", "/api/users/login")
                        .permitAll()
                        .requestMatchers("/api/auth/login").permitAll()
                        .requestMatchers("/oauth2/**", "/login/oauth2/**").permitAll()
                        .requestMatchers("/api/users/**", "/api/journeys/**", "/api/eco/**", "/api/google/**",
                                "/api/tourism/**")
                        .authenticated()
                        .anyRequest().authenticated())
                .oauth2Login(oauth -> oauth
                        .authorizationEndpoint(ae -> ae.authorizationRequestResolver(googleAuthRequestResolver))
                        .defaultSuccessUrl("/", false))
                .oauth2Client(withDefaults())
                .logout(logout -> logout
                        .logoutUrl("/logout")
                        .logoutSuccessUrl("/"))
                .headers(h -> h.frameOptions(f -> f.sameOrigin()))
                .csrf(csrf -> csrf
                        .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                        .ignoringRequestMatchers("/api/**", "/actuator/**"))
                .cors(withDefaults());

        http.addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
