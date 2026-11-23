package com.theapexhouse.portal;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.view.WindowManager;
import androidx.core.content.FileProvider;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

final class PortalUpdates {
    private static final String REPO = "Arsalanhussain0/TAH---PRIVATE-MENTORSHIP";
    private static final String PREFIX = "tah-android-v";
    private final Activity activity;
    private boolean busy;
    private File verifiedApk;

    PortalUpdates(Activity activity) { this.activity = activity; }

    void check(boolean manual) {
        if (busy) return;
        if (verifiedApk != null && verifiedApk.isFile()) {
            install();
            return;
        }
        busy = true;
        new Thread(() -> {
            File download = null;
            try {
                long installed = activity.getPackageManager()
                        .getPackageInfo(activity.getPackageName(), 0).versionCode;
                JSONArray releases = new JSONArray(new String(
                        readMetadata(), StandardCharsets.UTF_8));
                String profile = activity.getPackageName().endsWith(".admin") ? "Admin" : "Student";
                String filename = "TAH-" + profile + "-Android-Live.apk";
                JSONObject selected = null;
                String selectedTag = null;
                long best = installed;
                for (int i = 0; i < releases.length(); i++) {
                    JSONObject release = releases.getJSONObject(i);
                    String tag = release.optString("tag_name");
                    if (!tag.matches(PREFIX + "[0-9]{1,9}") || release.optBoolean("draft")
                            || release.optBoolean("prerelease")) continue;
                    long version = Long.parseLong(tag.substring(PREFIX.length()));
                    if (version <= best) continue;
                    JSONArray assets = release.optJSONArray("assets");
                    if (assets == null) continue;
                    for (int j = 0; j < assets.length(); j++) {
                        JSONObject asset = assets.getJSONObject(j);
                        if (!filename.equals(asset.optString("name"))) continue;
                        selected = asset;
                        selectedTag = tag;
                        best = version;
                        break;
                    }
                }
                if (selected == null) {
                    if (manual) show("TAH is up to date.");
                    return;
                }
                String digest = selected.optString("digest");
                long size = selected.optLong("size");
                if (!digest.matches("sha256:[a-fA-F0-9]{64}") || size <= 0 || size > 100_000_000)
                    throw new IllegalStateException("Missing release verification.");
                File folder = new File(activity.getCacheDir(), "updates");
                if (!folder.isDirectory() && !folder.mkdirs()) throw new IllegalStateException("Cache unavailable.");
                download = new File(folder, filename);
                verifyDownload("https://github.com/" + REPO + "/releases/download/"
                        + selectedTag + "/" + filename, download, size, digest.substring(7));
                android.content.pm.PackageInfo apk = activity.getPackageManager()
                        .getPackageArchiveInfo(download.getPath(), 0);
                if (apk == null || !activity.getPackageName().equals(apk.packageName)
                        || apk.versionCode != best) throw new IllegalStateException("Wrong APK.");
                File ready = download;
                download = null;
                activity.runOnUiThread(() -> {
                    verifiedApk = ready;
                    if (!activity.isFinishing() && !activity.isDestroyed()) {
                        secureDialog(new AlertDialog.Builder(activity).setTitle("TAH update")
                                .setMessage("A verified update is ready.")
                                .setPositiveButton("Install", (d, w) -> install())
                                .setNegativeButton("Later", null));
                    }
                });
            } catch (Exception error) {
                if (manual) show("Could not verify the update. Try again later.");
            } finally {
                if (download != null) download.delete();
                activity.runOnUiThread(() -> busy = false);
            }
        }, "tah-update").start();
    }

    private byte[] readMetadata() throws Exception {
        HttpURLConnection connection = open("https://api.github.com/repos/" + REPO + "/releases?per_page=50");
        try (InputStream in = connection.getInputStream();
             java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = in.read(buffer)) != -1) {
                if (out.size() + count > 2_000_000) throw new IllegalStateException("Release response too large.");
                out.write(buffer, 0, count);
            }
            return out.toByteArray();
        } finally { connection.disconnect(); }
    }

    private static HttpURLConnection open(String address) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(20000);
        connection.setRequestProperty("User-Agent", "TAH-Android-Updater");
        return connection;
    }

    private static void verifyDownload(String address, File file, long size, String expected) throws Exception {
        HttpURLConnection connection = open(address);
        MessageDigest hash = MessageDigest.getInstance("SHA-256");
        long total = 0;
        try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(file)) {
            byte[] buffer = new byte[32768];
            int count;
            while ((count = in.read(buffer)) != -1) {
                total += count;
                if (total > size) throw new IllegalStateException("APK is larger than expected.");
                hash.update(buffer, 0, count);
                out.write(buffer, 0, count);
            }
        } finally { connection.disconnect(); }
        StringBuilder hex = new StringBuilder();
        for (byte value : hash.digest()) hex.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        if (total != size || !expected.equalsIgnoreCase(hex.toString()))
            throw new IllegalStateException("APK verification failed.");
    }

    private void install() {
        if (!activity.getPackageManager().canRequestPackageInstalls()) {
            secureDialog(new AlertDialog.Builder(activity).setTitle("Allow TAH updates")
                    .setMessage("Allow installs from TAH in Android Settings, then return and tap Check for updates.")
                    .setPositiveButton("Open Settings", (d, w) -> activity.startActivity(
                            new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                    Uri.parse("package:" + activity.getPackageName()))))
                    .setNegativeButton("Cancel", null));
            return;
        }
        Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".updates", verifiedApk);
        Intent install = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try { activity.startActivity(install); }
        catch (android.content.ActivityNotFoundException error) { show("Android installer is unavailable."); }
    }

    private void secureDialog(AlertDialog.Builder builder) {
        AlertDialog dialog = builder.create();
        dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        dialog.show();
    }

    private void show(String message) {
        activity.runOnUiThread(() -> {
            if (!activity.isFinishing() && !activity.isDestroyed())
                android.widget.Toast.makeText(activity, message, android.widget.Toast.LENGTH_LONG).show();
        });
    }
}
