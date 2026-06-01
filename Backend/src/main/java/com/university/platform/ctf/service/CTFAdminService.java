package com.university.platform.ctf.service;

import com.university.platform.ctf.dto.CTFResourceConfigRequest;
import com.university.platform.ctf.entity.CTFChallenge;
import com.university.platform.ctf.entity.CTFResourceConfig;
import com.university.platform.ctf.entity.CTFSolve;
import com.university.platform.ctf.entity.CTFSubmission;
import com.university.platform.ctf.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CTFAdminService {

    private final CTFResourceConfigService configService;
    private final CTFChallengeRepository challengeRepository;
    private final CTFSubmissionRepository submissionRepository;
    private final CTFSolveRepository solveRepository;

    public CTFResourceConfig getResourceConfig() {
        return configService.getConfig();
    }

    public CTFResourceConfig updateResourceConfig(CTFResourceConfigRequest dto, UUID adminId) {
        return configService.updateConfig(dto, adminId);
    }

    public List<CTFSubmission> getAllSubmissions(UUID challengeId, int page, int size) {
        int safeSize = Math.min(size, 100);
        if (challengeId != null) {
            return submissionRepository.findByChallengeIdOrderBySubmittedAtDesc(
                    challengeId, PageRequest.of(page, safeSize));
        }
        return submissionRepository.findAll(PageRequest.of(page, safeSize)).getContent();
    }

    public Map<String, Object> getChallengeStats(UUID challengeId) {
        long solveCount = solveRepository.countByChallengeId(challengeId);
        long attemptCount = submissionRepository.findByChallengeIdOrderBySubmittedAtDesc(
                challengeId, PageRequest.of(0, Integer.MAX_VALUE)).size();
        CTFSolve firstSolve = solveRepository.findFirstByChallengeIdOrderBySolvedAtAsc(challengeId).orElse(null);

        Map<String, Object> stats = new HashMap<>();
        stats.put("challengeId", challengeId);
        stats.put("solveCount", solveCount);
        stats.put("attemptCount", attemptCount);
        stats.put("firstSolve", firstSolve != null ? Map.of(
                "userId", firstSolve.getUserId(),
                "solvedAt", firstSolve.getSolvedAt()
        ) : null);
        return stats;
    }

    public List<CTFChallenge> getAllChallengesAdmin() {
        return challengeRepository.findAll();
    }
}
