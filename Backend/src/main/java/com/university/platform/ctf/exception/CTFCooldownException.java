package com.university.platform.ctf.exception;

public class CTFCooldownException extends RuntimeException {

    private final long waitSeconds;

    public CTFCooldownException(long waitSeconds) {
        super("Please wait " + waitSeconds + " seconds before submitting again.");
        this.waitSeconds = waitSeconds;
    }

    public long getWaitSeconds() {
        return waitSeconds;
    }
}
