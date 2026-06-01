package com.university.platform.ctf.controller;

import com.university.platform.ctf.dto.CTFChallengeDTO;
import com.university.platform.ctf.dto.CTFChallengeRequest;
import com.university.platform.ctf.service.CTFChallengeService;
import com.university.platform.identity.service.JwtService;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/ctf/challenges")
@RequiredArgsConstructor
public class CTFChallengeController {

    private final CTFChallengeService challengeService;
    private final JwtService jwtService;

    @GetMapping
    public ResponseEntity<List<CTFChallengeDTO>> getChallenges(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String difficulty) {

        UUID userId = extractUserId(authHeader);
        return ResponseEntity.ok(challengeService.getChallenges(category, difficulty, userId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<CTFChallengeDTO> getChallengeDetail(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String authHeader) {

        UUID userId = extractUserId(authHeader);
        return ResponseEntity.ok(challengeService.getChallengeDetail(id, userId));
    }

    @PostMapping
    public ResponseEntity<CTFChallengeDTO> createChallenge(
            @RequestBody CTFChallengeRequest dto,
            @RequestHeader("Authorization") String authHeader) {

        requireAdminOrAdmin(authHeader);
        UUID authorId = extractUserId(authHeader);
        CTFChallengeDTO created = challengeService.createChallenge(dto, authorId);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    public ResponseEntity<CTFChallengeDTO> updateChallenge(
            @PathVariable UUID id,
            @RequestBody CTFChallengeRequest dto,
            @RequestHeader("Authorization") String authHeader) {

        requireAdminOrAdmin(authHeader);
        UUID editorId = extractUserId(authHeader);
        return ResponseEntity.ok(challengeService.updateChallenge(id, dto, editorId));
    }

    @PatchMapping("/{id}/toggle-active")
    public ResponseEntity<Map<String, String>> toggleActive(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String authHeader) {

        requireAdminOrAdmin(authHeader);
        challengeService.toggleActive(id);
        return ResponseEntity.ok(Map.of("message", "Challenge status toggled."));
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private UUID extractUserId(String authHeader) {
        return UUID.fromString(jwtService.parseToken(authHeader.substring(7)).getSubject());
    }

    private void requireAdminOrAdmin(String authHeader) {
        Claims claims = jwtService.parseToken(authHeader.substring(7));
        String role = claims.get("role", String.class);
        if (!"ADMIN".equals(role)) {
            throw new org.springframework.security.access.AccessDeniedException("Admin role required.");
        }
    }
}
