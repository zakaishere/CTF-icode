package com.university.platform.ctf.flag;

import com.university.platform.ctf.entity.CTFFlag;

/**
 * CHANGE 1 (Section 3): Strategy interface for flag verification.
 * Implementations must be timing-safe — no early-exit on mismatch.
 */
public interface FlagVerifier {
    boolean verify(CTFFlag flag, String submission);
}
