package com.university.platform.ctf.repository;

import com.university.platform.ctf.entity.CTFSolve;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CTFSolveRepository extends JpaRepository<CTFSolve, UUID> {

    Optional<CTFSolve> findByChallengeIdAndUserId(UUID challengeId, UUID userId);

    long countByChallengeId(UUID challengeId);

    List<CTFSolve> findAllByUserId(UUID userId);

    Optional<CTFSolve> findFirstByChallengeIdOrderBySolvedAtAsc(UUID challengeId);

    List<CTFSolve> findByChallengeIdOrderBySolvedAtDesc(UUID challengeId, org.springframework.data.domain.Pageable pageable);
}
