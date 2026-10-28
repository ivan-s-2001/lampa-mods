#!/usr/bin/env python3
"""Overlay a pinned Lampa checkout. Does not publish, sign or install anything."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
HOST = 'https://appassets.androidplatform.net'
START = HOST + '/assets/lampa/index.html'


def replace(text, old, new, count=1):
    if text.count(old) != count:
        raise ValueError(f'Upstream anchor changed: {old[:100]!r}; expected {count}')
    return text.replace(old, new)


def prepare(shell, web, binary, abi):
    pins = json.loads((ROOT / 'android/upstream.json').read_text())
    expected = pins['torrserver']['assets'][abi]['sha256']
    if hashlib.sha256(binary.read_bytes()).hexdigest() != expected:
        raise ValueError('TorrServer SHA-256 mismatch')
    app = shell / 'app'
    gradle = (app / 'build.gradle').read_text()
    gradle = replace(gradle, 'applicationId "top.rootu.lampa"', 'applicationId "ru.cinemahall.lampa"')
    gradle = replace(gradle, 'minSdkVersion 16', 'minSdkVersion 26')
    gradle = replace(gradle, 'buildConfigField "String", "defaultAppUrl", "\\"\\""', f'buildConfigField "String", "defaultAppUrl", "\\"{START}\\""', 2)
    gradle = replace(gradle, 'buildConfigField "boolean", "enableUpdate", "true"', 'buildConfigField "boolean", "enableUpdate", "false"')
    gradle += f'''\nandroid {{
    defaultConfig {{ ndk {{ abiFilters '{abi}' }} }}
    packagingOptions {{ jniLibs {{ useLegacyPackaging true; keepDebugSymbols += ['**/libtorrserver.so'] }} }}
}}\n'''
    (app / 'build.gradle').write_text(gradle)
    manifest = app / 'src/main/AndroidManifest.xml'
    text = manifest.read_text()
    text = replace(text, '<application\n', '<application\n        android:extractNativeLibs="true"\n')
    text = replace(text, 'android:label="@string/app_name"', 'android:label="CinemaHall"')
    text = replace(text, '</application>', '<service android:name=".EmbeddedTorrentService" android:exported="false" android:foregroundServiceType="dataSync" />\n    </application>')
    manifest.write_text(text)
    java = app / 'src/main/java/top/rootu/lampa'
    activity = java / 'MainActivity.kt'
    text = activity.read_text()
    text = replace(text, 'addJavascriptInterface(AndroidJS(this@MainActivity, this), "AndroidJS")', 'addJavascriptInterface(AndroidJS(this@MainActivity, this), "AndroidJS")\n            addJavascriptInterface(CinemaHallNative(this@MainActivity), "CinemaHallNative")')
    text = replace(text, 'SELECTED_BROWSER = appBrowser', 'SELECTED_BROWSER = "SysView"')
    # Service survives a temporary visit to an external video player, then is stopped on real teardown.
    text = replace(text, 'super.onDestroy()', 'if (!isChangingConfigurations) stopService(Intent(this, EmbeddedTorrentService::class.java))\n        super.onDestroy()')
    activity.write_text(text)
    shutil.copyfile(ROOT / 'android/overlay/EmbeddedTorrentService.kt', java / 'EmbeddedTorrentService.kt')
    sysview = java / 'browser/SysView.kt'
    text = sysview.read_text()
    text = replace(text, 'import android.webkit.WebView\n', 'import android.webkit.WebView\nimport android.webkit.WebResourceResponse\nimport androidx.webkit.WebViewAssetLoader\n')
    text = replace(text, 'browser?.webViewClient = object : WebViewClientCompat() {', '''val assets = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(mainActivity))
            .build()
        browser?.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                return assets.shouldInterceptRequest(request.url)
            }
''')
    # Keep the privileged bridge on the packaged origin; external links open the system browser.
    text = replace(text, 'val url = request.url.toString()', '''val url = request.url.toString()
                if ((request.url.scheme == "http" || request.url.scheme == "https") && request.url.host != "appassets.androidplatform.net") {
                    try { mainActivity.startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (_: Exception) {}
                    return true
                }''')
    text = replace(text, 'handler?.proceed() // Ignore SSL certificate errors', 'handler?.cancel() // Never bypass certificate validation in CinemaHall')
    sysview.write_text(text)
    # App IDs in content-provider strings must not collide with an installed official Lampa.
    for resource in (app / 'src/main/res').rglob('*.xml'):
        value = resource.read_text()
        if '<string name="provider_auth"' in value:
            import re
            value = re.sub(r'(<string\s+name="provider_auth"[^>]*>)[^<]*(</string>)', r'\g<1>ru.cinemahall.lampa\2', value)
            resource.write_text(value)
    destination = app / 'src/main/assets/lampa'
    destination.mkdir(parents=True, exist_ok=True)
    for name in ['app.min.js', 'assembly.json', 'css', 'fonts', 'icons', 'img', 'lang', 'sound', 'vender', 'webos', 'index.html']:
        source = web / name
        if not source.exists():
            if name == 'sound': continue
            raise FileNotFoundError(source)
        if source.is_dir(): shutil.copytree(source, destination / name, dirs_exist_ok=True)
        else: shutil.copyfile(source, destination / name)
    for name in ['cinemahall.js', 'cinemahall-look.js']:
        shutil.copyfile(ROOT / name, destination / name)
    index = destination / 'index.html'
    html = index.read_text()
    html = replace(html, 'window.youtube_lazy_load = true', '''window.youtube_lazy_load = true;
        window.lampa_settings = {account_use:false, account_sync:false, socket_use:false, services:false, feed:false, youtube:false, plugins_store:false};''')
    html = replace(html, "putScript('app.min.js?v=' + cache_version, function () {})", "putScript('app.min.js?v=' + cache_version, function () { putScript('cinemahall.js', function () { putScript('cinemahall-look.js', function () {}) }) })")
    index.write_text(html)
    target = app / 'src/main/jniLibs' / abi / 'libtorrserver.so'
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(binary, target)
    target.chmod(0o755)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--shell', type=Path, required=True)
    parser.add_argument('--web', type=Path, required=True)
    parser.add_argument('--binary', type=Path, required=True)
    parser.add_argument('--abi', choices=['arm64-v8a', 'armeabi-v7a'], required=True)
    args = parser.parse_args()
    prepare(args.shell, args.web, args.binary, args.abi)
    print('CinemaHall Android overlay prepared; APK build still required.')
