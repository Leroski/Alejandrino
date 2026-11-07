import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Runs the actual UUID_PATTERN from a Java source, without Android or a session. */
class NativeUuidContractTest {
    private static int checks;

    public static void main(String[] args) throws Exception {
        if (args.length < 1 || args.length > 2 ||
                (args.length == 2 && !args[1].equals("--reproduce"))) {
            throw new IllegalArgumentException("Usage: java NativeUuidContractTest.java JavaSource.java [--reproduce]");
        }
        String source = Files.readString(Path.of(args[0]));
        Matcher declaration = Pattern.compile(
            "private\\s+static\\s+final\\s+Pattern\\s+UUID_PATTERN\\s*=\\s*Pattern\\.compile\\(\\s*\"([^\"\\\\]+)\"\\s*\\);")
            .matcher(source);
        if (!declaration.find()) {
            throw new IllegalArgumentException("UUID_PATTERN literal not found; update the test adapter after refactoring.");
        }
        Pattern actual = Pattern.compile(declaration.group(1));
        if (declaration.find()) throw new IllegalArgumentException("Ambiguous UUID_PATTERN declaration.");

        // Synthetic identifiers, never production user or technique IDs.
        String user = "550e8400-e29b-41d4-a716-446655440000";
        String technique = "123e4567-e89b-42d3-a456-426614174000";
        String sixGroups = "550e8400-e29b-41d4-a716-abcd-446655440000";

        if (args.length == 2) {
            check(!actual.matcher(user).matches(), "historical pattern must reject canonical userId");
            check(!actual.matcher(technique).matches(), "historical pattern must reject canonical techniqueId");
            check(actual.matcher(sixGroups).matches(), "historical pattern must accept the invalid sixth group");
            System.out.println("INC-01 reproduced: two valid 36-character IDs rejected; invalid 41-character ID accepted.");
            return;
        }

        String[] valid = {
            user, technique, user.toUpperCase(Locale.ROOT),
            "550e8400-E29B-41d4-A716-446655440000",
            "019321ab-cdef-7abc-8def-0123456789ab",
            "00000000-0000-0000-0000-000000000000",
            "ffffffff-ffff-ffff-ffff-ffffffffffff"
        };
        for (int i = 0; i < valid.length; i++) {
            check(actual.matcher(valid[i]).matches(), "canonical representation " + i);
        }
        String[] invalid = {
            "", "null", "undefined", "123", sixGroups,
            "550e8400-e29b-41d4-446655440000",
            "550e8400-e29b-41d4-a716-44665544000",
            "550e8400-e29b-41d4-a716-4466554400000",
            "550e8400-e29b-41d4-a716-44665544000g",
            "1-1-1-1-1", user.replace("-", ""),
            " " + user, user + " ", "\t" + user, user + "\n", user + "\r\n",
            "{" + user + "}", "urn:uuid:" + user,
            user.replace('-', '\u2010'), user.replace('0', '\uff10'),
            user + "\u0000", "\"" + user + "\""
        };
        // The handler rejects the pair if EITHER field is invalid. Preserve that rule.
        check(accepts(actual, user, technique), "both canonical IDs accepted");
        for (int i = 0; i < invalid.length; i++) {
            check(!accepts(actual, invalid[i], technique), "invalid userId case " + i);
            check(!accepts(actual, user, invalid[i]), "invalid techniqueId case " + i);
        }
        System.out.println("PASS: " + checks + " UUID format checks. Session/ownership and Android routing are not tested here.");
    }

    private static boolean accepts(Pattern actual, String user, String technique) {
        return actual.matcher(user).matches() && actual.matcher(technique).matches();
    }

    private static void check(boolean condition, String label) {
        checks++;
        if (!condition) throw new AssertionError(label);
    }
}
