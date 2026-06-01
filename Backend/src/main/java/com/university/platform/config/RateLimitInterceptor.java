package com.university.platform.config;

import com.university.platform.identity.service.JwtService;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Per-principal rate limiter.
 *
 * Key selection (highest priority first):
 *   1. Authenticated user  → JWT subject (user UUID) — each user gets their own quota,
 *      avoiding NAT / shared-IP exhaustion in university / lab environments.
 *   2. Anonymous request   → client IP address.
 *
 * Bucket tier selection:
 *   strict   → flag submission, auth, registration  (10 req/min)
 *   polling  → /status, /notifications              (300 req/min)
 *   default  → everything else                      (120 req/min)
 */
@Component
public class RateLimitInterceptor implements HandlerInterceptor {

    private final RateLimitConfig rateLimitConfig;
    private final JwtService      jwtService;

    public RateLimitInterceptor(RateLimitConfig rateLimitConfig, JwtService jwtService) {
        this.rateLimitConfig = rateLimitConfig;
        this.jwtService      = jwtService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request,
                             HttpServletResponse response,
                             Object handler) throws Exception {

        String principalKey = resolvePrincipalKey(request);
        String uri          = request.getRequestURI();

        Bucket bucket;
        if (isStrictEndpoint(uri)) {
            bucket = rateLimitConfig.resolveStrictBucket(principalKey);
        } else if (isPollingEndpoint(uri)) {
            bucket = rateLimitConfig.resolvePollingBucket(principalKey);
        } else {
            bucket = rateLimitConfig.resolveBucket(principalKey);
        }

        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
        if (probe.isConsumed()) {
            response.addHeader("X-Rate-Limit-Remaining", String.valueOf(probe.getRemainingTokens()));
            return true;
        }

        long waitSeconds = probe.getNanosToWaitForRefill() / 1_000_000_000;
        response.addHeader("X-Rate-Limit-Retry-After-Seconds", String.valueOf(waitSeconds));
        response.setContentType("application/json");
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.getWriter().write(
            "{\"status\":429,\"code\":\"RATE_LIMITED\",\"message\":\"Rate limit exceeded\"," +
            "\"retryAfter\":" + waitSeconds + "}"
        );
        return false;
    }

    // ── Endpoint classification ───────────────────────────────────────────────

    private boolean isStrictEndpoint(String uri) {
        return uri.contains("/submit")
            || uri.contains("/auth/")
            || uri.contains("/register")
            // Instance start: without this, students can hammer the endpoint at 120 req/min,
            // generating DB + Docker API load even when the max-instances guard blocks them.
            || (uri.contains("/instance") && uri.contains("/start"));
    }

    /** Lightweight polling endpoints that every browser tab hits on a schedule. */
    private boolean isPollingEndpoint(String uri) {
        return uri.endsWith("/status")
            || uri.endsWith("/notifications");
    }

    // ── Principal key resolution ──────────────────────────────────────────────

    /**
     * Returns the JWT subject (user UUID) when the request carries a valid
     * Bearer token; falls back to the client IP address for anonymous requests.
     */
    private String resolvePrincipalKey(HttpServletRequest request) {
        String auth = request.getHeader("Authorization");
        if (auth != null && auth.startsWith("Bearer ")) {
            String token = auth.substring(7);
            try {
                // Use user ID as key — each authenticated user gets their own quota.
                String userId = jwtService.extractUserId(token).toString();
                return "user:" + userId;
            } catch (JwtException | IllegalArgumentException ignored) {
                // Token is present but invalid — fall through to IP-based key.
            }
        }
        return "ip:" + resolveClientIp(request);
    }

    private String resolveClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
