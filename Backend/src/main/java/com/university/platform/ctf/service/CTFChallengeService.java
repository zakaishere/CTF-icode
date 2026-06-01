package com.university.platform.ctf.service;

import com.university.platform.ctf.dto.CTFChallengeDTO;
import com.university.platform.ctf.dto.CTFChallengeRequest;
import com.university.platform.ctf.dto.CTFHintDTO;
import com.university.platform.ctf.entity.CTFChallenge;
import com.university.platform.ctf.entity.CTFHintUnlock;
import com.university.platform.ctf.repository.*;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CTFChallengeService {

    private final CTFChallengeRepository challengeRepository;
    private final CTFSolveRepository solveRepository;
    private final CTFSubmissionRepository submissionRepository;
    private final CTFHintUnlockRepository hintUnlockRepository;
    private final CTFInstanceRepository instanceRepository;

    public List<CTFChallengeDTO> getChallenges(String category, String difficulty, UUID userId) {
        List<CTFChallenge> challenges = filterChallenges(category, difficulty);
        return challenges.stream().map(c -> toDTO(c, userId, false)).collect(Collectors.toList());
    }

    public CTFChallengeDTO getChallengeDetail(UUID id, UUID userId) {
        CTFChallenge challenge = challengeRepository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new EntityNotFoundException("Challenge not found: " + id));
        return toDTO(challenge, userId, true);
    }

    @Transactional
    public CTFChallengeDTO createChallenge(CTFChallengeRequest dto, UUID authorId) {
        CTFChallenge challenge = buildFromRequest(dto);
        challenge.setAuthorId(authorId);
        challengeRepository.save(challenge);
        return toDTO(challenge, authorId, false);
    }

    @Transactional
    public CTFChallengeDTO updateChallenge(UUID id, CTFChallengeRequest dto, UUID editorId) {
        CTFChallenge challenge = challengeRepository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new EntityNotFoundException("Challenge not found: " + id));
        applyRequest(challenge, dto);
        challengeRepository.save(challenge);
        return toDTO(challenge, editorId, false);
    }

    @Transactional
    public void toggleActive(UUID id) {
        CTFChallenge challenge = challengeRepository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new EntityNotFoundException("Challenge not found: " + id));
        challenge.setIsActive(!challenge.getIsActive());
        challengeRepository.save(challenge);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private List<CTFChallenge> filterChallenges(String category, String difficulty) {
        CTFChallenge.CTFCategory cat = parseCategory(category);
        CTFChallenge.CTFDifficulty diff = parseDifficulty(difficulty);

        if (cat != null && diff != null) return challengeRepository.findByCategoryAndDifficultyAndIsActiveTrueAndDeletedFalse(cat, diff);
        if (cat != null)                 return challengeRepository.findByCategoryAndIsActiveTrueAndDeletedFalse(cat);
        if (diff != null)                return challengeRepository.findByDifficultyAndIsActiveTrueAndDeletedFalse(diff);
        return challengeRepository.findByIsActiveTrueAndDeletedFalse();
    }

    private CTFChallengeDTO toDTO(CTFChallenge c, UUID userId, boolean includeDescription) {
        Set<String> unlockedHintIds = hintUnlockRepository.findByChallengeIdAndUserId(c.getId(), userId)
                .stream().map(CTFHintUnlock::getHintId).collect(Collectors.toSet());

        List<CTFHintDTO> hintDTOs = c.getHints().stream().map(h -> new CTFHintDTO(
                h.id(),
                h.cost(),
                unlockedHintIds.contains(h.id()) ? h.text() : null
        )).collect(Collectors.toList());

        boolean solvedByMe = solveRepository.findByChallengeIdAndUserId(c.getId(), userId).isPresent();
        long solveCount = solveRepository.countByChallengeId(c.getId());
        int myAttempts = (int) submissionRepository.countByChallengeIdAndUserId(c.getId(), userId);
        boolean hasActiveInstance = Boolean.TRUE.equals(c.getRequiresInstance()) &&
                instanceRepository.findByChallengeIdAndUserIdAndStatus(c.getId(), userId, "RUNNING").isPresent();

        return CTFChallengeDTO.builder()
                .id(c.getId())
                .title(c.getTitle())
                .description(includeDescription ? c.getDescription() : truncate(c.getDescription(), 120))
                .category(c.getCategory() != null ? c.getCategory().name() : null)
                .difficulty(c.getDifficulty() != null ? c.getDifficulty().name() : null)
                .basePoints(c.getBasePoints())
                .flagFormat(c.getFlagFormat())
                .requiresInstance(c.getRequiresInstance())
                .dockerImage(c.getDockerImage())
                .dockerExposedPort(c.getDockerExposedPort())
                .connectionType(c.getConnectionType())
                .downloadableFileUrl(c.getDownloadableFileUrl())
                .downloadableFileName(c.getDownloadableFileName())
                .hints(hintDTOs)
                .maxAttempts(c.getMaxAttempts())
                .isActive(c.getIsActive())
                .createdAt(c.getCreatedAt())
                .solvedByMe(solvedByMe)
                .solveCount(solveCount)
                .myUnlockedHints(new ArrayList<>(unlockedHintIds))
                .myAttempts(myAttempts)
                .hasActiveInstance(hasActiveInstance)
                .build();
    }

    private CTFChallenge buildFromRequest(CTFChallengeRequest dto) {
        CTFChallenge c = new CTFChallenge();
        applyRequest(c, dto);
        return c;
    }

    private void applyRequest(CTFChallenge c, CTFChallengeRequest dto) {
        if (dto.getTitle() != null)               c.setTitle(dto.getTitle());
        if (dto.getDescription() != null)          c.setDescription(dto.getDescription());
        if (dto.getCategory() != null)             c.setCategory(CTFChallenge.CTFCategory.valueOf(dto.getCategory().toUpperCase()));
        if (dto.getDifficulty() != null)           c.setDifficulty(CTFChallenge.CTFDifficulty.valueOf(dto.getDifficulty().toUpperCase()));
        if (dto.getBasePoints() != null)           c.setBasePoints(dto.getBasePoints());
        if (dto.getFlagHash() != null)             c.setFlagHash(dto.getFlagHash());
        if (dto.getFlagFormat() != null)           c.setFlagFormat(dto.getFlagFormat());
        if (dto.getRequiresInstance() != null)     c.setRequiresInstance(dto.getRequiresInstance());
        if (dto.getDockerImage() != null)          c.setDockerImage(dto.getDockerImage());
        if (dto.getDockerExposedPort() != null)     c.setDockerExposedPort(dto.getDockerExposedPort());
        if (dto.getContainerEnvVars() != null)     c.setContainerEnvVars(dto.getContainerEnvVars());
        if (dto.getDownloadableFileUrl() != null)  c.setDownloadableFileUrl(dto.getDownloadableFileUrl());
        if (dto.getDownloadableFileName() != null) c.setDownloadableFileName(dto.getDownloadableFileName());
        if (dto.getHints() != null)                c.setHints(dto.getHints());
        // 0 or negative = unlimited (stored as null); positive = hard limit
        if (dto.getMaxAttempts() != null) {
            c.setMaxAttempts(dto.getMaxAttempts() <= 0 ? null : dto.getMaxAttempts());
        }
        if (dto.getIsActive() != null)             c.setIsActive(dto.getIsActive());
    }

    private CTFChallenge.CTFCategory parseCategory(String s) {
        if (s == null || s.isBlank()) return null;
        try { return CTFChallenge.CTFCategory.valueOf(s.toUpperCase()); } catch (IllegalArgumentException e) { return null; }
    }

    private CTFChallenge.CTFDifficulty parseDifficulty(String s) {
        if (s == null || s.isBlank()) return null;
        try { return CTFChallenge.CTFDifficulty.valueOf(s.toUpperCase()); } catch (IllegalArgumentException e) { return null; }
    }

    private String truncate(String s, int max) {
        if (s == null || s.length() <= max) return s;
        return s.substring(0, max) + "…";
    }
}
