package com.university.platform.ctf.repository;

import com.university.platform.ctf.entity.CTFCheatEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface CTFCheatEventRepository extends JpaRepository<CTFCheatEvent, UUID> {

    List<CTFCheatEvent> findByCompetitionIdOrderByDetectedAtDesc(UUID competitionId);

    int countByCompetitionId(UUID competitionId);
}
