package dev.treaple.rokidclaude

/** Одна «страница» HUD: либо текст ответа, либо блок кода. */
data class HudPage(val text: String, val isCode: Boolean)

/**
 * Сборка страниц из ответа моста. Мост уже нарезал текст под ширину строки
 * (поле chunks), здесь мы только группируем строки в экраны и добавляем код
 * отдельными страницами — читать его вслух бессмысленно, а показать нужно.
 */
object Hud {

    const val LINES_PER_PAGE = 3
    const val CODE_LINES_PER_PAGE = 8

    fun buildPages(answer: Answer): List<HudPage> {
        val pages = mutableListOf<HudPage>()

        val lines = answer.chunks.ifEmpty {
            answer.speech.takeIf { it.isNotBlank() }?.let { listOf(it) }.orEmpty()
        }
        lines.chunked(LINES_PER_PAGE).forEach { pages += HudPage(it.joinToString("\n"), isCode = false) }

        answer.codeBlocks.forEach { block ->
            val header = block.lang?.takeIf { it.isNotBlank() }?.let { "— код: $it —" } ?: "— код —"
            block.code.lines().chunked(CODE_LINES_PER_PAGE).forEach { part ->
                pages += HudPage(header + "\n" + part.joinToString("\n"), isCode = true)
            }
        }

        return pages.ifEmpty { listOf(HudPage("Пустой ответ", isCode = false)) }
    }
}
