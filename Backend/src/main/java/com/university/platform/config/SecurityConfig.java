package com.university.platform.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.http.HttpMethod;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.security.config.Customizer;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthFilter;

    /** Comma-separated allowed origins — set CORS_ALLOWED_ORIGINS in production. */
    @Value("${cors.allowed-origins:http://localhost:3000,http://localhost:3001}")
    private String corsAllowedOrigins;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthFilter) {
        this.jwtAuthFilter = jwtAuthFilter;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .cors(Customizer.withDefaults())
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // No servlet context-path — AntPathRequestMatcher matches full request URI as-is.
                .requestMatchers(AntPathRequestMatcher.antMatcher("/api/auth/**")).permitAll()
                .requestMatchers(AntPathRequestMatcher.antMatcher("/api/actuator/health")).permitAll()
                .requestMatchers(AntPathRequestMatcher.antMatcher("/api/actuator/**")).hasRole("ADMIN")
                .requestMatchers(AntPathRequestMatcher.antMatcher("/error")).permitAll()
                // SockJS handshake — JWT auth happens at STOMP level
                .requestMatchers(AntPathRequestMatcher.antMatcher("/ws-endpoint/**")).permitAll()
                .requestMatchers(AntPathRequestMatcher.antMatcher("/ws/**")).permitAll()
                // CTF teacher management
                .requestMatchers(AntPathRequestMatcher.antMatcher("/api/admin/ctf/**")).hasRole("ADMIN")
                // CTF endpoints — challenge browsing & submissions open to all authenticated users;
                // writes on the legacy CTFChallengeController (create/update/toggle/delete an individual
                // challenge) are restricted to TEACHER/ADMIN. Sub-resources (submit, hints/unlock,
                // instance/start, instance/renew) remain open to authenticated users.
                .requestMatchers(AntPathRequestMatcher.antMatcher(HttpMethod.GET, "/api/ctf/challenges")).authenticated()
                .requestMatchers(AntPathRequestMatcher.antMatcher(HttpMethod.GET, "/api/ctf/challenges/*")).authenticated()
                .requestMatchers(AntPathRequestMatcher.antMatcher(HttpMethod.POST,   "/api/ctf/challenges")).hasRole("ADMIN")
                .requestMatchers(AntPathRequestMatcher.antMatcher(HttpMethod.PUT,    "/api/ctf/challenges/*")).hasRole("ADMIN")
                .requestMatchers(AntPathRequestMatcher.antMatcher(HttpMethod.PATCH,  "/api/ctf/challenges/*/toggle-active")).hasRole("ADMIN")
                .requestMatchers(AntPathRequestMatcher.antMatcher(HttpMethod.DELETE, "/api/ctf/challenges/*")).hasRole("ADMIN")
                .requestMatchers(AntPathRequestMatcher.antMatcher("/api/ctf/admin/**")).hasRole("ADMIN")
                // Lightweight public status endpoint — used by the lobby entry page
                .requestMatchers(AntPathRequestMatcher.antMatcher(HttpMethod.GET, "/api/ctf/competitions/*/status")).permitAll()
                // Cover images served publicly (no auth required to display card images)
                .requestMatchers(AntPathRequestMatcher.antMatcher(HttpMethod.GET, "/api/ctf/competitions/covers/**")).permitAll()
                // CTF competition & team endpoints — all authenticated
                .requestMatchers(AntPathRequestMatcher.antMatcher("/api/ctf/competitions/**")).authenticated()
                .requestMatchers(AntPathRequestMatcher.antMatcher("/api/ctf/**")).authenticated()
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public org.springframework.security.authentication.dao.DaoAuthenticationProvider authenticationProvider(
            org.springframework.security.core.userdetails.UserDetailsService userDetailsService,
            org.springframework.security.crypto.password.PasswordEncoder passwordEncoder) {
        org.springframework.security.authentication.dao.DaoAuthenticationProvider authProvider = new org.springframework.security.authentication.dao.DaoAuthenticationProvider();
        authProvider.setUserDetailsService(userDetailsService);
        authProvider.setPasswordEncoder(passwordEncoder);
        return authProvider;
    }

    @Bean
    public org.springframework.security.authentication.AuthenticationManager authenticationManager(org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();

        // Origins read from CORS_ALLOWED_ORIGINS env var (comma-separated).
        // Defaults to localhost:3000/3001 for local development.
        // MUST be set to the real frontend URL(s) in production.
        List<String> origins = Arrays.asList(corsAllowedOrigins.split(","));
        configuration.setAllowedOriginPatterns(origins);

        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
        configuration.setAllowedHeaders(Arrays.asList("Authorization", "Content-Type", "Accept", "Origin"));
        configuration.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
