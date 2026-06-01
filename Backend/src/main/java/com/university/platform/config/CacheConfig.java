package com.university.platform.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Caffeine-backed cache manager with per-cache TTLs.
 *
 * <p>Active caches:
 * - scoreboard: @Cacheable on CTFCompetitionService.getScoreboard(), evicted on submitFlag()
 * - challenges: @Cacheable on CTFCompetitionService.getCompetitionChallenges(), evicted on submitFlag()
 *
 * <p>TODO (PHASE 6 — deferred): Replace Caffeine with Redis for multi-node deployments.
 * Caffeine is JVM-local: if two backend instances are running, each has its own cache.
 * One node's cache eviction is invisible to the other, causing stale reads.
 * Migration path:
 *   1. Add spring-boot-starter-data-redis to pom.xml
 *   2. Change spring.cache.type=redis in application.yml
 *   3. Add spring.redis.host=${REDIS_HOST:localhost} + spring.redis.port=${REDIS_PORT:6379}
 *   4. Remove this CacheConfig class (Spring Boot auto-configures RedisCacheManager)
 */
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager();

        // Different TTLs per cache
        Map<String, Caffeine<Object, Object>> caches = new java.util.HashMap<>();
        caches.put("scoreboard", Caffeine.newBuilder()
                .maximumSize(100)
                .expireAfterWrite(30, TimeUnit.SECONDS));
        caches.put("challenges", Caffeine.newBuilder()
                .maximumSize(500)
                .expireAfterWrite(60, TimeUnit.SECONDS));
        caches.put("competition-status", Caffeine.newBuilder()
                .maximumSize(100)
                .expireAfterWrite(10, TimeUnit.SECONDS));
        caches.put("user-profile", Caffeine.newBuilder()
                .maximumSize(1000)
                .expireAfterWrite(5, TimeUnit.MINUTES));
        caches.put("leaderboard", Caffeine.newBuilder()
                .maximumSize(50)
                .expireAfterWrite(2, TimeUnit.MINUTES));
        caches.put("hint-unlocks", Caffeine.newBuilder()
                .maximumSize(1000)
                .expireAfterWrite(5, TimeUnit.MINUTES));

        // Apply custom specs
        caches.forEach((name, caffeine) ->
            manager.registerCustomCache(name, caffeine.recordStats().build()));

        // Default for anything not listed above
        manager.setCaffeine(Caffeine.newBuilder()
            .maximumSize(200)
            .expireAfterWrite(60, TimeUnit.SECONDS));

        return manager;
    }
}
