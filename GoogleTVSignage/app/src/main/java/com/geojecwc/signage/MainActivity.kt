package com.geojecwc.signage

import android.annotation.SuppressLint
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * 사이니지 웹페이지를 전체 화면으로 띄우는 화면.
 * - 화면이 꺼지지 않게 유지
 * - 영상은 사용자 클릭 없이 자동 재생(소리 포함)
 * - 리모컨 뒤로가기 버튼으로 앱이 닫히지 않게 막음 (키오스크처럼 사용)
 * - 네트워크가 끊기거나 페이지를 못 열면 안내를 띄우고 10초마다 다시 시도
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var statusText: TextView
    private val handler = Handler(Looper.getMainLooper())

    private val retryRunnable = Runnable { loadSignage() }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // 화면 꺼짐 방지
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        webView = findViewById(R.id.signageWebView)
        statusText = findViewById(R.id.statusText)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // 소리 있는 영상을 클릭 없이 자동 재생
            mediaPlaybackRequiresUserGesture = false
            // https 페이지에서 http 자원은 차단 (보안 기본값 유지)
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            loadWithOverviewMode = true
            useWideViewPort = true
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                statusText.visibility = View.GONE
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                // 메인 화면 로드 실패일 때만 안내 + 재시도
                if (request?.isForMainFrame == true) showRetry("연결할 수 없습니다. 잠시 후 다시 시도합니다.")
            }
        }

        loadSignage()
    }

    private fun loadSignage() {
        handler.removeCallbacks(retryRunnable)
        if (!isOnline()) {
            showRetry("네트워크에 연결되어 있지 않습니다. 연결되면 자동으로 표시됩니다.")
            return
        }
        statusText.text = "사이니지를 불러오는 중입니다..."
        statusText.visibility = View.VISIBLE
        webView.loadUrl(BuildConfig.SIGNAGE_URL)
    }

    private fun showRetry(message: String) {
        statusText.text = message
        statusText.visibility = View.VISIBLE
        handler.removeCallbacks(retryRunnable)
        handler.postDelayed(retryRunnable, RETRY_MS)
    }

    private fun isOnline(): Boolean {
        val cm = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    // 리모컨 뒤로가기로 앱이 꺼지지 않게 함 (웹 히스토리도 쌓지 않음)
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) return true
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        handler.removeCallbacks(retryRunnable)
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val RETRY_MS = 10_000L
    }
}
