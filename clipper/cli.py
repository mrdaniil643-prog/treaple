"""Command line entry point."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .config import load_config
from .score import explain
from .utils import ToolError, log, setup_logging, timestamp


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="clipper",
        description="Turn long videos into vertical short-form clips.",
    )
    parser.add_argument("-c", "--config", help="path to config.toml")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    run_cmd = sub.add_parser("run", help="full pipeline: download -> clips")
    run_cmd.add_argument("source", help="video URL or local file path")
    run_cmd.add_argument("-n", "--limit", type=int, help="max clips to render")
    run_cmd.add_argument("--review", help="review JSON to blend into scores")
    run_cmd.add_argument("--force-download", action="store_true")
    run_cmd.add_argument("--force-transcribe", action="store_true")

    analyze_cmd = sub.add_parser(
        "analyze", help="download + transcribe + rank, render nothing"
    )
    analyze_cmd.add_argument("source")
    analyze_cmd.add_argument("--force-download", action="store_true")
    analyze_cmd.add_argument("--force-transcribe", action="store_true")
    analyze_cmd.add_argument("--top", type=int, default=15)
    analyze_cmd.add_argument("--explain", action="store_true", help="show feature scores")

    clips_cmd = sub.add_parser("clips", help="render clips from an analyzed source")
    clips_cmd.add_argument("work_dir", help="work/<slug> directory")
    clips_cmd.add_argument("-n", "--limit", type=int)
    clips_cmd.add_argument("--review")

    list_cmd = sub.add_parser("list", help="show ranked candidates for a source")
    list_cmd.add_argument("work_dir")
    list_cmd.add_argument("--top", type=int, default=20)
    list_cmd.add_argument("--explain", action="store_true")

    export_cmd = sub.add_parser(
        "review-export", help="dump top candidates for a second-opinion pass"
    )
    export_cmd.add_argument("work_dir")
    export_cmd.add_argument("-o", "--output")
    export_cmd.add_argument("--limit", type=int, default=40)

    publish_cmd = sub.add_parser("publish", help="upload rendered clips")
    publish_cmd.add_argument("target", choices=["youtube"])
    publish_cmd.add_argument("clips_dir", help="out/<slug> directory")
    publish_cmd.add_argument("--privacy", default="private",
                             choices=["private", "unlisted", "public"])
    publish_cmd.add_argument("-n", "--limit", type=int)
    publish_cmd.add_argument("--dry-run", action="store_true")

    return parser


def _print_candidates(candidates, top: int, show_explain: bool) -> None:
    ranked = sorted(candidates, key=lambda c: c.score, reverse=True)[:top]
    print(f"\n{'#':>3}  {'score':>5}  {'start':>10}  {'dur':>5}  text")
    print("-" * 100)
    for i, cand in enumerate(ranked, 1):
        preview = cand.text[:70].replace("\n", " ")
        print(
            f"{i:>3}  {cand.score:>5.3f}  {timestamp(cand.start):>10}  "
            f"{cand.duration:>5.1f}  {preview}"
        )
        if show_explain:
            print(f"     {explain(cand)}")
    print()


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    setup_logging(args.verbose)

    try:
        cfg = load_config(args.config)
    except (ValueError, FileNotFoundError) as exc:
        log.error("config error: %s", exc)
        return 2

    from . import pipeline

    try:
        if args.command == "run":
            results = pipeline.run(
                args.source, cfg,
                limit=args.limit,
                force_download=args.force_download,
                force_transcribe=args.force_transcribe,
                review_file=Path(args.review) if args.review else None,
            )
            if not results:
                return 1
            print(f"\n{len(results)} clips written to {cfg.out_path}/\n")
            for r in results:
                print(f"  {r.score:.3f}  {r.path}")
            print()
            return 0

        if args.command == "analyze":
            _, _, candidates = pipeline.analyze(
                args.source, cfg,
                force_download=args.force_download,
                force_transcribe=args.force_transcribe,
            )
            if not candidates:
                log.warning("no candidates found")
                return 1
            _print_candidates(candidates, args.top, args.explain)
            return 0

        if args.command == "clips":
            source, transcript, candidates = pipeline.load_existing(
                Path(args.work_dir), cfg
            )
            results = pipeline.make_clips(
                source, transcript, candidates, cfg,
                limit=args.limit,
                review_file=Path(args.review) if args.review else None,
            )
            return 0 if results else 1

        if args.command == "list":
            _, _, candidates = pipeline.load_existing(Path(args.work_dir), cfg)
            _print_candidates(candidates, args.top, args.explain)
            return 0

        if args.command == "review-export":
            from .score import export_for_review

            work_dir = Path(args.work_dir)
            _, _, candidates = pipeline.load_existing(work_dir, cfg)
            out = Path(args.output) if args.output else work_dir / "review.json"
            export_for_review(candidates, out, limit=args.limit)
            print(f"wrote {out} -- score the clips, then: clipper clips {work_dir} --review {out}")
            return 0

        if args.command == "publish":
            from .publish.youtube import publish_dir

            return publish_dir(
                Path(args.clips_dir),
                privacy=args.privacy,
                limit=args.limit,
                dry_run=args.dry_run,
            )

    except ToolError as exc:
        log.error("%s", exc)
        return 1
    except KeyboardInterrupt:
        log.warning("interrupted")
        return 130

    return 2


if __name__ == "__main__":
    sys.exit(main())
