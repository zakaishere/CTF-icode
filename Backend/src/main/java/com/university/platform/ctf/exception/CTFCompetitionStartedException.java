package com.university.platform.ctf.exception;

public class CTFCompetitionStartedException extends RuntimeException {
    public CTFCompetitionStartedException() {
        super("This operation is not allowed after the competition has started.");
    }
    public CTFCompetitionStartedException(String message) {
        super(message);
    }
}
