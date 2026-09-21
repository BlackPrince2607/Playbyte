import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors, radius, spacing } from "../theme/colors";
import { fonts, type } from "../theme/typography";

export function SectionCard({
  title,
  children,
  style,
}: {
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.section, style]}>
      {title ? (
        <Text style={[type.metadata, styles.sectionTitle]}>{title.toUpperCase()}</Text>
      ) : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function SettingsRow({
  label,
  value,
  onPress,
  trailing,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
}) {
  const content = (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyLg, { color: colors.paper }]}>{label}</Text>
        {value ? <Text style={[type.metadata, { color: colors.lilac, marginTop: 2 }]}>{value}</Text> : null}
      </View>
      {trailing ?? <Text style={{ color: colors.lilac, fontSize: 18 }}>›</Text>}
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button">
        {content}
      </Pressable>
    );
  }
  return content;
}

export function MajorityChip({ label, percent }: { label: string; percent: number }) {
  return (
    <View style={styles.chip}>
      <Text style={[type.metadata, { color: colors.paper, fontFamily: fonts.bodyBold }]}>
        {percent}% chose {label}
      </Text>
    </View>
  );
}

export function ResultBar({
  label,
  percent,
  highlight,
}: {
  label: string;
  percent: number;
  highlight?: boolean;
}) {
  return (
    <View style={styles.barTrack}>
      <View
        style={[
          styles.barFill,
          {
            width: `${Math.min(100, Math.max(0, percent))}%`,
            backgroundColor: highlight ? colors.pink : "rgba(65,48,52,0.9)",
          },
        ]}
      />
      <View style={styles.barLabels}>
        <Text
          style={[
            type.bodySm,
            {
              color: colors.paper,
              fontFamily: highlight ? fonts.bodyBold : fonts.body,
            },
          ]}
        >
          {label}
        </Text>
        <Text style={[type.statsSm, { color: colors.paper, fontSize: 14 }]}>{percent}%</Text>
      </View>
    </View>
  );
}

export function FriendChoiceStrip({
  name,
  choice,
  onChallenge,
}: {
  name: string;
  choice: string;
  onChallenge?: () => void;
}) {
  return (
    <View style={styles.strip}>
      <View style={{ flex: 1 }}>
        <Text style={[type.bodySm, { color: colors.paper }]}>
          <Text style={{ fontFamily: fonts.bodyBold }}>{name}</Text> chose {choice}
        </Text>
      </View>
      {onChallenge ? (
        <Pressable style={styles.challengeBtn} onPress={onChallenge} accessibilityRole="button">
          <Text style={[type.micro, { color: colors.ink, fontFamily: fonts.bodyBold }]}>Challenge</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.lg },
  sectionTitle: {
    color: colors.lilac,
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
    fontFamily: fonts.bodyBold,
  },
  sectionBody: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    gap: spacing.sm,
  },
  chip: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,77,141,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,77,141,0.35)",
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: spacing.sm,
  },
  barTrack: {
    height: 40,
    backgroundColor: colors.ink,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
    marginBottom: spacing.sm,
    justifyContent: "center",
  },
  barFill: { position: "absolute", left: 0, top: 0, bottom: 0 },
  barLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
  },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  challengeBtn: {
    backgroundColor: colors.lime,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
