package com.theapexhouse.portal;

import android.app.Activity;
import android.app.AlertDialog;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public final class PortalActivity extends Activity {
    private static final String HOST = "tah-private-mentorship.vercel.app";
    private WebView portal;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        WebView.setWebContentsDebuggingEnabled(false);
        portal = new WebView(this);
        WebSettings settings = portal.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        portal.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                Uri origin = Uri.parse(url == null ? "" : url);
                if (!"https".equals(origin.getScheme()) || !HOST.equals(origin.getHost())
                        || isFinishing() || isDestroyed()) {
                    result.cancel();
                    return true;
                }
                AlertDialog dialog = new AlertDialog.Builder(PortalActivity.this)
                        .setTitle(getString(R.string.app_name))
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, (prompt, button) -> result.confirm())
                        .setNegativeButton(android.R.string.cancel, (prompt, button) -> result.cancel())
                        .setOnCancelListener(prompt -> result.cancel())
                        .create();
                dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                dialog.show();
                return true;
            }
        });
        portal.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri url = request.getUrl();
                return !"https".equals(url.getScheme()) || !HOST.equals(url.getHost());
            }
        });
        PortalUpdates updates = new PortalUpdates(this);
        android.widget.LinearLayout layout = new android.widget.LinearLayout(this);
        layout.setOrientation(android.widget.LinearLayout.VERTICAL);
        android.widget.Button update = new android.widget.Button(this);
        update.setText("Check for updates");
        update.setOnClickListener(button -> updates.check(true));
        layout.addView(update);
        layout.addView(portal, new android.widget.LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(layout);
        updates.check(false);
        portal.loadUrl("https://" + HOST + getString(R.string.portal_path));
    }

    @Override public void onBackPressed() {
        if (portal.canGoBack()) portal.goBack();
        else super.onBackPressed();
    }
}
