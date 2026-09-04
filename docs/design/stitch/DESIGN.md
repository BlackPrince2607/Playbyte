---
name: PLAY
colors:
  surface: '#1d1013'
  surface-dim: '#1d1013'
  surface-bright: '#463538'
  surface-container-lowest: '#170a0e'
  surface-container-low: '#26181b'
  surface-container: '#2a1c1f'
  surface-container-high: '#362629'
  surface-container-highest: '#413034'
  on-surface: '#f7dce1'
  on-surface-variant: '#e1bec5'
  inverse-surface: '#f7dce1'
  inverse-on-surface: '#3c2c30'
  outline: '#a8898f'
  outline-variant: '#594046'
  surface-tint: '#ffb1c4'
  primary: '#ffb1c4'
  on-primary: '#65002e'
  primary-container: '#ff4d8d'
  on-primary-container: '#5b0028'
  inverse-primary: '#b90a5a'
  secondary: '#bdf532'
  on-secondary: '#263500'
  secondary-container: '#a2d801'
  on-secondary-container: '#425a00'
  tertiary: '#57e15b'
  on-tertiary: '#003908'
  tertiary-container: '#00a92a'
  on-tertiary-container: '#003306'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffd9e0'
  primary-fixed-dim: '#ffb1c4'
  on-primary-fixed: '#3f001a'
  on-primary-fixed-variant: '#8f0043'
  secondary-fixed: '#bdf532'
  secondary-fixed-dim: '#a2d801'
  on-secondary-fixed: '#141f00'
  on-secondary-fixed-variant: '#384e00'
  tertiary-fixed: '#75ff75'
  tertiary-fixed-dim: '#57e15b'
  on-tertiary-fixed: '#002203'
  on-tertiary-fixed-variant: '#00530f'
  background: '#1d1013'
  on-background: '#f7dce1'
  surface-variant: '#413034'
  ink: '#150E2B'
  card: '#211540'
  cardAlt: '#2A1B4E'
  paper: '#F5F0FF'
  lilac: '#8F7FC0'
  line: rgba(245, 240, 255, 0.12)
typography:
  hero:
    fontFamily: spaceGrotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
  hero-mobile:
    fontFamily: spaceGrotesk
    fontSize: 40px
    fontWeight: '700'
    lineHeight: '1.1'
  screen-title:
    fontFamily: spaceGrotesk
    fontSize: 34px
    fontWeight: '700'
    lineHeight: '1.2'
  game-question:
    fontFamily: spaceGrotesk
    fontSize: 42px
    fontWeight: '700'
    lineHeight: '1.1'
  game-question-mobile:
    fontFamily: spaceGrotesk
    fontSize: 30px
    fontWeight: '700'
    lineHeight: '1.1'
  large-score:
    fontFamily: spaceGrotesk
    fontSize: 72px
    fontWeight: '700'
    lineHeight: '1'
  stats:
    fontFamily: jetbrainsMono
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.4'
  body-lg:
    fontFamily: inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  metadata:
    fontFamily: inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
  micro:
    fontFamily: inter
    fontSize: 10px
    fontWeight: '500'
    lineHeight: '1.2'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin: 20px
---

# PLAY Master Design System

## Brand Identity
**Product:** PLAY is a vernacular-first social play platform where every swipe turns passive scrolling into active participation.
**Core Idea:** "Every swipe is a game."
**Visual Personality:** Bold, Playful, Social, Fast, Competitive, Youthful, Premium, Indian, Internet-native.

## Color System
- **ink:** `#150E2B` (Primary background, app bg, navigation bg)
- **card:** `#211540` (Primary surface for game cards)
- **cardAlt:** `#2A1B4E` (Secondary surface, selected states, active nav)
- **pink:** `#FF4D8D` (Primary brand accent, CTAs, social highlights)
- **lime:** `#C6FF3D` (Secondary accent, success, live indicators, timers)
- **paper:** `#F5F0FF` (Primary text, headlines, questions)
- **lilac:** `#8F7FC0` (Secondary text, metadata, descriptions)
- **line:** `rgba(245, 240, 255, 0.12)` (Borders, separators)

## Typography
- **DISPLAY:** Space Grotesk Bold (Headlines, Questions, Scores)
- **BODY:** Inter (Regular for descriptions, Medium/Bold for buttons)
- **MONO:** JetBrains Mono Medium (Timers, live counts, stats, percentages)

### Hierarchy
- **Hero:** Space Grotesk Bold, 40–48px
- **Screen title:** Space Grotesk Bold, 28–34px
- **Game question:** Space Grotesk Bold, 30–42px
- **Large score:** Space Grotesk Bold, 56–72px
- **Stats:** JetBrains Mono Medium, 20–28px
- **Body:** Inter Regular, 14–16px
- **Secondary:** Inter Regular, 11–13px
- **Micro:** Inter Regular/Medium, 9–11px

## Spacing & Radius
- **Spacing:** 8px base system (xs=4, sm=8, md=16, lg=24, xl=32)
- **Radius:**
  - **sm (8px):** small controls, inputs
  - **md (14px):** buttons, answer options, cards
  - **lg (24px):** hero game cards, major surfaces
  - **pill (999px):** tags, live indicators

## Components
- **Primary Button:** Bg `#FF4D8D`, Text `#F5F0FF`, Radius `14px`, Font `Inter Bold`
- **Secondary Button:** Bg `#2A1B4E`, Border `line`, Text `#F5F0FF`, Radius `14px`
- **Success Button:** Bg `#C6FF3D`, Text `#150E2B`, Radius `14px`
- **Game Card:** Bg `#211540`, Radius `24px`, Question-dominant.
- **Answer Buttons:** Bg `#2A1B4E`, Border `line`, Radius `14px`, Padding `16px`.
- **Live Indicator:** Lime `#C6FF3D` + JetBrains Mono for counts.
