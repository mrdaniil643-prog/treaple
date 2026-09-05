package dev.treaple.rokidclaude

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import java.util.Locale

/**
 * Распознавание речи системным движком очков.
 * SpeechRecognizer обязан создаваться и вызываться из главного потока.
 */
class VoiceInput(private val context: Context) {

    private var recognizer: SpeechRecognizer? = null
    var isListening: Boolean = false
        private set

    fun isAvailable(): Boolean = SpeechRecognizer.isRecognitionAvailable(context)

    fun start(
        language: String,
        onPartial: (String) -> Unit,
        onResult: (String) -> Unit,
        onError: (String) -> Unit,
    ) {
        stop()
        if (!isAvailable()) {
            onError("на очках нет движка распознавания речи")
            return
        }

        val speech = SpeechRecognizer.createSpeechRecognizer(context)
        recognizer = speech
        isListening = true

        speech.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) = Unit
            override fun onBeginningOfSpeech() = Unit
            override fun onRmsChanged(rmsdB: Float) = Unit
            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() = Unit
            override fun onEvent(eventType: Int, params: Bundle?) = Unit

            override fun onPartialResults(partialResults: Bundle?) {
                partialResults.firstText()?.let(onPartial)
            }

            override fun onResults(results: Bundle?) {
                isListening = false
                val text = results.firstText()
                if (text.isNullOrBlank()) onError("не расслышал") else onResult(text)
            }

            override fun onError(error: Int) {
                isListening = false
                onError(describe(error))
            }
        })

        speech.startListening(
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
            },
        )
    }

    fun stop() {
        isListening = false
        recognizer?.run {
            stopListening()
            cancel()
            destroy()
        }
        recognizer = null
    }

    private fun Bundle?.firstText(): String? =
        this?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim()

    private fun describe(error: Int): String = when (error) {
        SpeechRecognizer.ERROR_AUDIO -> "проблема с микрофоном"
        SpeechRecognizer.ERROR_CLIENT -> "ошибка клиента распознавания"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "нет доступа к микрофону"
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "нет сети для распознавания"
        SpeechRecognizer.ERROR_NO_MATCH -> "не расслышал"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "движок распознавания занят"
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "тишина"
        else -> "ошибка распознавания ($error)"
    }
}

/** Озвучка ответа системным TTS. */
class Speaker(context: Context, private val language: String) {

    private var ready = false
    private var pending: String? = null

    private val tts = TextToSpeech(context) { status ->
        ready = status == TextToSpeech.SUCCESS
        if (ready) {
            applyLanguage()
            pending?.let { speak(it) }
            pending = null
        }
    }

    fun speak(text: String) {
        if (text.isBlank()) return
        if (!ready) {
            // Движок ещё поднимается — озвучим, как только будет готов.
            pending = text
            return
        }
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, UTTERANCE_ID)
    }

    fun stop() {
        pending = null
        if (ready) tts.stop()
    }

    fun shutdown() {
        stop()
        tts.shutdown()
    }

    private fun applyLanguage() {
        val result = tts.setLanguage(Locale.forLanguageTag(language))
        if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
            // Нужного голоса на очках нет — читаем системным, это лучше тишины.
            tts.setLanguage(Locale.getDefault())
        }
    }

    private companion object {
        const val UTTERANCE_ID = "rokid-claude"
    }
}
