package com.university.platform.ctf.exception;

public class CTFTeamFullException extends RuntimeException {
    public CTFTeamFullException() {
        super("This team is full.");
    }
}
