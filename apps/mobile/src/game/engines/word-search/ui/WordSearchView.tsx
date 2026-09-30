import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { colors, radius, spacing } from "../../../../theme/colors";
import { fonts, type } from "../../../../theme/typography";
import { feedback } from "../../../ui/feedback";
import { HintBar } from "../../../ui/kit";
import { useShake } from "../../../ui/motion";
import type { EngineViewProps } from "../../../ui/types";
import { Cell, cellsOf, lineCells } from "../logic/grid";
import type { WordSearchAction, WordSearchState } from "../logic/types";

const FOUND_COLORS = ["rgba(198,255,61,0.45)", "rgba(255,77,141,0.45)", "rgba(127,219,255,0.45)", "rgba(255,216,77,0.5)", "rgba(178,141,255,0.5)"];
const key = (r: number, c: number) => r * 100 + c;

/** Snaps a drag from `start` toward (dr, dc) onto the nearest of the 8 grid directions. */
function snapEnd(start: Cell, dr: number, dc: number, n: number): Cell {
  if (dr === 0 && dc === 0) return start;
  const angle = Math.atan2(dr, dc);
  const oct = Math.round(angle / (Math.PI / 4));
  const dir: Cell = [Math.round(Math.sin((oct * Math.PI) / 4)), Math.round(Math.cos((oct * Math.PI) / 4))];
  let len = Math.round(Math.max(Math.abs(dr), Math.abs(dc)));
  while (len > 0) {
    const r = start[0] + dir[0] * len;
    const c = start[1] + dir[1] * len;
    if (r >= 0 && c >= 0 && r < n && c < n) return [r, c];
    len--;
  }
  return start;
}

export function WordSearchView({ state, dispatch, requestHint, snapshot }: EngineViewProps<WordSearchState, WordSearchAction>) {
  const { width } = useWindowDimensions();
  const n = state.grid.length;
  const cell = n ? Math.floor((Math.min(width, 480) - spacing.margin * 2) / n) : 0;
  const [sel, setSelState] = useState<{ from: Cell; to: Cell } | null>(null);
  const [pending, setPendingState] = useState<Cell | null>(null);
  const startRef = useRef<Cell | null>(null);
  const selRef = useRef<{ from: Cell; to: Cell } | null>(null);
  const pendingRef = useRef<Cell | null>(null);
  const setSel = (s: { from: Cell; to: Cell } | null) => {
    selRef.current = s;
    setSelState(s);
  };
  const setPending = (c: Cell | null) => {
    pendingRef.current = c;
    setPendingState(c);
  };
  const playing = snapshot.status === "playing";

  const missSeq = state.lastSelection && !state.lastSelection.ok ? state.attempts : 0;
  const shake = useShake(missSeq);
  const foundCount = state.found.length;
  useEffect(() => {
    if (foundCount) feedback("success");
  }, [foundCount]);
  useEffect(() => {
    if (missSeq) feedback("warning");
  }, [missSeq]);
  useEffect(() => {
    selRef.current = null;
    pendingRef.current = null;
    setSelState(null);
    setPendingState(null);
  }, [state.round]);

  const found = useMemo(() => {
    const m = new Map<number, string>();
    state.found.forEach((f, i) => {
      for (const [r, c] of lineCells(f.from, f.to) ?? []) m.set(key(r, c), FOUND_COLORS[i % FOUND_COLORS.length]);
    });
    return m;
  }, [state.found]);

  const missed = useMemo(() => {
    const s = new Set<number>();
    if (!state.roundOver) return s;
    const done = new Set(state.found.map((f) => f.word));
    for (const p of state.words) if (!done.has(p.word)) for (const [r, c] of cellsOf(p)) s.add(key(r, c));
    return s;
  }, [state.roundOver, state.found, state.words]);

  const hintedStarts = useMemo(() => {
    const done = new Set(state.found.map((f) => f.word));
    return new Set(state.words.filter((p) => state.hinted.includes(p.word) && !done.has(p.word)).map((p) => key(p.start[0], p.start[1])));
  }, [state.words, state.hinted, state.found]);

  const selected = useMemo(() => new Set((sel ? (lineCells(sel.from, sel.to) ?? []) : []).map(([r, c]) => key(r, c))), [sel]);

  const cellAt = (x: number, y: number): Cell | null => {
    const r = Math.floor(y / cell);
    const c = Math.floor(x / cell);
    return r >= 0 && c >= 0 && r < n && c < n ? [r, c] : null;
  };

  const submit = (from: Cell, to: Cell) => {
    if (from[0] === to[0] && from[1] === to[1]) return;
    dispatch({ type: "select", from, to });
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .enabled(playing)
    .onBegin((e) => {
      const c = cellAt(e.x, e.y);
      startRef.current = c;
      if (c) {
        feedback("select");
        setSel({ from: c, to: c });
      }
    })
    .onUpdate((e) => {
      const s = startRef.current;
      if (!s) return;
      const dr = e.y / cell - (s[0] + 0.5);
      const dc = e.x / cell - (s[1] + 0.5);
      const to = snapEnd(s, dr, dc, n);
      const prev = selRef.current;
      if (!prev || prev.to[0] !== to[0] || prev.to[1] !== to[1]) setSel({ from: s, to });
    })
    .onEnd(() => {
      const s = selRef.current;
      const pending = pendingRef.current;
      if (s && (s.from[0] !== s.to[0] || s.from[1] !== s.to[1])) {
        setPending(null);
        submit(s.from, s.to);
      } else if (s) {
        // Tap-tap selection: first tap marks the start, second tap the end.
        if (pending && (pending[0] !== s.from[0] || pending[1] !== s.from[1]) && lineCells(pending, s.from)) {
          submit(pending, s.from);
          setPending(null);
        } else setPending(s.from);
      }
    })
    .onFinalize(() => {
      startRef.current = null;
      setSel(null);
    })
    .runOnJS(true);

  const doneWords = new Set(state.found.map((f) => f.word));

  return (
    <View style={{ flex: 1, alignItems: "center", paddingHorizontal: spacing.margin, gap: spacing.md }}>
      <Text style={[type.bodyLg, { color: colors.lilac }]} accessibilityRole="header">
        Theme: <Text style={{ color: colors.paper, fontFamily: fonts.bodyBold }}>{state.theme}</Text>
      </Text>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[{ width: cell * n, height: cell * n }, styles.grid, shake]}
          accessibilityLabel={`Letter grid, ${n} by ${n}. Drag across a word, or tap its first and last letters.`}
        >
          {state.grid.map((row, r) => (
            <View key={r} style={{ flexDirection: "row" }}>
              {Array.from(row).map((ch, c) => {
                const k = key(r, c);
                const bg = selected.has(k) ? "rgba(198,255,61,0.35)" : (found.get(k) ?? (missed.has(k) ? "rgba(255,77,141,0.25)" : "transparent"));
                const isPending = pending && pending[0] === r && pending[1] === c;
                return (
                  <View
                    key={c}
                    style={[
                      { width: cell, height: cell, backgroundColor: bg },
                      styles.cell,
                      (hintedStarts.has(k) || isPending) && { borderColor: isPending ? colors.lime : "#FFD84D", borderWidth: 2 },
                    ]}
                  >
                    <Text style={[styles.letter, { fontSize: Math.max(14, cell * 0.5) }]}>{ch}</Text>
                  </View>
                );
              })}
            </View>
          ))}
        </Animated.View>
      </GestureDetector>
      <View style={styles.words}>
        {state.words.map((p) => {
          const done = doneWords.has(p.word);
          const reveal = !state.hidden || done || state.roundOver;
          const hint = state.hinted.includes(p.word);
          const label = reveal ? p.word : hint ? `${p.word[0]}${" _".repeat(p.word.length - 1)}` : `${p.word.length} letters`;
          return (
            <View key={p.word} style={[styles.chip, done && styles.chipDone]}>
              <Text
                style={[type.metadata, { color: done ? colors.ink : colors.paper, fontFamily: fonts.bodyBold, textDecorationLine: done ? "line-through" : "none" }]}
                accessibilityLabel={done ? `${p.word}, found` : reveal ? p.word : `Hidden word, ${p.word.length} letters`}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </View>
      <HintBar hints={snapshot.hints} onHint={requestHint} />
      {state.roundOver ? (
        <Text style={[type.bodyLg, { color: foundCount >= state.words.length ? colors.lime : colors.pink }]} accessibilityLiveRegion="polite">
          {foundCount >= state.words.length ? "All found!" : `Time's up · ${foundCount}/${state.words.length} found`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { backgroundColor: colors.card, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.line },
  cell: { alignItems: "center", justifyContent: "center", borderRadius: 6 },
  letter: { color: colors.paper, fontFamily: fonts.bodyBold },
  words: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.xs },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.cardAlt },
  chipDone: { backgroundColor: colors.lime, borderColor: colors.lime },
});
