package game.kingdomcome.rpg;
import android.app.Instrumentation;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.CookieManager;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.util.Collections;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
/** Actual emulator/platform WebView checks. All requests intercepted; no game traffic. */
public final class ShellInstrumentation extends Instrumentation {
 private static final String FIXTURE="<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head><body><h1>Isolated WebView</h1><form><label>Account <input id='name' autocomplete='username'></label><button>Continue</button></form></body></html>";
 @Override public void onCreate(Bundle args){super.onCreate(args);start();}
 private static void check(boolean value){if(!value)throw new AssertionError("SHELL_CHECK_FAILED");}
 @Override public void onStart(){
  Activity activity=null;Bundle result=new Bundle();
  result.putString("class",getClass().getName());result.putString("test","platformWebView");result.putInt("numtests",1);result.putInt("current",1);sendStatus(1,result);
  try {
   // Instrumentation deliberately does not start MainActivity: its origin is production.
   // An isolated activity exercises the real platform without any release origin override.
   Intent intent=new Intent(getTargetContext(),FixtureActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
   activity=startActivitySync(intent);
   final Activity active=activity;final CountDownLatch loaded=new CountDownLatch(1);
   runOnMainSync(()->{
    WebView web=new WebView(active);((ViewGroup)active.findViewById(android.R.id.content)).addView(web);
    WebViewSecurity.configure(web);WebSettings settings=web.getSettings();
    web.setWebViewClient(new WebViewClient(){
      @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest request){return new WebResourceResponse("text/html","UTF-8",200,"OK",Collections.emptyMap(),new ByteArrayInputStream(FIXTURE.getBytes(java.nio.charset.StandardCharsets.UTF_8)));}
      @Override public void onPageFinished(WebView v,String url){loaded.countDown();}
    });
    web.loadUrl("https://isolated.invalid/fixture");
    check(settings.getTextZoom()==Math.round(web.getResources().getConfiguration().fontScale*100));
    check(!settings.getAllowFileAccess()&&!settings.getAllowContentAccess());
    check(settings.getMixedContentMode()==WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    check(!CookieManager.getInstance().acceptThirdPartyCookies(web));
   });
   check(loaded.await(30,TimeUnit.SECONDS));
   check(NavigationPolicy.isGame(NavigationPolicy.HOME));
   check(NavigationPolicy.recovery(NavigationPolicy.ORIGIN+"/account-deletion/requests").equals(NavigationPolicy.HOME));
   result.putString("stream","ANDROID_WEBVIEW: PASS — intercepted synthetic fixture; no production requests; limited platform smoke, not full gameplay/device certification\n");
   sendStatus(0,result);finish(Activity.RESULT_OK,result);
  }catch(Throwable failure){result.putString("stream","ANDROID_WEBVIEW: FAIL\n");sendStatus(-2,result);finish(Activity.RESULT_CANCELED,result);}
  finally{if(activity!=null){final Activity last=activity;runOnMainSync(last::finish);}}
 }
}
