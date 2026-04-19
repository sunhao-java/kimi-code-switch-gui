from __future__ import annotations

import argparse
from pathlib import Path


CASK_TEMPLATE = """cask "kimi-code-switch-gui" do
  arch arm: "arm64", intel: "x64"

  version "{version}"

  if Hardware::CPU.arm?
    sha256 "{arm64_sha256}"
  else
    sha256 "{amd64_sha256}"
  end

  url "https://github.com/{github_repo}/releases/download/v#{{version}}/kimi-code-switch-gui-#{{version}}-mac-#{{arch}}.dmg"
  name "Kimi Code Switch GUI"
  desc "Desktop app for managing kimi-code-cli providers, models, and profiles"
  homepage "https://github.com/{github_repo}"

  livecheck do
    url :url
    regex(/^v?(\\d+\\.\\d+\\.\\d+)$/i)
  end

  app "Kimi Code Switch GUI.app"

  zap trash: [
    "~/Library/Application Support/Kimi Code Switch GUI",
    "~/Library/Logs/Kimi Code Switch GUI",
    "~/Library/Preferences/cn.crazycoder.kimi-code-switch-gui.plist",
    "~/Library/Saved Application State/cn.crazycoder.kimi-code-switch-gui.savedState",
  ]
end
"""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Render Homebrew cask for kimi-code-switch-gui release assets.",
    )
    parser.add_argument("--version", required=True, help="Release version without leading v")
    parser.add_argument("--github-repo", required=True, help="GitHub repo in owner/name form")
    parser.add_argument("--arm64-sha256", required=True, help="SHA256 for macOS arm64 DMG")
    parser.add_argument("--amd64-sha256", required=True, help="SHA256 for macOS x64 DMG")
    parser.add_argument("--output", type=Path, required=True, help="Output cask path")
    return parser


def render_cask(version: str, github_repo: str, arm64_sha256: str, amd64_sha256: str) -> str:
    return CASK_TEMPLATE.format(
        version=version,
        github_repo=github_repo,
        arm64_sha256=arm64_sha256,
        amd64_sha256=amd64_sha256,
    )


def main() -> int:
    args = build_parser().parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        render_cask(
            version=args.version,
            github_repo=args.github_repo,
            arm64_sha256=args.arm64_sha256,
            amd64_sha256=args.amd64_sha256,
        ),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
