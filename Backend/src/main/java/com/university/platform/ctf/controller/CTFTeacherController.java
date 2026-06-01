package com.university.platform.ctf.controller;

import com.university.platform.ctf.dto.*;
import com.university.platform.ctf.service.CTFTeacherService;
import com.university.platform.identity.service.JwtService;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/ctf/challenges")
@RequiredArgsConstructor
public class CTFTeacherController {

    private final CTFTeacherService teacherService;
    private final JwtService        jwtService;

    @GetMapping
    public ResponseEntity<List<CTFChallengeResponse>> getMyChallenges(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String difficulty,
            @RequestParam(required = false) String status) {

        requireAdmin(authHeader);
        UUID authorId = extractUserId(authHeader);
        return ResponseEntity.ok(teacherService.getMyChallenges(authorId, category, difficulty, status));
    }

    @GetMapping("/{id}")
    public ResponseEntity<CTFChallengeDetailResponse> getChallengeDetail(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String authHeader) {

        requireAdmin(authHeader);
        UUID authorId = extractUserId(authHeader);
        return ResponseEntity.ok(teacherService.getChallengeDetail(id, authorId));
    }

    @PostMapping
    public ResponseEntity<CTFChallengeResponse> createChallenge(
            @RequestBody CTFChallengeCreateRequest dto,
            @RequestHeader("Authorization") String authHeader) {

        requireAdmin(authHeader);
        UUID authorId = extractUserId(authHeader);
        return ResponseEntity.status(HttpStatus.CREATED).body(teacherService.createChallenge(dto, authorId));
    }

    @PutMapping("/{id}")
    public ResponseEntity<CTFChallengeResponse> updateChallenge(
            @PathVariable UUID id,
            @RequestBody CTFChallengeUpdateRequest dto,
            @RequestHeader("Authorization") String authHeader) {

        requireAdmin(authHeader);
        UUID authorId = extractUserId(authHeader);
        return ResponseEntity.ok(teacherService.updateChallenge(id, dto, authorId));
    }

    @PatchMapping("/{id}/toggle-active")
    public ResponseEntity<CTFChallengeResponse> toggleActive(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String authHeader) {

        requireAdmin(authHeader);
        UUID authorId = extractUserId(authHeader);
        return ResponseEntity.ok(teacherService.toggleActive(id, authorId));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, String>> deleteChallenge(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String authHeader) {

        requireAdmin(authHeader);
        UUID authorId = extractUserId(authHeader);
        teacherService.deleteChallenge(id, authorId);
        return ResponseEntity.ok(Map.of("message", "Challenge deleted."));
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private UUID extractUserId(String authHeader) {
        return UUID.fromString(jwtService.parseToken(authHeader.substring(7)).getSubject());
    }

    private void requireAdmin(String authHeader) {
        Claims claims = jwtService.parseToken(authHeader.substring(7));
        String role = claims.get("role", String.class);
        if (!"ADMIN".equals(role)) {
            throw new AccessDeniedException("Admin role required.");
        }
    }
}
