import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { FeedGame, Friend, OnlineMatch } from "../../api";
import { isApiError } from "../../api";
import { useApp } from "../../context/AppContext";
import { useLanguage } from "../../context/LanguageContext";
import { createChallenge } from "../../lib/challenges";
import { canLaunchGame, pickCategoryGame, resolveFeedGame } from "../../lib/gameCatalog";
import { getMatch } from "../../lib/matchmaking";
import { colors, spacing } from "../../theme/colors";
import { fonts, type } from "../../theme/typography";
import { BattleHistoryScreen } from "./BattleHistoryScreen";
import { BattleHomeScreen } from "./BattleHomeScreen";
import type { BattleCategory } from "./categories";
import { ChooseGameScreen } from "./ChooseGameScreen";
import { MatchmakingScreen } from "./MatchmakingScreen";
import { OpponentFoundScreen } from "./OpponentFoundScreen";
import { PickFriendScreen } from "./PickFriendScreen";

type Step = "home" | "pickFriend" | "choose" | "creating" | "matchmaking" | "found" | "history";
type Mode = "random" | "friend";

type Props = {
  signedIn: boolean;
  onNeedSignIn: () => void;
  onProfile?: () => void;
  /** Open Friends tab when the player has nobody to challenge. */
  onAddFriends?: () => void;
  /** Pre-select a friend (e.g. from Friends tab challenge button). */
  initialFriendId?: string | null;
  onConsumedInitialFriend?: () => void;
  onStartMatch: (
    game: FeedGame,
    match: {
      id: string;
      seed: string;
      opponent?: { displayName: string; avatarKey: string | null };
    },
  ) => void;
  onStartChallenge: (
    game: FeedGame,
    challenge: {
      id: string;
      seed: string;
      opponent?: { displayName: string; avatarKey: string | null };
    },
  ) => void;
};

function hintFromMatch(m: OnlineMatch) {
  return {
    title: m.gameTitle,
    blurb: m.gameBlurb,
    engine: m.engine,
    variation: m.variation,
    config: m.config,
  };
}

export function BattleFlow({
  signedIn,
  onNeedSignIn,
  onProfile,
  onAddFriends,
  initialFriendId,
  onConsumedInitialFriend,
  onStartMatch,
  onStartChallenge,
}: Props) {
  const { items, friends, friendsLoading } = useApp();
  const { t } = useLanguage();
  const [step, setStep] = useState<Step>("home");
  const [mode, setMode] = useState<Mode>("random");
  const [category, setCategory] = useState<BattleCategory | null>(null);
  const [friend, setFriend] = useState<Friend | null>(null);
  const [match, setMatch] = useState<OnlineMatch | null>(null);
  const [launchGame, setLaunchGame] = useState<FeedGame | null>(null);
  const [launchError, setLaunchError] = useState("");
  const [challengeGame, setChallengeGame] = useState<FeedGame | null>(null);
  const [challengeRef, setChallengeRef] = useState<{ id: string; seed: string } | null>(null);
  const [createError, setCreateError] = useState("");

  const reset = useCallback(() => {
    setStep("home");
    setMode("random");
    setCategory(null);
    setFriend(null);
    setMatch(null);
    setLaunchGame(null);
    setLaunchError("");
    setChallengeGame(null);
    setChallengeRef(null);
    setCreateError("");
  }, []);

  const feedGames = useCallback(
    () => items.filter((i): i is FeedGame => i.type === "mini_game"),
    [items],
  );

  const prepareMatchGame = useCallback(
    async (m: OnlineMatch): Promise<FeedGame | null> => {
      const game = await resolveFeedGame(m.gameKey, {
        title: m.gameTitle,
        feed: feedGames(),
        hint: hintFromMatch(m),
      });
      return canLaunchGame(game) ? game : null;
    },
    [feedGames],
  );

  // Deep-link from Friends: jump straight into friend challenge with that person.
  useEffect(() => {
    if (!initialFriendId) return;
    if (!signedIn) {
      onNeedSignIn();
      onConsumedInitialFriend?.();
      return;
    }
    if (friendsLoading) return;
    const target = friends.find((f) => f.userId === initialFriendId) ?? null;
    onConsumedInitialFriend?.();
    if (!target) {
      setMode("friend");
      setStep("pickFriend");
      return;
    }
    setMode("friend");
    setFriend(target);
    setStep("choose");
  }, [initialFriendId, friends, friendsLoading, signedIn, onNeedSignIn, onConsumedInitialFriend]);

  // Warm the game during the opponent-found countdown so GO never hits an empty card.
  useEffect(() => {
    if (step !== "found" || !match || mode !== "random") return;
    let cancelled = false;
    setLaunchError("");
    void (async () => {
      try {
        let fresh = match;
        try {
          fresh = await getMatch(match.id);
          if (!cancelled) setMatch(fresh);
        } catch {
          /* cached match is fine */
        }
        const game = await prepareMatchGame(fresh);
        if (cancelled) return;
        if (!game) {
          setLaunchGame(null);
          setLaunchError(t("gameNeedsNewer"));
          return;
        }
        setLaunchGame(game);
      } catch {
        if (!cancelled) {
          setLaunchGame(null);
          setLaunchError(t("couldntStartBody"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, match?.id, mode, prepareMatchGame, t]);

  const handleMatched = useCallback((m: OnlineMatch) => {
    setMatch(m);
    setLaunchGame(null);
    setLaunchError("");
    setStep("found");
  }, []);

  const handleReadyMatch = useCallback(async () => {
    if (!match) return;
    let game = launchGame;
    if (!game || !canLaunchGame(game)) {
      try {
        let fresh = match;
        try {
          fresh = await getMatch(match.id);
        } catch {
          /* cached */
        }
        game = await prepareMatchGame(fresh);
      } catch {
        game = null;
      }
    }
    if (!game) {
      setLaunchError(t("gameNeedsNewer"));
      return;
    }
    onStartMatch(game, {
      id: match.id,
      seed: match.seed,
      opponent: match.opponent
        ? { displayName: match.opponent.displayName, avatarKey: match.opponent.avatarKey ?? null }
        : undefined,
    });
    reset();
  }, [launchGame, match, onStartMatch, prepareMatchGame, reset, t]);

  const handleReadyChallenge = useCallback(() => {
    if (!challengeGame || !challengeRef) return;
    onStartChallenge(challengeGame, {
      ...challengeRef,
      opponent: friend
        ? { displayName: friend.displayName, avatarKey: friend.avatarKey ?? null }
        : undefined,
    });
    reset();
  }, [challengeGame, challengeRef, friend, onStartChallenge, reset]);

  const startFriendChallenge = useCallback(
    async (cat: BattleCategory, opponent: Friend) => {
      setCategory(cat);
      setStep("creating");
      setCreateError("");
      try {
        const game = await pickCategoryGame(cat.gameKeys, { feed: feedGames() });
        if (!canLaunchGame(game)) {
          setCreateError(t("gameNeedsNewer"));
          setStep("choose");
          return;
        }
        const created = await createChallenge({
          opponentUserId: opponent.userId,
          gameKey: game.key,
        });
        setChallengeGame(game);
        setChallengeRef({ id: created.id, seed: created.seed });
        setStep("found");
      } catch (e) {
        setCreateError(isApiError(e) ? e.userMessage : t("challengeSendFailed"));
        setStep("choose");
      }
    },
    [feedGames, t],
  );

  if (step === "history") {
    return (
      <BattleHistoryScreen
        onClose={() => setStep("home")}
        onProfile={onProfile}
        onPlayMatch={(game, m) => {
          onStartMatch(game, m);
          reset();
        }}
      />
    );
  }

  if (step === "pickFriend") {
    return (
      <PickFriendScreen
        friends={friends}
        onClose={reset}
        onProfile={onProfile}
        onAddFriends={onAddFriends}
        onSelect={(f) => {
          setFriend(f);
          setStep("choose");
        }}
      />
    );
  }

  if (step === "choose") {
    return (
      <ChooseGameScreen
        onClose={() => {
          setCreateError("");
          if (mode === "friend") {
            setFriend(null);
            setStep("pickFriend");
            return;
          }
          setStep("home");
        }}
        onProfile={onProfile}
        subtitle={
          mode === "friend" && friend
            ? `Challenge ${friend.displayName} · random playable game`
            : undefined
        }
        error={createError || undefined}
        onContinue={(cat) => {
          setCreateError("");
          if (mode === "friend" && friend) {
            void startFriendChallenge(cat, friend);
            return;
          }
          setCategory(cat);
          setStep("matchmaking");
        }}
      />
    );
  }

  if (step === "creating") {
    return (
      <View style={styles.creating}>
        <ActivityIndicator size="large" color={colors.lime} />
        <Text style={[type.bodyLg, { color: colors.paper, fontFamily: fonts.bodyBold, marginTop: spacing.md }]}>
          {t("sendingChallenge")}
        </Text>
        {friend ? (
          <Text style={[type.bodySm, { color: colors.lilac, marginTop: spacing.xs }]}>
            vs {friend.displayName}
          </Text>
        ) : null}
      </View>
    );
  }

  if (step === "matchmaking" && category) {
    return (
      <MatchmakingScreen
        category={category.id}
        gameLabel={category.label}
        signedIn={signedIn}
        onNeedSignIn={onNeedSignIn}
        onCancel={() => setStep("choose")}
        onMatched={handleMatched}
        onProfile={onProfile}
      />
    );
  }

  if (step === "found" && match && mode === "random") {
    return (
      <OpponentFoundScreen
        match={match}
        onClose={reset}
        onReady={() => void handleReadyMatch()}
        onProfile={onProfile}
        launchError={launchError || undefined}
        gameReady={Boolean(launchGame && canLaunchGame(launchGame))}
      />
    );
  }

  if (step === "found" && friend && challengeGame && challengeRef && mode === "friend") {
    return (
      <OpponentFoundScreen
        duel={{
          opponent: {
            displayName: friend.displayName,
            avatarKey: friend.avatarKey,
          },
          gameTitle: challengeGame.title,
          countdownSeconds: 3,
          badgeLabel: "Challenge Ready",
        }}
        onClose={reset}
        onReady={handleReadyChallenge}
        onProfile={onProfile}
      />
    );
  }

  return (
    <BattleHomeScreen
      onPlayRandom={() => {
        if (!signedIn) {
          onNeedSignIn();
          return;
        }
        setMode("random");
        setFriend(null);
        setStep("choose");
      }}
      onChallengeFriend={() => {
        if (!signedIn) {
          onNeedSignIn();
          return;
        }
        setMode("friend");
        setMatch(null);
        setStep("pickFriend");
      }}
      onHistory={() => {
        if (!signedIn) {
          onNeedSignIn();
          return;
        }
        setStep("history");
      }}
      onProfile={onProfile}
    />
  );
}

const styles = StyleSheet.create({
  creating: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.margin,
  },
});
