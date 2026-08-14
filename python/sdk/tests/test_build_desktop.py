"""Tests for the desktop packaging orchestrator."""

from __future__ import annotations

import json
import runpy
from pathlib import Path
from types import SimpleNamespace

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts" / "build-desktop.py"
build_desktop = SimpleNamespace(**runpy.run_path(str(SCRIPT)))


def test_desktop_package_name_matches_manifest() -> None:
    expected = json.loads((ROOT / "apps" / "desktop" / "package.json").read_text())["name"]

    assert build_desktop.desktop_package_name() == expected


def test_host_platform_is_a_known_electron_builder_platform() -> None:
    assert build_desktop.host_platform() in build_desktop.TARGETS_BY_PLATFORM


def test_resolve_platforms_defaults_to_host() -> None:
    assert build_desktop.resolve_platforms("windows", win=False, linux=False, mac=False) == ("windows",)
    assert build_desktop.resolve_platforms("linux", win=False, linux=False, mac=False) == ("linux",)


def test_resolve_platforms_prefers_explicit_flags() -> None:
    assert build_desktop.resolve_platforms("windows", win=True, linux=False, mac=False) == ("windows",)
    assert build_desktop.resolve_platforms("windows", win=True, linux=True, mac=True) == (
        "windows",
        "linux",
        "macos",
    )


def test_resolve_platforms_rejects_unknown_host() -> None:
    with pytest.raises(ValueError, match="unknown host platform"):
        build_desktop.resolve_platforms("freebsd", win=False, linux=False, mac=False)


def test_electron_builder_args_pairs_platform_with_targets() -> None:
    assert build_desktop.electron_builder_args("windows") == ["--win", "nsis", "portable"]
    assert build_desktop.electron_builder_args("linux") == ["--linux", "AppImage", "deb"]
    assert build_desktop.electron_builder_args("macos") == ["--mac", "dmg", "zip"]


def test_electron_builder_args_rejects_unknown_platform() -> None:
    with pytest.raises(ValueError, match="unknown platform"):
        build_desktop.electron_builder_args("freebsd")


def test_pnpm_command_uses_cmd_on_windows() -> None:
    assert build_desktop.pnpm_command("windows") == "pnpm.cmd"
    assert build_desktop.pnpm_command("linux") == "pnpm"
    assert build_desktop.pnpm_command("macos") == "pnpm"


def test_plan_runs_workspace_build_before_packaging() -> None:
    commands = build_desktop.plan(
        host="windows",
        platforms=("windows",),
        package="@deepseek-ai/dsh-desktop",
        install_electron=True,
        build=True,
        test=True,
    )

    assert commands == [
        (["pnpm.cmd", "run", "install-electron"], "install Electron runtime"),
        (["pnpm.cmd", "run", "build"], "build workspace"),
        (["pnpm.cmd", "run", "desktop:build"], "build desktop shell"),
        (["pnpm.cmd", "run", "desktop:test"], "test desktop launcher"),
        (
            [
                "pnpm.cmd",
                "--filter",
                "@deepseek-ai/dsh-desktop",
                "exec",
                "electron-builder",
                "--win",
                "nsis",
                "portable",
            ],
            "package windows",
        ),
    ]


def test_plan_can_skip_optional_steps() -> None:
    commands = build_desktop.plan(
        host="linux",
        platforms=("linux",),
        package="@deepseek-ai/dsh-desktop",
        install_electron=False,
        build=False,
        test=False,
    )

    assert commands == [
        (
            ["pnpm", "--filter", "@deepseek-ai/dsh-desktop", "exec", "electron-builder", "--linux", "AppImage", "deb"],
            "package linux",
        )
    ]
