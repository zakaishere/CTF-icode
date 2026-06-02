package com.university.platform.ctf.exception;

public class WorkerAgentException extends RuntimeException {
    public WorkerAgentException(String message) {
        super(message);
    }
    public WorkerAgentException(String message, Throwable cause) {
        super(message, cause);
    }
}
