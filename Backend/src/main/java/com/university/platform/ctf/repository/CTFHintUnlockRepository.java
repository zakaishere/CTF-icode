package com.university.platform.ctf.repository;

import com.university.platform.ctf.entity.CTFHintUnlock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public interface CTFHintUnlockRepository extends JpaRepository<CTFHintUnlock, UUID> {

    /** Practice-mode idempotency: same user, same hint. */
    boolean existsByChallengeIdAndUserIdAndHintId(UUID challengeId, UUID userId, String hintId);

    /** Competition-mode idempotency: same team, same hint (regardless of which member clicked). */
    boolean existsByHintIdAndTeamId(String hintId, UUID teamId);

    List<CTFHintUnlock> findByChallengeIdAndUserId(UUID challengeId, UUID userId);

    /** Whether any student has unlocked the given hint id on this challenge. */
    boolean existsByChallengeIdAndHintId(UUID challengeId, String hintId);

    /**
     * Returns every hint ID that the given team has unlocked for any challenge in
     * {@code challengeIds}.  Used to filter hint text before sending to the client.
     */
    @Query("SELECT u.hintId FROM CTFHintUnlock u WHERE u.teamId = :teamId AND u.challengeId IN :challengeIds")
    Set<String> findHintIdsByTeamIdAndChallengeIdIn(
            @Param("teamId") UUID teamId,
            @Param("challengeIds") Collection<UUID> challengeIds);
}
