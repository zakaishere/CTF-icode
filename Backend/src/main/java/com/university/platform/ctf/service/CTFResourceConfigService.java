package com.university.platform.ctf.service;

import com.university.platform.ctf.dto.CTFResourceConfigRequest;
import com.university.platform.ctf.entity.CTFResourceConfig;
import com.university.platform.ctf.repository.CTFInstanceRepository;
import com.university.platform.ctf.repository.CTFResourceConfigRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CTFResourceConfigService {

    private final CTFResourceConfigRepository configRepository;
    private final CTFInstanceRepository instanceRepository;

    @Transactional
    public CTFResourceConfig getConfig() {
        return configRepository.findById(1L)
                .orElseGet(this::createDefaultConfig);
    }

    /** Bootstraps the singleton config row (id=1) the first time it's needed. */
    private CTFResourceConfig createDefaultConfig() {
        CTFResourceConfig config = CTFResourceConfig.builder()
                .id(1L)
                .maxConcurrentInstances(50)
                .maxInstancesPerUser(3)
                .maxInstanceDurationMinutes(30)
                .containerMemoryLimitMb(128)
                .containerCpuPercent(50)
                .cleanupIntervalSeconds(60)
                .build();
        return configRepository.save(config);
    }

    @Transactional
    public CTFResourceConfig updateConfig(CTFResourceConfigRequest dto, UUID adminId) {
        CTFResourceConfig config = getConfig();
        if (dto.getMaxConcurrentInstances() != null)     config.setMaxConcurrentInstances(dto.getMaxConcurrentInstances());
        if (dto.getMaxInstancesPerUser() != null)         config.setMaxInstancesPerUser(dto.getMaxInstancesPerUser());
        if (dto.getMaxInstanceDurationMinutes() != null)  config.setMaxInstanceDurationMinutes(dto.getMaxInstanceDurationMinutes());
        if (dto.getContainerMemoryLimitMb() != null)      config.setContainerMemoryLimitMb(dto.getContainerMemoryLimitMb());
        if (dto.getContainerCpuPercent() != null)         config.setContainerCpuPercent(dto.getContainerCpuPercent());
        if (dto.getCleanupIntervalSeconds() != null)      config.setCleanupIntervalSeconds(dto.getCleanupIntervalSeconds());
        config.setUpdatedBy(adminId);
        config.setUpdatedAt(LocalDateTime.now());
        return configRepository.save(config);
    }

    public boolean isInstanceCapacityAvailable() {
        CTFResourceConfig config = getConfig();
        long running = instanceRepository.countByStatus("RUNNING");
        return running < config.getMaxConcurrentInstances();
    }
}
