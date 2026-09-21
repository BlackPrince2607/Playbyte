import React from "react";
import { Pressable, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme/colors";
import { fonts, type } from "../theme/typography";

type Props = {
  tag: string;
  title: string;
  score: number;
  subtitle?: string;
  onEnd: () => void;
  children: React.ReactNode;
};

export function Shell({ tag, title, score, subtitle, onEnd, children }: Props) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, padding: spacing.margin }}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.card,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.line,
          padding: spacing.lg,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={[type.micro, { color: colors.lime, letterSpacing: 2, fontFamily: fonts.bodyBold }]}>
            {tag}
          </Text>
          <Pressable
            onPress={onEnd}
            accessibilityRole="button"
            accessibilityLabel="End game"
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.cardAlt,
            }}
          >
            <Text style={[type.micro, { color: colors.paper, fontFamily: fonts.bodyBold }]}>END</Text>
          </Pressable>
        </View>
        <Text style={[type.gameQuestion, { color: colors.paper, marginTop: spacing.sm }]}>{title}</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.xs }}>
          <Text style={[type.bodySm, { color: colors.lilac, flex: 1 }]}>
            {subtitle ?? "End anytime — score vs the crowd"}
          </Text>
          <Text style={[type.statsSm, { color: colors.lime }]}>{score}</Text>
        </View>
        <View style={{ marginTop: spacing.md, flex: 1 }}>{children}</View>
      </View>
    </View>
  );
}
