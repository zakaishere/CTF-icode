package com.university.platform.ctf.exception;

public class CTFAlreadyInTeamException extends RuntimeException {
    public CTFAlreadyInTeamException() {
        super("You are already in a team for this competition.");
    }
}
