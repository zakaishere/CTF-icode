package com.university.platform.exception;

import com.university.platform.ctf.exception.CTFAlreadyInTeamException;
import com.university.platform.ctf.exception.CTFAlreadySolvedException;
import com.university.platform.ctf.exception.CTFCapacityException;
import com.university.platform.ctf.exception.CTFCompetitionStartedException;
import com.university.platform.ctf.exception.CTFCooldownException;
import com.university.platform.ctf.exception.CTFMaxAttemptsException;
import com.university.platform.ctf.exception.CTFNotCaptainException;
import com.university.platform.ctf.exception.CTFPausedException;
import com.university.platform.ctf.exception.CTFTeamFullException;
import jakarta.persistence.EntityNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    // ── ResponseStatusException (thrown by services/controllers directly) ──────
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiError> handleResponseStatus(
            ResponseStatusException ex,
            HttpServletRequest req) {

        int status = ex.getStatusCode().value();
        if (status >= 500) {
            log.error("[RSE_{}] {} {} — {}", status, req.getMethod(), req.getRequestURI(), ex.getReason(), ex);
        } else if (status >= 400) {
            log.warn("[RSE_{}] {} {} — {}", status, req.getMethod(), req.getRequestURI(), ex.getReason());
        }

        return ResponseEntity.status(status).body(ApiError.builder()
                .status(status)
                .code(codeForStatus(status))
                .message(ex.getReason() != null ? ex.getReason() : ex.getMessage())
                .path(req.getRequestURI())
                .timestamp(Instant.now())
                .build());
    }

    // ── 400: Bean-validation errors ──────────────────────────────────────────
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(
            MethodArgumentNotValidException ex,
            HttpServletRequest req) {

        Map<String, String> fields = new LinkedHashMap<>();
        ex.getBindingResult().getFieldErrors()
                .forEach(e -> fields.put(e.getField(), e.getDefaultMessage()));

        log.warn("[VALIDATION] {} {} — invalid fields: {}", req.getMethod(), req.getRequestURI(), fields);

        return ResponseEntity.badRequest().body(ApiError.builder()
                .status(400)
                .code("VALIDATION_ERROR")
                .message("Please check the highlighted fields and try again.")
                .fieldErrors(fields)
                .path(req.getRequestURI())
                .timestamp(Instant.now())
                .build());
    }

    // ── 400: Business rule violation ─────────────────────────────────────────
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiError> handleIllegalArg(
            IllegalArgumentException ex,
            HttpServletRequest req) {

        log.warn("[BUSINESS_RULE] {} {} — {}", req.getMethod(), req.getRequestURI(), ex.getMessage());

        return ResponseEntity.badRequest().body(ApiError.builder()
                .status(400)
                .code("INVALID_REQUEST")
                .message(ex.getMessage())
                .path(req.getRequestURI())
                .timestamp(Instant.now())
                .build());
    }

    // ── 409: State conflict ──────────────────────────────────────────────────
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ApiError> handleIllegalState(
            IllegalStateException ex,
            HttpServletRequest req) {

        log.warn("[STATE_CONFLICT] {} {} — {}", req.getMethod(), req.getRequestURI(), ex.getMessage());

        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiError.builder()
                .status(409)
                .code("STATE_CONFLICT")
                .message(ex.getMessage())
                .path(req.getRequestURI())
                .timestamp(Instant.now())
                .build());
    }

    // ── 404: JPA entity not found ────────────────────────────────────────────
    @ExceptionHandler(EntityNotFoundException.class)
    public ResponseEntity<ApiError> handleNotFound(
            EntityNotFoundException ex,
            HttpServletRequest req) {

        log.warn("[NOT_FOUND] {} {} — {}", req.getMethod(), req.getRequestURI(), ex.getMessage());

        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiError.builder()
                .status(404)
                .code("NOT_FOUND")
                .message(ex.getMessage())
                .path(req.getRequestURI())
                .timestamp(Instant.now())
                .build());
    }

    // ── 403: Spring Security access denied ──────────────────────────────────
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiError> handleAccess(
            AccessDeniedException ex,
            HttpServletRequest req) {

        log.warn("[ACCESS_DENIED] {} {} — principal lacks permission", req.getMethod(), req.getRequestURI());

        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(ApiError.builder()
                .status(403)
                .code("ACCESS_DENIED")
                .message("You don't have permission to perform this action.")
                .path(req.getRequestURI())
                .timestamp(Instant.now())
                .build());
    }

    // ── 409: DB constraint violation ────────────────────────────────────────
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiError> handleDbConstraint(
            DataIntegrityViolationException ex,
            HttpServletRequest req) {

        String raw     = ex.getMostSpecificCause().getMessage();
        String message = friendlyConstraintMessage(raw);

        log.error("[DB_CONSTRAINT] {} {} — raw: {}", req.getMethod(), req.getRequestURI(), raw);

        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiError.builder()
                .status(409)
                .code("DATA_CONFLICT")
                .message(message)
                .path(req.getRequestURI())
                .timestamp(Instant.now())
                .build());
    }

    // ── CTF exceptions ───────────────────────────────────────────────────────

    @ExceptionHandler(CTFCapacityException.class)
    public ResponseEntity<ApiError> handleCTFCapacity(CTFCapacityException ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(ApiError.builder()
                .status(503).code("CTF_CAPACITY").message(ex.getMessage())
                .path(req.getRequestURI()).timestamp(java.time.Instant.now()).build());
    }

    @ExceptionHandler(CTFAlreadySolvedException.class)
    public ResponseEntity<ApiError> handleCTFAlreadySolved(CTFAlreadySolvedException ex, HttpServletRequest req) {
        return ResponseEntity.ok(ApiError.builder()
                .status(200).code("CTF_ALREADY_SOLVED").message(ex.getMessage())
                .path(req.getRequestURI()).timestamp(java.time.Instant.now()).build());
    }

    @ExceptionHandler(CTFMaxAttemptsException.class)
    public ResponseEntity<ApiError> handleCTFMaxAttempts(CTFMaxAttemptsException ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(ApiError.builder()
                .status(429).code("CTF_MAX_ATTEMPTS").message(ex.getMessage())
                .path(req.getRequestURI()).timestamp(java.time.Instant.now()).build());
    }

    @ExceptionHandler(CTFCooldownException.class)
    public ResponseEntity<Map<String, Object>> handleCTFCooldown(CTFCooldownException ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(Map.of("status", 429, "code", "CTF_COOLDOWN",
                        "message", ex.getMessage(), "waitSeconds", ex.getWaitSeconds()));
    }

    @ExceptionHandler(CTFTeamFullException.class)
    public ResponseEntity<ApiError> handleCTFTeamFull(CTFTeamFullException ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiError.builder()
                .status(409).code("CTF_TEAM_FULL").message(ex.getMessage())
                .path(req.getRequestURI()).timestamp(java.time.Instant.now()).build());
    }

    @ExceptionHandler(CTFAlreadyInTeamException.class)
    public ResponseEntity<ApiError> handleCTFAlreadyInTeam(CTFAlreadyInTeamException ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiError.builder()
                .status(409).code("CTF_ALREADY_IN_TEAM").message(ex.getMessage())
                .path(req.getRequestURI()).timestamp(java.time.Instant.now()).build());
    }

    @ExceptionHandler(CTFCompetitionStartedException.class)
    public ResponseEntity<ApiError> handleCTFCompetitionStarted(CTFCompetitionStartedException ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiError.builder()
                .status(409).code("CTF_COMPETITION_STARTED").message(ex.getMessage())
                .path(req.getRequestURI()).timestamp(java.time.Instant.now()).build());
    }

    @ExceptionHandler(CTFNotCaptainException.class)
    public ResponseEntity<ApiError> handleCTFNotCaptain(CTFNotCaptainException ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(ApiError.builder()
                .status(403).code("CTF_NOT_CAPTAIN").message(ex.getMessage())
                .path(req.getRequestURI()).timestamp(java.time.Instant.now()).build());
    }

    @ExceptionHandler(CTFPausedException.class)
    public ResponseEntity<ApiError> handleCTFPaused(CTFPausedException ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiError.builder()
                .status(409).code("CTF_PAUSED").message(ex.getMessage())
                .path(req.getRequestURI()).timestamp(java.time.Instant.now()).build());
    }

    // ── 500: Catch-all ───────────────────────────────────────────────────────
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleAll(
            Exception ex,
            HttpServletRequest req) {

        log.error("[UNHANDLED_ERROR] {} {} — {}", req.getMethod(), req.getRequestURI(), ex.getMessage(), ex);

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(ApiError.builder()
                .status(500)
                .code("SERVER_ERROR")
                .message("Something went wrong on our end. Our team has been notified. Please try again in a moment.")
                .path(req.getRequestURI())
                .timestamp(Instant.now())
                .build());
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private String codeForStatus(int status) {
        return switch (status) {
            case 400 -> "INVALID_REQUEST";
            case 401 -> "UNAUTHORIZED";
            case 403 -> "FORBIDDEN";
            case 404 -> "NOT_FOUND";
            case 409 -> "CONFLICT";
            default  -> status >= 500 ? "SERVER_ERROR" : "ERROR";
        };
    }

    private String friendlyConstraintMessage(String raw) {
        if (raw == null) return "A data constraint was violated.";
        if (raw.contains("null value in column")) {
            int s = raw.indexOf('"') + 1;
            int e = raw.indexOf('"', s);
            String col = (s > 0 && e > s) ? raw.substring(s, e) : "unknown field";
            return "Required field is missing: " + col.replace("_", " ");
        }
        if (raw.contains("duplicate key")) return "A record with this value already exists.";
        if (raw.contains("foreign key"))   return "A referenced record could not be found.";
        return "A data constraint was violated.";
    }
}
