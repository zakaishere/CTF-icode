package com.university.platform.ctf.exception;

public class CTFPausedException extends RuntimeException {
    public CTFPausedException() {
        super("Competition is currently paused");
    }
    public CTFPausedException(String message) {
        super(message);
    }
}
