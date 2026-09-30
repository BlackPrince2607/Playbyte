import { Canvas, Circle, Fill, Path, Rect, RoundedRect } from "@shopify/react-native-skia";
import React, { memo, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { colors, radius, spacing } from "../../../../theme/colors";
import { fonts, type } from "../../../../theme/typography";
import { feedback } from "../../../ui/feedback";
import { HintBar } from "../../../ui/kit";
import type { EngineViewProps } from "../../../ui/types";
import type { MazeAction, MazeState } from "../logic/engine";
import { DIR_BIT, Dir, E, N, S, W, neighbour, open, xy } from "../logic/maze";

const GOLD = "#FFD84D";
const FOG = "#0b0820";

function wallPath(walls: number[], size: number, cell: number): string {
  let d = "";
  for (let i = 0; i < walls.length; i++) {
    const [x, y] = xy(i, size);
    const x0 = x * cell;
    const y0 = y * cell;
    // Each wall is drawn once: north and west by every cell, south/east only on the border.
    if (walls[i] & N) d += `M${x0} ${y0}L${x0 + cell} ${y0}`;
    if (walls[i] & W) d += `M${x0} ${y0}L${x0} ${y0 + cell}`;
    if (y === size - 1 && walls[i] & S) d += `M${x0} ${y0 + cell}L${x0 + cell} ${y0 + cell}`;
    if (x === size - 1 && walls[i] & E) d += `M${x0 + cell} ${y0}L${x0 + cell} ${y0 + cell}`;
  }
  return d;
}

function linePath(cells: number[], size: number, cell: number): string {
  return cells
    .map((c, k) => {
      const [x, y] = xy(c, size);
      return `${k ? "L" : "M"}${(x + 0.5) * cell} ${(y + 0.5) * cell}`;
    })
    .join("");
}

const Walls = memo(function Walls({ walls, size, cell }: { walls: number[]; size: number; cell: number }) {
  const d = useMemo(() => wallPath(walls, size, cell), [walls, size, cell]);
  return <Path path={d} color={colors.paper} style="stroke" strokeWidth={Math.max(2, cell * 0.12)} strokeCap="round" />;
});

export function MazeView({ state, dispatch, snapshot, requestHint }: EngineViewProps<MazeState, MazeAction>) {
  const [board, setBoard] = useState(0);
  const playing = snapshot.status === "playing" && !state.roundOver;
  const size = state.size;
  const cell = size ? board / size : 0;
  const posRef = useRef(state.pos);
  posRef.current = state.pos;
  const exitOpen = state.got.length >= state.gems.length;
  const seen = useMemo(() => new Set(state.seen), [state.seen]);
  const visible = (c: number) => !state.fog || seen.has(c);

  const step = (dir: Dir, run = false) => {
    if (!playing) return false;
    const r = dispatch({ type: "move", dir, run });
    if (!r.accepted) return false;
    if (!run) posRef.current = neighbour(posRef.current, DIR_BIT[dir], size);
    return true;
  };

  const followFinger = (fx: number, fy: number) => {
    if (!cell) return;
    const tx = Math.max(0, Math.min(size - 1, Math.floor(fx / cell)));
    const ty = Math.max(0, Math.min(size - 1, Math.floor(fy / cell)));
    for (let guard = 0; guard < 4; guard++) {
      const [px, py] = xy(posRef.current, size);
      const dx = tx - px;
      const dy = ty - py;
      if (!dx && !dy) return;
      const horizontal: Dir = dx > 0 ? "E" : "W";
      const vertical: Dir = dy > 0 ? "S" : "N";
      const order: Dir[] = Math.abs(dx) >= Math.abs(dy) ? [horizontal, vertical] : [vertical, horizontal];
      const dir = order.find((d, k) => (k === 0 || (d === horizontal ? dx : dy) !== 0) && open(state.walls, posRef.current, DIR_BIT[d]));
      if (!dir || !step(dir)) return;
    }
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(4)
    .onBegin((e) => followFinger(e.x, e.y))
    .onUpdate((e) => followFinger(e.x, e.y));

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBoard(Math.floor(Math.min(width, height)));
  };

  const center = (c: number) => {
    const [x, y] = xy(c, size);
    return { x: (x + 0.5) * cell, y: (y + 0.5) * cell };
  };
  const player = center(state.pos);
  const exitAt = center(state.exit);

  const [ex, ey] = size ? xy(state.exit, size) : [0, 0];
  const pad = (b: number) => (
    <Pressable
      key={b}
      onPress={() => {
        const dir = (Object.keys(DIR_BIT) as Dir[]).find((d) => DIR_BIT[d] === b)!;
        if (step(dir, true)) feedback("tap");
      }}
      disabled={!playing || !open(state.walls, state.pos, b)}
      accessibilityRole="button"
      accessibilityLabel={`Run ${b === N ? "up" : b === S ? "down" : b === E ? "right" : "left"}`}
      style={({ pressed }) => [styles.pad, (!playing || !open(state.walls, state.pos, b)) && { opacity: 0.35 }, pressed && { backgroundColor: colors.cardAlt }]}
    >
      <Text style={styles.padText}>{b === N ? "▲" : b === S ? "▼" : b === E ? "▶" : "◀"}</Text>
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={[type.bodySm, { color: colors.lilac }]}>
          Steps <Text style={{ color: colors.paper, fontFamily: fonts.bodyBold }}>{state.steps}</Text> · Best route {state.par}
        </Text>
        {state.gems.length ? (
          <Text style={[type.bodySm, { color: exitOpen ? colors.lime : GOLD, fontFamily: fonts.bodyBold }]}>
            💎 {state.got.length}/{state.gems.length}
          </Text>
        ) : null}
      </View>
      <View style={styles.boardWrap} onLayout={onLayout}>
        {board > 0 && size > 0 ? (
          <GestureDetector gesture={pan}>
            <View
              style={{ width: board, height: board }}
              accessible
              accessibilityLabel={`Maze ${size} by ${size}. Drag toward where you want to go, or use the arrows.`}
            >
              <Canvas style={{ width: board, height: board }} pointerEvents="none">
                <Fill color={colors.card} />
                <RoundedRect x={ex * cell + cell * 0.12} y={ey * cell + cell * 0.12} width={cell * 0.76} height={cell * 0.76} r={cell * 0.18} color={exitOpen ? colors.lime : colors.lilac} opacity={0.35} />
                {state.trail.length > 1 ? (
                  <Path path={linePath(state.trail, size, cell)} color={colors.lime} opacity={0.3} style="stroke" strokeWidth={cell * 0.28} strokeJoin="round" strokeCap="round" />
                ) : null}
                {state.hintPath.map((c) => {
                  const p = center(c);
                  return <Circle key={`h${c}`} cx={p.x} cy={p.y} r={cell * 0.12} color={GOLD} />;
                })}
                <Walls walls={state.walls} size={size} cell={cell} />
                <Circle cx={player.x} cy={player.y} r={cell * 0.32} color={colors.pink} />
                {state.fog
                  ? Array.from({ length: size * size }, (_, c) =>
                      seen.has(c) ? null : <Rect key={`f${c}`} x={(c % size) * cell - 0.5} y={Math.floor(c / size) * cell - 0.5} width={cell + 1} height={cell + 1} color={FOG} />,
                    )
                  : null}
              </Canvas>
              {visible(state.exit) ? (
                <Text pointerEvents="none" style={[styles.emoji, { left: exitAt.x - cell / 2, top: exitAt.y - cell / 2, width: cell, fontSize: cell * 0.55, lineHeight: cell }]}>
                  {exitOpen ? "🏁" : "🔒"}
                </Text>
              ) : null}
              {state.gems
                .filter((g) => !state.got.includes(g) && visible(g))
                .map((g) => {
                  const p = center(g);
                  return (
                    <Text key={`g${g}`} pointerEvents="none" style={[styles.emoji, { left: p.x - cell / 2, top: p.y - cell / 2, width: cell, fontSize: cell * 0.5, lineHeight: cell }]}>
                      💎
                    </Text>
                  );
                })}
            </View>
          </GestureDetector>
        ) : null}
      </View>
      <View style={styles.controls}>
        <HintBar hints={snapshot.hints} onHint={requestHint} />
        <View style={styles.dpad}>
          {pad(W)}
          <View style={{ gap: spacing.sm }}>
            {pad(N)}
            {pad(S)}
          </View>
          {pad(E)}
        </View>
      </View>
      {state.roundOver ? (
        <Text style={[type.bodyLg, { color: state.escaped ? colors.lime : colors.pink, textAlign: "center", fontFamily: fonts.bodyBold }]} accessibilityLiveRegion="polite">
          {state.escaped ? (state.steps <= state.par ? "Perfect route!" : "You made it out!") : "Time's up!"}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.margin, paddingBottom: spacing.md, gap: spacing.sm },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  boardWrap: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: radius.md, overflow: "hidden" },
  emoji: { position: "absolute", textAlign: "center" },
  controls: { alignItems: "center", gap: spacing.sm },
  dpad: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pad: { width: 56, height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  padText: { color: colors.paper, fontSize: 20 },
});
