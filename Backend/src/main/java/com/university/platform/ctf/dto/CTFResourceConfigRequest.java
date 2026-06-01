package com.university.platform.ctf.dto;

import lombok.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CTFResourceConfigRequest {

    private Integer maxConcurrentInstances;
    private Integer maxInstancesPerUser;
    private Integer maxInstanceDurationMinutes;
    private Integer containerMemoryLimitMb;
    private Integer containerCpuPercent;
    private Integer cleanupIntervalSeconds;
}
