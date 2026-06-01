package com.university.platform.ctf.controller;

import com.university.platform.ctf.dto.CTFSubmitResponse;
import com.university.platform.ctf.entity.CTFSubmission;
import com.university.platform.ctf.service.CTFSubmissionService;
import com.university.platform.identity.service.JwtService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/ctf/challenges/{challengeId}")
@RequiredArgsConstructor
public class CTFSubmissionController {

    private final CTFSubmissionService submissionService;
    private final JwtService jwtService;

    @PostMapping("/submit")
    public ResponseEntity<CTFSubmitResponse> submitFlag(
            @PathVariable UUID challengeId,
            @RequestBody Map<String, String> body,
            @RequestHeader("Authorization") String authHeader,
            HttpServletRequest request) {

        UUID userId = extractUserId(authHeader);
        String flag = body.getOrDefault("flag", "");
        return ResponseEntity.ok(submissionService.submitFlag(challengeId, flag, userId, request));
    }

    @GetMapping("/my-submissions")
    public ResponseEntity<List<CTFSubmission>> getMySubmissions(
            @PathVariable UUID challengeId,
            @RequestHeader("Authorization") String authHeader) {

        UUID userId = extractUserId(authHeader);
        return ResponseEntity.ok(submissionService.getMySubmissions(challengeId, userId));
    }

    private UUID extractUserId(String authHeader) {
        return UUID.fromString(jwtService.parseToken(authHeader.substring(7)).getSubject());
    }
}
