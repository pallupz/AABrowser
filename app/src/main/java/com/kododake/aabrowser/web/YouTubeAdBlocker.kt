package com.kododake.aabrowser.web

import android.content.Context
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.util.concurrent.ConcurrentHashMap

object YouTubeAdBlocker {

    private val SCRIPT_ASSETS = listOf("youtube_adblock.js", "sponsorblock.js")

    private val ALLOWED_ORIGINS = setOf(
        "https://youtube.com",
        "https://www.youtube.com",
        "https://m.youtube.com",
        "https://music.youtube.com",
        "https://www.youtube-nocookie.com"
    )

    private val scriptCache = ConcurrentHashMap<String, String>()

    fun install(webView: WebView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
        SCRIPT_ASSETS.forEach { asset ->
            loadScript(webView.context, asset)?.let { script ->
                WebViewCompat.addDocumentStartJavaScript(webView, script, ALLOWED_ORIGINS)
            }
        }
    }

    private fun loadScript(context: Context, asset: String): String? =
        scriptCache[asset] ?: runCatching {
            context.assets.open(asset).bufferedReader().use { it.readText() }
        }.getOrNull()?.also { scriptCache[asset] = it }
}
