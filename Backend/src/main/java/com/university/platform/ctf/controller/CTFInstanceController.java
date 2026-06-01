package com.university.platform.ctf.controller;

import com.university.platform.ctf.dto.CTFInstanceResponse;
import com.university.platform.ctf.service.CTFInstanceService;
import com.university.platform.identity.service.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/ctf/instances")
@RequiredArgsConstructor
public class CTFInstanceController {

    private final CTFInstanceService instanceService;
    private final JwtService         jwtService;

    /** GET /api/ctf/instances/status?challengeId=X[&teamId=Y] */
    @GetMapping("/status")
    public ResponseEntity<CTFInstanceResponse> getStatus(
            @RequestParam UUID challengeId,
            @RequestParam(required = false) UUID teamId,
            @RequestHeader("Authorization") String authHeader) {

        UUID userId = extractUserId(authHeader);
        CTFInstanceResponse status = instanceService.getInstanceStatus(challengeId, userId, teamId);
        return ResponseEntity.ok(status);
    }

    /** POST /api/ctf/instances/start  body: {challengeId, competitionId?, teamId?} */
    @PostMapping("/start")
    public ResponseEntity<CTFInstanceResponse> startInstance(
            @RequestBody Map<String, String> body,
            @RequestHeader("Authorization") String authHeader) {

        UUID userId        = extractUserId(authHeader);
        UUID challengeId   = UUID.fromString(body.get("challengeId"));
        UUID competitionId = body.containsKey("competitionId") ? UUID.fromString(body.get("competitionId")) : null;
        UUID teamId        = body.containsKey("teamId")        ? UUID.fromString(body.get("teamId"))        : null;

        return ResponseEntity.ok(instanceService.requestInstance(challengeId, userId, teamId, competitionId));
    }

    /** POST /api/ctf/instances/{instanceId}/renew */
    @PostMapping("/{instanceId}/renew")
    public ResponseEntity<CTFInstanceResponse> renewInstance(
            @PathVariable UUID instanceId,
            @RequestHeader("Authorization") String authHeader) {

        UUID userId = extractUserId(authHeader);
        return ResponseEntity.ok(instanceService.renewInstance(instanceId, userId));
    }

    /** DELETE /api/ctf/instances/{instanceId} */
    @DeleteMapping("/{instanceId}")
    public ResponseEntity<Map<String, String>> stopInstance(
            @PathVariable UUID instanceId,
            @RequestHeader("Authorization") String authHeader) {

        UUID userId = extractUserId(authHeader);
        instanceService.stopInstance(instanceId, userId);
        return ResponseEntity.ok(Map.of("message", "Instance stopped."));
    }

    private UUID extractUserId(String authHeader) {
        try {
            return UUID.fromString(jwtService.parseToken(authHeader.substring(7)).getSubject());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid token");
        }
    }
}
