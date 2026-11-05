package game.kingdomcome.rpg;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.CookieManager;
/** Shared by the production Activity and the isolated real-WebView test. */
public final class WebViewSecurity {
 private WebViewSecurity() {}
 @android.annotation.SuppressLint("SetJavaScriptEnabled")
 public static void configure(WebView web) {
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings settings = web.getSettings();
        settings.setTextZoom(Math.round(web.getResources().getConfiguration().fontScale * 100));
        settings.setJavaScriptEnabled(true); // Existing HTTPS game enhancements, never a native bridge.
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
 }
}
