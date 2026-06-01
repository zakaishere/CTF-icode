package com.university.platform.ctf.repository;

import com.university.platform.ctf.entity.CTFChallengeBuild;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CTFChallengeBuildRepository extends JpaRepository<CTFChallengeBuild, UUID> {

    Optional<CTFChallengeBuild> findTopByChallengeIdOrderByCreatedAtDesc(UUID challengeId);

    List<CTFChallengeBuild> findByChallengeId(UUID challengeId);
}
