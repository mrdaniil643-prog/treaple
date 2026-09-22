"""Verify the hand-rolled multipart encoder against a real HTTP server.

api.telegram.org is not reachable from CI, so the transport is pointed at
a local server that parses the request the same way Telegram's would.
"""

from __future__ import annotations

import email
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from clipper.publish import telegram

received: dict = {}


class Handler(BaseHTTPRequestHandler):
    reply_ok = True

    def do_POST(self):  # noqa: N802 - http.server API
        length = int(self.headers["Content-Length"])
        body = self.rfile.read(length)

        # Parse with the email package: stdlib, and unlike cgi it still
        # exists on Python 3.13+.
        raw = b"Content-Type: " + self.headers["Content-Type"].encode() + b"\r\n\r\n" + body
        message = email.message_from_bytes(raw)

        received.clear()
        received["path"] = self.path
        received["fields"] = {}
        received["files"] = {}
        for part in message.get_payload():
            name = part.get_param("name", header="content-disposition")
            filename = part.get_param("filename", header="content-disposition")
            payload = part.get_payload(decode=True)
            if filename:
                received["files"][name] = (filename, payload)
            else:
                received["fields"][name] = payload.decode("utf-8")

        payload = (
            {"ok": True, "result": {"message_id": 1}}
            if self.reply_ok
            else {"ok": False, "description": "Bad Request: chat not found"}
        )
        raw = json.dumps(payload).encode()
        self.send_response(200 if self.reply_ok else 400)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, *args):  # silence the test output
        pass


@pytest.fixture
def server(monkeypatch):
    Handler.reply_ok = True
    httpd = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setattr(telegram, "API_ROOT", f"http://127.0.0.1:{httpd.server_port}")
    yield httpd
    httpd.shutdown()


def test_multipart_roundtrips_fields_and_file(server, tmp_path):
    blob = tmp_path / "clip.mp4"
    payload = bytes(range(256)) * 40  # binary, including bytes that look like delimiters
    blob.write_bytes(payload)

    telegram._call(
        "TOKEN123", "sendVideo",
        {"chat_id": "42", "caption": "Заголовок с юникодом"},
        {"video": blob},
    )

    assert received["fields"]["chat_id"] == "42"
    assert received["fields"]["caption"] == "Заголовок с юникодом"
    name, content = received["files"]["video"]
    assert name == "clip.mp4"
    assert content == payload, "file bytes were corrupted in transit"


def test_method_name_is_in_the_path_not_the_body(server, tmp_path):
    blob = tmp_path / "x.mp4"
    blob.write_bytes(b"data")
    telegram._call("TOKEN123", "sendVideo", {"chat_id": "1"}, {"video": blob})
    assert received["path"].endswith("/sendVideo")


def test_api_error_does_not_leak_the_token(server, tmp_path):
    Handler.reply_ok = False
    blob = tmp_path / "x.mp4"
    blob.write_bytes(b"data")

    with pytest.raises(telegram.TelegramError) as excinfo:
        telegram._call("SUPERSECRETTOKEN", "sendVideo", {"chat_id": "1"}, {"video": blob})

    assert "SUPERSECRETTOKEN" not in str(excinfo.value)
    assert "chat not found" in str(excinfo.value)


def test_caption_is_truncated_to_the_api_limit(tmp_path):
    sidecar = tmp_path / "c.txt"
    sidecar.write_text("x" * 5000 + "\n#shorts\n", encoding="utf-8")
    caption = telegram._caption({"title": "y" * 2000, "file": "c.mp4"}, sidecar)
    assert len(caption) <= telegram.CAPTION_LIMIT


def test_publish_dir_refuses_without_credentials(tmp_path, monkeypatch, caplog):
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)
    clip = tmp_path / "a.mp4"
    clip.write_bytes(b"x")
    (tmp_path / "clips.json").write_text(
        json.dumps({"clips": [{"file": str(clip), "title": "t"}]}), encoding="utf-8"
    )
    assert telegram.publish_dir(tmp_path) == 1


def test_publish_dir_dry_run_needs_no_credentials(tmp_path, capsys):
    clip = tmp_path / "a.mp4"
    clip.write_bytes(b"x")
    (tmp_path / "clips.json").write_text(
        json.dumps({"clips": [{"file": str(clip), "title": "Hook here"}]}), encoding="utf-8"
    )
    assert telegram.publish_dir(tmp_path, dry_run=True) == 0
    assert "Hook here" in capsys.readouterr().out
