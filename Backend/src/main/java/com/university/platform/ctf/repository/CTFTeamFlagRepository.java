package com.university.platform.ctf.repository;

import com.university.platform.ctf.entity.CTFTeamFlag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CTFTeamFlagRepository extends JpaRepository<CTFTeamFlag, UUID> {

    Optional<CTFTeamFlag> findByCompetitionIdAndChallengeIdAndTeamId(
            UUID competitionId, UUID challengeId, UUID teamId);

    List<CTFTeamFlag> findByCompetitionIdAndChallengeId(UUID competitionId, UUID challengeId);

    void deleteByTeamId(UUID teamId);

    @Query("SELECT f FROM CTFTeamFlag f WHERE f.competitionId = :compId AND f.challengeId = :chalId " +
           "AND f.flagHash = :hash AND f.teamId <> :teamId")
    Optional<CTFTeamFlag> findCheatSource(
            @Param("compId")  UUID compId,
            @Param("chalId")  UUID chalId,
            @Param("hash")    String hash,
            @Param("teamId")  UUID teamId);
}
