package com.university.platform.ctf.controller;

import com.university.platform.ctf.dto.*;
import com.university.platform.ctf.service.CTFTeamService;
import com.university.platform.identity.service.JwtService;
import io.jsonwebtoken.Claims;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/ctf/competitions/{competitionId}/teams")
public class CTFTeamController {

    private final CTFTeamService teamService;
    private final JwtService     jwtService;

    public CTFTeamController(CTFTeamService teamService, JwtService jwtService) {
        this.teamService = teamService;
        this.jwtService  = jwtService;
    }

    @GetMapping
    public ResponseEntity<List<CTFTeamResponse>> getAllTeams(
            @PathVariable UUID competitionId) {
        return ResponseEntity.ok(teamService.getCompetitionTeams(competitionId));
    }

    @GetMapping("/{teamId}/profile")
    public ResponseEntity<CTFTeamProfileDTO> getTeamProfile(
            @PathVariable UUID competitionId,
            @PathVariable UUID teamId) {
        return ResponseEntity.ok(teamService.getTeamProfile(competitionId, teamId));
    }

    @GetMapping("/mine")
    public ResponseEntity<CTFTeamResponse> getMyTeam(
            @PathVariable UUID competitionId,
            @RequestHeader("Authorization") String authHeader) {
        UUID userId = parseUserId(authHeader);
        CTFTeamResponse team = teamService.getMyTeam(competitionId, userId);
        return ResponseEntity.ok(team); // null → 200 with null body if not in a team
    }

    @PostMapping
    public ResponseEntity<CTFTeamResponse> createTeam(
            @PathVariable UUID competitionId,
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody CTFCreateTeamRequest req) {
        UUID userId = parseUserId(authHeader);
        return ResponseEntity.ok(teamService.createTeam(competitionId, userId, req));
    }

    @PostMapping("/join")
    public ResponseEntity<CTFTeamResponse> joinTeam(
            @PathVariable UUID competitionId,
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody CTFJoinTeamRequest req) {
        UUID userId = parseUserId(authHeader);
        return ResponseEntity.ok(teamService.joinTeam(competitionId, userId, req));
    }

    @DeleteMapping("/mine/leave")
    public ResponseEntity<Void> leaveTeam(
            @PathVariable UUID competitionId,
            @RequestHeader("Authorization") String authHeader) {
        UUID userId = parseUserId(authHeader);
        teamService.leaveTeam(competitionId, userId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/mine/kick/{userId}")
    public ResponseEntity<Void> kickMember(
            @PathVariable UUID competitionId,
            @PathVariable UUID userId,
            @RequestHeader("Authorization") String authHeader) {
        UUID captainId = parseUserId(authHeader);
        teamService.kickMember(competitionId, captainId, userId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/mine/transfer")
    public ResponseEntity<CTFTeamResponse> transferCaptaincy(
            @PathVariable UUID competitionId,
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody CTFTransferCaptaincyRequest req) {
        UUID captainId = parseUserId(authHeader);
        return ResponseEntity.ok(teamService.transferCaptaincy(competitionId, captainId, req));
    }

    private UUID parseUserId(String authHeader) {
        Claims claims = jwtService.parseToken(authHeader.substring(7));
        return UUID.fromString(claims.getSubject());
    }
}
