package com.university.platform.ctf.controller;

import com.university.platform.ctf.dto.CTFGraphPointDTO;
import com.university.platform.ctf.dto.CTFResourceConfigRequest;
import com.university.platform.ctf.dto.CTFScoreboardEntryDTO;
import com.university.platform.ctf.entity.CTFChallenge;
import com.university.platform.ctf.entity.CTFDockerImage;
import com.university.platform.ctf.entity.CTFInstance;
import com.university.platform.ctf.entity.CTFResourceConfig;
import com.university.platform.ctf.entity.CTFSubmission;
import com.university.platform.ctf.repository.CTFAwardRepository;
import com.university.platform.ctf.repository.CTFTeamRepository;
import com.university.platform.ctf.service.CTFAdminService;
import com.university.platform.ctf.service.CTFCompetitionService;
import com.university.platform.ctf.service.CTFInstanceService;
import com.university.platform.identity.service.JwtService;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/ctf/admin")
@RequiredArgsConstructor
public class CTFAdminController {

    private final CTFAdminService      adminService;
    private final CTFAwardRepository   awardRepo;
    private final CTFTeamRepository    teamRepo;
    private final CTFCompetitionService competitionService;
    private final CTFInstanceService   instanceService;
    private final JwtService           jwtService;

    @GetMapping("/config")
    public ResponseEntity<CTFResourceConfig> getConfig(
            @RequestHeader("Authorization") String authHeader) {

        requireAdmin(authHeader);
        return ResponseEntity.ok(adminService.getResourceConfig());
    }

    @PutMapping("/config")
    public ResponseEntity<CTFResourceConfig> updateConfig(
            @RequestBody CTFResourceConfigRequest dto,
            @RequestHeader("Authorization") String authHeader) {

        requireAdmin(authHeader);
        UUID adminId = extractUserId(authHeader);
        return ResponseEntity.ok(adminService.updateResourceConfig(dto, adminId));
    }

    @GetMapping("/submissions")
    public ResponseEntity<List<CTFSubmission>> getAllSubmissions(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(required = false) UUID challengeId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        requireAdminOrAdmin(authHeader);
        return ResponseEntity.ok(adminService.getAllSubmissions(challengeId, page, size));
    }

    @GetMapping("/submissions/{challengeId}/stats")
    public ResponseEntity<Map<String, Object>> getChallengeStats(
            @PathVariable UUID challengeId,
            @RequestHeader("Authorization") String authHeader) {

        requireAdminOrAdmin(authHeader);
        return ResponseEntity.ok(adminService.getChallengeStats(challengeId));
    }

    @GetMapping("/challenges")
    public ResponseEntity<List<CTFChallenge>> getAllChallengesAdmin(
            @RequestHeader("Authorization") String authHeader) {

        requireAdminOrAdmin(authHeader);
        return ResponseEntity.ok(adminService.getAllChallengesAdmin());
    }

    /**
     * CHANGE 6 (Section 16 Query 6): Cumulative score timeline for the top 10
     * teams.  Returns a map of teamName → [{time, score}] for chart rendering.
     * Respects the freeze timestamp if the competition is frozen.
     */
    @GetMapping("/competitions/{competitionId}/graph")
    public ResponseEntity<Map<String, List<CTFGraphPointDTO>>> getScoreGraph(
            @PathVariable UUID competitionId,
            @RequestHeader("Authorization") String authHeader) {

        requireAdminOrAdmin(authHeader);

        // Resolve freeze time: null means no freeze (include all awards)
        var status = competitionService.getStatus(competitionId, null);
        LocalDateTime freezeTime = "FROZEN".equals(status.getStatus()) ? status.getFrozenAt() : null;

        List<Object[]> rows = awardRepo.findCumulativeScoreTimeline(competitionId, 10, freezeTime);

        // Build teamId → teamName lookup
        Map<UUID, String> teamNames = new LinkedHashMap<>();
        teamRepo.findByCompetitionId(competitionId)
                .forEach(t -> teamNames.put(t.getId(), t.getName()));

        Map<String, List<CTFGraphPointDTO>> result = new LinkedHashMap<>();
        for (Object[] row : rows) {
            UUID teamId = UUID.fromString(row[0].toString());
            // JDBC returns TIMESTAMP columns as java.sql.Timestamp from native queries
            LocalDateTime awardedAt;
            if (row[1] instanceof java.sql.Timestamp ts) {
                awardedAt = ts.toLocalDateTime();
            } else {
                awardedAt = (LocalDateTime) row[1];
            }
            int cumulativeScore = ((Number) row[2]).intValue();

            String teamName = teamNames.getOrDefault(teamId, teamId.toString());
            result.computeIfAbsent(teamName, k -> new ArrayList<>())
                  .add(new CTFGraphPointDTO(awardedAt, cumulativeScore));
        }
        return ResponseEntity.ok(result);
    }

    // ── Admin: live scoreboard (ignores freeze) ──────────────────────────────

    /**
     * Returns the real-time scoreboard regardless of freeze state.
     * Use this in the teacher/admin control panel so organizers always see live data.
     */
    @GetMapping("/competitions/{competitionId}/scoreboard/live")
    public ResponseEntity<List<CTFScoreboardEntryDTO>> getScoreboardLive(
            @PathVariable UUID competitionId,
            @RequestHeader("Authorization") String authHeader) {
        requireAdminOrAdmin(authHeader);
        return ResponseEntity.ok(competitionService.getScoreboardLive(competitionId));
    }

    // ── Admin: instances ─────────────────────────────────────────────────────

    @GetMapping("/instances")
    public ResponseEntity<List<CTFInstance>> getAllInstances(
            @RequestHeader("Authorization") String authHeader) {
        requireAdmin(authHeader);
        return ResponseEntity.ok(instanceService.getAllActiveInstances());
    }

    @DeleteMapping("/instances/{instanceId}")
    public ResponseEntity<Map<String, String>> forceStopInstance(
            @PathVariable UUID instanceId,
            @RequestHeader("Authorization") String authHeader) {
        requireAdmin(authHeader);
        instanceService.adminStopInstance(instanceId);
        return ResponseEntity.ok(Map.of("message", "Instance stopped."));
    }

    // ── Admin: Docker images ─────────────────────────────────────────────────

    @GetMapping("/images")
    public ResponseEntity<List<CTFDockerImage>> getImages(
            @RequestHeader("Authorization") String authHeader) {
        requireAdmin(authHeader);
        return ResponseEntity.ok(instanceService.getAllImages());
    }

    @PostMapping("/images/prewarm")
    public ResponseEntity<Map<String, String>> prewarmImages(
            @RequestBody List<String> imageRefs,
            @RequestHeader("Authorization") String authHeader) {
        requireAdmin(authHeader);
        instanceService.prewarmImages(imageRefs);
        return ResponseEntity.ok(Map.of("message", "Pre-warm started for " + imageRefs.size() + " image(s)."));
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private UUID extractUserId(String authHeader) {
        return UUID.fromString(jwtService.parseToken(authHeader.substring(7)).getSubject());
    }

    private String extractRole(String authHeader) {
        Claims claims = jwtService.parseToken(authHeader.substring(7));
        return claims.get("role", String.class);
    }

    private void requireAdmin(String authHeader) {
        if (!"ADMIN".equals(extractRole(authHeader))) {
            throw new AccessDeniedException("Admin role required.");
        }
    }

    private void requireAdminOrAdmin(String authHeader) {
        String role = extractRole(authHeader);
        if (!"ADMIN".equals(role)) {
            throw new AccessDeniedException("Admin role required.");
        }
    }
}
