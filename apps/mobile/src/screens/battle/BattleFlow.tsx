import { useCallback, useState } from "react";
import type { FeedGame, OnlineMatch } from "../../api";
import { useApp } from "../../context/AppContext";
import { getMatch } from "../../lib/matchmaking";
import { BattleHomeScreen } from "./BattleHomeScreen";
import type { BattleCategory } from "./categories";
import { ChooseGameScreen } from "./ChooseGameScreen";
import { MatchmakingScreen } from "./MatchmakingScreen";
import { OpponentFoundScreen } from "./OpponentFoundScreen";

type Step = "home" | "choose" | "matchmaking" | "found";

type Props = {
  signedIn: boolean;
  onNeedSignIn: () => void;
  onProfile?: () => void;
  onChallengeFriend: () => void;
  onStartMatch: (game: FeedGame, match: { id: string; seed: string }) => void;
};

export function BattleFlow({
  signedIn,
  onNeedSignIn,
  onProfile,
  onChallengeFriend,
  onStartMatch,
}: Props) {
  const { items } = useApp();
  const [step, setStep] = useState<Step>("home");
  const [category, setCategory] = useState<BattleCategory | null>(null);
  const [match, setMatch] = useState<OnlineMatch | null>(null);

  const reset = useCallback(() => {
    setStep("home");
    setCategory(null);
    setMatch(null);
  }, []);

  const resolveGame = useCallback(
    (m: OnlineMatch): FeedGame => {
      const fromFeed = items.find(
        (i): i is FeedGame => i.type === "mini_game" && i.key === m.gameKey,
      );
      return (
        fromFeed ?? {
          type: "mini_game",
          key: m.gameKey,
          title: m.gameTitle,
          blurb: "",
        }
      );
    },
    [items],
  );

  const handleMatched = useCallback((m: OnlineMatch) => {
    setMatch(m);
    setStep("found");
  }, []);

  const handleReady = useCallback(async () => {
    if (!match) return;
    let fresh = match;
    try {
      fresh = await getMatch(match.id);
    } catch {
      /* use cached match */
    }
    onStartMatch(resolveGame(fresh), { id: fresh.id, seed: fresh.seed });
    reset();
  }, [match, onStartMatch, resolveGame, reset]);

  if (step === "choose") {
    return (
      <ChooseGameScreen
        onClose={() => setStep("home")}
        onProfile={onProfile}
        onContinue={(cat) => {
          setCategory(cat);
          setStep("matchmaking");
        }}
      />
    );
  }

  if (step === "matchmaking" && category) {
    return (
      <MatchmakingScreen
        gameKey={category.gameKey}
        gameLabel={category.label}
        signedIn={signedIn}
        onNeedSignIn={onNeedSignIn}
        onCancel={() => setStep("choose")}
        onMatched={handleMatched}
        onProfile={onProfile}
      />
    );
  }

  if (step === "found" && match) {
    return (
      <OpponentFoundScreen
        match={match}
        onClose={reset}
        onReady={() => void handleReady()}
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
        setStep("choose");
      }}
      onChallengeFriend={() => {
        if (!signedIn) {
          onNeedSignIn();
          return;
        }
        onChallengeFriend();
      }}
      onProfile={onProfile}
    />
  );
}
