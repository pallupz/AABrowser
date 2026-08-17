package com.kododake.aabrowser.web

import android.content.Context
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

object YouTubeAdBlocker {

    private const val SCRIPT_ASSET = "youtube_adblock.js"

    private val ALLOWED_ORIGINS = setOf(
        "https://youtube.com",
        "https://www.youtube.com",
        "https://m.youtube.com",
        "https://music.youtube.com",
        "https://www.youtube-nocookie.com"
    )

    @Volatile
    private var cachedScript: String? = null

    fun install(webView: WebView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
        val script = loadScript(webView.context) ?: return
        WebViewCompat.addDocumentStartJavaScript(webView, script, ALLOWED_ORIGINS)
    }

    private fun loadScript(context: Context): String? =
        cachedScript ?: runCatching {
            context.assets.open(SCRIPT_ASSET).bufferedReader().use { it.readText() }
        }.getOrNull()?.also { cachedScript = it }
}
