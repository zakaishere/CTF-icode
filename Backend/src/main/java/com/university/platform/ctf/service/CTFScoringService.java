package com.university.platform.ctf.service;

import org.springframework.stereotype.Service;

/**
 * CHANGE 3 (Section 4, 15): CTFd-compatible dynamic scoring formulas.
 *
 * All methods take the solve count AFTER the current solve is recorded
 * (i.e., currentSolveCount = 1 for the first solver).
 * The first solver always receives the full initialValue (n = solveCount - 1 = 0).
 */
@Service
public class CTFScoringService {

    /**
     * CHANGE 3 (Section 15): CTFd "logarithmic" formula — actually a downward parabola.
     * Formula: points = max(minimum, ceil(((minimum - initial) / decay²) × n² + initial))
     * where n = solveCount - 1.  Hits minimum when n = decay (solveCount = decay + 1).
     */
    public int calculateLogarithmic(int initialValue, int minimumValue,
                                    int decayCount, int currentSolveCount) {
        if (currentSolveCount <= 0) return initialValue;

        int n = currentSolveCount - 1;
        if (decayCount == 0) decayCount = 1;

        double value = ((double) (minimumValue - initialValue) / Math.pow(decayCount, 2))
                       * Math.pow(n, 2)
                       + initialValue;

        return Math.max((int) Math.ceil(value), minimumValue);
    }

    /**
     * CHANGE 3 (Section 15): CTFd linear decay formula.
     * Formula: points = max(minimum, ceil(initial - decay × n))
     * where n = solveCount - 1.
     */
    public int calculateLinear(int initialValue, int minimumValue,
                               int decayStep, int currentSolveCount) {
        if (currentSolveCount <= 0) return initialValue;

        int n = currentSolveCount - 1;
        int value = (int) Math.ceil((double) initialValue - (double) decayStep * n);
        return Math.max(value, minimumValue);
    }
}
