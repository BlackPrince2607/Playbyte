import PagerView from "react-native-pager-view";
import { useEffect, useRef } from "react";
import { useWindowDimensions, View } from "react-native";
import { FeedGame, FeedItem } from "../../api";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { FeedTopBar } from "../../components/FeedTopBar";
import { LoadingSkeleton } from "../../components/LoadingSkeleton";
import { isMoment, useApp } from "../../context/AppContext";
import { colors } from "../../theme/colors";
import { GameIntroPage } from "./GameIntroPage";
import { MomentFeedPage } from "./MomentFeedPage";

type Props = {
  onPlayGame: (game: FeedGame) => void;
};

export function FeedScreen({ onPlayGame }: Props) {
  const {
    items,
    streak,
    feedIndex,
    setFeedIndex,
    feedLoading,
    feedRefreshing,
    feedError,
    refreshFeed,
    isFeedTabActive,
  } = useApp();
  const { height } = useWindowDimensions();
  const pageH = height;
  const pagerRef = useRef<PagerView>(null);

  useEffect(() => {
    if (feedIndex >= 0 && feedIndex < items.length) {
      pagerRef.current?.setPage(feedIndex);
    }
  }, [feedIndex, items.length]);

  if (feedLoading && items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink }}>
        <FeedTopBar streak={streak} refreshing={feedLoading} onRefresh={() => void refreshFeed(true)} />
        <LoadingSkeleton />
      </View>
    );
  }

  if (feedError && items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink }}>
        <FeedTopBar streak={streak} onRefresh={() => void refreshFeed(true)} />
        <ErrorState message={feedError} onRetry={() => void refreshFeed(true)} />
      </View>
    );
  }

  if (!items.length) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink }}>
        <FeedTopBar streak={streak} onRefresh={() => void refreshFeed(true)} />
        <EmptyState
          title="Nothing live right now"
          message="Check back soon — new moments drop throughout the day."
          actionLabel="Refresh"
          onAction={() => void refreshFeed(true)}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FeedTopBar
        streak={streak}
        refreshing={feedRefreshing}
        onRefresh={() => void refreshFeed(true)}
      />
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={feedIndex}
        orientation="vertical"
        onPageSelected={(e) => setFeedIndex(e.nativeEvent.position)}
      >
        {items.map((item: FeedItem, index) =>
          isMoment(item) ? (
            <View key={item.id} collapsable={false}>
              <MomentFeedPage
                item={item}
                height={pageH}
                isActive={isFeedTabActive && feedIndex === index}
              />
            </View>
          ) : (
            <View key={item.key} collapsable={false}>
              <GameIntroPage item={item} height={pageH} onStart={() => onPlayGame(item)} />
            </View>
          ),
        )}
      </PagerView>
    </View>
  );
}
