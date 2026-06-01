package com.university.platform.ctf.repository;

import com.university.platform.ctf.entity.CTFNotification;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface CTFNotificationRepository extends JpaRepository<CTFNotification, UUID> {

    /** Newest-first; caller passes a Pageable to cap at 50. */
    List<CTFNotification> findByCompetitionIdOrderBySentAtDesc(UUID competitionId, Pageable pageable);
}
