package com.tabent2020.rafeeqalhatif;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * تطبيق «رفيق الهاتف» للأندرويد
 * المصمم: عمر الطابوني (Tabent2020@gmail.com)
 */
public class MainActivity extends Activity {

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new NativeBridge(), "RafeeqNativeAndroid");

        // يعمل فوراً بدون إنترنت من النسخة المدمجة، أو يمكن توجيهه لرابط Render
        webView.loadUrl("file:///android_asset/index.html");
    }

    public class NativeBridge {
        @JavascriptInterface
        public String getDeviceManufacturer() {
            return Build.MANUFACTURER + " " + Build.MODEL;
        }

        @JavascriptInterface
        public void openAndroidSetting(String action) {
            try {
                Intent intent;
                if (action != null && action.startsWith("market://")) {
                    intent = new Intent(Intent.ACTION_VIEW, Uri.parse(action));
                } else if (action != null && action.startsWith("com.")) {
                    intent = getPackageManager().getLaunchIntentForPackage(action);
                    if (intent == null) {
                        intent = new Intent(Settings.ACTION_APPLICATION_SETTINGS);
                    }
                } else if (action != null && !action.isEmpty()) {
                    intent = new Intent(action);
                } else {
                    intent = new Intent(Settings.ACTION_SETTINGS);
                }
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Exception e) {
                try {
                    Intent fallback = new Intent(Settings.ACTION_SETTINGS);
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(fallback);
                } catch (Exception ignored) {}
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
