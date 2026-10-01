import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, LayoutChangeEvent, RefreshControl, View, ViewToken } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  onOpenProfile?: () => void;
};

const keyOf = (item: FeedItem) => (isMoment(item) ? `m:${item.id}` : `g:${item.key}`);
const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

export function FeedScreen({ onPlayGame, onOpenProfile }: Props) {
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
  const insets = useSafeAreaInsets();
  const [pageH, setPageH] = useState(0);
  const [pulling, setPulling] = useState(false);
  const listRef = useRef<FlatList<FeedItem>>(null);
  /** Page the list is showing, so programmatic jumps (Live tab, refresh) only scroll when needed. */
  const shownIndex = useRef(feedIndex);

  useEffect(() => {
    if (!pageH || feedIndex === shownIndex.current || feedIndex < 0 || feedIndex >= items.length) return;
    shownIndex.current = feedIndex;
    listRef.current?.scrollToIndex({ index: feedIndex, animated: false });
  }, [feedIndex, items.length, pageH]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<FeedItem>[] }) => {
    const index = viewableItems[0]?.index;
    if (index === null || index === undefined) return;
    shownIndex.current = index;
    setFeedIndex(index);
  }).current;

  const onPull = useCallback(() => {
    setPulling(true);
    refreshFeed(true)
      .catch(() => {})
      .finally(() => setPulling(false));
  }, [refreshFeed]);

  const onLayout = (e: LayoutChangeEvent) => setPageH(Math.round(e.nativeEvent.layout.height));

  if (feedLoading && items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink }}>
        <FeedTopBar
          streak={streak}
          refreshing={feedLoading}
          onRefresh={() => void refreshFeed(true)}
          onProfile={onOpenProfile}
        />
        <LoadingSkeleton />
      </View>
    );
  }

  if (feedError && items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink }}>
        <FeedTopBar streak={streak} onRefresh={() => void refreshFeed(true)} onProfile={onOpenProfile} />
        <ErrorState message={feedError} onRetry={() => void refreshFeed(true)} />
      </View>
    );
  }

  if (!items.length) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink }}>
        <FeedTopBar streak={streak} onRefresh={() => void refreshFeed(true)} onProfile={onOpenProfile} />
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
    <View style={{ flex: 1, backgroundColor: colors.ink }} onLayout={onLayout}>
      {pageH > 0 ? (
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={keyOf}
          extraData={`${feedIndex}:${isFeedTabActive}`}
          renderItem={({ item, index }) =>
            isMoment(item) ? (
              <MomentFeedPage item={item} height={pageH} isActive={isFeedTabActive && feedIndex === index} />
            ) : (
              <GameIntroPage item={item} height={pageH} onStart={() => onPlayGame(item)} />
            )
          }
          getItemLayout={(_, index) => ({ length: pageH, offset: pageH * index, index })}
          initialScrollIndex={Math.min(Math.max(0, feedIndex), items.length - 1)}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={3}
          viewabilityConfig={VIEWABILITY}
          onViewableItemsChanged={onViewableItemsChanged}
          refreshControl={
            <RefreshControl
              refreshing={pulling}
              onRefresh={onPull}
              tintColor={colors.lime}
              colors={[colors.lime]}
              progressBackgroundColor={colors.card}
              progressViewOffset={insets.top + 56}
            />
          }
        />
      ) : null}
      <FeedTopBar
        streak={streak}
        refreshing={feedRefreshing}
        onRefresh={() => void refreshFeed(true)}
        onProfile={onOpenProfile}
      />
    </View>
  );
}
