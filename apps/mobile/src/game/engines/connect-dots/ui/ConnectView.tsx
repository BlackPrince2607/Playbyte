import { Canvas, Circle, Fill, Path, Rect } from "@shopify/react-native-skia";
import React, { memo, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { colors, radius, spacing } from "../../../../theme/colors";
import { fonts, type } from "../../../../theme/typography";
import { feedback } from "../../../ui/feedback";
import { HintBar } from "../../../ui/kit";
import type { EngineViewProps } from "../../../ui/types";
import { adjacent } from "../logic/board";
import { ConnectAction, ConnectState, filledCells, isConnected } from "../logic/engine";

/** Distinct hues; dots also carry their number so colour is never the only cue. */
export const PALETTE = ["#FF4D8D", "#C6FF3D", "#7FDBFF", "#FFD84D", "#B28DFF", "#FF8A3D", "#3DFFB8", "#FF5B5B", "#5B8CFF", "#F5F0FF", "#C08457", "#00C2A8"];

const GridLines = memo(function GridLines({ size, cell }: { size: number; cell: number }) {
  const d = useMemo(() => {
    let s = "";
    for (let i = 1; i < size; i++) s += `M${i * cell} 0L${i * cell} ${size * cell}M0 ${i * cell}L${size * cell} ${i * cell}`;
    return s;
  }, [size, cell]);
  return <Path path={d} color={colors.line} style="stroke" strokeWidth={1} />;
});

export function ConnectView({ state, dispatch, snapshot, requestHint }: EngineViewProps<ConnectState, ConnectAction>) {
  const [board, setBoard] = useState(0);
  const size = state.size;
  const cell = size ? board / size : 0;
  const playing = snapshot.status === "playing" && !state.roundOver;
  const drag = useRef<{ color: number; path: number[] }>({ color: -1, path: [] });

  const cellAt = (x: number, y: number) => {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    return cx < 0 || cy < 0 || cx >= size || cy >= size ? -1 : cy * size + cx;
  };

  const send = (path: number[], stroke: boolean) => {
    const { color } = drag.current;
    const r = dispatch({ type: "draw", color, cells: path, stroke });
    if (r.accepted) drag.current.path = path;
    return r.accepted;
  };

  /** Big boards have cells under 44pt; a touch just outside a dot's cell still picks up that dot. */
  const nearbyDot = (x: number, y: number, c: number) => {
    let best = -1;
    let bestD = 0.8 * cell;
    const cx = c % size;
    const cy = Math.floor(c / size);
    for (let ny = Math.max(0, cy - 1); ny <= Math.min(size - 1, cy + 1); ny++) {
      for (let nx = Math.max(0, cx - 1); nx <= Math.min(size - 1, cx + 1); nx++) {
        const n = ny * size + nx;
        if (state.dots[n] < 0) continue;
        const d = Math.hypot(x - (nx + 0.5) * cell, y - (ny + 0.5) * cell);
        if (d < bestD) {
          best = n;
          bestD = d;
        }
      }
    }
    return best;
  };

  const begin = (x: number, y: number) => {
    drag.current = { color: -1, path: [] };
    if (!playing || !cell) return;
    let c = cellAt(x, y);
    if (c < 0) return;
    if (state.dots[c] < 0 && !state.paths.some((p) => p.includes(c))) {
      const near = nearbyDot(x, y, c);
      if (near >= 0) c = near;
    }
    if (state.dots[c] >= 0) {
      drag.current.color = state.dots[c];
      send([c], true);
      feedback("tap");
      return;
    }
    const k = state.paths.findIndex((p) => p.includes(c));
    if (k >= 0) {
      drag.current.color = k;
      send(state.paths[k].slice(0, state.paths[k].indexOf(c) + 1), true);
    }
  };

  const extend = (x: number, y: number) => {
    const { color } = drag.current;
    if (color < 0 || !playing) return;
    const target = cellAt(x, y);
    if (target < 0) return;
    let path = drag.current.path;
    const [a, b] = state.pairs[color];
    for (let guard = 0; guard < size * 2; guard++) {
      const last = path[path.length - 1];
      if (last === target) break;
      const lx = last % size;
      const ly = Math.floor(last / size);
      const dx = (target % size) - lx;
      const dy = Math.floor(target / size) - ly;
      const next = Math.abs(dx) >= Math.abs(dy) ? last + Math.sign(dx) : last + Math.sign(dy) * size;
      if (!adjacent(last, next, size)) break;
      const back = path.indexOf(next);
      if (back >= 0) {
        path = path.slice(0, back + 1);
        continue;
      }
      const done = path.length >= 2 && (path[path.length - 1] === (path[0] === a ? b : a));
      if (done) break;
      if (state.dots[next] >= 0 && state.dots[next] !== color) break;
      path = [...path, next];
    }
    if (path !== drag.current.path && path.length) {
      const wasConnected = isConnected({ pairs: state.pairs, paths: state.paths.map((p, k) => (k === color ? drag.current.path : p)) }, color);
      if (send(path, false)) {
        const nowConnected = isConnected({ pairs: state.pairs, paths: state.paths.map((p, k) => (k === color ? path : p)) }, color);
        if (nowConnected && !wasConnected) feedback("success");
      }
    }
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => begin(e.x, e.y))
    .onUpdate((e) => extend(e.x, e.y))
    .onFinalize(() => {
      drag.current = { color: -1, path: [] };
    });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBoard(Math.floor(Math.min(width, height)));
  };

  const center = (c: number) => ({ x: ((c % size) + 0.5) * cell, y: (Math.floor(c / size) + 0.5) * cell });
  const line = (p: number[]) =>
    p
      .map((c, i) => {
        const { x, y } = center(c);
        return `${i ? "L" : "M"}${x} ${y}`;
      })
      .join("");

  const connected = state.pairs.filter((_, k) => isConnected(state, k)).length;
  const fill = size ? Math.round((filledCells(state) / (size * size)) * 100) : 0;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={[type.bodySm, { color: colors.lilac }]}>
          Pairs <Text style={{ color: colors.paper, fontFamily: fonts.bodyBold }}>{connected}/{state.pairs.length}</Text>
        </Text>
        <Text style={[type.bodySm, { color: fill === 100 ? colors.lime : colors.lilac }]}>Filled {fill}%</Text>
        <Text style={[type.bodySm, { color: colors.lilac }]}>Moves {state.moves}</Text>
      </View>
      <View style={styles.boardWrap} onLayout={onLayout}>
        {board > 0 && size > 0 ? (
          <GestureDetector gesture={pan}>
            <View
              style={{ width: board, height: board }}
              accessible
              accessibilityLabel={`Board ${size} by ${size} with ${state.pairs.length} numbered pairs. Drag from a dot to its matching number. ${connected} connected.`}
            >
              <Canvas style={{ width: board, height: board }} pointerEvents="none">
                <Fill color={colors.card} />
                <GridLines size={size} cell={cell} />
                {state.paths.map((p, k) =>
                  p.map((c) => <Rect key={`t${k}-${c}`} x={(c % size) * cell} y={Math.floor(c / size) * cell} width={cell} height={cell} color={PALETTE[k % PALETTE.length]} opacity={0.16} />),
                )}
                {state.paths.map((p, k) =>
                  p.length > 1 ? (
                    <Path key={`p${k}`} path={line(p)} color={PALETTE[k % PALETTE.length]} style="stroke" strokeWidth={cell * 0.3} strokeCap="round" strokeJoin="round" />
                  ) : null,
                )}
                {state.pairs.flatMap(([a, b], k) =>
                  [a, b].map((c) => {
                    const { x, y } = center(c);
                    return <Circle key={`d${k}-${c}`} cx={x} cy={y} r={cell * 0.36} color={PALETTE[k % PALETTE.length]} />;
                  }),
                )}
              </Canvas>
              {state.pairs.flatMap(([a, b], k) =>
                [a, b].map((c) => {
                  const { x, y } = center(c);
                  return (
                    <Text
                      key={`n${k}-${c}`}
                      pointerEvents="none"
                      style={[styles.num, { left: x - cell / 2, top: y - cell / 2, width: cell, lineHeight: cell, fontSize: cell * 0.36 }]}
                    >
                      {k + 1}
                    </Text>
                  );
                }),
              )}
            </View>
          </GestureDetector>
        ) : null}
      </View>
      <HintBar hints={snapshot.hints} onHint={requestHint} />
      {state.roundOver ? (
        <Text style={[type.bodyLg, { color: state.solved ? colors.lime : colors.pink, textAlign: "center", fontFamily: fonts.bodyBold }]} accessibilityLiveRegion="polite">
          {state.solved ? (state.perfect ? "Perfect! Every cell filled." : "All connected!") : "Time's up!"}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.margin, paddingBottom: spacing.md, gap: spacing.sm },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  boardWrap: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: radius.md, overflow: "hidden" },
  num: { position: "absolute", textAlign: "center", color: colors.ink, fontFamily: fonts.bodyBold },
});
