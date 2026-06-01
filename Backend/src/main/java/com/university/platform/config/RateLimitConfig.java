package com.university.platform.config;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Configuration
public class RateLimitConfig {

    // Per-principal bucket store — keyed by user ID (authenticated) or IP (anonymous).
    // In-memory only: resets on restart, not shared across multiple backend instances.
    // TODO (PHASE 6 — deferred): Replace with Bucket4j Redis ProxyManager for multi-node safety.
    // Migration: add bucket4j-redis dependency, configure LettuceBasedProxyManager,
    // replace buckets.computeIfAbsent(...) with proxyManager.builder().build(key, config).
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    /**
     * General API bucket — 120 requests per minute with a burst of 40.
     * Used for all authenticated, non-sensitive endpoints.
     */
    public Bucket resolveBucket(String key) {
        return buckets.computeIfAbsent(key, k -> newBucket());
    }

    private Bucket newBucket() {
        Bandwidth limit = Bandwidth.classic(120, Refill.greedy(120, Duration.ofMinutes(1)));
        return Bucket.builder().addLimit(limit).build();
    }

    /**
     * Strict bucket — 10 requests per minute for sensitive endpoints
     * (flag submission, authentication, registration).
     */
    public Bucket resolveStrictBucket(String key) {
        return buckets.computeIfAbsent("strict:" + key, k -> newStrictBucket());
    }

    private Bucket newStrictBucket() {
        Bandwidth limit = Bandwidth.classic(10, Refill.greedy(10, Duration.ofMinutes(1)));
        return Bucket.builder().addLimit(limit).build();
    }

    /**
     * Polling bucket — 300 requests per minute for lightweight read-only poll
     * endpoints (/status, /notifications). These are hit on a tight schedule
     * by every browser tab the user has open; a tighter limit causes spurious
     * 429s that break the live-status UX.
     */
    public Bucket resolvePollingBucket(String key) {
        return buckets.computeIfAbsent("poll:" + key, k -> newPollingBucket());
    }

    private Bucket newPollingBucket() {
        Bandwidth limit = Bandwidth.classic(300, Refill.greedy(300, Duration.ofMinutes(1)));
        return Bucket.builder().addLimit(limit).build();
    }
}
