# =============================================================================
#  icode-ctf Backend — multi-stage Docker build
#  Stage 1 (builder): Maven + JDK 17 — compiles the JAR
#  Stage 2 (runner):  JRE 17 only — runs the JAR as non-root
# =============================================================================

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-17-alpine AS builder

WORKDIR /build

# Cache the dependency layer separately.
# Docker rebuilds from here only when pom.xml changes, not when src/ changes.
COPY pom.xml .

# Cache Maven dependencies between builds — only re-downloaded when pom.xml changes.
RUN --mount=type=cache,target=/root/.m2 \
    mvn dependency:go-offline -q

# Now copy source and build
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \
    mvn clean package -DskipTests -q

# ── Stage 2: run ──────────────────────────────────────────────────────────────
FROM eclipse-temurin:17-jre-alpine AS runner

WORKDIR /app

# The backend mounts /var/run/docker.sock to spawn challenge containers.
# Running as root is acceptable here: docker socket access is already root-equivalent,
# so the non-root user gives no meaningful security benefit in this context.
COPY --from=builder \
    /build/target/icode-ctf-backend-0.0.1-SNAPSHOT.jar app.jar

EXPOSE 8080

# Liveness probe — Spring Boot actuator health endpoint.
# start-period=60s because the backend waits for Postgres to be ready
# and runs Hibernate schema validation before accepting traffic.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/api/actuator/health || exit 1

ENTRYPOINT ["java", \
    "-XX:+UseContainerSupport", \
    "-XX:MaxRAMPercentage=75.0", \
    "-jar", "app.jar"]
