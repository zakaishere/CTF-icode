package com.university.platform.utils;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

public class HashGenerator {
    public static void main(String[] args) {
        if (args.length < 1) {
            System.err.println("Usage: HashGenerator <password>");
            System.exit(1);
        }
        String password = args[0];
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(12);
        String hash = encoder.encode(password);
        System.out.println(hash);
    }
}
