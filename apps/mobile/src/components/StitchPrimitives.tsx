import Ionicons from "@expo/vector-icons/Ionicons";
import { Children, Fragment, isValidElement, type ComponentProps } from "react";
import { Pressable, StyleSheet, Switch, Text, View, ViewStyle } from "react-native";
import { colors, radius, spacing } from "../theme/colors";
import { fonts, type } from "../theme/typography";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** Grouped card; dividers go between rows only, so the rounded bottom edge stays clean. */
export function SectionCard({
  title,
  children,
  style,
}: {
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.section, style]}>
      {title ? (
        <Text style={[type.metadata, styles.sectionTitle]}>{title.toUpperCase()}</Text>
      ) : null}
      <View style={styles.sectionBody}>
        {rows.map((row, i) => (
          <Fragment key={row.key ?? i}>
            {i > 0 ? <View style={styles.divider} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

function RowIcon({ icon, destructive }: { icon: IconName; destructive?: boolean }) {
  return (
    <View style={[styles.rowIcon, destructive && styles.rowIconDestructive]}>
      <Ionicons name={icon} size={18} color={destructive ? colors.pink : colors.paper} />
    </View>
  );
}

export function SettingsRow({
  label,
  value,
  icon,
  onPress,
  trailing,
  destructive,
  disabled,
}: {
  label: string;
  value?: string;
  icon?: IconName;
  onPress?: () => void;
  trailing?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const content = (
    <View style={styles.row}>
      {icon ? <RowIcon icon={icon} destructive={destructive} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyLg, { color: destructive ? colors.pink : colors.paper }]}>{label}</Text>
        {value ? (
          <Text style={[type.metadata, { color: colors.lilac, marginTop: 2 }]} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.lilac} /> : null)}
    </View>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [(pressed || disabled) && { opacity: 0.6 }]}
      >
        {content}
      </Pressable>
    );
  }
  return content;
}

export function ToggleRow({
  label,
  value,
  icon,
  onValueChange,
}: {
  label: string;
  value: boolean;
  icon?: IconName;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <SettingsRow
      label={label}
      icon={icon}
      trailing={
        <Switch
          value={value}
          onValueChange={onValueChange}
          accessibilityLabel={label}
          trackColor={{ true: colors.pink, false: colors.cardAlt }}
          thumbColor={colors.paper}
        />
      }
    />
  );
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
  onShare,
}: {
  name: string;
  choice: string;
  /** Real share action only — not a duel challenge. */
  onShare?: () => void;
}) {
  return (
    <View style={styles.strip}>
      <View style={{ flex: 1 }}>
        <Text style={[type.bodySm, { color: colors.paper }]}>
          <Text style={{ fontFamily: fonts.bodyBold }}>{name}</Text> chose {choice}
        </Text>
      </View>
      {onShare ? (
        <Pressable style={styles.challengeBtn} onPress={onShare} accessibilityRole="button">
          <Text style={[type.micro, { color: colors.ink, fontFamily: fonts.bodyBold }]}>Share</Text>
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
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: 56,
    gap: 12,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconDestructive: { backgroundColor: colors.pinkFill },
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
