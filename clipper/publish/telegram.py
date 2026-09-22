"""Deliver rendered clips into a Telegram chat via the Bot API.

This is the phone-friendly path: the pipeline runs somewhere with a CPU
(a GitHub Actions runner, say) and drops the finished vertical clips
straight into a chat, where a phone can pick them up and post them.

Uses only the standard library -- no extra dependencies to install on
whatever machine ends up running this.
"""

from __future__ import annotations

import json
import mimetypes
import os
import subprocess
import tempfile
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from ..utils import log, probe

API_ROOT = "https://api.telegram.org"
# Bots may upload at most 50 MB; stay under it with room for the envelope.
MAX_UPLOAD_BYTES = 48 * 1024 * 1024
CAPTION_LIMIT = 1024


class TelegramError(RuntimeError):
    pass


def _encode_multipart(fields: dict[str, str], files: dict[str, Path]) -> tuple[bytes, str]:
    """Build a multipart/form-data body without pulling in requests."""
    boundary = f"----clipper{uuid.uuid4().hex}"
    out = bytearray()

    for name, value in fields.items():
        out += f"--{boundary}\r\n".encode()
        out += f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode()
        out += f"{value}\r\n".encode()

    for name, path in files.items():
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        out += f"--{boundary}\r\n".encode()
        out += (
            f'Content-Disposition: form-data; name="{name}"; '
            f'filename="{path.name}"\r\n'
        ).encode()
        out += f"Content-Type: {ctype}\r\n\r\n".encode()
        out += path.read_bytes()
        out += b"\r\n"

    out += f"--{boundary}--\r\n".encode()
    return bytes(out), f"multipart/form-data; boundary={boundary}"


def _call(token: str, method: str, fields: dict[str, str],
          files: dict[str, Path] | None = None, timeout: int = 300) -> dict:
    url = f"{API_ROOT}/bot{token}/{method}"
    body, content_type = _encode_multipart(fields, files or {})
    request = urllib.request.Request(url, data=body, method="POST")
    request.add_header("Content-Type", content_type)

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:400]
        # Never echo the URL back: it carries the bot token.
        raise TelegramError(f"{method} failed: HTTP {exc.code} {detail}") from None
    except urllib.error.URLError as exc:
        raise TelegramError(f"{method} failed: {exc.reason}") from None

    if not payload.get("ok"):
        raise TelegramError(f"{method} rejected: {payload.get('description')}")
    return payload.get("result", {})


def _caption(clip: dict, sidecar: Path) -> str:
    title = clip.get("title") or Path(clip["file"]).stem
    parts = [title]
    if sidecar.exists():
        text = sidecar.read_text(encoding="utf-8").split("\n---\n")[0]
        tags = [l for l in text.splitlines() if l.strip().startswith("#")]
        if tags:
            parts.append(tags[0].strip())
    caption = "\n\n".join(parts)
    return caption[: CAPTION_LIMIT - 1] + "…" if len(caption) > CAPTION_LIMIT else caption


def _shrink(path: Path, target_bytes: int) -> Path | None:
    """Re-encode harder so an oversized clip fits the Bot API upload limit."""
    for crf in (28, 32, 36):
        temp = Path(tempfile.gettempdir()) / f"{path.stem}-crf{crf}.mp4"
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-i", str(path),
                 "-c:v", "libx264", "-preset", "medium", "-crf", str(crf),
                 "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
                 "-movflags", "+faststart", str(temp)],
                check=True, capture_output=True,
            )
        except subprocess.CalledProcessError:
            return None
        if temp.stat().st_size <= target_bytes:
            log.info("  re-encoded at crf=%d to fit the upload limit", crf)
            return temp
        temp.unlink(missing_ok=True)
    return None


def send_clip(token: str, chat_id: str, path: Path, caption: str) -> None:
    upload = path
    temp: Path | None = None

    if path.stat().st_size > MAX_UPLOAD_BYTES:
        log.warning("%s is %.1f MB, over the 50 MB bot upload limit",
                    path.name, path.stat().st_size / 1024 / 1024)
        temp = _shrink(path, MAX_UPLOAD_BYTES)
        if temp is None:
            raise TelegramError(f"{path.name} will not fit under the upload limit")
        upload = temp

    fields = {"chat_id": chat_id, "caption": caption, "supports_streaming": "true"}
    try:
        info = probe(upload)
        fields |= {
            "width": str(info.width),
            "height": str(info.height),
            "duration": str(int(info.duration)),
        }
    except Exception:  # noqa: BLE001 - geometry is a nicety, not a requirement
        pass

    try:
        _call(token, "sendVideo", fields, {"video": upload})
    finally:
        if temp is not None:
            temp.unlink(missing_ok=True)


def publish_dir(
    clips_dir: Path,
    *,
    token: str | None = None,
    chat_id: str | None = None,
    limit: int | None = None,
    dry_run: bool = False,
) -> int:
    token = token or os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = chat_id or os.environ.get("TELEGRAM_CHAT_ID", "")

    manifest = clips_dir / "clips.json"
    if not manifest.exists():
        log.error("no clips.json in %s -- render clips first", clips_dir)
        return 1

    data = json.loads(manifest.read_text(encoding="utf-8"))
    clips = data.get("clips", [])
    if limit:
        clips = clips[:limit]
    if not clips:
        log.error("clips.json lists no clips")
        return 1

    if dry_run:
        for clip in clips:
            path = Path(clip["file"])
            size = path.stat().st_size / 1024 / 1024 if path.exists() else 0.0
            print(f"\n{path.name}  ({size:.1f} MB)")
            print(f"  caption: {_caption(clip, path.with_suffix('.txt'))}")
        print(f"\ndry run: {len(clips)} clips\n")
        return 0

    if not token or not chat_id:
        log.error(
            "set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID "
            "(token from @BotFather; chat id from getUpdates)"
        )
        return 1

    failures = 0
    for clip in clips:
        path = Path(clip["file"])
        if not path.exists():
            log.error("missing file %s", path)
            failures += 1
            continue
        log.info("sending %s", path.name)
        try:
            send_clip(token, chat_id, path, _caption(clip, path.with_suffix(".txt")))
        except TelegramError as exc:
            log.error("  %s", exc)
            failures += 1

    log.info("sent %d/%d clips", len(clips) - failures, len(clips))
    return 1 if failures else 0
