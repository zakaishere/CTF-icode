package com.university.platform.ctf.flag;

import com.university.platform.ctf.entity.CTFFlag;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * CHANGE 1 (Section 3): Registry that routes flag verification to the correct
 * strategy.  Spring injects all FlagVerifier beans keyed by bean name
 * ("STATIC", "REGEX") into the map.
 * Returns true if ANY flag matches — same as CTFd's "any" logic.
 */
@Component
public class FlagVerifierRegistry {

    private final Map<String, FlagVerifier> verifiers;

    public FlagVerifierRegistry(Map<String, FlagVerifier> verifiers) {
        this.verifiers = verifiers;
    }

    public boolean verifyAny(List<CTFFlag> flags, String submission) {
        for (CTFFlag flag : flags) {
            FlagVerifier verifier = verifiers.getOrDefault(flag.getType(), verifiers.get("STATIC"));
            if (verifier != null && verifier.verify(flag, submission)) {
                return true;
            }
        }
        return false;
    }
}
