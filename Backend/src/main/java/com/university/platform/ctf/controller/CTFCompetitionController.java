package com.university.platform.ctf.controller;

import com.university.platform.ctf.dto.*;
import com.university.platform.ctf.dto.CTFAttemptDTO;
import com.university.platform.ctf.dto.CTFScoreTimelineDTO;
import com.university.platform.ctf.service.CTFCompetitionService;
import com.university.platform.ctf.service.CTFNotificationService;
import com.university.platform.identity.service.JwtService;
import io.jsonwebtoken.Claims;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/ctf/competitions")
public class CTFCompetitionController {

    private final CTFCompetitionService competitionService;
    private final CTFNotificationService notificationService;
    private final JwtService            jwtService;

    @Value("${upload.path:/tmp/ctf-uploads}")
    private String uploadPath;

    public CTFCompetitionController(CTFCompetitionService competitionService,
                                    CTFNotificationService notificationService,
                                    JwtService jwtService) {
        this.competitionService = competitionService;
        this.notificationService = notificationService;
        this.jwtService         = jwtService;
    }

    @GetMapping("/covers/{filename:.+}")
    public ResponseEntity<Resource> getCoverImage(@PathVariable String filename) throws IOException {
        Path file = Paths.get(uploadPath, "covers", filename);
        if (!Files.exists(file)) return ResponseEntity.notFound().build();

        String ct = Files.probeContentType(file);
        MediaType mediaType = ct != null ? MediaType.parseMediaType(ct) : MediaType.IMAGE_JPEG;

        return ResponseEntity.ok()
                .contentType(mediaType)
                .header("Cache-Control", "public, max-age=86400")
                .body(new FileSystemResource(file));
    }

    @GetMapping
    public ResponseEntity<List<CTFCompetitionDTO>> listCompetitions(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        UUID userId = tryParseUserId(authHeader);
        return ResponseEntity.ok(competitionService.listForUser(userId));
    }

    @GetMapping("/{competitionId}")
    public ResponseEntity<CTFCompetitionDTO> getCompetition(
            @PathVariable UUID competitionId,
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        UUID userId = tryParseUserId(authHeader);
        return ResponseEntity.ok(competitionService.getCompetition(competitionId, userId));
    }

    /**
     * Public lightweight status. Honors the Authorization header if present
     * to fill in {@code myTeamId} / {@code canEnterArena}, but never requires it.
     */
    @GetMapping("/{competitionId}/status")
    public ResponseEntity<CTFCompetitionStatusDTO> getStatus(
            @PathVariable UUID competitionId,
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        UUID userId = tryParseUserId(authHeader);
        return ResponseEntity.ok(competitionService.getStatus(competitionId, userId));
    }

    @PostMapping("/join")
    public ResponseEntity<CTFCompetitionDTO> joinByAccessCode(
            @Valid @RequestBody CTFAccessCodeRequest req) {
        return ResponseEntity.ok(competitionService.joinByAccessCode(req.getAccessCode()));
    }

    @GetMapping("/{competitionId}/challenges")
    public ResponseEntity<CTFChallengeListResponse> getChallenges(
            @PathVariable UUID competitionId,
            @RequestHeader("Authorization") String authHeader) {
        UUID userId = parseUserId(authHeader);
        return ResponseEntity.ok(competitionService.getCompetitionChallenges(competitionId, userId));
    }

    @GetMapping("/{competitionId}/scoreboard")
    public ResponseEntity<List<CTFScoreboardEntryDTO>> getScoreboard(
            @PathVariable UUID competitionId) {
        return ResponseEntity.ok(competitionService.getScoreboard(competitionId));
    }

    @GetMapping("/{competitionId}/notifications")
    public ResponseEntity<List<CTFNotificationDTO>> getNotifications(
            @PathVariable UUID competitionId) {
        return ResponseEntity.ok(notificationService.getHistory(competitionId));
    }

    @GetMapping("/{competitionId}/scoreboard/graph")
    public ResponseEntity<CTFScoreTimelineDTO> getScoreboardGraph(
            @PathVariable UUID competitionId,
            @RequestParam(value = "topN", defaultValue = "10") int topN) {
        return ResponseEntity.ok(competitionService.getScoreTimeline(competitionId, topN));
    }

    @GetMapping("/{competitionId}/feed")
    public ResponseEntity<List<CTFFeedEventDTO>> getFeed(
            @PathVariable UUID competitionId) {
        return ResponseEntity.ok(competitionService.getFeed(competitionId));
    }

    @GetMapping("/{competitionId}/challenges/{challengeId}/solvers")
    public ResponseEntity<List<CTFChallengeSolverDTO>> getChallengeSolvers(
            @PathVariable UUID competitionId,
            @PathVariable UUID challengeId) {
        return ResponseEntity.ok(competitionService.getChallengeSolvers(competitionId, challengeId));
    }

    @GetMapping("/{competitionId}/challenges/{challengeId}/my-attempts")
    public ResponseEntity<List<CTFAttemptDTO>> getMyAttempts(
            @PathVariable UUID competitionId,
            @PathVariable UUID challengeId,
            @RequestHeader("Authorization") String authHeader) {
        UUID userId = parseUserId(authHeader);
        return ResponseEntity.ok(competitionService.getMyAttempts(competitionId, challengeId, userId));
    }

    @PostMapping("/{competitionId}/challenges/{challengeId}/submit")
    public ResponseEntity<CTFCompetitionSubmitResponse> submitFlag(
            @PathVariable UUID competitionId,
            @PathVariable UUID challengeId,
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody CTFCompetitionSubmitRequest req,
            HttpServletRequest request) {
        UUID userId = parseUserId(authHeader);
        return ResponseEntity.ok(competitionService.submitFlag(
                competitionId, challengeId, userId, req, clientIp(request)));
    }

    private String clientIp(HttpServletRequest req) {
        String xff = req.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
        return req.getRemoteAddr();
    }

    private UUID parseUserId(String authHeader) {
        Claims claims = jwtService.parseToken(authHeader.substring(7));
        return UUID.fromString(claims.getSubject());
    }

    /** Returns null when the header is missing/invalid — used by endpoints that
     *  permit anonymous access but still want to enrich the response if a token is present. */
    private UUID tryParseUserId(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) return null;
        try {
            return UUID.fromString(jwtService.parseToken(authHeader.substring(7)).getSubject());
        } catch (Exception e) {
            return null;
        }
    }
}
