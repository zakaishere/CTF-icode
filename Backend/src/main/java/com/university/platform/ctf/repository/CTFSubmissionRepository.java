package com.university.platform.ctf.repository;

import com.university.platform.ctf.entity.CTFSubmission;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CTFSubmissionRepository extends JpaRepository<CTFSubmission, UUID> {

    long countByChallengeIdAndUserId(UUID challengeId, UUID userId);

    long countByChallengeIdAndTeamId(UUID challengeId, UUID teamId);

    Optional<CTFSubmission> findTopByChallengeIdAndUserIdOrderBySubmittedAtDesc(UUID challengeId, UUID userId);

    List<CTFSubmission> findByChallengeIdAndUserIdOrderBySubmittedAtDesc(UUID challengeId, UUID userId, Pageable pageable);

    List<CTFSubmission> findByChallengeIdAndTeamIdOrderBySubmittedAtDesc(UUID challengeId, UUID teamId, Pageable pageable);

    List<CTFSubmission> findByChallengeIdOrderBySubmittedAtDesc(UUID challengeId, Pageable pageable);

    List<CTFSubmission> findByCompetitionIdOrderBySubmittedAtDesc(UUID competitionId, Pageable pageable);

    long countByChallengeId(UUID challengeId);

    long countByCompetitionId(UUID competitionId);
}
