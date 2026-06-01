package com.university.platform.ctf.repository;

import com.university.platform.ctf.entity.CTFCompetition;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface CTFCompetitionRepository extends JpaRepository<CTFCompetition, UUID> {

    List<CTFCompetition> findByIsActiveTrueOrderByStartTimeDesc();

    @Query("SELECT c FROM CTFCompetition c WHERE c.isActive = true AND c.endTime > :now ORDER BY c.startTime ASC")
    List<CTFCompetition> findActiveUpcoming(LocalDateTime now);

    List<CTFCompetition> findByCreatedByOrderByCreatedAtDesc(UUID createdBy);

    @Query("SELECT c FROM CTFCompetition c WHERE LOWER(c.accessCode) = LOWER(:code) AND c.isActive = true")
    java.util.Optional<CTFCompetition> findByAccessCodeIgnoreCase(String code);

    @Query("SELECT COUNT(c) > 0 FROM CTFCompetition c WHERE LOWER(c.accessCode) = LOWER(:code)")
    boolean existsByAccessCodeIgnoreCase(String code);

    @Query("SELECT COUNT(c) > 0 FROM CTFCompetition c WHERE LOWER(c.accessCode) = LOWER(:code) AND c.id <> :excludeId")
    boolean existsByAccessCodeIgnoreCaseAndIdNot(String code, UUID excludeId);
}
