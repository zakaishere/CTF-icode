package com.university.platform.ctf.controller;

import com.university.platform.ctf.dto.*;
import com.university.platform.ctf.entity.CTFCompetition;
import com.university.platform.ctf.entity.CTFNotification;
import com.university.platform.ctf.repository.CTFCompetitionRepository;
import com.university.platform.ctf.service.CTFCompetitionChallengeTeacherService;
import com.university.platform.ctf.service.CTFCompetitionTeacherService;
import com.university.platform.ctf.service.CTFNotificationService;
import com.university.platform.ctf.service.CTFTeacherManagementService;
import com.university.platform.identity.service.JwtService;
import io.jsonwebtoken.Claims;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/ctf/competitions")
@RequiredArgsConstructor
public class CTFCompetitionTeacherController {

    private final CTFCompetitionTeacherService          teacherService;
    private final CTFCompetitionChallengeTeacherService challengeService;
    private final CTFTeacherManagementService           managementService;
    private final CTFNotificationService                notificationService;
    private final CTFCompetitionRepository              competitionRepo;
    private final JwtService                            jwtService;

    @Value("${upload.path:/tmp/ctf-uploads}")
    private String uploadPath;

    // ── Listing / read ───────────────────────────────────────────────────────

    @GetMapping
    public ResponseEntity<List<CTFCompetitionDTO>> listMine(
            @RequestHeader("Authorization") String auth) {
        Claims claims = parse(auth);
        return ResponseEntity.ok(teacherService.listMine(userId(claims)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<CTFCompetitionDTO> getOne(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String auth) {
        Claims claims = parse(auth);
        return ResponseEntity.ok(teacherService.getOwned(id, userId(claims), isAdmin(claims)));
    }

    @PostMapping
    public ResponseEntity<CTFCompetitionDTO> create(
            @Valid @RequestBody CTFCompetitionCreateRequest dto,
            @RequestHeader("Authorization") String auth) {
        Claims claims = parse(auth);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(teacherService.createCompetition(dto, userId(claims)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<CTFCompetitionDTO> update(
            @PathVariable UUID id,
            @Valid @RequestBody CTFCompetitionUpdateRequest dto,
            @RequestHeader("Authorization") String auth) {
        Claims claims = parse(auth);
        return ResponseEntity.ok(teacherService.updateCompetition(id, dto, userId(claims), isAdmin(claims)));
    }

    // ── Lifecycle controls ───────────────────────────────────────────────────

    @PostMapping("/{id}/pause")
    public ResponseEntity<CTFCompetitionDTO> pause(@PathVariable UUID id,
                                                    @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        return ResponseEntity.ok(teacherService.pauseCompetition(id, userId(c), isAdmin(c)));
    }

    @PostMapping("/{id}/resume")
    public ResponseEntity<CTFCompetitionDTO> resume(@PathVariable UUID id,
                                                     @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        return ResponseEntity.ok(teacherService.resumeCompetition(id, userId(c), isAdmin(c)));
    }

    @PostMapping("/{id}/freeze")
    public ResponseEntity<CTFCompetitionDTO> freeze(@PathVariable UUID id,
                                                     @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        return ResponseEntity.ok(teacherService.freezeScoreboard(id, userId(c), isAdmin(c)));
    }

    @PostMapping("/{id}/unfreeze")
    public ResponseEntity<CTFCompetitionDTO> unfreeze(@PathVariable UUID id,
                                                       @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        return ResponseEntity.ok(teacherService.unfreezeScoreboard(id, userId(c), isAdmin(c)));
    }

    @PostMapping("/{id}/start")
    public ResponseEntity<CTFCompetitionDTO> start(@PathVariable UUID id,
                                                    @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        return ResponseEntity.ok(teacherService.startManualCompetition(id, userId(c), isAdmin(c)));
    }

    @PostMapping("/{id}/end")
    public ResponseEntity<CTFCompetitionDTO> end(@PathVariable UUID id,
                                                  @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        return ResponseEntity.ok(teacherService.endCompetition(id, userId(c), isAdmin(c)));
    }

    // ── Challenge management ─────────────────────────────────────────────────

    @GetMapping("/{id}/challenges")
    public ResponseEntity<List<CTFChallengeDTO>> listChallenges(
            @PathVariable("id") UUID competitionId,
            @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        return ResponseEntity.ok(challengeService.listChallenges(competitionId, userId(c), isAdmin(c)));
    }

    @PostMapping("/{id}/challenges")
    public ResponseEntity<CTFChallengeDTO> addChallenge(
            @PathVariable("id") UUID competitionId,
            @RequestBody CTFChallengeCreateRequest dto,
            @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(challengeService.addChallenge(competitionId, dto, userId(c), isAdmin(c)));
    }

    @PutMapping("/{id}/challenges/{chalId}")
    public ResponseEntity<CTFChallengeDTO> updateChallenge(
            @PathVariable("id") UUID competitionId,
            @PathVariable("chalId") UUID challengeId,
            @RequestBody CTFChallengeUpdateRequest dto,
            @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        return ResponseEntity.ok(challengeService.updateChallenge(competitionId, challengeId, dto,
                userId(c), isAdmin(c)));
    }

    @PatchMapping("/{id}/challenges/{chalId}/flag")
    public ResponseEntity<CTFChallengeDTO> updateChallengeFlag(
            @PathVariable("id") UUID competitionId,
            @PathVariable("chalId") UUID challengeId,
            @RequestBody Map<String, String> body,
            @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        String newFlag = body.get("newFlag");
        return ResponseEntity.ok(challengeService.updateChallengeFlag(competitionId, challengeId,
                newFlag, userId(c), isAdmin(c)));
    }

    @PostMapping("/{id}/challenges/{chalId}/reveal")
    public ResponseEntity<CTFChallengeDTO> reveal(
            @PathVariable("id") UUID competitionId,
            @PathVariable("chalId") UUID challengeId,
            @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        return ResponseEntity.ok(challengeService.revealChallenge(competitionId, challengeId,
                userId(c), isAdmin(c)));
    }

    @PostMapping("/{id}/challenges/{chalId}/hide")
    public ResponseEntity<CTFChallengeDTO> hide(
            @PathVariable("id") UUID competitionId,
            @PathVariable("chalId") UUID challengeId,
            @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        return ResponseEntity.ok(challengeService.hideChallenge(competitionId, challengeId,
                userId(c), isAdmin(c)));
    }

    @PostMapping("/{id}/challenges/{chalId}/hints")
    public ResponseEntity<CTFChallengeDTO> addHint(
            @PathVariable("id") UUID competitionId,
            @PathVariable("chalId") UUID challengeId,
            @RequestBody CTFHintRequest req,
            @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        return ResponseEntity.ok(challengeService.addHint(competitionId, challengeId, req,
                userId(c), isAdmin(c)));
    }

    @DeleteMapping("/{id}/challenges/{chalId}/hints/{hintId}")
    public ResponseEntity<CTFChallengeDTO> deleteHint(
            @PathVariable("id") UUID competitionId,
            @PathVariable("chalId") UUID challengeId,
            @PathVariable String hintId,
            @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        return ResponseEntity.ok(challengeService.deleteHint(competitionId, challengeId, hintId,
                userId(c), isAdmin(c)));
    }

    // ── Management read endpoints ────────────────────────────────────────────

    @GetMapping("/{id}/overview")
    public ResponseEntity<CTFTeacherOverviewDTO> overview(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        return ResponseEntity.ok(managementService.getOverview(id, userId(c), isAdmin(c)));
    }

    @GetMapping("/{id}/teams")
    public ResponseEntity<List<CTFTeacherTeamDTO>> teams(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        return ResponseEntity.ok(managementService.listTeams(id, userId(c), isAdmin(c)));
    }

    @GetMapping("/{id}/submissions")
    public ResponseEntity<List<CTFTeacherSubmissionDTO>> submissions(
            @PathVariable UUID id,
            @RequestParam(value = "limit", defaultValue = "200") int limit,
            @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        return ResponseEntity.ok(managementService.listSubmissions(id, userId(c), isAdmin(c), limit));
    }

    @GetMapping("/{id}/cheats")
    public ResponseEntity<List<CTFTeacherCheatDTO>> cheats(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        return ResponseEntity.ok(managementService.listCheats(id, userId(c), isAdmin(c)));
    }

    @GetMapping("/{id}/cheats/export")
    public ResponseEntity<byte[]> exportCheats(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        byte[] body = managementService.exportCheatsCsv(id, userId(c), isAdmin(c));
        String filename = managementService.exportCheatsFilename(id, userId(c), isAdmin(c));
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv; charset=utf-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .body(body);
    }

    @PostMapping("/{id}/cheats/{cheatId}/dismiss")
    public ResponseEntity<CTFTeacherCheatDTO> dismissCheat(
            @PathVariable UUID id,
            @PathVariable UUID cheatId,
            @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        return ResponseEntity.ok(managementService.dismissCheat(id, cheatId, userId(c), isAdmin(c)));
    }

    @PostMapping("/{id}/teams/{teamId}/disqualify")
    public ResponseEntity<CTFTeacherTeamDTO> disqualifyTeam(
            @PathVariable UUID id,
            @PathVariable UUID teamId,
            @RequestBody(required = false) Map<String, String> body,
            @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        String reason = body != null ? body.get("reason") : null;
        return ResponseEntity.ok(managementService.disqualifyTeam(id, teamId, reason, userId(c), isAdmin(c)));
    }

    @PostMapping("/{id}/notify")
    public ResponseEntity<CTFNotificationDTO> broadcastCustom(
            @PathVariable UUID id,
            @Valid @RequestBody CTFBroadcastRequest req,
            @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        // Guard ownership by loading via the teacher service before broadcasting.
        teacherService.getOwned(id, userId(c), isAdmin(c));
        CTFNotificationDTO dto = notificationService.sendToCompetition(
                id, CTFNotification.Type.CUSTOM,
                req.getTitle().trim(),
                req.getBody().trim(),
                java.util.Map.of("fromTeacher", true),
                userId(c));
        return ResponseEntity.ok(dto);
    }

    @GetMapping("/{id}/export")
    public ResponseEntity<byte[]> export(
            @PathVariable UUID id,
            @RequestHeader("Authorization") String auth) {
        Claims c = parse(auth);
        byte[] body = managementService.exportCsv(id, userId(c), isAdmin(c));
        String filename = managementService.exportFilename(id, userId(c), isAdmin(c));
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv; charset=utf-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .body(body);
    }

    // ── Cover image upload ───────────────────────────────────────────────────

    @PostMapping("/{id}/cover")
    public ResponseEntity<Map<String, String>> uploadCover(
            @PathVariable UUID id,
            @RequestParam("image") MultipartFile file,
            @RequestHeader("Authorization") String auth) throws IOException {

        Claims c = parse(auth);
        CTFCompetition comp = teacherService.loadOwned(id, userId(c), isAdmin(c));

        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "File is empty"));
        }
        String contentType = file.getContentType() != null ? file.getContentType() : "";
        if (!contentType.startsWith("image/")) {
            return ResponseEntity.badRequest().body(Map.of("error", "File must be an image"));
        }
        if (file.getSize() > 2L * 1024 * 1024) {
            return ResponseEntity.badRequest().body(Map.of("error", "File too large (max 2MB)"));
        }

        String original = file.getOriginalFilename() != null ? file.getOriginalFilename() : "img";
        int dot = original.lastIndexOf('.');
        String ext = dot > 0 ? original.substring(dot) : ".jpg";
        String filename = id + "-" + System.currentTimeMillis() + ext;

        Path coversDir = Paths.get(uploadPath, "covers");
        Files.createDirectories(coversDir);
        Files.write(coversDir.resolve(filename), file.getBytes());

        String url = "/api/ctf/competitions/covers/" + filename;
        comp.setCoverImageUrl(url);
        competitionRepo.save(comp);

        return ResponseEntity.ok(Map.of("coverImageUrl", url));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private Claims parse(String authHeader) {
        return jwtService.parseToken(authHeader.substring(7));
    }

    private UUID userId(Claims c) {
        return UUID.fromString(c.getSubject());
    }

    private boolean isAdmin(Claims c) {
        return "ADMIN".equals(c.get("role", String.class));
    }
}
