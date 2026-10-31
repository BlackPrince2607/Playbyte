import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, LayoutChangeEvent, RefreshControl, View, ViewToken } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FeedGame, FeedItem } from "../../api";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { FeedTopBar } from "../../components/FeedTopBar";
import { ScreenLoading } from "../../components/ScreenLoading";
import { SwipeHintOverlay } from "../../components/SwipeHintOverlay";
import { isMoment, useApp } from "../../context/AppContext";
import { useLanguage } from "../../context/LanguageContext";
import { capture } from "../../lib/analytics";
import { prefetchGame } from "../../game/platform/prefetchGame";
import type { CompletedPlay } from "../../game/session/types";
import { FEED_PREFETCH_AHEAD, feedKeys } from "../../lib/feedPages";
import { isSwipeHintPending, markSwipeHintSeen } from "../../lib/storage";
import { colors } from "../../theme/colors";
import { GameIntroPage } from "./GameIntroPage";
import { GuessFeedPage, isInlineGuessGame } from "./GuessFeedPage";
import { MomentFeedPage } from "./MomentFeedPage";

type Props = {
  onPlayGame: (game: FeedGame) => void;
  onChallengeGame?: (game: FeedGame, challenge: { id: string; seed: string }) => void;
  /** Guess trivia finished in-feed — same submit/result path as GameHost. */
  onGuessComplete?: (game: FeedGame, play: CompletedPlay) => void;
  onOpenProfile?: () => void;
  onOpenStreak?: () => void;
  onOpenWallet?: () => void;
  onSignIn?: () => void;
};

const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

export function FeedScreen({
  onPlayGame,
  onChallengeGame,
  onGuessComplete,
  onOpenProfile,
  onOpenStreak,
  onOpenWallet,
  onSignIn,
}: Props) {
  const {
    items,
    streak,
    wallet,
    feedIndex,
    setFeedIndex,
    feedLoading,
    feedError,
    refreshFeed,
    loadMoreFeed,
    isFeedTabActive,
  } = useApp();
  const { t } = useLanguage();
  const keys = useMemo(() => feedKeys(items), [items]);
  const nearEnd = useRef({ count: items.length, loadMore: loadMoreFeed });
  nearEnd.current = { count: items.length, loadMore: loadMoreFeed };
  const insets = useSafeAreaInsets();
  const [pageH, setPageH] = useState(0);
  const [pulling, setPulling] = useState(false);
  const listRef = useRef<FlatList<FeedItem>>(null);
  /** Page the list is showing, so programmatic jumps (Live tab, refresh) only scroll when needed. */
  const shownIndex = useRef(feedIndex);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const viewedIds = useRef(new Set<string>());
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

  // Warm the next game cards ahead of the viewer so Join never waits on packs.
  useEffect(() => {
    for (let i = feedIndex; i < Math.min(items.length, feedIndex + 3); i++) {
      const item = items[i];
      if (item?.type === "mini_game") prefetchGame(item);
    }
  }, [feedIndex, items]);

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
    const item = itemsRef.current[index];
    if (item) {
      const viewKey = `${item.type}:${item.type === "mini_game" ? item.key : item.id}`;
      if (!viewedIds.current.has(viewKey)) {
        viewedIds.current.add(viewKey);
        capture("feed_item_viewed", {
          item_id: item.type === "mini_game" ? item.key : item.id,
          item_type: item.type,
          position: index,
        });
      }
    }
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
        <FeedTopBar streak={streak} coins={wallet?.balance ?? 0} onStreak={onOpenStreak} onCoins={onOpenWallet} onProfile={onOpenProfile} />
        <ScreenLoading label={t("loadingFeed")} />
      </View>
    );
  }

  if (feedError && items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink }}>
        <FeedTopBar streak={streak} coins={wallet?.balance ?? 0} onStreak={onOpenStreak} onCoins={onOpenWallet} onProfile={onOpenProfile} />
        <ErrorState message={feedError} onRetry={() => void refreshFeed(true)} />
      </View>
    );
  }

  if (!items.length) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink }}>
        <FeedTopBar streak={streak} coins={wallet?.balance ?? 0} onStreak={onOpenStreak} onCoins={onOpenWallet} onProfile={onOpenProfile} />
        <EmptyState
          title={t("nothingLive")}
          message={t("checkBack")}
          actionLabel={t("refresh")}
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
          renderItem={({ item, index }) => {
            if (isMoment(item)) {
              return (
                <MomentFeedPage
                  item={item}
                  height={pageH}
                  isActive={isFeedTabActive && feedIndex === index}
                  onSignIn={onSignIn}
                />
              );
            }
            if (isInlineGuessGame(item) && onGuessComplete) {
              return (
                <GuessFeedPage
                  item={item}
                  height={pageH}
                  isActive={isFeedTabActive && feedIndex === index}
                  onComplete={(play) => onGuessComplete(item, play)}
                  onChallengeStart={
                    onChallengeGame ? (challenge) => onChallengeGame(item, challenge) : undefined
                  }
                  onSignIn={onSignIn}
                />
              );
            }
            return (
              <GameIntroPage
                item={item}
                height={pageH}
                isActive={isFeedTabActive && feedIndex === index}
                onStart={() => onPlayGame(item)}
                onChallengeStart={
                  onChallengeGame ? (challenge) => onChallengeGame(item, challenge) : undefined
                }
                onSignIn={onSignIn}
              />
            );
          }}
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
      <FeedTopBar streak={streak} coins={wallet?.balance ?? 0} onStreak={onOpenStreak} onCoins={onOpenWallet} onProfile={onOpenProfile} />
    </View>
  );
}
