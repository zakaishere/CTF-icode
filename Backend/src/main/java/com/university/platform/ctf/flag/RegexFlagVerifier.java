package com.university.platform.ctf.flag;

import com.university.platform.ctf.entity.CTFFlag;
import org.springframework.stereotype.Component;

import java.util.regex.Pattern;

/**
 * CHANGE 1 (Section 3): Regex flag verifier.
 * matches() requires a full-string match (anchored at start AND end),
 * matching CTFd's `res.group() == provided` guard.
 */
@Component("REGEX")
public class RegexFlagVerifier implements FlagVerifier {

    @Override
    public boolean verify(CTFFlag flag, String submission) {
        int patternFlags = flag.isCaseInsensitive() ? Pattern.CASE_INSENSITIVE : 0;
        Pattern p = Pattern.compile(flag.getContent(), patternFlags);
        return p.matcher(submission.strip()).matches();
    }
}
