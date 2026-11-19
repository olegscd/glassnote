package com.yumpzy.glassnote

import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.WindowCompat
import androidx.webkit.WebViewAssetLoader
import java.io.File
import java.io.FileOutputStream

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val filePicker = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val cb = fileCallback
        fileCallback = null
        if (cb == null) return@registerForActivityResult
        if (result.resultCode != RESULT_OK || result.data == null) {
            cb.onReceiveValue(null)
            return@registerForActivityResult
        }
        val data = result.data!!
        val clip = data.clipData
        val uris = if (clip != null) {
            Array(clip.itemCount) { i -> clip.getItemAt(i).uri }
        } else {
            data.data?.let { arrayOf(it) }
        }
        cb.onReceiveValue(uris)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                useWideViewPort = true
                loadWithOverviewMode = true
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            }
            overScrollMode = WebView.OVER_SCROLL_NEVER
            addJavascriptInterface(AndroidBridge(), "GlassnoteAndroid")

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

                override fun onPageFinished(view: WebView, url: String) {
                    // Intercept blob: <a download> clicks so Glassnote exports save to Downloads/Glassnote
                    view.evaluateJavascript(
                        """
                        (function(){
                          if (window.__gnAndroidHook) return;
                          window.__gnAndroidHook = true;
                          const origClick = HTMLAnchorElement.prototype.click;
                          HTMLAnchorElement.prototype.click = function() {
                            if (this.download && this.href && this.href.startsWith('blob:') && window.GlassnoteAndroid) {
                              const name = this.download, href = this.href;
                              fetch(href).then(r => r.blob()).then(b => {
                                const fr = new FileReader();
                                fr.onload = () => {
                                  const b64 = String(fr.result || '').split(',')[1] || '';
                                  window.GlassnoteAndroid.saveFile(name, b64, b.type || 'application/octet-stream');
                                };
                                fr.readAsDataURL(b);
                              }).catch(() => origClick.call(this));
                              return;
                            }
                            return origClick.call(this);
                          };
                        })();
                        """.trimIndent(),
                        null
                    )
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?
                ): Boolean {
                    fileCallback?.onReceiveValue(null)
                    fileCallback = filePathCallback
                    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        val types = fileChooserParams?.acceptTypes?.filter { it.isNotBlank() }.orEmpty()
                        type = if (types.size == 1 && types[0].contains("/")) types[0] else "*/*"
                        if (types.size > 1) {
                            putExtra(Intent.EXTRA_MIME_TYPES, types.toTypedArray())
                        }
                        if (fileChooserParams?.mode == FileChooserParams.MODE_OPEN_MULTIPLE) {
                            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                        }
                    }
                    return try {
                        filePicker.launch(intent)
                        true
                    } catch (_: Exception) {
                        fileCallback?.onReceiveValue(null)
                        fileCallback = null
                        false
                    }
                }
            }
        }

        setContentView(webView)
        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript(
                    """
                    (function(){
                      const scrim = document.getElementById('scrim');
                      if (scrim && scrim.classList.contains('open')) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return 'handled'; }
                      const menu = document.getElementById('menu');
                      if (menu && menu.classList.contains('open')) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return 'handled'; }
                      const back = document.getElementById('backBtn');
                      const ed = document.getElementById('editor');
                      if (ed && !ed.classList.contains('hidden') && back) { back.click(); return 'handled'; }
                      return 'exit';
                    })();
                    """.trimIndent()
                ) { res ->
                    if (res == "\"exit\"") {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        })
    }

    override fun onPause() {
        super.onPause()
        webView.evaluateJavascript("try{if(typeof save==='function')save(true);}catch(e){}", null)
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun saveFile(name: String, base64Data: String, mimeType: String) {
            try {
                val bytes = Base64.decode(base64Data, Base64.DEFAULT)
                val safe = name.replace(Regex("[^a-zA-Z0-9._-]"), "_").ifBlank { "glassnote-export" }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, safe)
                        put(MediaStore.Downloads.MIME_TYPE, mimeType.ifBlank { "application/octet-stream" })
                        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Glassnote")
                    }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                        ?: throw IllegalStateException("Could not create download entry")
                    contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                } else {
                    @Suppress("DEPRECATION")
                    val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Glassnote")
                    dir.mkdirs()
                    FileOutputStream(File(dir, safe)).use { it.write(bytes) }
                }
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "Saved to Downloads/Glassnote/$safe", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "Save failed: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }
}
