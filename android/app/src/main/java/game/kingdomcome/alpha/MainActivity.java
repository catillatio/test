package game.kingdomcome.alpha;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.util.Collections;

/** One platform WebView. No JavaScript bridge, native login or client-side game rules. */
public final class MainActivity extends Activity {
    private WebView web;
    private ProgressBar progress;
    private ScrollView notice;
    private TextView title;
    private TextView help;
    private Button retry;
    private Button home;
    private boolean failed;
    private String recovery = NavigationPolicy.HOME;
    private android.window.OnBackInvokedCallback backCallback;

    @android.annotation.SuppressLint("SetJavaScriptEnabled")
    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(20, 19, 16));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
                return WindowInsets.CONSUMED;
            });
        }
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(20, 19, 16));
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); // Existing HTTPS game enhancements, never a native bridge.
        settings.setDomStorageEnabled(true);
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
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) {
                progress.setProgress(value);
            }
            @Override public boolean onConsoleMessage(android.webkit.ConsoleMessage message) {
                return true; // Do not relay page content, URLs or credentials into app logs.
            }
        });
        web.setWebViewClient(new GameClient());
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        root.addView(progress, new FrameLayout.LayoutParams(-1, dp(3), Gravity.TOP));
        createNotice(root);
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = this::navigateBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0, backCallback);
        }
        if (saved != null) recovery = NavigationPolicy.recovery(saved.getString("recovery"));
        String incoming = getIntent().getDataString();
        if (incoming != null && NavigationPolicy.isGame(incoming)) {
            recovery = NavigationPolicy.recovery(incoming);
            web.loadUrl(incoming);
        } else if (saved != null) {
            // Restore a safe page with a fresh GET; never persist or replay form bodies.
            web.loadUrl(recovery);
        } else web.loadUrl(NavigationPolicy.ORIGIN + "/");
    }

    private void createNotice(FrameLayout root) {
        notice = new ScrollView(this);
        notice.setFillViewport(true);
        notice.setBackgroundColor(Color.rgb(20, 19, 16));
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);
        content.setPadding(dp(24), dp(20), dp(24), dp(20));
        notice.addView(content, new ScrollView.LayoutParams(-1, -2));
        ImageView crest = new ImageView(this);
        crest.setImageResource(R.drawable.kingdom_crest);
        crest.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        content.addView(crest, new LinearLayout.LayoutParams(dp(88), dp(88)));
        title = new TextView(this);
        title.setTextColor(Color.rgb(232, 208, 151));
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER);
        title.setText(R.string.app_name);
        content.addView(title);
        help = new TextView(this);
        help.setTextColor(Color.rgb(225, 222, 214));
        help.setTextSize(16);
        help.setGravity(Gravity.CENTER);
        help.setPadding(0, dp(16), 0, dp(16));
        help.setText(R.string.loading);
        help.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        content.addView(help);
        retry = new Button(this);
        retry.setText(R.string.retry);
        retry.setMinHeight(dp(48));
        retry.setOnClickListener(view -> web.loadUrl(NavigationPolicy.recovery(recovery)));
        content.addView(retry, new LinearLayout.LayoutParams(-1, -2));
        home = new Button(this);
        home.setText(R.string.home);
        home.setMinHeight(dp(48));
        home.setOnClickListener(view -> web.loadUrl(NavigationPolicy.HOME));
        content.addView(home, new LinearLayout.LayoutParams(-1, -2));
        retry.setVisibility(View.GONE);
        home.setVisibility(View.GONE);
        root.addView(notice, new FrameLayout.LayoutParams(-1, -1));
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void showError(int text) {
        failed = true;
        progress.setVisibility(View.GONE);
        title.setText(R.string.unavailable);
        help.setText(text);
        retry.setVisibility(View.VISIBLE);
        home.setVisibility(View.VISIBLE);
        notice.setVisibility(View.VISIBLE);
    }
    private void navigateBack() {
        if (web.canGoBack()) { failed = false; notice.setVisibility(View.GONE); web.goBack(); }
        else finish();
    }
    // API 26–32 fallback only; API 33+ uses the registered platform callback.
    @android.annotation.SuppressLint("GestureBackNavigation")
    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() { navigateBack(); }
    @Override protected void onSaveInstanceState(Bundle out) {
        out.putString("recovery", recovery);
        super.onSaveInstanceState(out);
    }
    @Override protected void onPause() {
        CookieManager.getInstance().flush();
        web.onPause();
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }
    @Override protected void onDestroy() {
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        }
        web.stopLoading();
        web.destroy();
        super.onDestroy();
    }
    private void external(String url) {
        new AlertDialog.Builder(this).setTitle(R.string.external_title).setMessage(R.string.external_help)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.open_browser, (dialog, which) -> {
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)); }
                catch (ActivityNotFoundException exception) { Toast.makeText(this, R.string.browser_missing, Toast.LENGTH_LONG).show(); }
            }).show();
    }
    private final class GameClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String url = request.getUrl().toString();
            if (NavigationPolicy.isGame(url)) return false;
            if (request.isForMainFrame() && NavigationPolicy.destination(url, request.hasGesture()) == NavigationPolicy.Destination.BROWSER) external(url);
            else if (request.isForMainFrame()) Toast.makeText(MainActivity.this, R.string.blocked, Toast.LENGTH_SHORT).show();
            return true;
        }
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            if (NavigationPolicy.isGame(request.getUrl().toString())) return null;
            // Also blocks foreign POSTs/subresources, which navigation callbacks may not cover.
            return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
        }
        @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            failed = false;
            progress.setProgress(0);
            progress.setVisibility(View.VISIBLE);
        }
        @Override public void onPageFinished(WebView view, String url) {
            progress.setVisibility(View.GONE);
            if (!failed && NavigationPolicy.isGame(url)) {
                recovery = NavigationPolicy.recovery(url);
                if (NavigationPolicy.isAuthentication(url)) view.clearHistory();
                notice.setVisibility(View.GONE);
                CookieManager.getInstance().flush();
            }
        }
        @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) showError(R.string.connection_help);
        }
        @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            if (request.isForMainFrame() && response.getStatusCode() >= 500) showError(R.string.connection_help);
        }
        @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel();
            showError(R.string.security_help);
        }
        @Override public void onFormResubmission(WebView view, Message dontResend, Message resend) {
            dontResend.sendToTarget();
            showError(R.string.resubmit_help);
        }
    }
}
