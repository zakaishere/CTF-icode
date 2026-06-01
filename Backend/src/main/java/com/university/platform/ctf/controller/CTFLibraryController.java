package com.university.platform.ctf.controller;

import com.university.platform.ctf.dto.CTFChallengeCreateRequest;
import com.university.platform.ctf.dto.CTFChallengeDTO;
import com.university.platform.ctf.dto.CTFLibraryChallengeDTO;
import com.university.platform.ctf.service.CTFLibraryService;
import com.university.platform.identity.service.JwtService;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Teacher-only REST API for the reusable challenge library.
 *
 * <pre>
 * GET    /api/teacher/ctf/library                         → list my library
 * POST   /api/teacher/ctf/library                         → create library challenge
 * PUT    /api/teacher/ctf/library/{id}                    → update library challenge
 * POST   /api/teacher/ctf/library/{id}/add-to/{compId}    → copy to competition
 * DELETE /api/teacher/ctf/library/{id}                    → delete from library
 * </pre>
 *
 * ZIP upload / build-status are handled by the existing
 * {@link CTFChallengeUploadController} at {@code /api/teacher/ctf/challenges/{id}/...}
 * which already validates {@code authorId} ownership and works for library challenges.
 */
@RestController
@RequestMapping("/api/teacher/ctf/library")
@RequiredArgsConstructor
public class CTFLibraryController {

    private final CTFLibraryService libraryService;
    private final JwtService        jwtService;

    @GetMapping
    public ResponseEntity<List<CTFLibraryChallengeDTO>> getMyLibrary(
            @RequestHeader("Authorization") String auth) {

        UUID userId = extractUserId(auth);
        return ResponseEntity.ok(libraryService.getMyLibrary(userId));
    }

    @PostMapping
    public ResponseEntity<CTFLibraryChallengeDTO> saveToLibrary(
            @RequestBody CTFChallengeCreateRequest dto,
            @RequestHeader("Authorization") String auth) {

        UUID userId = extractUserId(auth);
        CTFLibraryChallengeDTO result = libraryService.saveToLibrary(dto, userId);
        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }

    @PutMapping("/{id}")
    public ResponseEntity<CTFLibraryChallengeDTO> updateLibraryChallenge(
            @PathVariable UUID id,
            @RequestBody CTFChallengeCreateRequest dto,
            @RequestHeader("Authorization") String auth) {

        UUID userId = extractUserId(auth);
        return ResponseEntity.ok(libraryService.updateLibraryChallenge(id, dto, userId));
    }

    @PostMapping("/{id}/add-to/{competitionId}")
    public ResponseEntity<CTFChallengeDTO> addToCompetition(
            @PathVariable UUID id,
            @PathVariable UUID competitionId,
            @RequestHeader("Authorization") String auth) {

        Claims claims = requireAdmin(auth);
        UUID   userId  = UUID.fromString(claims.getSubject());
        boolean isAdmin = "ADMIN".equals(claims.get("role", String.class));

        CTFChallengeDTO result = libraryService.addToCompetition(id, competitionId, userId, isAdmin);
        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> removeFromLibrary(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String auth) {

        UUID userId = extractUserId(auth);
        libraryService.removeFromLibrary(id, userId);
        return ResponseEntity.noContent().build();
    }

    // ── Auth helpers ──────────────────────────────────────────────────────────

    private Claims requireAdmin(String authHeader) {
        Claims claims = jwtService.parseToken(authHeader.substring(7));
        String role   = claims.get("role", String.class);
        if (!"ADMIN".equals(role)) {
            throw new AccessDeniedException("Admin role required.");
        }
        return claims;
    }

    private UUID extractUserId(String authHeader) {
        return UUID.fromString(requireAdmin(authHeader).getSubject());
    }
}
