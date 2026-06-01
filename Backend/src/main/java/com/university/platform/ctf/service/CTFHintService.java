package com.university.platform.ctf.service;

import com.university.platform.ctf.dto.CTFHint;
import com.university.platform.ctf.entity.CTFAward;
import com.university.platform.ctf.entity.CTFChallenge;
import com.university.platform.ctf.entity.CTFHintUnlock;
import com.university.platform.ctf.repository.CTFAwardRepository;
import com.university.platform.ctf.repository.CTFChallengeRepository;
import com.university.platform.ctf.repository.CTFHintUnlockRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CTFHintService {

    private final CTFChallengeRepository  challengeRepository;
    private final CTFHintUnlockRepository hintUnlockRepository;
    private final CTFAwardRepository      awardRepository;

    /**
     * Unlock a hint.
     *
     * Competition mode (competitionId + teamId non-null): inserts a negative
     *   CTFAward so the team's scoreboard total is reduced by hint.cost().
     *   Does NOT touch student.totalPoints.
     *
     * Practice mode (competitionId == null): unlocks for free.
     *
     * Re-unlock: returns the hint text directly instead of throwing 409.
     *
     * @param competitionId null for practice mode
     * @param teamId        null for practice mode
     */
    @Transactional
    public CTFHint unlockHint(UUID challengeId, String hintId, UUID userId,
                               UUID teamId, UUID competitionId) {

        CTFChallenge challenge = challengeRepository.findById(challengeId)
                .orElseThrow(() -> new EntityNotFoundException("Challenge not found: " + challengeId));
        CTFHint hint = challenge.getHints().stream()
                .filter(h -> h.id().equals(hintId))
                .findFirst()
                .orElseThrow(() -> new EntityNotFoundException("Hint not found: " + hintId));

        if (competitionId != null && teamId != null) {
            // Competition mode: idempotency is per-team — any member re-unlocking returns
            // the text without charging again.
            if (hintUnlockRepository.existsByHintIdAndTeamId(hintId, teamId)) {
                return hint;
            }
            // Deduct from team score via a negative ctf_award.
            awardRepository.save(CTFAward.builder()
                    .competitionId(competitionId)
                    .teamId(teamId)
                    .value(-hint.cost())
                    .reason("hint:" + hintId)
                    .build());
            hintUnlockRepository.save(CTFHintUnlock.builder()
                    .challengeId(challengeId)
                    .userId(userId)
                    .teamId(teamId)
                    .hintId(hintId)
                    .pointsSpent(hint.cost())
                    .build());
        } else {
            // Practice mode: idempotency is per-user.
            if (hintUnlockRepository.existsByChallengeIdAndUserIdAndHintId(challengeId, userId, hintId)) {
                return hint;
            }
            // Practice mode: hints unlock for free in icode-ctf (no point cost)
            hintUnlockRepository.save(CTFHintUnlock.builder()
                    .challengeId(challengeId)
                    .userId(userId)
                    .hintId(hintId)
                    .pointsSpent(hint.cost())
                    .build());
        }

        return hint;
    }
}
