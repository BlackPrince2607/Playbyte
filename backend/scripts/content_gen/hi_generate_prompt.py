"""Maja Hindi Content Generation Agent — invents original Hindi feed cards.

This is NOT a localization pass. It creates its own polls/quizzes in Devanagari
Hinglish. English cards are a separate pool (content_lang=en).

System prompt mirrors the English high-engagement poll playbook (New prompt tab)
with Hindi voice — see poll_prompt.build_hi_system().
"""

from __future__ import annotations

from scripts.content_gen.poll_prompt import build_hi_system

HI_GENERATE_SYSTEM = build_hi_system()
