package dev.treaple.rokidclaude

import android.content.Context
import android.content.Intent
import java.util.UUID

/**
 * Настройки приложения. Клавиатуры на очках нет, поэтому всё, что нужно ввести
 * руками, приходит через extras запуска:
 *
 * adb shell am start -n dev.treaple.rokidclaude/.MainActivity \
 *   -e bridgeUrl https://bridge.example.com -e token СЕКРЕТ
 */
class Settings(context: Context) {

    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    var bridgeUrl: String
        get() = prefs.getString(KEY_URL, "").orEmpty()
        set(value) = prefs.edit().putString(KEY_URL, value.trim().trimEnd('/')).apply()

    var token: String
        get() = prefs.getString(KEY_TOKEN, "").orEmpty()
        set(value) = prefs.edit().putString(KEY_TOKEN, value.trim()).apply()

    var language: String
        get() = prefs.getString(KEY_LANG, DEFAULT_LANG) ?: DEFAULT_LANG
        set(value) = prefs.edit().putString(KEY_LANG, value.trim()).apply()

    /** Идентификатор диалога: мост держит по нему историю. Живёт до переустановки. */
    val sessionId: String
        get() = prefs.getString(KEY_SESSION, null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString(KEY_SESSION, it).apply()
        }

    val isConfigured: Boolean
        get() = bridgeUrl.isNotBlank()

    /** Забирает настройки из extras. Возвращает true, если что-то поменялось. */
    fun applyIntentExtras(intent: Intent?): Boolean {
        var changed = false
        intent?.getStringExtra("bridgeUrl")?.let { bridgeUrl = it; changed = true }
        intent?.getStringExtra("token")?.let { token = it; changed = true }
        intent?.getStringExtra("lang")?.let { language = it; changed = true }
        return changed
    }

    private companion object {
        const val PREFS = "rokid-claude"
        const val KEY_URL = "bridge_url"
        const val KEY_TOKEN = "token"
        const val KEY_LANG = "language"
        const val KEY_SESSION = "session_id"
        const val DEFAULT_LANG = "ru-RU"
    }
}
