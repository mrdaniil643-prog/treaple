package dev.treaple.rokidclaude

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

data class CodeBlock(val lang: String?, val code: String)

/** Разобранный ответ моста: озвучка, полный markdown, строки под HUD и код. */
data class Answer(
    val speech: String,
    val markdown: String,
    val chunks: List<String>,
    val codeBlocks: List<CodeBlock>,
    val model: String,
    val latencyMs: Long,
)

class BridgeException(message: String) : Exception(message)

/**
 * Клиент моста. Ходит в POST /v1/chat/stream и читает SSE:
 *
 *   event: delta\ndata: {"text":"…"}\n\n
 *   event: done\ndata: {"answer":"…","chunks":[…],"codeBlocks":[…]}\n\n
 *   event: error\ndata: {"error":"upstream_error"}\n\n
 *
 * Нарочно на HttpURLConnection: лишние зависимости при сайдлоаде — лишний риск.
 */
class BridgeClient(private val settings: Settings) {

    /**
     * @param onDelta вызывается в IO-потоке на каждый кусок ответа —
     *                в UI его нужно прокидывать через runOnUiThread.
     */
    suspend fun ask(question: String, onDelta: (String) -> Unit): Answer = withContext(Dispatchers.IO) {
        if (!settings.isConfigured) throw BridgeException("не задан адрес моста")

        val connection = (URL("${settings.bridgeUrl}/v1/chat/stream").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Accept", "text/event-stream")
            if (settings.token.isNotBlank()) setRequestProperty("x-webhook-token", settings.token)
        }

        val body = JSONObject()
            .put("text", question)
            .put("sessionId", settings.sessionId)
            .toString()

        try {
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }

            val status = connection.responseCode
            if (status !in 200..299) {
                val detail = connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
                throw BridgeException("HTTP $status ${detail.take(160)}".trim())
            }

            connection.inputStream.bufferedReader().use { readSse(it, onDelta) }
        } finally {
            connection.disconnect()
        }
    }

    private fun readSse(reader: BufferedReader, onDelta: (String) -> Unit): Answer {
        var event = "message"
        val data = StringBuilder()
        var answer: Answer? = null

        while (true) {
            val line = reader.readLine() ?: break
            when {
                line.startsWith("event:") -> event = line.removePrefix("event:").trim()
                line.startsWith("data:") -> data.append(line.removePrefix("data:").trim())
                // Пустая строка закрывает кадр SSE.
                line.isEmpty() -> {
                    if (data.isNotEmpty()) {
                        val payload = JSONObject(data.toString())
                        when (event) {
                            "delta" -> onDelta(payload.optString("text"))
                            "done" -> answer = parseAnswer(payload)
                            "error" -> throw BridgeException(payload.optString("error", "upstream_error"))
                        }
                    }
                    event = "message"
                    data.setLength(0)
                }
            }
        }

        return answer ?: throw BridgeException("поток оборвался без события done")
    }

    private fun parseAnswer(json: JSONObject): Answer {
        val chunks = json.optJSONArray("chunks")?.let { array ->
            List(array.length()) { array.optString(it) }
        }.orEmpty()

        val codeBlocks = json.optJSONArray("codeBlocks")?.let { array ->
            List(array.length()) { index ->
                val block = array.optJSONObject(index) ?: JSONObject()
                CodeBlock(
                    // lang приходит null, если у блока не указан язык.
                    lang = if (block.isNull("lang")) null else block.optString("lang"),
                    code = block.optString("code"),
                )
            }
        }.orEmpty()

        return Answer(
            speech = json.optString("answer"),
            markdown = json.optString("markdown"),
            chunks = chunks,
            codeBlocks = codeBlocks,
            model = json.optString("model"),
            latencyMs = json.optLong("latencyMs"),
        )
    }

    private companion object {
        const val CONNECT_TIMEOUT_MS = 10_000
        const val READ_TIMEOUT_MS = 60_000
    }
}
