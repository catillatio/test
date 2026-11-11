package game.kingdomcome.alpha;

import java.net.URI;
import java.net.URISyntaxException;

/** No credentials, API URLs or configurable alternate origins belong in this shell. */
public final class NavigationPolicy {
    public static final String ORIGIN = "https://test-production-995c.up.railway.app";
    public static final String HOME = ORIGIN + "/game/home";
    private static final String HOST = "test-production-995c.up.railway.app";
    public enum Destination { GAME, BROWSER, BLOCK }
    private NavigationPolicy() {}

    private static URI https(String value) {
        if (value == null || value.isEmpty()) return null;
        try {
            URI uri = new URI(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.isOpaque()
                    || uri.getHost() == null || uri.getRawUserInfo() != null
                    || (uri.getPort() != -1 && uri.getPort() != 443)) return null;
            return uri;
        } catch (URISyntaxException exception) { return null; }
    }
    public static boolean isGame(String value) {
        URI uri = https(value);
        return uri != null && HOST.equalsIgnoreCase(uri.getHost());
    }
    public static Destination destination(String value, boolean userGesture) {
        if (isGame(value)) return Destination.GAME;
        return userGesture && https(value) != null ? Destination.BROWSER : Destination.BLOCK;
    }
    /** A fresh GET to a known screen, never reload/replay a POST or API command. */
    public static String recovery(String value) {
        if (!isGame(value)) return HOME;
        String path = https(value).getPath();
        if (path == null) return HOME;
        if (path.matches("/(login|register|rules)?")
                || path.matches("/game/(home|quests|battle|armory|land|profile|army|vault|settings|champions|tutorial|achievements|bounties)")
                || path.equals("/game/bounties/new")
                || path.matches("/game/(players|battles|purchases)/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}")) return value;
        return HOME;
    }
    public static boolean isAuthentication(String value) {
        if (!isGame(value)) return false;
        String path = https(value).getPath();
        return "/login".equals(path) || "/register".equals(path);
    }
}
