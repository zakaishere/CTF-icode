package com.university.platform.ctf.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "ctf.worker.agent")
@Getter
@Setter
public class WorkerAgentConfig {
    private String url = "";
    private String keyId = "";
    private String secret = "";
    private int timeoutSeconds = 30;
    private int pollIntervalMs = 500;
    private int pollMaxAttempts = 60;

    public boolean isEnabled() {
        return url != null && !url.isBlank();
    }
}
