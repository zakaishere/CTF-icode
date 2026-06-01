package com.university.platform.ctf.exception;

public class CTFNotCaptainException extends RuntimeException {
    public CTFNotCaptainException() {
        super("Only the team captain can perform this action.");
    }
}
