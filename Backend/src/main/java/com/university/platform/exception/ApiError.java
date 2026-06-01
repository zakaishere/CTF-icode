package com.university.platform.exception;

import lombok.Builder;

import java.time.Instant;
import java.util.Map;

@Builder
public record ApiError(
        int                 status,
        String              code,
        String              message,
        Map<String, String> fieldErrors,
        String              path,
        Instant             timestamp
) {}
