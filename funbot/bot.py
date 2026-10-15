"""Угарный бот для чата с друзьями."""
import asyncio
import hashlib
import html
import logging
import os
import random
from datetime import date, timedelta

from aiogram import Bot, Dispatcher, F
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ChatType, ParseMode
from aiogram.filters import Command, CommandObject
from aiogram.types import BotCommand, Message, User

import texts
from storage import Storage

BOT_TOKEN = os.environ["BOT_TOKEN"]
RANDOM_REPLY_CHANCE = float(os.getenv("RANDOM_REPLY_CHANCE", "0.02"))
RHYME_CHANCE = float(os.getenv("RHYME_CHANCE", "0.35"))
DB_PATH = os.getenv("DB_PATH", "funbot.db")

dp = Dispatcher()
db = Storage(DB_PATH)
GROUPS = F.chat.type.in_({ChatType.GROUP, ChatType.SUPERGROUP})


def mention(user_id: int, name: str) -> str:
    return f'<a href="tg://user?id={user_id}">{html.escape(name)}</a>'


def mention_user(user: User) -> str:
    return mention(user.id, user.full_name)


def seeded(*parts) -> random.Random:
    """Детерминированный рандом: один и тот же ответ на один и тот же вопрос за день."""
    key = "|".join(map(str, parts)).encode()
    return random.Random(int(hashlib.sha256(key).hexdigest(), 16))


@dp.message(Command("start", "help"))
async def cmd_help(message: Message) -> None:
    await message.answer(
        "Я бот для угара 🤪\n\n"
        "/krasavchik — красавчик дня\n"
        "/klown — клоун дня\n"
        "/top — зал славы и позора\n"
        "/kto &lt;текст&gt; — кто из нас…\n"
        "/shar &lt;вопрос&gt; — магический шар\n"
        "/rate &lt;что угодно&gt; — оценю от 0 до 10\n"
        "/iq — измерю IQ (ответом на сообщение — чужой)\n"
        "/kogda &lt;событие&gt; — предскажу дату\n"
        "/duel — ответь на сообщение, чтобы вызвать на дуэль\n"
        "/predskazanie — предсказание на сегодня\n\n"
        "Я знаю только тех, кто хоть раз писал в чат, пока я тут."
    )


async def pick_daily(message: Message, kind: str) -> None:
    chat_id, today = message.chat.id, date.today().isoformat()
    winner = db.get_daily(chat_id, kind, today)
    if winner is not None:
        who = mention(winner, db.name_of(chat_id, winner))
        await message.answer(texts.DAILY_ALREADY[kind].format(who=who))
        return

    members = db.members(chat_id)
    if len(members) < 2:
        await message.answer("Мало народу. Пусть хотя бы двое что-нибудь напишут в чат 🙄")
        return

    chosen = random.choice(members)
    db.set_daily(chat_id, kind, today, chosen.user_id)
    for line in texts.DRAMA[kind]:
        await message.answer(line)
        await asyncio.sleep(1.2)
    title, text = texts.DAILY[kind]
    await message.answer(f"<b>{title}</b>\n{text.format(who=mention(chosen.user_id, chosen.name))}")


@dp.message(Command("krasavchik"), GROUPS)
async def cmd_handsome(message: Message) -> None:
    await pick_daily(message, "handsome")


@dp.message(Command("klown"), GROUPS)
async def cmd_clown(message: Message) -> None:
    await pick_daily(message, "clown")


@dp.message(Command("top"), GROUPS)
async def cmd_top(message: Message) -> None:
    parts = []
    for kind, title in (("handsome", "😎 Красавчики"), ("clown", "🤡 Клоуны")):
        rows = db.top(message.chat.id, kind)
        lines = [f"{i}. {html.escape(name)} — {count}" for i, (name, count) in enumerate(rows, 1)]
        parts.append(f"<b>{title}</b>\n" + ("\n".join(lines) or "пока никого"))
    await message.answer("\n\n".join(parts))


@dp.message(Command("kto"), GROUPS)
async def cmd_who(message: Message, command: CommandObject) -> None:
    if not command.args:
        await message.reply("Кто что? Пример: /kto сегодня проставляется")
        return
    members = db.members(message.chat.id)
    if not members:
        await message.reply("Я пока никого тут не знаю 🤷")
        return
    m = seeded(message.chat.id, date.today(), command.args.lower()).choice(members)
    intro = random.choice(["Очевидно, что", "Тут без вариантов:", "Я посчитал, и это", "Все знают, что это"])
    await message.reply(f"{intro} {mention(m.user_id, m.name)} {html.escape(command.args)}")


@dp.message(Command("shar"))
async def cmd_ball(message: Message, command: CommandObject) -> None:
    if not command.args:
        await message.reply("Задай вопрос: /shar я сегодня выиграю?")
        return
    await message.reply("🎱 " + random.choice(texts.BALL_ANSWERS))


@dp.message(Command("rate"))
async def cmd_rate(message: Message, command: CommandObject) -> None:
    if not command.args:
        await message.reply("Что оценить? Пример: /rate мою причёску")
        return
    score = seeded(command.args.lower().strip()).randint(0, 10)
    comment = next(random.choice(v) for k, v in texts.RATE_COMMENTS.items() if score in k)
    await message.reply(f"«{html.escape(command.args)}» — <b>{score}/10</b>. {comment}")


@dp.message(Command("iq"))
async def cmd_iq(message: Message) -> None:
    target = message.reply_to_message.from_user if message.reply_to_message else message.from_user
    iq = seeded("iq", target.id, date.today()).choice(
        [random.randint(1, 60), random.randint(60, 130), random.randint(130, 250)]
    )
    comment = next(c for lo, hi, c in texts.IQ_COMMENTS if lo <= iq < hi)
    await message.reply(f"🧠 IQ {mention_user(target)} сегодня: <b>{iq}</b>\n{comment}")


@dp.message(Command("kogda"))
async def cmd_when(message: Message, command: CommandObject) -> None:
    if not command.args:
        await message.reply("Когда что? Пример: /kogda я сдам сессию")
        return
    rnd = seeded("when", command.args.lower())
    if rnd.random() < 0.1:
        answer = "Никогда 💀"
    else:
        d = date.today() + timedelta(days=rnd.randint(1, 365 * 30))
        answer = d.strftime("%d.%m.%Y")
    await message.reply(f"📅 {html.escape(command.args)} — <b>{answer}</b>. {random.choice(texts.WHEN_SUFFIXES)}")


@dp.message(Command("duel"))
async def cmd_duel(message: Message) -> None:
    if not message.reply_to_message or message.reply_to_message.from_user.is_bot:
        await message.reply("Ответь этой командой на сообщение того, кого вызываешь ⚔️")
        return
    a, b = message.from_user, message.reply_to_message.from_user
    if a.id == b.id:
        await message.reply("Дуэль с самим собой? Сходи к психологу.")
        return
    await message.answer(f"⚔️ {mention_user(a)} вызывает {mention_user(b)} на дуэль!")
    await asyncio.sleep(1.5)
    winner, loser = random.sample([a, b], 2)
    await message.answer(
        f"💥 {mention_user(winner)} {random.choice(texts.DUEL_ACTIONS)} {mention_user(loser)}!\n"
        f"🏆 Победитель: {mention_user(winner)}"
    )


@dp.message(Command("predskazanie"))
async def cmd_prediction(message: Message) -> None:
    text = seeded("pred", message.from_user.id, date.today()).choice(texts.PREDICTIONS)
    await message.reply(f"🔮 {text}")


@dp.message(GROUPS)
async def on_any_message(message: Message) -> None:
    """Запоминаем участников и иногда вставляем свои пять копеек."""
    user = message.from_user
    if user is None or user.is_bot:
        return
    db.touch(message.chat.id, user.id, user.full_name)

    word = (message.text or "").strip().lower().rstrip("?!.)")
    if word in texts.RHYMES and random.random() < RHYME_CHANCE:
        await message.reply(random.choice(texts.RHYMES[word]))
    elif message.text and random.random() < RANDOM_REPLY_CHANCE:
        await message.reply(random.choice(texts.RANDOM_COMMENTS))


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    bot = Bot(BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    await bot.set_my_commands([
        BotCommand(command="krasavchik", description="Красавчик дня"),
        BotCommand(command="klown", description="Клоун дня"),
        BotCommand(command="top", description="Зал славы и позора"),
        BotCommand(command="kto", description="Кто из нас…"),
        BotCommand(command="shar", description="Магический шар"),
        BotCommand(command="rate", description="Оценить что угодно"),
        BotCommand(command="iq", description="Измерить IQ"),
        BotCommand(command="kogda", description="Когда это случится"),
        BotCommand(command="duel", description="Дуэль (ответом на сообщение)"),
        BotCommand(command="predskazanie", description="Предсказание на сегодня"),
        BotCommand(command="help", description="Что я умею"),
    ])
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
