package game.kingdomcome.alpha;

import org.junit.Test;
import static org.junit.Assert.*;

public class NavigationPolicyTest {
    @Test public void gamePagesAndInvitationsStayInApp() {
        for (String suffix : new String[]{"/", "/login", "/game/quests?region=all", "/game/army?tab=army", "/game/players/11111111-1111-4111-8111-111111111111", "/game/land#holdings"}) {
            assertTrue(NavigationPolicy.isGame(NavigationPolicy.ORIGIN + suffix));
            assertEquals(NavigationPolicy.Destination.GAME, NavigationPolicy.destination(NavigationPolicy.ORIGIN + suffix, false));
        }
        assertTrue(NavigationPolicy.isGame("HTTPS://TEST-PRODUCTION-995C.UP.RAILWAY.APP:443/game/home"));
    }
    @Test public void deceptiveHostsNeverReceiveTheInAppSession() {
        for (String value : new String[]{"https://test-production-995c.up.railway.app.evil.invalid/", "https://evil.invalid/test-production-995c.up.railway.app", "https://test-production-995c.up.railway.app./", "https://test-production-995c.up.railway.app:8443/", "https://127.0.0.1/", "https://[::1]/"}) {
            assertFalse(value, NavigationPolicy.isGame(value));
        }
    }
    @Test public void dangerousSchemesCredentialsAndMalformedUrlsAreBlocked() {
        for (String value : new String[]{null, "", " ", "http://test-production-995c.up.railway.app", "javascript:alert(1)", "file:///sdcard/example", "content://example", "data:text/html,hello", "intent://example", "https://user:pass@test-production-995c.up.railway.app/", "https://test-production-995c.up.railway.app@evil.invalid/", "https://test-production-995c.up.railway.app\\@evil.invalid/", "https://%74est-production-995c.up.railway.app/", "https://test-production-995c.up.railway.app/\n", "//test-production-995c.up.railway.app/"}) {
            assertFalse(NavigationPolicy.isGame(value));
            assertEquals(String.valueOf(value), NavigationPolicy.Destination.BLOCK, NavigationPolicy.destination(value, true));
        }
    }
    @Test public void externalHttpsNeedsAUserGestureAndBrowserSeparation() {
        String url = "https://discord.com/invite/owner-selected";
        assertEquals(NavigationPolicy.Destination.BLOCK, NavigationPolicy.destination(url, false));
        assertEquals(NavigationPolicy.Destination.BROWSER, NavigationPolicy.destination(url, true));
        assertEquals(NavigationPolicy.HOME, NavigationPolicy.recovery(url));
    }
    @Test public void recoveryKeepsKnownScreensAndFilters() {
        for (String suffix : new String[]{"/game/land", "/game/armory?category=weapon", "/game/army?tab=dashboard", "/login?returnTo=%2Fgame%2Fland", "/game/battles/11111111-1111-4111-8111-111111111111"}) {
            assertEquals(NavigationPolicy.ORIGIN + suffix, NavigationPolicy.recovery(NavigationPolicy.ORIGIN + suffix));
        }
    }
    @Test public void recoveryCannotReplayApiOrFormActions() {
        for (String suffix : new String[]{"/logout", "/api/v1/commands", "/game/armory/buy?command=anything", "/game/army/invite-code", "/game/land/sell", "/game/../logout"}) {
            assertEquals(NavigationPolicy.HOME, NavigationPolicy.recovery(NavigationPolicy.ORIGIN + suffix));
        }
        assertEquals(NavigationPolicy.HOME, NavigationPolicy.recovery("javascript:alert(1)"));
    }
    @Test public void onlyActualAuthenticationPagesClearBackHistory() {
        assertTrue(NavigationPolicy.isAuthentication(NavigationPolicy.ORIGIN + "/login?expired=1"));
        assertTrue(NavigationPolicy.isAuthentication(NavigationPolicy.ORIGIN + "/register"));
        assertFalse(NavigationPolicy.isAuthentication("https://evil.invalid/login"));
        assertFalse(NavigationPolicy.isAuthentication(NavigationPolicy.ORIGIN + "/game/home"));
    }
}
