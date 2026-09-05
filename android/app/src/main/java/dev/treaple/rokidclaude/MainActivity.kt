package dev.treaple.rokidclaude

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Typeface
import android.os.Bundle
import android.util.TypedValue
import android.view.GestureDetector
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.WindowManager
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * Единственный экран приложения на очках.
 *
 * Тап по тачпаду — спросить голосом, свайпы — листать ответ, «назад» — выйти
 * из ответа. Настройки приезжают через extras запуска (клавиатуры на очках нет).
 */
class MainActivity : ComponentActivity() {

    private enum class Stage { IDLE, LISTENING, THINKING, ANSWER }

    private lateinit var settings: Settings
    private lateinit var bridge: BridgeClient
    private lateinit var voice: VoiceInput
    private lateinit var speaker: Speaker
    private lateinit var gestures: GestureDetector

    private lateinit var statusView: TextView
    private lateinit var contentView: TextView
    private lateinit var hintView: TextView

    private var stage = Stage.IDLE
    private var pages: List<HudPage> = emptyList()
    private var pageIndex = 0
    private var request: Job? = null

    private val micPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startListening() else showError("нет доступа к микрофону")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        statusView = findViewById(R.id.status)
        contentView = findViewById(R.id.content)
        hintView = findViewById(R.id.hint)

        // На очках нет «свернуть и вернуться»: экран должен жить, пока живёт сессия.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemBars()

        settings = Settings(this)
        settings.applyIntentExtras(intent)
        bridge = BridgeClient(settings)
        voice = VoiceInput(this)
        speaker = Speaker(this, settings.language)
        gestures = GestureDetector(this, TouchpadListener())

        render()
        handleAskExtra(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (settings.applyIntentExtras(intent)) {
            stage = Stage.IDLE
            render()
        }
        handleAskExtra(intent)
    }

    override fun onPause() {
        super.onPause()
        voice.stop()
        speaker.stop()
        if (stage == Stage.LISTENING) {
            stage = Stage.IDLE
            render()
        }
    }

    override fun onDestroy() {
        request?.cancel()
        voice.stop()
        speaker.shutdown()
        super.onDestroy()
    }

    // --- Ввод -------------------------------------------------------------

    /**
     * Коды клавиш тачпада и кнопок отличаются от прошивки к прошивке.
     * Если жест не срабатывает — смотрите `adb shell getevent -l` и дописывайте
     * код сюда: это единственное место, где они разбираются.
     */
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean = when (keyCode) {
        KeyEvent.KEYCODE_DPAD_CENTER,
        KeyEvent.KEYCODE_ENTER,
        KeyEvent.KEYCODE_SPACE,
        KeyEvent.KEYCODE_BUTTON_A,
        KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
        -> {
            toggleListening()
            true
        }

        KeyEvent.KEYCODE_DPAD_RIGHT,
        KeyEvent.KEYCODE_PAGE_DOWN,
        KeyEvent.KEYCODE_MEDIA_NEXT,
        -> turnPage(+1)

        KeyEvent.KEYCODE_DPAD_LEFT,
        KeyEvent.KEYCODE_PAGE_UP,
        KeyEvent.KEYCODE_MEDIA_PREVIOUS,
        -> turnPage(-1)

        KeyEvent.KEYCODE_BACK -> if (stage == Stage.ANSWER) {
            speaker.stop()
            stage = Stage.IDLE
            render()
            true
        } else {
            super.onKeyDown(keyCode, event)
        }

        else -> super.onKeyDown(keyCode, event)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean =
        gestures.onTouchEvent(event) || super.onTouchEvent(event)

    private inner class TouchpadListener : GestureDetector.SimpleOnGestureListener() {
        override fun onDown(e: MotionEvent): Boolean = true

        override fun onSingleTapUp(e: MotionEvent): Boolean {
            toggleListening()
            return true
        }

        override fun onFling(
            e1: MotionEvent?,
            e2: MotionEvent,
            velocityX: Float,
            velocityY: Float,
        ): Boolean {
            if (kotlin.math.abs(velocityX) < kotlin.math.abs(velocityY)) return false
            return turnPage(if (velocityX < 0) +1 else -1)
        }
    }

    // --- Сценарий ---------------------------------------------------------

    private fun toggleListening() {
        if (voice.isListening) {
            voice.stop()
            stage = Stage.IDLE
            render()
            return
        }
        startListening()
    }

    private fun startListening() {
        speaker.stop()

        if (!settings.isConfigured) {
            stage = Stage.IDLE
            statusView.text = getString(R.string.not_configured)
            contentView.text = SETUP_HINT
            hintView.text = ""
            return
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            micPermission.launch(Manifest.permission.RECORD_AUDIO)
            return
        }

        stage = Stage.LISTENING
        render()

        voice.start(
            language = settings.language,
            onPartial = { partial -> if (stage == Stage.LISTENING) contentView.text = partial },
            onResult = { question -> ask(question) },
            onError = { reason -> showError(reason) },
        )
    }

    private fun handleAskExtra(intent: Intent?) {
        // Способ проверить всё без голоса: adb ... -e ask "вопрос"
        val question = intent?.getStringExtra("ask")?.trim().orEmpty()
        // Снимаем extra, иначе пересоздание активности повторит тот же вопрос.
        intent?.removeExtra("ask")
        if (question.isNotEmpty()) ask(question)
    }

    private fun ask(question: String) {
        request?.cancel()
        stage = Stage.THINKING
        render()
        contentView.text = question

        val streamed = StringBuilder()
        request = lifecycleScope.launch {
            try {
                val answer = bridge.ask(question) { delta ->
                    // Колбэк приходит из IO-потока.
                    streamed.append(delta)
                    val tail = streamed.toString()
                    runOnUiThread {
                        if (stage == Stage.THINKING) contentView.text = tail.takeLast(STREAM_TAIL_CHARS)
                    }
                }
                showAnswer(answer)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                showError(error.message ?: getString(R.string.bridge_unreachable))
                speaker.speak(getString(R.string.bridge_unreachable))
            }
        }
    }

    private fun showAnswer(answer: Answer) {
        pages = Hud.buildPages(answer)
        pageIndex = 0
        stage = Stage.ANSWER
        render()
        statusView.text = "${answer.model} - ${answer.latencyMs} мс"
        speaker.speak(answer.speech)
    }

    private fun showError(reason: String) {
        stage = Stage.IDLE
        statusView.text = reason
        contentView.text = ""
        hintView.text = getString(R.string.status_idle)
    }

    private fun turnPage(delta: Int): Boolean {
        if (stage != Stage.ANSWER || pages.isEmpty()) return false
        val next = (pageIndex + delta).coerceIn(0, pages.size - 1)
        if (next == pageIndex) return true
        pageIndex = next
        render()
        return true
    }

    // --- Отрисовка --------------------------------------------------------

    private fun render() {
        when (stage) {
            Stage.IDLE -> {
                statusView.text = if (settings.isConfigured) {
                    getString(R.string.status_idle)
                } else {
                    getString(R.string.not_configured)
                }
                contentView.text = if (settings.isConfigured) "" else SETUP_HINT
                setContentStyle(isCode = false)
                hintView.text = ""
            }

            Stage.LISTENING -> {
                statusView.text = getString(R.string.status_listening)
                contentView.text = ""
                setContentStyle(isCode = false)
                hintView.text = ""
            }

            Stage.THINKING -> {
                statusView.text = getString(R.string.status_thinking)
                setContentStyle(isCode = false)
                hintView.text = ""
            }

            Stage.ANSWER -> {
                val page = pages.getOrNull(pageIndex) ?: HudPage("", isCode = false)
                contentView.text = page.text
                setContentStyle(page.isCode)
                hintView.text = if (pages.size > 1) {
                    "${pageIndex + 1}/${pages.size} - ${getString(R.string.hint_pages)}"
                } else {
                    getString(R.string.hint_pages)
                }
            }
        }
    }

    private fun setContentStyle(isCode: Boolean) {
        contentView.typeface = if (isCode) Typeface.MONOSPACE else Typeface.SANS_SERIF
        contentView.setTextSize(TypedValue.COMPLEX_UNIT_SP, if (isCode) CODE_TEXT_SP else TEXT_SP)
    }

    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    private companion object {
        const val TEXT_SP = 28f
        const val CODE_TEXT_SP = 18f
        const val STREAM_TAIL_CHARS = 180
        const val SETUP_HINT =
            "adb shell am start -n dev.treaple.rokidclaude/.MainActivity \\\n" +
                "  -e bridgeUrl https://ваш-мост -e token СЕКРЕТ"
    }
}
