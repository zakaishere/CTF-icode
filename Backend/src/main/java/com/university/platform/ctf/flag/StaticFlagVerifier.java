package com.university.platform.ctf.flag;

import com.university.platform.ctf.entity.CTFFlag;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * CHANGE 1 (Section 3): Constant-time static flag comparison.
 * Uses MessageDigest.isEqual — NEVER String.equals() — to prevent timing attacks.
 */
@Component("STATIC")
public class StaticFlagVerifier implements FlagVerifier {

    @Override
    public boolean verify(CTFFlag flag, String submission) {
        String saved    = flag.getContent();
        String provided = submission.strip();

        if (flag.isCaseInsensitive()) {
            saved    = saved.toLowerCase();
            provided = provided.toLowerCase();
        }

        // Length check first (acceptable — flag lengths are visible from format)
        if (saved.length() != provided.length()) return false;

        return MessageDigest.isEqual(
                saved.getBytes(StandardCharsets.UTF_8),
                provided.getBytes(StandardCharsets.UTF_8));
    }
}
