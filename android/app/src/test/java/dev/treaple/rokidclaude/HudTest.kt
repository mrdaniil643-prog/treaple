package dev.treaple.rokidclaude

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Проверяет сборку страниц HUD — чистая логика, Android для неё не нужен. */
class HudTest {

    private fun answer(
        speech: String = "",
        chunks: List<String> = emptyList(),
        codeBlocks: List<CodeBlock> = emptyList(),
    ) = Answer(
        speech = speech,
        markdown = "",
        chunks = chunks,
        codeBlocks = codeBlocks,
        model = "claude-opus-5",
        latencyMs = 0,
    )

    @Test
    fun `строки группируются по три на страницу`() {
        val pages = Hud.buildPages(answer(chunks = List(7) { "строка $it" }))
        assertEquals(3, pages.size)
        assertEquals("строка 0\nстрока 1\nстрока 2", pages[0].text)
        assertEquals("строка 6", pages[2].text)
        assertTrue(pages.none { it.isCode })
    }

    @Test
    fun `код уезжает на отдельные страницы`() {
        val pages = Hud.buildPages(
            answer(
                chunks = listOf("держи"),
                codeBlocks = listOf(CodeBlock("ts", (1..10).joinToString("\n") { "line $it" })),
            ),
        )
        assertEquals(3, pages.size)
        assertEquals(false, pages[0].isCode)
        assertTrue(pages[1].isCode)
        assertTrue(pages[1].text.startsWith("— код: ts —"))
        assertTrue(pages[2].text.contains("line 10"))
    }

    @Test
    fun `без chunks показываем озвучку`() {
        val pages = Hud.buildPages(answer(speech = "короткий ответ"))
        assertEquals(listOf("короткий ответ"), pages.map { it.text })
    }

    @Test
    fun `пустой ответ не роняет экран`() {
        val pages = Hud.buildPages(answer())
        assertEquals(1, pages.size)
        assertEquals("Пустой ответ", pages[0].text)
    }
}
