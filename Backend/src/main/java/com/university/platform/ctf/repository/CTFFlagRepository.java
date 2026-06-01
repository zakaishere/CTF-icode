package com.university.platform.ctf.repository;

import com.university.platform.ctf.entity.CTFFlag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

public interface CTFFlagRepository extends JpaRepository<CTFFlag, UUID> {

    List<CTFFlag> findByChallengeId(UUID challengeId);

    @Modifying
    @Transactional
    void deleteByChallengeId(UUID challengeId);
}
