package top.rootu.lampa

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.webkit.JavascriptInterface
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.ServerSocket
import java.net.URL
import java.util.concurrent.Executors

/** Owns only the child process started by this application. No killall or root. */
class EmbeddedTorrentService : Service() {
    private val worker = Executors.newSingleThreadExecutor()
    @Volatile private var child: Process? = null
    @Volatile private var closing = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= 26) {
            getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel("cinemahall_playback", "Просмотр CinemaHall", NotificationManager.IMPORTANCE_LOW)
            )
        }
        val notification = NotificationCompat.Builder(this, "cinemahall_playback")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("CinemaHall")
            .setContentText("Торрентный движок работает во время просмотра")
            .setOngoing(true).build()
        startForeground(7310, notification)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        synchronized(EmbeddedTorrentState) {
            if (EmbeddedTorrentState.state == "ready" || EmbeddedTorrentState.state == "starting") return START_NOT_STICKY
            EmbeddedTorrentState.state = "starting"
            EmbeddedTorrentState.error = ""
        }
        worker.execute {
            try {
                val binary = File(applicationInfo.nativeLibraryDir, "libtorrserver.so")
                check(binary.isFile && binary.canExecute()) { "В APK отсутствует торрентный движок для этой архитектуры" }
                val port = ServerSocket(0).use { it.localPort }
                val directory = File(filesDir, "cinemahall-torrserver").apply { mkdirs() }
                val process = ProcessBuilder(binary.absolutePath, "--ip", "127.0.0.1", "--port", port.toString(), "--path", directory.absolutePath)
                    .redirectErrorStream(true)
                    .apply { environment()["GODEBUG"] = "madvdontneed=1" }
                    .start()
                child = process
                // Drain output without keeping an unbounded log or leaking torrent URLs.
                Thread { try { process.inputStream.bufferedReader().useLines { it.forEach { _ -> } } } catch (_: Exception) {} }.apply { isDaemon = true; start() }
                val endpoint = "http://127.0.0.1:$port"
                val deadline = System.currentTimeMillis() + 12000
                var ready = false
                while (!closing && System.currentTimeMillis() < deadline) {
                    try {
                        process.exitValue()
                        error("Торрентный движок завершился при запуске")
                    } catch (_: IllegalThreadStateException) { /* Still running. */ }
                    try {
                        val connection = URL("$endpoint/echo").openConnection() as HttpURLConnection
                        connection.connectTimeout = 400
                        connection.readTimeout = 400
                        try { ready = connection.responseCode == 200 } finally { connection.disconnect() }
                    } catch (_: Exception) {}
                    if (ready) break
                    Thread.sleep(150)
                }
                check(ready && !closing) { "Торрентный движок не ответил вовремя" }
                // Configure cache once, while the engine has no active torrent.
                val getSettings = URL("$endpoint/settings").openConnection() as HttpURLConnection
                getSettings.requestMethod = "POST"
                getSettings.connectTimeout = 1000
                getSettings.readTimeout = 1000
                getSettings.doOutput = true
                getSettings.setRequestProperty("Content-Type", "application/json")
                val current = try {
                    getSettings.outputStream.use { it.write("{\"action\":\"get\"}".toByteArray()) }
                    JSONObject(getSettings.inputStream.bufferedReader().use { it.readText() })
                } finally { getSettings.disconnect() }
                current.put("CacheSize", 64)
                val settings = URL("$endpoint/settings").openConnection() as HttpURLConnection
                settings.requestMethod = "POST"
                settings.connectTimeout = 1000
                settings.readTimeout = 1000
                settings.doOutput = true
                settings.setRequestProperty("Content-Type", "application/json")
                try {
                    val body = JSONObject().put("action", "set").put("sets", current).toString()
                    settings.outputStream.use { it.write(body.toByteArray()) }
                    check(settings.responseCode in 200..299) { "Не удалось настроить кэш торрентного движка" }
                } finally { settings.disconnect() }
                EmbeddedTorrentState.url = endpoint
                EmbeddedTorrentState.state = "ready"
                process.waitFor()
                if (!closing) {
                    EmbeddedTorrentState.error = "Торрентный движок остановлен системой. Повтори запуск."
                    EmbeddedTorrentState.state = "error"
                }
                stopSelf()
            } catch (e: Exception) {
                if (!closing) {
                    EmbeddedTorrentState.error = e.message ?: "Ошибка запуска торрентного движка"
                    EmbeddedTorrentState.state = "error"
                }
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        closing = true
        child?.destroy()
        child = null
        worker.shutdownNow()
        EmbeddedTorrentState.url = ""
        if (EmbeddedTorrentState.state != "error") EmbeddedTorrentState.state = "stopped"
        super.onDestroy()
    }
}

private object EmbeddedTorrentState {
    @Volatile var state = "stopped"
    @Volatile var url = ""
    @Volatile var error = ""
}

/** Deliberately small bridge: it cannot run arbitrary commands or accept a URL. */
class CinemaHallNative(context: Context) {
    private val context = context.applicationContext

    @JavascriptInterface fun startTorrentEngine() {
        val intent = Intent(context, EmbeddedTorrentService::class.java)
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
    }

    @JavascriptInterface fun torrentState(): String = JSONObject().apply {
        put("state", EmbeddedTorrentState.state)
        put("url", if (EmbeddedTorrentState.state == "ready") EmbeddedTorrentState.url else "")
        put("error", EmbeddedTorrentState.error)
    }.toString()

    @JavascriptInterface fun stopTorrentEngine() {
        context.stopService(Intent(context, EmbeddedTorrentService::class.java))
    }
}
