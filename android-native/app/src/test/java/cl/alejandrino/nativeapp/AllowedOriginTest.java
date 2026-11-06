package cl.alejandrino.nativeapp;

import org.junit.Test;
import static org.junit.Assert.*;

public class AllowedOriginTest {
    @Test public void onlyTheConfiguredHttpsOriginMatches() throws Exception {
        AllowedOrigin origin = new AllowedOrigin("https://APP.example/");
        assertEquals("https://app.example", origin.value);
        assertTrue(origin.allows("https://app.example/compartir?text=example"));
        assertTrue(origin.allows("https://app.example:443/"));
        for (String url : new String[] { "http://app.example/", "https://app.example.attacker.example/", "https://sub.app.example/",
            "https://user@app.example/", "https://app.example:444/", "file:///private", "javascript:alert(1)", null }) {
            assertFalse(origin.allows(url));
        }
    }

    @Test public void invalidBuildConfigurationFailsClosed() throws Exception {
        for (String url : new String[] { "", "http://app.example", "https://app.example/path", "https://app.example/?q=x",
            "https://app.example/#x", "https://user@app.example", "https://app.example:444", "https://*.example" }) {
            assertThrows(Exception.class, () -> new AllowedOrigin(url));
        }
    }
}
