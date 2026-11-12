import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme/colors";
import { fonts, type } from "../theme/typography";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Keeps a JS render crash from becoming a silent Android “keeps stopping” kill. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.root}>
        <Text style={[type.screenTitle, styles.title]}>Something went wrong</Text>
        <Text style={[type.bodySm, styles.body]}>
          {this.state.error.message || "The app hit an unexpected error on launch."}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => this.setState({ error: null })}
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
        >
          <Text style={[type.button, { color: colors.paper, fontFamily: fonts.bodyBold }]}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { color: colors.paper, textAlign: "center" },
  body: { color: colors.lilac, textAlign: "center" },
  btn: {
    marginTop: spacing.sm,
    backgroundColor: colors.pink,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 12,
  },
});
