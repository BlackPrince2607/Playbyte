import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, LayoutChangeEvent, RefreshControl, View, ViewToken } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FeedGame, FeedItem } from "../../api";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { FeedTopBar } from "../../components/FeedTopBar";
import { LoadingSkeleton } from "../../components/LoadingSkeleton";
import { SwipeHintOverlay } from "../../components/SwipeHintOverlay";
import { isMoment, useApp } from "../../context/AppContext";
import { FEED_PREFETCH_AHEAD, feedKeys } from "../../lib/feedPages";
import { isSwipeHintPending, markSwipeHintSeen } from "../../lib/storage";
import { colors } from "../../theme/colors";
import { GameIntroPage } from "./GameIntroPage";
import { MomentFeedPage } from "./MomentFeedPage";

type Props = {
  onPlayGame: (game: FeedGame) => void;
  onOpenProfile?: () => void;
  onOpenStreak?: () => void;
  onSignIn?: () => void;
};

const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

export function FeedScreen({ onPlayGame, onOpenProfile, onOpenStreak, onSignIn }: Props) {
  const {
    items,
    streak,
    feedIndex,
    setFeedIndex,
    feedLoading,
    feedError,
    refreshFeed,
    loadMoreFeed,
    isFeedTabActive,
  } = useApp();
  const keys = useMemo(() => feedKeys(items), [items]);
  const nearEnd = useRef({ count: items.length, loadMore: loadMoreFeed });
  nearEnd.current = { count: items.length, loadMore: loadMoreFeed };
  const insets = useSafeAreaInsets();
  const [pageH, setPageH] = useState(0);
  const [pulling, setPulling] = useState(false);
  const listRef = useRef<FlatList<FeedItem>>(null);
  /** Page the list is showing, so programmatic jumps (Live tab, refresh) only scroll when needed. */
  const shownIndex = useRef(feedIndex);
  /** Feed page the swipe tip appeared on; moving off it counts as having learned the gesture. */
  const [swipeHintFrom, setSwipeHintFrom] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void isSwipeHintPending().then((pending) => {
      if (pending && !cancelled) setSwipeHintFrom(shownIndex.current);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dismissSwipeHint = useCallback(() => {
    setSwipeHintFrom(null);
    void markSwipeHintSeen();
  }, []);

  useEffect(() => {
    if (swipeHintFrom !== null && feedIndex !== swipeHintFrom) dismissSwipeHint();
  }, [feedIndex, swipeHintFrom, dismissSwipeHint]);

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
    if (index >= nearEnd.current.count - 1 - FEED_PREFETCH_AHEAD) void nearEnd.current.loadMore(index);
  }).current;

  /** Dragging against the last cards retries a page fetch that gave up, since no new page comes into view. */
  const onScrollEndDrag = useCallback(() => {
    if (shownIndex.current >= nearEnd.current.count - 1 - FEED_PREFETCH_AHEAD) {
      void nearEnd.current.loadMore(shownIndex.current);
    }
  }, []);

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
        <FeedTopBar streak={streak} onStreak={onOpenStreak} onProfile={onOpenProfile} />
        <LoadingSkeleton />
      </View>
    );
  }

  if (feedError && items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink }}>
        <FeedTopBar streak={streak} onStreak={onOpenStreak} onProfile={onOpenProfile} />
        <ErrorState message={feedError} onRetry={() => void refreshFeed(true)} />
      </View>
    );
  }

  if (!items.length) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink }}>
        <FeedTopBar streak={streak} onStreak={onOpenStreak} onProfile={onOpenProfile} />
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
          keyExtractor={(_, index) => keys[index]}
          extraData={`${feedIndex}:${isFeedTabActive}`}
          renderItem={({ item, index }) =>
            isMoment(item) ? (
              <MomentFeedPage
                item={item}
                height={pageH}
                isActive={isFeedTabActive && feedIndex === index}
                onSignIn={onSignIn}
              />
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
          onScrollEndDrag={onScrollEndDrag}
          onEndReached={() => void loadMoreFeed()}
          onEndReachedThreshold={FEED_PREFETCH_AHEAD}
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
      {pageH > 0 && swipeHintFrom !== null && isFeedTabActive ? (
        <SwipeHintOverlay onDismiss={dismissSwipeHint} />
      ) : null}
      <FeedTopBar streak={streak} onStreak={onOpenStreak} onProfile={onOpenProfile} />
    </View>
  );
}
