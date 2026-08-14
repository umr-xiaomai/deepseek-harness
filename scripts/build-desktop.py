#!/usr/bin/env python3
"""Orchestrate the Electron desktop build for one or more host platforms.

The repository already keeps every target in the electron-builder
configuration under ``apps/desktop/package.json``; this script turns that
configuration into a one-command pipeline:

* download the Electron runtime,
* build the workspace and desktop shell,
* run the desktop launcher unit tests,
* invoke electron-builder for the requested platforms.

By default it builds only the host platform. Windows additionally produces a
portable executable alongside the NSIS installer.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESKTOP_DIR = ROOT / "apps" / "desktop"
RELEASE_DIR = DESKTOP_DIR / "release"

# electron-builder targets are the declarative source of truth in
# apps/desktop/package.json; keep these in sync with that file.
TARGETS_BY_PLATFORM = {
    "windows": ("nsis", "portable"),
    "linux": ("AppImage", "deb"),
    "macos": ("dmg", "zip"),
}

PLATFORM_FLAGS = {"windows": "win", "linux": "linux", "macos": "mac"}


def host_platform() -> str:
    """Return the electron-builder platform name for the running OS."""
    if sys.platform.startswith("win"):
        return "windows"
    if sys.platform.startswith("linux"):
        return "linux"
    if sys.platform == "darwin":
        return "macos"
    raise RuntimeError(f"unsupported host platform: {sys.platform}")


def resolve_platforms(host: str, *, win: bool, linux: bool, mac: bool) -> tuple[str, ...]:
    """Resolve explicit platform flags, defaulting to the host platform."""
    if host not in TARGETS_BY_PLATFORM:
        raise ValueError(f"unknown host platform: {host}")
    selected = tuple(
        name for name, flag in (("windows", win), ("linux", linux), ("macos", mac)) if flag
    )
    if not selected:
        return (host,)
    unknown = [name for name in selected if name not in TARGETS_BY_PLATFORM]
    if unknown:
        raise ValueError(f"unknown platform targets: {', '.join(unknown)}")
    return selected


def electron_builder_args(platform: str) -> list[str]:
    """Return the electron-builder CLI arguments for one platform."""
    targets = TARGETS_BY_PLATFORM.get(platform)
    flag = PLATFORM_FLAGS.get(platform)
    if targets is None or flag is None:
        raise ValueError(f"unknown platform: {platform}")
    return [f"--{flag}", *targets]


def pnpm_command(platform: str) -> str:
    """Return the pnpm executable name for a platform."""
    return "pnpm.cmd" if platform == "windows" else "pnpm"


def desktop_package_name(root: Path = ROOT) -> str:
    """Read the workspace package name of the desktop shell."""
    package_json = root / "apps" / "desktop" / "package.json"
    try:
        payload = json.loads(package_json.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"could not read desktop package manifest at {package_json}") from error
    name = payload.get("name") if isinstance(payload, dict) else None
    if not isinstance(name, str) or not name:
        raise ValueError(f"{package_json} must declare a package name")
    return name


def plan(
    *,
    host: str,
    platforms: tuple[str, ...],
    package: str,
    install_electron: bool,
    build: bool,
    test: bool,
) -> list[tuple[list[str], str]]:
    """Return the ordered commands and human-readable labels for the build."""
    pnpm = pnpm_command(host)
    commands: list[tuple[list[str], str]] = []
    if install_electron:
        commands.append(([pnpm, "run", "install-electron"], "install Electron runtime"))
    if build:
        commands.append(([pnpm, "run", "build"], "build workspace"))
        commands.append(([pnpm, "run", "desktop:build"], "build desktop shell"))
    if test:
        commands.append(([pnpm, "run", "desktop:test"], "test desktop launcher"))
    for platform in platforms:
        command = [
            pnpm,
            "--filter",
            package,
            "exec",
            "electron-builder",
            *electron_builder_args(platform),
        ]
        commands.append((command, f"package {platform}"))
    return commands


def run_command(command: list[str], label: str, *, dry_run: bool) -> None:
    """Print and run one build command from the repository root."""
    print(f"[desktop-build] {label}: {' '.join(command)}")
    if dry_run:
        return
    subprocess.run(command, cwd=ROOT, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--win",
        action="store_true",
        help="build the Windows NSIS installer and portable executable",
    )
    parser.add_argument(
        "--linux",
        action="store_true",
        help="build the Linux AppImage and deb installers",
    )
    parser.add_argument(
        "--mac",
        action="store_true",
        help="build the macOS dmg and zip bundles",
    )
    parser.add_argument(
        "--skip-install-electron",
        action="store_true",
        help="skip downloading the Electron runtime",
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="skip the workspace and desktop-shell builds",
    )
    parser.add_argument(
        "--skip-tests",
        action="store_true",
        help="skip the desktop launcher unit tests",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print the planned commands without running them",
    )
    args = parser.parse_args()

    host = host_platform()
    platforms = resolve_platforms(host, win=args.win, linux=args.linux, mac=args.mac)
    package = desktop_package_name()
    for platform in platforms:
        if platform != host:
            print(
                f"[desktop-build] warning: building {platform} on {host}; "
                "electron-builder may require running on the target OS"
            )

    commands = plan(
        host=host,
        platforms=platforms,
        package=package,
        install_electron=not args.skip_install_electron,
        build=not args.skip_build,
        test=not args.skip_tests,
    )
    for command, label in commands:
        run_command(command, label, dry_run=args.dry_run)

    if not args.dry_run:
        print(f"[desktop-build] artifacts written under {RELEASE_DIR}")


if __name__ == "__main__":
    main()
