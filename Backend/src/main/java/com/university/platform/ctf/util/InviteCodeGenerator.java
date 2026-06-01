package com.university.platform.ctf.util;

import java.util.List;
import java.util.Random;

public final class InviteCodeGenerator {

    private static final Random RNG = new Random();

    private static final List<String> ANIMALS = List.of(
        "BEAR", "WOLF", "LION", "HAWK", "DEER", "FOX",  "OWL",  "RAM",
        "EEL",  "YAK",  "GNU",  "EMU",  "COD",  "JAY",  "IBIS", "LYNX",
        "MINK", "NEWT", "PUMA", "QUAIL","ROOK", "SEAL", "TOAD", "VOLE",
        "WREN", "CROW", "DUCK", "FROG", "GOAT", "HARE", "KITE", "LARK",
        "MOLE", "PIKE", "ROBIN","SLUG", "SWAN", "TERN", "WASP", "CLAM",
        "DACE", "FINCH","GNAT", "HERON","KRILL","LOACH","MOTH", "NEWT",
        "ORYX", "PIKA"
    );

    private InviteCodeGenerator() {}

    public static String generate() {
        String animal = ANIMALS.get(RNG.nextInt(ANIMALS.size()));
        int suffix    = 1000 + RNG.nextInt(9000);
        return animal + "-" + suffix;
    }
}
