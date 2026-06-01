package com.university.platform.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

@Component
@Order(1)
public class RequestLoggingFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RequestLoggingFilter.class);

    private static final Set<String> SKIP_PATHS = Set.of(
            "/actuator/health", "/actuator/info"
    );

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        String path   = request.getRequestURI();
        String method = request.getMethod();
        String query  = request.getQueryString();
        long   start  = System.currentTimeMillis();

        if (SKIP_PATHS.contains(path)) {
            filterChain.doFilter(request, response);
            return;
        }

        log.debug("[REQUEST] {} {}{}", method, path, query != null ? "?" + query : "");

        try {
            filterChain.doFilter(request, response);
        } finally {
            long duration = System.currentTimeMillis() - start;
            int  status   = response.getStatus();

            if (status >= 500) {
                log.error("[RESPONSE] {} {} → {} ({}ms)", method, path, status, duration);
            } else if (status >= 400) {
                log.warn("[RESPONSE] {} {} → {} ({}ms)", method, path, status, duration);
            } else {
                log.debug("[RESPONSE] {} {} → {} ({}ms)", method, path, status, duration);
            }
        }
    }
}
