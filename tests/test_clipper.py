"""Unit tests for the parts that decide clip quality and output validity."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from clipper.config import Config, load_config
from clipper.reframe import CropPlan, _best_window, _crop_box
from clipper.score import score_candidates
from clipper.segment import build_candidates, build_sentences, select_non_overlapping
from clipper.subtitles import build_ass
from clipper.transcribe import Transcript, Word
from clipper.utils import slugify


def words_from(text: str, start: float = 0.0, wps: float = 3.0) -> list[Word]:
    """Evenly timed words, so tests can talk in sentences not timestamps."""
    out: list[Word] = []
    t = start
    step = 1.0 / wps
    for token in text.split():
        out.append(Word(start=t, end=t + step * 0.9, text=" " + token, prob=0.9))
        t += step
    return out


# --- config -----------------------------------------------------------------

def test_config_defaults_when_no_file_present(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)  # no config.toml here
    cfg = load_config(None)
    assert cfg.render.width == 1080 and cfg.render.height == 1920
    assert cfg.transcribe.model == "small"


def test_config_missing_explicit_path_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_config(tmp_path / "absent.toml")


def test_config_rejects_unknown_key(tmp_path):
    bad = tmp_path / "c.toml"
    bad.write_text("[clips]\nmin_secondz = 5\n")
    with pytest.raises(ValueError, match="unknown option"):
        load_config(bad)


def test_config_rejects_unknown_section(tmp_path):
    bad = tmp_path / "c.toml"
    bad.write_text("[nope]\nx = 1\n")
    with pytest.raises(ValueError, match="unknown config section"):
        load_config(bad)


# --- segmentation -----------------------------------------------------------

def test_sentences_split_on_punctuation():
    transcript = Transcript("en", words_from("One two three. Four five six. Seven eight."))
    sentences = build_sentences(transcript)
    assert len(sentences) == 3
    assert sentences[0].text == "One two three."


def test_sentences_split_on_long_pause():
    words = words_from("alpha beta")
    tail = words_from("gamma delta", start=words[-1].end + 1.5)
    sentences = build_sentences(Transcript("en", words + tail))
    assert len(sentences) == 2


def test_candidates_respect_duration_bounds():
    cfg = Config()
    cfg.clips.min_seconds = 5.0
    cfg.clips.max_seconds = 12.0
    text = " ".join(f"word{i} number{i} filler{i}." for i in range(40))
    sentences = build_sentences(Transcript("en", words_from(text)))
    candidates = build_candidates(sentences, cfg)
    assert candidates
    assert all(5.0 <= c.duration <= 12.0 for c in candidates)


def test_candidates_start_and_end_on_sentence_boundaries():
    cfg = Config()
    cfg.clips.min_seconds = 2.0
    cfg.clips.max_seconds = 30.0
    sentences = build_sentences(Transcript("en", words_from(
        "First one here. Second one here. Third one here. Fourth one here."
    )))
    starts = {round(s.start, 3) for s in sentences}
    ends = {round(s.end, 3) for s in sentences}
    for cand in build_candidates(sentences, cfg):
        assert round(cand.start, 3) in starts
        assert round(cand.end, 3) in ends


def test_selection_is_non_overlapping():
    cfg = Config()
    cfg.clips.min_seconds = 2.0
    cfg.clips.max_seconds = 20.0
    sentences = build_sentences(Transcript("en", words_from(
        " ".join(f"sentence{i} body text here." for i in range(25))
    )))
    candidates = build_candidates(sentences, cfg)
    score_candidates(candidates, cfg)
    chosen = select_non_overlapping(candidates, limit=5)
    for a, b in zip(chosen, chosen[1:]):
        assert a.end <= b.start


# --- scoring ----------------------------------------------------------------

def _score_one(text: str, cfg: Config | None = None) -> float:
    cfg = cfg or Config()
    cfg.clips.min_seconds = 2.0
    cfg.clips.max_seconds = 90.0
    transcript = Transcript("en", words_from(text))
    sentences = build_sentences(transcript)
    candidates = build_candidates(sentences, cfg)
    assert candidates, "fixture produced no candidate"
    full = max(candidates, key=lambda c: c.duration)
    score_candidates([full], cfg)
    return full.score


def test_dangling_opener_scores_below_clean_hook():
    hook = _score_one(
        "Why do most people quit? The reason is money. They run out before it works. "
        "So they never see the result. That is the whole story here today."
    )
    dangling = _score_one(
        "And so he told them that. It went on for a while after. "
        "But nobody really followed up. Then it just ended quietly there."
    )
    assert hook > dangling


def test_numbers_lift_curiosity():
    plain = _score_one("Revenue improved a lot last year. We were happy with it overall. "
                       "The team worked hard on that.")
    with_numbers = _score_one("Revenue grew 340% last year. We were happy with it overall. "
                              "The team worked hard on that.")
    assert with_numbers > plain


def test_scores_stay_in_unit_range():
    cfg = Config()
    cfg.clips.min_seconds = 2.0
    cfg.clips.max_seconds = 60.0
    sentences = build_sentences(Transcript("en", words_from(
        "Why is this happening? Nobody knows for sure. It grew 200% anyway. "
        "And then it stopped. The truth is simple enough."
    )))
    candidates = build_candidates(sentences, cfg)
    score_candidates(candidates, cfg)
    assert all(0.0 <= c.score <= 1.0 for c in candidates)


# --- subtitles --------------------------------------------------------------

def test_ass_dialogue_field_count_matches_format():
    """Regression: a missing MarginV in Format shifted Text by one field,
    leaking a stray comma into every burned-in caption."""
    cfg = Config()
    words = words_from("one two three four five six")
    ass = build_ass(words, 0.0, 3.0, cfg)

    fmt = next(l for l in ass.splitlines() if l.startswith("Format: Layer"))
    field_count = len(fmt.split(":", 1)[1].split(","))

    dialogues = [l for l in ass.splitlines() if l.startswith("Dialogue:")]
    assert dialogues
    for line in dialogues:
        payload = line.split(":", 1)[1]
        # Text is the last field and may itself contain commas, so split with
        # a bounded maxsplit and require the leading fields to line up exactly.
        parts = payload.split(",", field_count - 1)
        assert len(parts) == field_count
        assert not parts[-1].startswith(","), f"text field shifted: {line}"


def test_ass_highlights_exactly_one_word_per_line():
    cfg = Config()
    cfg.subtitles.group_size = 3
    ass = build_ass(words_from("alpha beta gamma delta"), 0.0, 3.0, cfg)
    for line in [l for l in ass.splitlines() if l.startswith("Dialogue:")]:
        assert line.count(cfg.subtitles.highlight_color) == 1


def test_ass_times_never_exceed_clip_duration():
    cfg = Config()
    ass = build_ass(words_from("one two three four five"), 0.0, 1.2, cfg)
    for line in [l for l in ass.splitlines() if l.startswith("Dialogue:")]:
        end = line.split(",")[2]
        h, m, s = end.split(":")
        assert int(h) * 3600 + int(m) * 60 + float(s) <= 1.2 + 1e-6


# --- reframe ----------------------------------------------------------------

def test_crop_box_matches_output_aspect():
    cfg = Config()
    w, h = _crop_box(1920, 1080, cfg)
    assert h == 1080
    assert abs(w / h - cfg.render.width / cfg.render.height) < 0.01
    assert w % 2 == 0 and h % 2 == 0


def test_crop_box_never_exceeds_source_width():
    cfg = Config()
    w, h = _crop_box(400, 1080, cfg)
    assert w <= 400


def test_best_window_finds_the_busy_side():
    import numpy as np

    column_score = np.zeros(320, dtype=np.float32)
    column_score[210:290] = 1.0  # activity on the right
    crop_x = _best_window(column_score, crop_w=405, src_w=1280)
    # the interesting region maps to roughly x=840..1160 in source pixels
    assert 700 <= crop_x <= 900


def test_blur_plan_needs_no_crop_geometry():
    cfg = Config()
    chain = CropPlan(mode="blur").filter_chain(cfg)
    assert "gblur" in chain and "overlay" in chain
    assert f"{cfg.render.width}:{cfg.render.height}" in chain


# --- utils ------------------------------------------------------------------

def test_slugify_transliterates_cyrillic():
    assert slugify("Как заработать") == "kak-zarabotat"


def test_slugify_never_returns_empty():
    assert slugify("!!!///") == "source"
