"""Upload rendered clips to YouTube as Shorts.

Quota note: the Data API gives a project 10,000 units/day and every
videos.insert costs 1,600 -- so six uploads per day per project, full
stop. Plan around that (several projects, or request a quota increase)
rather than discovering it at upload five.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..utils import log

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
UPLOAD_COST = 1600
DAILY_QUOTA = 10000
CLIENT_SECRET = "client_secret.json"
TOKEN_FILE = "token_youtube.json"


class PublishError(RuntimeError):
    pass


def _service():
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise PublishError(
            "publishing needs extra packages:\n"
            "  pip install google-api-python-client google-auth-oauthlib"
        ) from exc

    token_path = Path(TOKEN_FILE)
    creds = None
    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            secret_path = Path(CLIENT_SECRET)
            if not secret_path.exists():
                raise PublishError(
                    f"missing {CLIENT_SECRET}. Create an OAuth client "
                    "(type: Desktop app) in Google Cloud Console, enable the "
                    "YouTube Data API v3, and save the JSON here."
                )
            flow = InstalledAppFlow.from_client_secrets_file(str(secret_path), SCOPES)
            creds = flow.run_local_server(port=0)
        token_path.write_text(creds.to_json(), encoding="utf-8")

    from googleapiclient.discovery import build

    return build("youtube", "v3", credentials=creds)


def _metadata(clip: dict, sidecar: Path) -> tuple[str, str]:
    """Title and description, preferring the sidecar written at render time."""
    title = clip.get("title") or sidecar.stem
    description = ""
    if sidecar.exists():
        text = sidecar.read_text(encoding="utf-8")
        description = text.split("\n---\n")[0].strip()

    # Shorts are detected by aspect + duration, but the tag still helps.
    if "#shorts" not in description.lower():
        description = f"{description}\n\n#shorts".strip()
    # YouTube rejects titles over 100 chars and any title containing < or >.
    title = title.replace("<", "").replace(">", "")[:100]
    return title, description


def publish_dir(
    clips_dir: Path,
    *,
    privacy: str = "private",
    limit: int | None = None,
    dry_run: bool = False,
) -> int:
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

    budget = DAILY_QUOTA // UPLOAD_COST
    if len(clips) > budget:
        log.warning(
            "%d clips requested but the daily quota allows %d uploads "
            "(%d units each of %d) -- the rest will fail today",
            len(clips), budget, UPLOAD_COST, DAILY_QUOTA,
        )

    if dry_run:
        for clip in clips:
            path = Path(clip["file"])
            title, description = _metadata(clip, path.with_suffix(".txt"))
            print(f"\n{path}\n  title: {title}\n  privacy: {privacy}")
            print("  description:")
            for line in description.splitlines():
                print(f"    {line}")
        print(f"\ndry run: {len(clips)} clips, "
              f"{len(clips) * UPLOAD_COST} quota units\n")
        return 0

    try:
        service = _service()
    except PublishError as exc:
        log.error("%s", exc)
        return 1

    from googleapiclient.http import MediaFileUpload

    failures = 0
    for clip in clips:
        path = Path(clip["file"])
        if not path.exists():
            log.error("missing file %s", path)
            failures += 1
            continue

        title, description = _metadata(clip, path.with_suffix(".txt"))
        body = {
            "snippet": {"title": title, "description": description, "categoryId": "22"},
            "status": {"privacyStatus": privacy, "selfDeclaredMadeForKids": False},
        }

        log.info("uploading %s as %r", path.name, title)
        request = service.videos().insert(
            part="snippet,status",
            body=body,
            media_body=MediaFileUpload(str(path), chunksize=-1, resumable=True),
        )

        try:
            response = None
            while response is None:
                _, response = request.next_chunk()
            log.info("  https://youtube.com/watch?v=%s", response["id"])
        except Exception as exc:  # noqa: BLE001 - surface the API error as-is
            log.error("  upload failed: %s", exc)
            failures += 1

    return 1 if failures else 0
