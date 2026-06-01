package com.university.platform.ctf.exception;

public class CTFMaxAttemptsException extends RuntimeException {
    public CTFMaxAttemptsException(String message) {
        super(message);
    }
}
