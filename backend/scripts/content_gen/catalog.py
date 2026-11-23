"""Poll and quiz catalogs. One tree: format, category, question type, card."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from scripts.content_gen.taxonomy import (  # noqa: E402
    EVENT_SLUGS,
    FORMAT_FIND_THE_DIFFERENCE,
    FORMAT_POLL,
    FORMAT_QUIZ,
    FORMAT_THIS_OR_THAT,
    FORMAT_TRIVIA,
    KNOWLEDGE_FORMATS,
    ONBOARDING_SLUGS,
    OPINION_FORMATS,
    QUIZ_ONLY_SLUGS,
    format_to_scoring_mode,
    format_to_tags,
    formats_for,
    normalize_slug,
    types_for,
)

MIN_LIVE = 8

EVENT_POLL_TYPES = frozenset({"opinion", "debate", "prediction", "challenge", "versus", "hypothetical"})
EVENT_QUIZ_TYPES = frozenset({"stat", "who", "which", "facts", "records"})
# Freeform trend polls for every onboarding category (not bound to the evergreen bank).
# Freeform opinion types — includes high-engagement pollTypes from poll_prompt.py.
TREND_POLL_TYPES = frozenset(
    {
        "opinion",
        "debate",
        "hot",
        "pick_one",
        "who_is_right",
        "who_is_more_likely",
        "what_would_you_do",
        "prediction",
        "versus",
        "personality",
        "unpopular_opinion",
        "hypothetical",
        "social_debate",
    }
)
# Freeform India-trend trivia (well-known facts only — not locked to the evergreen bank).
TREND_QUIZ_TYPES = frozenset({"trivia", "who", "which", "facts", "recognition"})

GAMBLING_WORDS = ("odds", "payout", "bet", "stake", "wager")
SMALL_WORDS = frozenset({"The", "A", "An", "It", "Who", "How", "What", "Which", "Prediction", "Fair"})
# Devanagari belongs on Hindi-native cards (content_lang=hi) only — never in English prompt/label fields.
_DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]+")
_MULTI_SPACE_RE = re.compile(r"\s{2,}")
# Latin-script Hindi / Hinglish tokens that must not appear in English prompt/label fields.
_HINGLISH_LATIN_RE = re.compile(
    r"(?i)(?<![A-Za-z])("
    r"yaar|yaarr|kya|kyun|kyoon|nahi|nahin|bahut|bohot|kitna|kitne|kitni|"
    r"itna|itne|matlab|bilkul|accha|achha|acha|theek|thik|bhaiya|bhai|"
    r"abhi|phir|lekin|magar|toh|hai\s+kya|kya\s+hai|scene\s+hai|full\s+on|"
    r"maja\s+aa|mazza|mazzaa|arre|arrey|arey|bas\s+yaar"
    r")(?![A-Za-z])"
)

BRIEFS_DIR = Path(__file__).resolve().parent / "briefs"
TRENDS_DIR = Path(__file__).resolve().parent / "trends"


def has_devanagari(text: str) -> bool:
    return bool(_DEVANAGARI_RE.search(text or ""))


def has_hinglish_latin(text: str) -> bool:
    """True when English fields contain Hindi/Hinglish written in Latin letters."""
    return bool(_HINGLISH_LATIN_RE.search(text or ""))


def strip_devanagari(text: str) -> str:
    """Remove Devanagari runs so English fields stay language-clean for lang=en."""
    cleaned = _DEVANAGARI_RE.sub(" ", text or "")
    cleaned = re.sub(r"\s*[|/·]+\s*", " ", cleaned)
    cleaned = _MULTI_SPACE_RE.sub(" ", cleaned).strip(" -")
    cleaned = re.sub(r"([?!])\s*[?!]+$", r"\1", cleaned)
    return cleaned.strip()


# Latin words that look like English leftovers in a Hindi field (Excited, trailer, What's…).
# Keep short acronyms / brand tokens people leave in Latin (MV, OTT, DRS, IPL, Maggi).
_LATIN_ENGLISH_LEFTOVER_RE = re.compile(
    r"(?:^|\s)(?:(?:[A-Za-z]+')?[A-Za-z]*[a-z]{5,}[!?.]*|[Ww]hat'?s|[Yy]our|[Tt]he|[Aa]nd|[Ff]or|[Ww]ith)(?=\s|$)"
)


def prefer_devanagari(text: str) -> str:
    """Keep Hindi/Devanagari Hinglish; drop Latin-only bilingual halves / English leftovers."""
    raw = (text or "").strip()
    if not raw or not has_devanagari(raw):
        return raw
    parts = [p.strip() for p in re.split(r"\s*[|/·]+\s*", raw) if p.strip()]
    if len(parts) > 1:
        # Prefer the most Devanagari-heavy half (Hinglish loanwords stay with that half).
        parts.sort(key=lambda p: (-len(_DEVANAGARI_RE.findall(p)), len(p)))
        raw = parts[0]
    cleaned = _LATIN_ENGLISH_LEFTOVER_RE.sub(" ", raw)
    cleaned = _MULTI_SPACE_RE.sub(" ", cleaned).strip()
    cleaned = re.sub(r"([?!])\s*[?!]+$", r"\1", cleaned).strip()
    return cleaned or raw


@dataclass
class Card:
    type: str
    category_slug: str
    format: str
    question_type: str
    prompt: str
    options: list[dict[str, Any]]
    scoring_mode: str
    tags: list[str]
    ends_at: datetime | None = None
    brief_id: str | None = None
    event_date: str | None = None
    facts_used: list[str] = field(default_factory=list)
    prompt_hi: str | None = None

    def option_labels(self) -> list[str]:
        return [str(o["label"]) for o in self.options]

    def needs_hi(self) -> bool:
        if not (self.prompt_hi or "").strip():
            return True
        return any(not str(opt.get("labelHi") or "").strip() for opt in self.options)

    def has_complete_hi(self) -> bool:
        """True when Hindi fields are present and look like Devanagari copy."""
        if self.needs_hi():
            return False
        if not has_devanagari(self.prompt_hi or ""):
            return False
        return all(has_devanagari(str(opt.get("labelHi") or "")) for opt in self.options)


# (question_type, prompt, options)
Poll = tuple[str, str, tuple[str, ...]]
# (question_type, prompt, options, correct index)
Quiz = tuple[str, str, tuple[str, ...], int]


def _p(question_type: str, prompt: str, *options: str) -> Poll:
    return (question_type, prompt, options)


def _q(question_type: str, prompt: str, options: tuple[str, ...], correct: int) -> Quiz:
    return (question_type, prompt, options, correct)


POLLS: dict[str, tuple[Poll, ...]] = {
    "boys-girls": (
        _p("travel", "Your ideal escape looks like…", "Beach person — sunsets and slow days", "Mountain person — cool air and quiet trails"),
        _p("travel", "How do you take a trip?", "Planned itinerary — every hour booked", "Spontaneous adventure — buy the ticket and go"),
        _p("fitness", "Your real workout looks like…", "Morning run — out the door before the city wakes", "Evening gym — weights after the day ends"),
        _p("fitness", "How do you like to move?", "Yoga and stretching — slow and steady", "Heavy lifting — last set or it did not count"),
        _p("social", "Your weekend energy looks like…", "Weekend party — stay out with the group", "Quiet night — home and an early finish"),
        _p("social", "Plans with people look like…", "Big friend group — the more the louder", "Two close friends — one table is enough"),
        _p("everyday", "Your default evening looks like…", "Books and coffee — a quiet corner", "Movies and popcorn — lights off"),
        _p("everyday", "How do you handle money?", "Save for later — future you says thanks", "Spend on experiences — the story is the point"),
        _p("work", "Your ambition looks like…", "Stable job — a clear ladder", "Risky dream project — build the thing"),
        _p("work", "How do you do the work?", "Work alone — headphones on", "Brainstorm with a team — whiteboard full"),
        _p("friendship", "How do you show up for a friend?", "Call them — hear the whole story", "Send a meme — say it without a speech"),
        _p("friendship", "A disagreement looks like…", "Sort it out now — talk before you sleep", "Take some space — come back calmer"),
        _p("plans", "Last-minute group plan — you in?", "Say yes", "Need a day to decide"),
        _p("seen", "You read the message. What next?", "Reply now", "Leave it on seen"),
        _p("birthday", "Friend's birthday — how do you show up?", "Call", "A text is enough", "Story reply and done"),
        _p("drama", "Group chat is on fire. Your move?", "Jump in", "Mute for an hour"),
        _p("intro", "A new person joins. What do you do?", "Talk first", "Wait to be pulled in"),
        _p("cancel", "You need to cancel plans. How?", "Say it early", "Hope they cancel first"),
    ),
    "kpop": (
        _p("bias", "Your bias is the one who…", "Owns the encore — center stage", "Sings the high note — that one line"),
        _p("comeback", "Midnight comeback drop. Your move?", "Stream the music video first", "Learn the chorus before breakfast"),
        _p("concept", "Which concept is your era?", "Dark and cinematic — black outfits", "Fresh and bright — pastels, smile"),
        _p("lightstick", "Concert night looks like…", "Lightstick up — you know every fan chant", "Phone away — you just want the live vocal"),
        _p("playlist", "Your playlist is mostly…", "Title tracks — the big chorus only", "B-sides — the songs they skip promoting"),
        _p("bias", "Pick your fandom habit.", "Streaming party — refresh the view count", "Fancam loop — one member, all night"),
        _p("pace", "You press play for…", "A slow romance", "A thriller that starts loud"),
        _p("binge", "Episode one ends. Next move?", "Start episode two", "Save it for tomorrow"),
        _p("lead", "Who are you rooting for?", "The quiet lead", "The scene-stealer friend"),
        _p("ost", "Great soundtrack — what do you do?", "Add it immediately", "Only notice the sad scene"),
        _p("end", "Sad ending landed. Your reaction?", "Accept it", "Need a fan edit"),
        _p("sub", "How do you watch?", "Subtitles, original audio", "A dub if you are cooking"),
    ),
    "football": (
        _p("watch", "Big match night. Where are you?", "On the couch with the stream", "In the stands if you can get a ticket"),
        _p("loyalty", "Your club loyalty looks like…", "Same colours every season", "You follow the players you love"),
        _p("fantasy", "Your fantasy move is…", "Safe captain and an early night", "A differential and a loud group chat"),
        _p("derby", "Derby week. Your mood is…", "Nervous until the whistle", "Hyped from the team sheet"),
        _p("ritual", "Your match ritual is…", "Jersey on, snacks ready", "Headphones in, no spoilers"),
        _p("take", "Bad call against your side. Next?", "Rewatch the clip twice", "Trust the referee and move on"),
    ),
    "cricket": (
        _p("powerplay", "Powerplay over. Your instinct is…", "Swing at everything", "Keep wickets in hand"),
        _p("death", "Death overs. You bowl…", "Yorkers at the stumps", "Slower balls and hope"),
        _p("captaincy", "Your captain looks like…", "Calm, field set early", "Aggressive, always hunting a wicket"),
        _p("toss", "You win the toss. What do you do?", "Bat first and set a total", "Chase under lights"),
        _p("watch", "India night. You watch with…", "Family and a running commentary", "Friends and a second screen"),
        _p("format", "Your format is…", "T20 — three hours and done", "Test — five days if it lasts"),
    ),
    "bollywood": (
        _p("screen", "Friday night. Where do you watch?", "Theatre — big screen only", "Couch and a stream"),
        _p("interval", "What keeps you in the seat?", "An interval twist", "A slow burn that earns the end"),
        _p("sequel", "Sequel announced. Your move?", "Book early", "Wait for reviews", "Protect the original"),
        _p("snack", "Interval snack. Your move?", "Always popcorn", "Sneak your own", "Skip food"),
        _p("language", "How do you watch?", "Hindi original", "Dubbed, subtitles on"),
        _p("company", "Who is in the next seat?", "The group chat, all of them", "One friend who will not talk"),
        _p("night", "Tonight is for…", "A new Hindi release", "A rewatch of a classic"),
        _p("spoiler", "Someone starts a spoiler. Next?", "Cover your ears", "Tell them to finish"),
        _p("rewatch", "You rewatch because…", "It feels like home", "You forgot the plot"),
        _p("song", "Interval song hits. Your move?", "Sing along", "Wait for the story"),
        _p("star", "You pick a film for…", "The lead pair", "The director"),
        _p("end", "Credits are rolling. What do you do?", "Sit through them", "Are already discussing the end"),
    ),
    "music": (
        _p("playlist", "What is winning your week?", "Film songs", "Indie and alt", "Hip-hop", "Lo-fi focus"),
        _p("tickets", "Concert tickets dropped. Next?", "Buy in the first minute", "Wait to see who else is going", "The stream is enough"),
        _p("live", "What hits harder?", "A live gig", "The studio album"),
        _p("discovery", "How do you find a new song?", "A friend sends it", "The autoplay keeps going"),
        _p("volume", "Your listening looks like…", "Headphones, world off", "Speaker, everyone hears it"),
        _p("memory", "A song sticks because…", "The chorus", "The memory attached to it"),
    ),
    "indian-foods": (
        _p("craving", "Late night. What wins?", "Street food", "Whatever is already at home"),
        _p("chai", "The cup in your hand is…", "Chai, extra hot", "Coffee, no debate in the cup"),
        _p("loyalty", "Biryani loyalty. You are…", "One city, one shop", "You will try every version"),
        _p("plan", "Dinner is…", "Cooked at home", "Ordered in"),
        _p("spice", "Food comes spicy. Your move?", "Ask for extra", "Keep it mild"),
        _p("sweet", "After the meal, what do you want?", "Need something sweet", "Are already done"),
    ),
    "weather": (
        _p("commute", "Unexpected rain. What do you do?", "Wait it out", "Walk anyway"),
        _p("season", "Your season is…", "Monsoon and the smell of wet earth", "Winter mornings and a sweater"),
        _p("ac", "The room is…", "AC on, always", "Fan and an open window"),
        _p("plan", "The forecast changes your plan. You…", "Reschedule", "Go anyway"),
        _p("morning", "Cold morning. What do you do?", "Get up for it", "Add ten more minutes in bed"),
        _p("heat", "Peak afternoon heat. Your move?", "Stay indoors", "Still go out"),
    ),
    "tech": (
        _p("phone", "New phone drops. Your move?", "Read the reviews first", "Want it the same day"),
        _p("privacy", "App asks for permissions. You?", "Deny almost everything", "Tap allow and move on"),
        _p("work", "AI at work — how do you use it?", "Use it every day", "Keep it for drafts only"),
        _p("apps", "Your home screen is…", "A few tools you actually open", "A folder of apps you forgot"),
        _p("os", "Your phone is…", "iOS", "Android"),
        _p("hype", "Startup launch day. Your move?", "Try the preview", "Wait until your friends complain"),
        _p("read", "Science headline drops. Next?", "Open the paper", "Trust the summary"),
        _p("wonder", "You would rather understand…", "Space", "The human body"),
        _p("experiment", "Kitchen experiment. How do you cook?", "Follow the steps", "Change one thing and see"),
        _p("fact", "Surprising fact lands. Next?", "Check it", "Repeat it at dinner"),
        _p("future", "The invention you want is…", "Clean energy that just works", "A doctor in your pocket"),
        _p("class", "Science class was…", "The lab", "The diagrams"),
    ),
    "news": (
        _p("habit", "Morning news habit looks like?", "Read one long piece", "Scroll headlines and stop"),
        _p("check", "Viral claim pops up. Your move?", "Look for the source", "Forward it if it feels true"),
        _p("alerts", "Breaking alerts — keep or mute?", "Keep them on", "Mute the noise"),
        _p("depth", "You trust…", "A reporter you follow", "A friend who reads a lot"),
        _p("share", "A news story upsets you. Next?", "Read the whole thing", "Close the app"),
        _p("time", "News time is…", "With breakfast", "Late, if at all"),
    ),
    "pop-culture": (
        _p("meme", "Meme of the week. Your move?", "Send it to three chats", "Are already tired of it"),
        _p("audio", "Viral audio drops. Your move?", "Use it the same day", "Let it pass"),
        _p("fandom", "Two fandoms fighting. Your move?", "Pick a side", "Watch with snacks"),
        _p("creator", "Creator you like slips. Next?", "Give them one more video", "Unfollow quietly"),
        _p("trend", "Reel trend hits. Your move?", "Try it once", "Scroll past"),
        _p("quote", "You remember a show by…", "One line everyone quotes", "The ending"),
    ),
    "social": (
        _p("plans", "Last-minute group plan — you in?", "Say yes", "Need a day to decide"),
        _p("seen", "You read the message. What next?", "Reply now", "Leave it on seen"),
        _p("birthday", "Friend's birthday — how do you show up?", "Call", "A text is enough", "Story reply and done"),
        _p("drama", "Group chat is on fire. Your move?", "Jump in", "Mute for an hour"),
        _p("intro", "A new person joins. What do you do?", "Talk first", "Wait to be pulled in"),
        _p("cancel", "You need to cancel plans. How?", "Say it early", "Hope they cancel first"),
    ),
    "casual": (
        _p("sunday", "Sunday looks like…", "A full reset", "Nothing planned, on purpose"),
        _p("monday", "Monday morning. How do you start?", "Start on time", "Negotiate with the alarm"),
        _p("snooze", "Alarm goes off. What do you do?", "Stand up", "One more snooze"),
        _p("evening", "Free evening. What wins?", "Go out", "Stay in"),
        _p("scroll", "Meant to sleep. What happens?", "Put the phone down", "One more video"),
        _p("errand", "Boring task waiting. Your move?", "Do it now", "Add it to tomorrow"),
    ),
    "entertainment": (
        _p("night", "Tonight is for…", "A film", "A series you will not pause"),
        _p("spoiler", "Someone starts a spoiler. Next?", "Cover your ears", "Tell them to finish"),
        _p("rewatch", "You rewatch because…", "It feels like home", "You forgot the plot"),
        _p("live", "A live show versus a recording. You pick…", "Live", "The recording, pause button included"),
        _p("host", "You are hosting. The plan is…", "A film everyone can talk over", "A game on the table"),
        _p("end", "Credits are rolling. What do you do?", "Sit through them", "Are already discussing the end"),
    ),
    "fashion": (
        _p("fit", "Getting dressed — what's the move?", "Plan the outfit", "Grab what is clean"),
        _p("trend", "A fashion trend hits. You…?", "Try it once", "Wait until it looks normal"),
        _p("shoes", "The pair you reach for…", "Comfort first", "The good ones"),
        _p("shop", "You shop when…", "You need something", "You are bored"),
        _p("colour", "Your default colour is…", "Black, always", "Whatever is bright"),
        _p("event", "Wedding invite landed. Outfit plan?", "Buy something new", "Restyle what you own"),
    ),
    "politics": (
        _p("source", "Political claim pops up. Next?", "Read the primary source", "Ask who shared it"),
        _p("talk", "Politics at the table. Your move?", "Join the argument", "Change the subject"),
        _p("vote", "Election week. What are you doing?", "Plan the day you will vote", "Still deciding"),
        _p("news", "You follow politics through…", "One paper", "Clips and explainers"),
        _p("local", "Local issue pops up. Your move?", "Show up", "Sign something online"),
        _p("tone", "TV debate is on. Your move?", "Watch to the end", "Mute it"),
    ),
    "science": (
        _p("read", "Science headline drops. Next?", "Open the paper", "Trust the summary"),
        _p("wonder", "You would rather understand…", "Space", "The human body"),
        _p("experiment", "Kitchen experiment. How do you cook?", "Follow the steps", "Change one thing and see"),
        _p("fact", "Surprising fact lands. Next?", "Check it", "Repeat it at dinner"),
        _p("future", "The invention you want is…", "Clean energy that just works", "A doctor in your pocket"),
        _p("class", "Science class was…", "The lab", "The diagrams"),
    ),
    "health": (
        _p("morning", "A healthy morning is…", "Water before the phone", "A real breakfast"),
        _p("sleep", "Sleep vs one more episode?", "Protect the hours", "One more episode"),
        _p("move", "How are you moving today?", "A walk outside", "A planned workout"),
        _p("stress", "Heavy day — what do you do?", "Step away for ten minutes", "Push through and crash later"),
        _p("food", "Eating well this week means…", "Cooking more", "One less order-in"),
        _p("check", "Weird symptom shows up. Next?", "Ask a doctor", "Search and worry"),
    ),
    "k-drama": (
        _p("pace", "You press play for…", "A slow romance", "A thriller that starts loud"),
        _p("binge", "Episode one ends. Next move?", "Start episode two", "Save it for tomorrow"),
        _p("lead", "Who are you rooting for?", "The quiet lead", "The scene-stealer friend"),
        _p("ost", "Great soundtrack — what do you do?", "Add it immediately", "Only notice the sad scene"),
        _p("end", "Sad ending landed. Your reaction?", "Accept it", "Need a fan edit"),
        _p("sub", "How do you watch?", "Subtitles, original audio", "A dub if you are cooking"),
    ),
    "gaming": (
        _p("session", "Tonight you queue for…", "A ranked match", "A chill casual lobby"),
        _p("genre", "Your main is…", "Shooters", "Strategy and MOBAs", "Story single-player"),
        _p("squad", "You play with…", "The same trio every night", "Solo queue and vibes"),
        _p("spend", "Battle pass drops. Your move?", "Buy it on day one", "Grind free rewards only"),
        _p("device", "You mostly play on…", "Mobile", "PC or console"),
        _p("tilt", "After a loss streak you…", "One more game", "Close the app"),
    ),
    # math-puzzles / maths / word-puzzles / memory-games: quiz or FTD only — no opinion polls.
    "mythology": (
        _p("ramayana", "Which quality of Hanuman would you most want?", "Courage", "Devotion", "Loyalty"),
        _p("mahabharat", "Was Karna's loyalty his greatest…", "Strength", "Weakness"),
        _p("versus", "Who would you choose as a mentor?", "Krishna", "Dronacharya"),
        _p("morals", "Was Yudhishthira right to follow the dice rules?", "Yes — dharma first", "No — family first"),
        _p("shiv", "What draws you more in Shiv stories?", "Ascetic calm", "Fierce power"),
        _p("hypothetical", "If you were Vibhishan, would you leave Lanka?", "Leave for dharma", "Stay loyal to home"),
    ),
    "tv-serials": (
        _p("plots", "A big twist drops mid-week. You…", "Rewatch immediately", "Wait for tonight's episode"),
        _p("characters", "Which character type do you root for?", "The underdog", "The schemer"),
        _p("endings", "How should a long-running serial end?", "Clean closure", "Open for a reboot"),
        _p("nostalgia", "Peak TV nostalgia is…", "Early 2000s soaps", "Recent family dramas"),
        _p("versus", "Who carries the show?", "Lead pair chemistry", "Supporting cast chaos"),
        _p("prediction", "Next big leap will be…", "Time skip", "New villain entry"),
    ),
    "general-knowledge": (
        _p("habits", "You learn something new mostly from…", "Short videos", "Long reads"),
        _p("india", "India fact debates with friends feel…", "Fun and competitive", "Too nerdy"),
        _p("versus", "What should schools emphasize more?", "Practical skills", "General knowledge"),
        _p("internet", "Viral 'fact' lands. You…", "Verify first", "Share if it sounds right"),
        _p("opinions", "Quiz nights are…", "Your comfort zone", "Only for specialists"),
        _p("social_debate", "Is GK more useful than trending news?", "GK wins", "News wins"),
    ),
}

QUIZZES: dict[str, tuple[Quiz, ...]] = {
    "boys-girls": (
        _q("travel", "Aarav books nothing and takes the first bus toward the hills. Which travel vibe is that?", ("Spontaneous adventure — buy the ticket and go", "Planned itinerary — every hour booked", "Beach person — sunsets and slow days"), 0),
        _q("fitness", "Meera lifts until the last set and skips the stretching mat. Which fitness vibe is that?", ("Heavy lifting — last set or it did not count", "Yoga and stretching — slow and steady", "Morning run — out the door before the city wakes"), 0),
        _q("social", "Two friends, one table, home before midnight. Which social vibe is that?", ("Two close friends — one table is enough", "Big friend group — the more the louder", "Weekend party — stay out with the group"), 0),
        _q("everyday", "The evening is a book, a quiet corner, and a hot cup. Which everyday vibe is that?", ("Books and coffee — a quiet corner", "Movies and popcorn — lights off", "Spend on experiences — the story is the point"), 0),
        _q("work", "They quit the steady role to build a project that might fail. Which work vibe is that?", ("Risky dream project — build the thing", "Stable job — a clear ladder", "Work alone — headphones on"), 0),
        _q("friendship", "A friend is upset, so they send a meme instead of a speech. Which friendship vibe is that?", ("Send a meme — say it without a speech", "Call them — hear the whole story", "Sort it out now — talk before you sleep"), 0),
    ),
    "kpop": (
        _q("concept", "A group returns in black outfits with a whisper chorus. Which concept is it?", ("Dark and cinematic — black outfits", "Fresh and bright — pastels, smile", "Title tracks — the big chorus only"), 0),
        _q("playlist", "You skip the promoted single and loop the deep cuts. Which playlist habit is that?", ("B-sides — the songs they skip promoting", "Title tracks — the big chorus only", "Streaming party — refresh the view count"), 0),
        _q("lightstick", "You know every fan chant and the colour of the official light. Which concert habit is that?", ("Lightstick up — you know every fan chant", "Phone away — you just want the live vocal", "Fancam loop — one member, all night"), 0),
        _q("ost", "The songs written for a series are the…", ("Soundtrack", "Toss", "Headline"), 0),
        _q("sub", "Translated lines on screen while you hear the original actors are…", ("Subtitles", "A derby", "A century"), 0),
    ),
    "football": (
        _q("watch", "A sport uses a round ball and a goal, and outfield players may not handle the ball. Which sport is it?", ("Football", "Swimming", "Chess"), 0),
        _q("derby", "Two local clubs play each other and the city splits. What is that match called?", ("A derby", "A friendly", "A trial"), 0),
    ),
    "cricket": (
        _q("format", "A batter scores a hundred runs in one innings. What is that score called?", ("A century", "A duck", "A maiden"), 0),
        _q("powerplay", "The fielding side is limited in how many fielders can be outside the circle at the start of a T20. What is that phase called?", ("The powerplay", "The death", "The toss"), 0),
    ),
    "bollywood": (
        _q("interval", "The short break in the middle of a theatrical film in India is called the…", ("Interval", "Encore", "Overture"), 0),
        _q("screen", "A film you leave the house to see on a large shared screen is a…", ("Theatre screening", "Dub", "Sequel"), 0),
        _q("spoiler", "Telling the ending before someone has watched is a…", ("Spoiler", "Chorus", "Headline"), 0),
        _q("rewatch", "Playing a film you have already finished is a…", ("Rewatch", "Debut", "Toss"), 0),
    ),
    "music": (
        _q("live", "A recording made in front of an audience, wrong notes included, is a…", ("Live album", "Studio album", "Playlist"), 0),
        _q("playlist", "A short list of songs you queue on purpose is a…", ("Playlist", "Encore", "Ticket"), 0),
    ),
    "indian-foods": (
        _q("chai", "Milk, tea, and spice simmered together is…", ("Chai", "Black coffee", "A smoothie"), 0),
        _q("loyalty", "A spiced rice dish with meat or vegetables, claimed by many cities, is…", ("Biryani", "Toast", "Salad"), 0),
    ),
    "weather": (
        _q("season", "The rainy season that fills Indian streets is the…", ("Monsoon", "Winter", "A drought"), 0),
        _q("heat", "Water falling from a cloud is…", ("Rain", "Fog", "A breeze"), 0),
    ),
    "tech": (
        _q("os", "The mobile system made by Apple is…", ("iOS", "A browser", "A charger"), 0),
        _q("privacy", "A prompt that asks if an app may use your camera is a…", ("Permission", "Playlist", "Derby"), 0),
        _q("read", "A formal write-up of an experiment is a…", ("Paper", "Playlist", "Jersey"), 0),
        _q("wonder", "The study of stars, planets, and what is beyond Earth is…", ("Space science", "Fashion", "A derby"), 0),
    ),
    "news": (
        _q("check", "Comparing a viral claim with a named source is a…", ("Fact check", "Rumour", "Spoiler"), 0),
        _q("habit", "The title line of a story, before the article, is the…", ("Headline", "Chorus", "Interval"), 0),
    ),
    "pop-culture": (
        _q("meme", "A joke format copied across thousands of posts is a…", ("Meme", "Century", "Derby"), 0),
        _q("audio", "A short sound everyone reuses on video is a…", ("Viral audio", "Headline", "Toss"), 0),
    ),
    "social": (
        _q("seen", "Opening a chat so the sender can tell you read it is leaving them…", ("On seen", "On mute", "On stage"), 0),
        _q("plans", "A plan made an hour before it starts is…", ("Short notice", "A century", "A sequel"), 0),
    ),
    "casual": (
        _q("snooze", "Tapping the alarm so it rings again in a few minutes is…", ("Snooze", "A powerplay", "A dub"), 0),
        _q("sunday", "The day many people treat as a reset before the week is…", ("Sunday", "A toss", "An interval"), 0),
    ),
    "entertainment": (
        _q("spoiler", "Telling the ending before someone has watched is a…", ("Spoiler", "Chorus", "Headline"), 0),
        _q("rewatch", "Playing a film you have already finished is a…", ("Rewatch", "Debut", "Toss"), 0),
    ),
    "fashion": (
        _q("fit", "The combination of clothes you leave the house in is an…", ("Outfit", "Playlist", "Innings"), 0),
        _q("shoes", "The pair you wear on your feet is…", ("Shoes", "Subtitles", "A wicket"), 0),
    ),
    "politics": (
        _q("vote", "Marking a choice in an election is a…", ("Vote", "Encore", "Snooze"), 0),
        _q("source", "The original document behind a claim is a…", ("Primary source", "Meme", "Dub"), 0),
    ),
    "science": (
        _q("read", "A formal write-up of an experiment is a…", ("Paper", "Playlist", "Jersey"), 0),
        _q("wonder", "The study of stars, planets, and what is beyond Earth is…", ("Space science", "Fashion", "A derby"), 0),
    ),
    "health": (
        _q("sleep", "The hours your body uses to recover at night are…", ("Sleep", "A comeback", "A headline"), 0),
        _q("move", "Walking or training so your body works is…", ("Movement", "A spoiler", "A toss"), 0),
    ),
    "k-drama": (
        _q("ost", "The songs written for a series are the…", ("Soundtrack", "Toss", "Headline"), 0),
        _q("sub", "Translated lines on screen while you hear the original actors are…", ("Subtitles", "A derby", "A century"), 0),
    ),
    "gaming": (
        _q("genre", "A game built around shooting from a first-person view is often called…", ("An FPS", "A puzzle", "A rhythm game"), 0),
        _q("mode", "Playing against other people online is…", ("Multiplayer", "A cutscene", "A tutorial"), 0),
    ),
    "math-puzzles": (
        _q("number_puzzles", "What comes next: 2, 4, 8, 16, …?", ("32", "24", "20"), 0),
        _q("patterns", "Which number does not belong: 3, 5, 7, 9, 11?", ("9", "5", "11"), 0),
        _q("quick_calc", "A shirt costs ₹800. 25% off is…", ("₹600", "₹700", "₹500"), 0),
        _q("logic_lite", "If all A are B, and this is A, then it is…", ("Definitely B", "Never B", "Maybe C"), 0),
    ),
    "logical-reasoning": (
        _q("pattern", "What comes next: 1, 1, 2, 3, 5, …?", ("8", "6", "7"), 0),
        _q("odd", "Which does not belong: square, circle, triangle, banana?", ("Banana", "Circle", "Square"), 0),
    ),
    "maths": (
        _q("percent", "Half of 100 is…", ("50", "25", "75"), 0),
        _q("order", "The next even number after 8 is…", ("10", "9", "7"), 0),
        _q("arithmetic", "12 + 8 − 5 equals…", ("15", "16", "10"), 0),
        _q("ratios", "A 2:1 mix of water to milk. For 2 cups milk you need…", ("4 cups water", "2 cups water", "1 cup water"), 0),
    ),
    "mythology": (
        _q("characters", "In the Ramayana, who is known for devotion and strength?", ("Hanuman", "Shakuni", "Duryodhana"), 0),
        _q("events", "The Mahabharata war is set mainly around which place?", ("Kurukshetra", "Ayodhya", "Lanka"), 0),
        _q("who", "Who is Sita's husband in the Ramayana?", ("Ram", "Lakshman", "Bharat"), 0),
    ),
    "tv-serials": (
        _q("shows", "A long-running daily Indian family drama is often called a…", ("Soap / serial", "Short film", "News bulletin"), 0),
        _q("cast", "The main romantic pair of a serial are usually called the…", ("Lead pair", "Guest anchors", "Umpires"), 0),
        _q("which", "An episode that reveals a major secret is often called a…", ("Twist episode", "Friendly", "Interval"), 0),
    ),
    "general-knowledge": (
        _q("india", "India's national animal is the…", ("Tiger", "Lion", "Elephant"), 0),
        _q("world", "The largest ocean on Earth is the…", ("Pacific", "Atlantic", "Indian"), 0),
        _q("science_lite", "Water freezes at…", ("0°C", "100°C", "50°C"), 0),
    ),
    "word-puzzles": (
        _q("anagrams", "Unscramble these letters to make a fruit: PLEAP", ("Apple", "Grape", "Mango"), 0),
        _q("anagrams", "Rearrange EARTH to make a body part", ("Heart", "Ear", "Hair"), 0),
        _q("anagrams", "Unscramble OCEHR to make a place to sing", ("Choir", "Horse", "Shore"), 0),
        _q("missing_letters", "Fill in the blanks: C_FF__", ("Coffee", "Castle", "Circus"), 0),
        _q("missing_letters", "Complete the word: T_G_R", ("Tiger", "Tower", "Tutor"), 0),
        _q("synonyms", "Which word means almost the same as 'happy'?", ("Glad", "Angry", "Tired"), 0),
        _q("synonyms", "Which word means almost the same as 'begin'?", ("Start", "Finish", "Pause"), 0),
        _q("riddles", "I have keys but no locks, space but no room. What am I?", ("A keyboard", "A piano", "A map"), 0),
        _q("riddles", "What has cities but no houses, and roads but no cars?", ("A map", "A dream", "A cloud"), 0),
    ),
}


def question_types(slug: str, fmt: str) -> set[str]:
    """Allowed content types for a category format (taxonomy + bank + trend extras)."""
    key = normalize_slug(slug)
    # Never invent poll/trivia types for formats this category does not allow
    # (e.g. word-puzzles is quiz-only — pollQuestionTypes must stay empty).
    if fmt not in set(formats_for(key)):
        return set()
    allowed = set(types_for(key, fmt))
    # Bank rows still contribute known evergreen types.
    if fmt in OPINION_FORMATS or fmt == FORMAT_POLL:
        allowed |= {row[0] for row in POLLS.get(key, ())}
        allowed |= set(TREND_POLL_TYPES)
        if key in EVENT_SLUGS:
            allowed |= set(EVENT_POLL_TYPES)
    if fmt in KNOWLEDGE_FORMATS or fmt == FORMAT_QUIZ:
        allowed |= {row[0] for row in QUIZZES.get(key, ())}
        # Skill puzzles stay puzzle-typed — do not open freeform "trivia" trend types.
        if key not in QUIZ_ONLY_SLUGS:
            allowed |= set(TREND_QUIZ_TYPES)
        if key in EVENT_SLUGS:
            allowed |= set(EVENT_QUIZ_TYPES)
    if fmt == FORMAT_THIS_OR_THAT:
        allowed |= set(TREND_POLL_TYPES)
    if fmt == FORMAT_TRIVIA:
        allowed |= set(TREND_QUIZ_TYPES)
    if fmt == FORMAT_FIND_THE_DIFFERENCE:
        allowed |= set(types_for(key, FORMAT_FIND_THE_DIFFERENCE)) or {"scenes", "objects"}
    return allowed


def bank_labels(slug: str, question_type: str | None = None) -> set[str]:
    key = normalize_slug(slug)
    labels: set[str] = set()
    for qtype, _prompt, options in POLLS.get(key, ()):
        if question_type is None or qtype == question_type:
            labels.update(options)
    for qtype, _prompt, options, _correct in QUIZZES.get(key, ()):
        if question_type is None or qtype == question_type:
            labels.update(options)
    return labels


def bank_text(slug: str) -> str:
    key = normalize_slug(slug)
    parts: list[str] = []
    for _qtype, prompt, options in POLLS.get(key, ()):
        parts.append(prompt)
        parts.extend(options)
    for _qtype, prompt, options, _correct in QUIZZES.get(key, ()):
        parts.append(prompt)
        parts.extend(options)
    return "\n".join(parts)


def _card_from_poll(slug: str, row: Poll) -> Card:
    question_type, prompt, options = row
    moment_type = "predict" if len(options) == 2 else "pulse"
    return Card(
        type=moment_type,
        category_slug=slug,
        format=FORMAT_POLL,
        question_type=question_type,
        prompt=prompt,
        options=[{"label": label, "isCorrect": False} for label in options],
        scoring_mode=format_to_scoring_mode(FORMAT_POLL),
        tags=format_to_tags(FORMAT_POLL, slug),
    )


def _card_from_quiz(slug: str, row: Quiz) -> Card:
    question_type, prompt, options, correct = row
    return Card(
        type="pulse",
        category_slug=slug,
        format=FORMAT_QUIZ,
        question_type=question_type,
        prompt=prompt,
        options=[{"label": label, "isCorrect": i == correct} for i, label in enumerate(options)],
        scoring_mode=format_to_scoring_mode(FORMAT_QUIZ),
        tags=format_to_tags(FORMAT_QUIZ, slug),
    )


def generate_stock(slug: str) -> list[Card]:
    """Evergreen polls and quizzes for one category. Empty if the slug is unknown."""
    key = normalize_slug(slug)
    allowed = set(formats_for(key))
    cards: list[Card] = []
    if key in POLLS and (FORMAT_POLL in allowed or FORMAT_THIS_OR_THAT in allowed):
        cards.extend(_card_from_poll(key, row) for row in POLLS[key])
    if key in QUIZZES and (FORMAT_QUIZ in allowed or FORMAT_TRIVIA in allowed):
        cards.extend(_card_from_quiz(key, row) for row in QUIZZES[key])
    return cards


def fact_issues(
    prompt: str,
    options: list[str],
    allowed: str,
    *,
    check_entities: bool = True,
) -> list[str]:
    """Names and numbers must already exist in the brief or the category bank.

    Trend polls set check_entities=False so only gambling wording is blocked.
    """
    issues: list[str] = []
    blob = prompt + "\n" + "\n".join(options)
    lowered = blob.lower()
    for word in GAMBLING_WORDS:
        if word in lowered:
            issues.append(f"gambling:{word}")
    if not check_entities:
        return issues
    for num in re.findall(r"\d+", blob):
        if num not in allowed:
            issues.append(f"number:{num}")
    for name in re.findall(r"[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+)+", blob):
        if name not in allowed:
            issues.append(f"name:{name}")
    for label in options:
        for word in re.findall(r"[A-Z][a-z]+", label):
            if word in SMALL_WORDS:
                continue
            if word not in allowed:
                issues.append(f"word:{word}")
    return issues


def load_briefs(folder: Path | None = None) -> list[dict[str, Any]]:
    root = folder or BRIEFS_DIR
    if not root.exists():
        return []
    briefs: list[dict[str, Any]] = []
    for path in sorted(root.glob("*.json")):
        briefs.append(json.loads(path.read_text(encoding="utf-8")))
    return briefs


def _parse_expires_at(raw: str | None) -> datetime | None:
    text = str(raw or "").strip()
    if not text:
        return None
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt
    except ValueError:
        return None


def load_trend_file(path: Path) -> dict[str, Any] | None:
    """Load one category trends file. Returns None if missing/invalid."""
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    return data


def load_trends(folder: Path | None = None) -> dict[str, list[dict[str, Any]]]:
    """Load all ops trend files keyed by category slug (unfiltered)."""
    root = folder or TRENDS_DIR
    by_slug: dict[str, list[dict[str, Any]]] = {}
    if not root.exists():
        return by_slug
    for path in sorted(root.glob("*.json")):
        if path.name.startswith("_"):
            continue
        data = load_trend_file(path)
        if not data:
            continue
        slug = str(data.get("category") or path.stem).strip()
        rows = data.get("trends") or []
        if not isinstance(rows, list):
            continue
        by_slug[slug] = [row for row in rows if isinstance(row, dict)]
    return by_slug


def trends_for(
    slug: str,
    *,
    folder: Path | None = None,
    now: datetime | None = None,
    rows: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Active India trends for one category. Drops expired and wrong-category rows."""
    now = now or datetime.now(UTC)
    key = normalize_slug(slug)
    if rows is None:
        all_rows = load_trends(folder)
        rows = list(all_rows.get(key) or [])
        # Also pull legacy slug files that remapped onto this category.
        for legacy, target in {
            "movies": "bollywood",
            "food": "indian-foods",
            "sports": "football",
            "personality-vibe": "boys-girls",
            "math-numbers": "maths",
            "puzzles": "math-puzzles",
            "logical-reasoning": "math-puzzles",
            "music": "bollywood",
            "pop-culture": "general-knowledge",
            "gaming": "general-knowledge",
            "news": "general-knowledge",
            "tech": "general-knowledge",
            "fashion": "bollywood",
            "health": "general-knowledge",
        }.items():
            if target == key:
                rows.extend(all_rows.get(legacy) or [])
    active: list[dict[str, Any]] = []
    for row in rows:
        cat = normalize_slug(str(row.get("category") or "").strip()) if row.get("category") else ""
        # Items may omit category when the file already scopes the slug.
        if cat and cat != key:
            continue
        expires = _parse_expires_at(str(row.get("expiresAt") or "") or None)
        if expires is not None and expires <= now:
            continue
        trend_id = str(row.get("trendId") or "").strip()
        topic = str(row.get("topic") or "").strip()
        if not trend_id or not topic:
            continue
        active.append(row)
    return active


def normalize_manual_trends(
    rows: list[dict[str, Any]],
    *,
    slug: str,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """Normalize ops trend JSON into the shared verifiedTrends shape."""
    now = now or datetime.now(UTC)
    out: list[dict[str, Any]] = []
    for row in trends_for(slug, now=now, rows=rows):
        event_status = str(row.get("eventStatus") or row.get("freshness") or "live").strip().lower()
        if event_status not in {"live", "upcoming", "recent", "completed", "unknown"}:
            event_status = "live"
        allowed = [str(a) for a in (row.get("allowedAngles") or []) if str(a).strip()]
        if not allowed:
            allowed = ["trivia", "which", "opinion", "debate"]
        if event_status == "completed":
            allowed = [a for a in allowed if a != "prediction"]
        elif "prediction" not in allowed and event_status in {"upcoming", "live"}:
            pass  # only include prediction when ops listed it
        out.append(
            {
                "trendId": str(row["trendId"]),
                "topic": str(row["topic"]),
                "category": slug,
                "trendScore": int(row.get("trendScore") or 50),
                "freshness": str(row.get("freshness") or event_status),
                "indiaRelevance": int(row.get("indiaRelevance") or 100),
                "eventStatus": event_status,
                "eventDate": str(row.get("eventDate") or "") or None,
                "facts": list(row.get("facts") or []),
                "allowedAngles": allowed,
                "allowPrediction": "prediction" in allowed and event_status in {"upcoming", "live", "unknown"},
                "sourceConfidence": str(row.get("sourceConfidence") or "high"),
                "expiresAt": str(row.get("expiresAt") or "") or None,
                "context": str(row.get("context") or row.get("topic") or ""),
                "source": "manual_trends",
            }
        )
    return out


_FORWARD_LOOKING_RE = re.compile(
    r"(?i)\b(next|upcoming|tonight|today|this\s+weekend|tomorrow|coming\s+up|yet\s+to\s+play)\b"
)


def _brief_prediction_open(brief: dict[str, Any], prompt: str, now: datetime) -> bool:
    """Past-dated briefs may keep predictions only when the prompt is clearly forward-looking."""
    if not brief.get("allowPrediction"):
        return False
    raw_date = str(brief.get("eventDate") or "").strip()
    if not raw_date:
        return True
    try:
        event_day = datetime.fromisoformat(raw_date[:10]).date()
    except ValueError:
        return True
    if event_day >= now.date():
        return True
    return bool(_FORWARD_LOOKING_RE.search(prompt or ""))


def cards_from_brief(brief: dict[str, Any], now: datetime | None = None) -> list[Card]:
    """Emit only the formats the brief can support. Predictions need allowPrediction."""
    now = now or datetime.now(UTC)
    allowed = json.dumps(brief)
    hours = int(brief.get("freshnessHours") or 24)
    ends = now + timedelta(hours=hours)
    context = str(brief.get("context") or "")
    slug = normalize_slug(str(brief["category"]))
    event_date = str(brief.get("eventDate") or "")
    brief_id = str(brief["id"])
    specs: tuple[tuple[str, str, str, bool], ...] = (
        ("opinion", "poll", "opinion", False),
        ("debate", "poll", "debate", False),
        ("prediction", "poll", "prediction", True),
        ("challenge", "poll", "challenge", False),
        ("quiz", "quiz", "stat", False),
    )
    cards: list[Card] = []
    for key, fmt, question_type, needs_open in specs:
        block = brief.get(key)
        if not isinstance(block, dict):
            continue
        options = [str(o) for o in block.get("options") or []]
        if not (2 <= len(options) <= 4):
            continue
        prompt = str(block.get("prompt") or "").strip()
        if not prompt:
            continue
        if context and context not in prompt:
            prompt = f"{prompt}\n{context}"
        if needs_open and not _brief_prediction_open(brief, prompt, now):
            continue
        qtype = question_type
        if fmt == "quiz":
            qtype = str(block.get("questionType") or "stat")
            correct = str(block.get("correct") or "")
            if correct not in options or options.count(correct) != 1:
                continue
            opt_dicts = [{"label": label, "isCorrect": label == correct} for label in options]
            scoring = "correct_option"
            tags = format_to_tags(FORMAT_QUIZ if fmt == "quiz" else FORMAT_TRIVIA, slug)
        else:
            if qtype == "prediction" and "prediction" not in prompt.lower():
                continue
            opt_dicts = [{"label": label, "isCorrect": False} for label in options]
            scoring = "none"
            tags = format_to_tags(FORMAT_POLL, slug)
        if fact_issues(prompt, options, allowed):
            continue
        moment_type = "predict" if len(options) == 2 else "pulse"
        cards.append(
            Card(
                type=moment_type,
                category_slug=slug,
                format=fmt,
                question_type=qtype,
                prompt=prompt,
                options=opt_dicts,
                scoring_mode=scoring,
                tags=tags,
                ends_at=ends,
                brief_id=brief_id,
                event_date=event_date,
                facts_used=list(brief.get("facts") or []),
            )
        )
    return cards


def briefs_for(slug: str, briefs: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    rows = load_briefs() if briefs is None else briefs
    key = normalize_slug(slug)
    return [row for row in rows if normalize_slug(str(row.get("category") or "")) == key]


def event_cards(slug: str, now: datetime | None = None, briefs: list[dict[str, Any]] | None = None) -> list[Card]:
    cards: list[Card] = []
    for brief in briefs_for(slug, briefs):
        cards.extend(cards_from_brief(brief, now=now))
    return cards
