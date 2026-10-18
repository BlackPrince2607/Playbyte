// Per-weight subpath imports: the package root requires every weight's .ttf and bundles ~8 MB of unused fonts.
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";
import { NotoSansDevanagari_400Regular } from "@expo-google-fonts/noto-sans-devanagari/400Regular";
import { NotoSansDevanagari_500Medium } from "@expo-google-fonts/noto-sans-devanagari/500Medium";
import { NotoSansDevanagari_700Bold } from "@expo-google-fonts/noto-sans-devanagari/700Bold";
import { SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk/700Bold";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { setMusicScene, startSound } from "./src/audio/sound";
import { AppProvider } from "./src/context/AppContext";
import { AuthProvider } from "./src/context/AuthContext";
import { LanguageProvider } from "./src/context/LanguageContext";
import { initMetaSdk } from "./src/lib/metaSdk";
import MainShell from "./src/MainShell";
import { colors } from "./src/theme/colors";

export default function App() {
  useEffect(() => {
    void initMetaSdk();
    setMusicScene("home");
    void startSound();
  }, []);

  const [loaded, error] = useFonts({
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
    JetBrainsMono_500Medium,
    NotoSansDevanagari_400Regular,
    NotoSansDevanagari_500Medium,
    NotoSansDevanagari_700Bold,
  });

  // Don't block forever if font download fails on a flaky network.
  if (!loaded && !error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.lime} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <LanguageProvider>
          <AppProvider>
            <StatusBar style="light" />
            <MainShell />
          </AppProvider>
        </LanguageProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
