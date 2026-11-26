import React, { useEffect, useState } from "react";
import { GestureResponderEvent, Image, type ImageSourcePropType, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, ZoomIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useLanguage } from "../../../../context/LanguageContext";
import { fill } from "../../../../i18n/strings";
import { colors, radius, spacing } from "../../../../theme/colors";
import { fonts, type } from "../../../../theme/typography";
import { feedback, prefersReducedMotion } from "../../../ui/feedback";
import { HintBar } from "../../../ui/kit";
import type { EngineViewProps } from "../../../ui/types";
import type { Difference } from "../logic/differences";
import type { SpotAction, SpotState } from "../logic/engine";
import type { SpotOverlay } from "../logic/pairs";
import { ASPECT } from "../logic/scene";
import { spotAssetModule } from "./spotAssets";

const GOLD = "#FFD84D";

function Marker({ d, width, color, pulse, grow = 1 }: { d: Difference; width: number; color: string; pulse?: boolean; grow?: number }) {
  const o = useSharedValue(1);
  useEffect(() => {
    if (pulse && !prefersReducedMotion()) o.value = withRepeat(withTiming(0.3, { duration: 600 }), -1, true);
  }, [pulse, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  const w = d.hw * width * grow;
  const h = d.hh * width * grow;
  return (
    <Animated.View
      pointerEvents="none"
      entering={prefersReducedMotion() ? undefined : ZoomIn.duration(220)}
      style={[
        { position: "absolute", left: d.x * width - w, top: d.y * width - h, width: w * 2, height: h * 2, borderRadius: Math.min(w, h), borderWidth: 3, borderColor: color },
        style,
      ]}
    />
  );
}

function DiffOverlay({ d, overlay, width }: { d: Difference; overlay: SpotOverlay; width: number }) {
  const left = d.x * width - d.hw * width;
  const top = d.y * width - d.hh * width;
  const w = d.hw * width * 2;
  const h = d.hh * width * 2;
  const box = { position: "absolute" as const, left, top, width: w, height: h };
  switch (overlay.op) {
    case "blob":
      return <View pointerEvents="none" style={[box, { borderRadius: Math.min(w, h), backgroundColor: overlay.color, opacity: 0.85 }]} />;
    case "ring":
      return <View pointerEvents="none" style={[box, { borderRadius: Math.min(w, h), borderWidth: 4, borderColor: overlay.color, backgroundColor: "transparent" }]} />;
    case "dim":
      return <View pointerEvents="none" style={[box, { borderRadius: Math.min(w, h) * 0.35, backgroundColor: "#000", opacity: 0.55 }]} />;
    case "bright":
      return <View pointerEvents="none" style={[box, { borderRadius: Math.min(w, h) * 0.35, backgroundColor: "#fff", opacity: 0.45 }]} />;
    case "badge":
      return (
        <View pointerEvents="none" style={[box, { alignItems: "center", justifyContent: "center" }]}>
          <View style={{ width: w * 0.55, height: h * 0.55, borderRadius: Math.min(w, h) * 0.3, backgroundColor: overlay.color }} />
        </View>
      );
    case "hide":
      return <View pointerEvents="none" style={[box, { borderRadius: Math.min(w, h) * 0.2, backgroundColor: colors.ink, opacity: 0.92 }]} />;
    default:
      return null;
  }
}

function pictureSource(uri: string): ImageSourcePropType | null {
  if (!uri) return null;
  const bundled = spotAssetModule(uri);
  if (bundled != null) return bundled;
  return { uri };
}

function Picture({
  uri,
  side,
  width,
  aspect,
  label,
  state,
  onTap,
  enabled,
}: {
  uri: string;
  side: "left" | "right";
  width: number;
  aspect: number;
  label: string;
  state: SpotState;
  onTap: (x: number, y: number) => void;
  enabled: boolean;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const source = pictureSource(uri);
  useEffect(() => {
    setStatus("loading");
  }, [uri]);

  const handle = (e: GestureResponderEvent) => {
    if (!enabled) return;
    onTap(e.nativeEvent.locationX / width, e.nativeEvent.locationY / width);
  };
  const miss = state.lastTap && !state.lastTap.ok ? state.lastTap : null;
  const height = width * aspect;
  const sideOverlays = state.overlays.filter((o) => o.side === side);
  const byId = new Map(state.diffs.map((d) => [d.id, d]));

  return (
    <Pressable
      onPress={handle}
      accessibilityRole="imagebutton"
      accessibilityLabel={`Picture ${label}. ${state.found.length} of ${state.diffs.length} differences found.`}
      accessibilityHint="Tap where this picture differs from the other one. Hints mark a difference for you."
      style={[styles.picture, { width, height }]}
    >
      {source ? (
        <Image
          source={source}
          style={{ width, height }}
          resizeMode="stretch"
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("error")}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      {status === "loading" ? <View style={[styles.placeholder, { width, height }]} /> : null}
      {status === "error" ? (
        <View style={[styles.placeholder, styles.errorBox, { width, height }]}>
          <Text style={[type.bodySm, { color: colors.lilac, textAlign: "center" }]}>Could not load picture</Text>
        </View>
      ) : null}
      {sideOverlays.map((o) => {
        const d = byId.get(o.id);
        return d ? <DiffOverlay key={o.id} d={d} overlay={o} width={width} /> : null;
      })}
      {state.diffs.map((d) =>
        state.found.includes(d.id) ? (
          <Marker key={d.id} d={d} width={width} color={colors.lime} />
        ) : state.roundOver ? (
          <Marker key={d.id} d={d} width={width} color={colors.pink} />
        ) : state.revealed.includes(d.id) ? (
          <Marker key={d.id} d={d} grow={1.6} width={width} color={GOLD} pulse />
        ) : null,
      )}
      {miss ? (
        <Animated.Text key={miss.n} entering={FadeIn.duration(80)} pointerEvents="none" style={[styles.miss, { left: miss.x * width - 12, top: miss.y * width - 16 }]}>
          ✕
        </Animated.Text>
      ) : null}
      <View pointerEvents="none" style={styles.badge}>
        <Text style={[type.metadata, { color: colors.ink, fontFamily: fonts.bodyBold }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function SpotView({
  state,
  dispatch,
  requestHint,
  snapshot,
  resolveAsset,
  compact,
  hideHints,
}: EngineViewProps<SpotState, SpotAction>) {
  const { t } = useLanguage();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const aspect = state.aspect || ASPECT;
  const stackGap = compact ? spacing.xs : spacing.sm;
  const width = Math.floor(Math.min(box.w, Math.max(0, box.h - stackGap) / (2 * aspect)));
  const playing = snapshot.status === "playing";

  const foundN = state.found.length;
  useEffect(() => {
    if (foundN) feedback("success");
  }, [foundN]);
  const missN = state.lastTap && !state.lastTap.ok ? state.lastTap.n : 0;
  useEffect(() => {
    if (missN) feedback("error");
  }, [missN]);

  const tap = (x: number, y: number) => dispatch({ type: "tap", x, y });
  const leftUri = state.leftUrl ? resolveAsset(state.leftUrl) : "";
  const rightUri = state.rightUrl ? resolveAsset(state.rightUrl) : "";

  return (
    <View style={{ flex: 1, paddingHorizontal: compact ? 0 : spacing.margin, gap: compact ? spacing.xs : spacing.sm, minHeight: 0 }}>
      <View style={styles.header}>
        <Text style={[type.bodySm, { color: colors.lilac, flex: 1 }]} numberOfLines={compact ? 1 : 2}>
          {t("spotTapHint")}
        </Text>
        <View style={styles.dots} accessibilityLabel={`${foundN} of ${state.diffs.length} found`}>
          {state.diffs.map((d, i) => (
            <View key={d.id} style={[styles.dot, compact && styles.dotCompact, i < foundN && { backgroundColor: colors.lime, borderColor: colors.lime }]} />
          ))}
        </View>
      </View>
      <View style={{ flex: 1, alignItems: "center", gap: stackGap, minHeight: 0 }} onLayout={onLayout}>
        {width > 0 ? (
          <>
            <Picture uri={leftUri} side="left" width={width} aspect={aspect} label="A" state={state} onTap={tap} enabled={playing} />
            <Picture uri={rightUri} side="right" width={width} aspect={aspect} label="B" state={state} onTap={tap} enabled={playing} />
          </>
        ) : null}
      </View>
      {hideHints ? null : <HintBar hints={snapshot.hints} onHint={requestHint} />}
      {state.roundOver ? (
        <Text style={[type.bodyLg, { color: foundN >= state.diffs.length ? colors.lime : colors.pink, textAlign: "center" }]} accessibilityLiveRegion="polite">
          {foundN >= state.diffs.length
            ? t("allSpotted")
            : fill(t("missedDiffs"), { count: state.diffs.length - foundN })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.lilac },
  dotCompact: { width: 9, height: 9, borderRadius: 5 },
  picture: { borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.ink },
  placeholder: { position: "absolute", left: 0, top: 0, backgroundColor: "#1b1440" },
  errorBox: { alignItems: "center", justifyContent: "center", padding: spacing.sm },
  badge: { position: "absolute", top: 6, left: 6, backgroundColor: colors.paper, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  miss: { position: "absolute", color: colors.pink, fontSize: 26, fontWeight: "900" },
});
