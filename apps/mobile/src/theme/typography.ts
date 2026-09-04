import { TextStyle } from "react-native";

export const fonts = {
  display: "SpaceGrotesk_700Bold",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodyBold: "Inter_700Bold",
  mono: "JetBrainsMono_500Medium",
};

export const type: Record<string, TextStyle> = {
  hero: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, fontWeight: "700" },
  screenTitle: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, fontWeight: "700" },
  gameQuestion: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, fontWeight: "700" },
  largeScore: { fontFamily: fonts.display, fontSize: 56, lineHeight: 56, fontWeight: "700" },
  stats: { fontFamily: fonts.mono, fontSize: 14, fontWeight: "500" },
  bodyLg: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
  bodySm: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  metadata: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  micro: { fontFamily: fonts.bodyMedium, fontSize: 10, lineHeight: 12 },
  logo: { fontFamily: fonts.display, fontSize: 22, fontWeight: "700", letterSpacing: -0.5 },
};
