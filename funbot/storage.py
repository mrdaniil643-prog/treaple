"""Простое хранилище на SQLite: участники чатов и итоги «X дня»."""
import sqlite3
from dataclasses import dataclass


@dataclass
class Member:
    user_id: int
    name: str


class Storage:
    def __init__(self, path: str):
        self.db = sqlite3.connect(path)
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS members (
                chat_id INTEGER, user_id INTEGER, name TEXT,
                PRIMARY KEY (chat_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS daily (
                chat_id INTEGER, kind TEXT, day TEXT, user_id INTEGER,
                PRIMARY KEY (chat_id, kind, day)
            );
            """
        )

    def touch(self, chat_id: int, user_id: int, name: str) -> None:
        self.db.execute(
            "INSERT INTO members VALUES (?, ?, ?) "
            "ON CONFLICT(chat_id, user_id) DO UPDATE SET name = excluded.name",
            (chat_id, user_id, name),
        )
        self.db.commit()

    def members(self, chat_id: int) -> list[Member]:
        rows = self.db.execute(
            "SELECT user_id, name FROM members WHERE chat_id = ?", (chat_id,)
        )
        return [Member(*r) for r in rows]

    def name_of(self, chat_id: int, user_id: int) -> str:
        row = self.db.execute(
            "SELECT name FROM members WHERE chat_id = ? AND user_id = ?",
            (chat_id, user_id),
        ).fetchone()
        return row[0] if row else "кто-то"

    def get_daily(self, chat_id: int, kind: str, day: str) -> int | None:
        row = self.db.execute(
            "SELECT user_id FROM daily WHERE chat_id = ? AND kind = ? AND day = ?",
            (chat_id, kind, day),
        ).fetchone()
        return row[0] if row else None

    def set_daily(self, chat_id: int, kind: str, day: str, user_id: int) -> None:
        self.db.execute(
            "INSERT OR REPLACE INTO daily VALUES (?, ?, ?, ?)",
            (chat_id, kind, day, user_id),
        )
        self.db.commit()

    def top(self, chat_id: int, kind: str, limit: int = 10) -> list[tuple[str, int]]:
        rows = self.db.execute(
            "SELECT COALESCE(m.name, 'кто-то'), COUNT(*) AS c FROM daily d "
            "LEFT JOIN members m ON m.chat_id = d.chat_id AND m.user_id = d.user_id "
            "WHERE d.chat_id = ? AND d.kind = ? "
            "GROUP BY d.user_id ORDER BY c DESC LIMIT ?",
            (chat_id, kind, limit),
        )
        return list(rows)
