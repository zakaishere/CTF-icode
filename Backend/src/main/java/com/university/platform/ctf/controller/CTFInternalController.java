package com.university.platform.ctf.controller;

import com.university.platform.ctf.repository.CTFChallengeBuildRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

/**
 * Internal endpoints called by the worker agent, not by browser clients.
 * No authentication — agent access is controlled by network + HMAC at the agent level.
 */
@Slf4j
@RestController
@RequestMapping("/api/internal")
public class CTFInternalController {

    private final CTFChallengeBuildRepository buildRepo;

    public CTFInternalController(CTFChallengeBuildRepository buildRepo) {
        this.buildRepo = buildRepo;
    }

    @GetMapping("/zip/{challengeId}")
    public ResponseEntity<Resource> getZip(@PathVariable UUID challengeId) {
        return buildRepo.findTopByChallengeIdOrderByCreatedAtDesc(challengeId)
                .filter(b -> b.getZipFilePath() != null)
                .map(b -> {
                    Path zipPath = Path.of(b.getZipFilePath());
                    if (!Files.exists(zipPath)) {
                        log.warn("ZIP file not found on disk for challenge {}: {}", challengeId, zipPath);
                        return ResponseEntity.<Resource>notFound().<Resource>build();
                    }
                    Resource resource = new FileSystemResource(zipPath);
                    return ResponseEntity.ok()
                            .contentType(MediaType.APPLICATION_OCTET_STREAM)
                            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"challenge.zip\"")
                            .<Resource>body(resource);
                })
                .orElseGet(() -> {
                    log.warn("No build record with ZIP found for challenge {}", challengeId);
                    return ResponseEntity.<Resource>notFound().build();
                });
    }
}
