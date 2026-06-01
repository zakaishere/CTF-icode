package com.university.platform.ctf.repository;

import com.university.platform.ctf.entity.CTFInstance;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CTFInstanceRepository extends JpaRepository<CTFInstance, UUID> {

    Optional<CTFInstance> findByChallengeIdAndUserIdAndStatus(UUID challengeId, UUID userId, String status);

    Optional<CTFInstance> findFirstByChallengeIdAndUserIdAndStatusIn(UUID challengeId, UUID userId, List<String> statuses);

    long countByStatus(String status);

    List<CTFInstance> findByUserIdAndStatusIn(UUID userId, List<String> statuses);

    List<CTFInstance> findAllByExpiresAtBeforeAndStatus(LocalDateTime time, String status);

    @Query("SELECT i.assignedPort FROM CTFInstance i WHERE i.status IN ('STARTING','RUNNING')")
    List<Integer> findOccupiedPorts();

    /** For competition mode — find an active instance for a given team + challenge. */
    @Query("SELECT i FROM CTFInstance i WHERE i.teamId = :teamId AND i.challengeId = :challengeId AND i.status IN ('STARTING','RUNNING')")
    Optional<CTFInstance> findActiveByTeamAndChallenge(@Param("teamId") UUID teamId, @Param("challengeId") UUID challengeId);

    /** Admin view — all active instances. */
    List<CTFInstance> findByStatusIn(List<String> statuses);

    List<CTFInstance> findByCompetitionId(UUID competitionId);
}
