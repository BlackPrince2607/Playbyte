import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, LayoutChangeEvent, RefreshControl, View, ViewToken } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FeedGame, FeedItem } from "../../api";
import { DailyFeaturedBanner } from "../../components/DailyFeaturedBanner";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { FeedTopBar } from "../../components/FeedTopBar";
import { ScreenLoading } from "../../components/ScreenLoading";
import { SwipeHintOverlay } from "../../components/SwipeHintOverlay";
import { isMoment, useApp } from "../../context/AppContext";
import { useLanguage } from "../../context/LanguageContext";
import { capture } from "../../lib/analytics";
import { getDailyFeaturedGame, markDailyFeaturedPlayed } from "../../lib/dailyFeatured";
import { prefetchGame } from "../../game/platform/prefetchGame";
import type { CompletedPlay } from "../../game/session/types";
import { FEED_PREFETCH_AHEAD, feedKeys } from "../../lib/feedPages";
import { prefetchMomentImages } from "../../lib/prefetchMomentImages";
import { isSwipeHintPending, markSwipeHintSeen } from "../../lib/storage";
import { colors, spacing } from "../../theme/colors";
import { GameIntroPage } from "./GameIntroPage";
import { GuessFeedPage, isInlineGuessGame } from "./GuessFeedPage";
import { MomentFeedPage } from "./MomentFeedPage";

/** Native RefreshControl freezes a paging FlatList while `refreshing` — release it immediately after the pull. */
const PULL_NATIVE_MS = 120;

/** How many cards ahead of the viewer to warm (games + poll images). */
const FEED_WARM_AHEAD = 3;

type Props = {
  /** Incremented when the Feed tab is pressed while already active — scroll to the first card. */
  feedTopNonce?: number;
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
  feedTopNonce = 0,
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
  /** Brief native pull ack only — keeping this true locks the paging list and feels stuck. */
  const [pulling, setPulling] = useState(false);
  const pullLock = useRef(false);
  const listRef = useRef<FlatList<FeedItem>>(null);
  /** Page the list is showing, so programmatic jumps (Live tab, refresh) only scroll when needed. */
  const shownIndex = useRef(feedIndex);
  /** Last Feed-tab “jump to top” nonce we handled — ignore later length/layout churn. */
  const handledTopNonce = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const viewedIds = useRef(new Set<string>());
  /** Feed page the swipe tip appeared on; moving off it counts as having learned the gesture. */
  const [swipeHintFrom, setSwipeHintFrom] = useState<number | null>(null);
  const [featured, setFeatured] = useState<FeedGame | null>(null);
  const featuredTracked = useRef(false);
  /** Lock paging while in-feed trivia is mid-round so PLAY can't accidentally swipe away. */
  const [guessLocked, setGuessLocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void isSwipeHintPending().then((pending) => {
      if (pending && !cancelled) setSwipeHintFrom(shownIndex.current);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getDailyFeaturedGame().then((game) => {
      if (!cancelled) setFeatured(game);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!featured || featuredTracked.current) return;
    featuredTracked.current = true;
    capture("daily_featured_viewed", { game_id: featured.key });
  }, [featured]);

  const dismissSwipeHint = useCallback(() => {
    setSwipeHintFrom(null);
    void markSwipeHintSeen();
  }, []);

  useEffect(() => {
    if (swipeHintFrom !== null && feedIndex !== swipeHintFrom) dismissSwipeHint();
  }, [feedIndex, swipeHintFrom, dismissSwipeHint]);

  // Warm upcoming games + poll images so the next swipe is already cached.
  useEffect(() => {
    for (let i = feedIndex; i < Math.min(items.length, feedIndex + FEED_WARM_AHEAD); i++) {
      const item = items[i];
      if (item?.type === "mini_game") prefetchGame(item);
      else if (item?.type === "moment") prefetchMomentImages(item);
    }
  }, [feedIndex, items]);

  useEffect(() => {
    if (!pageH || feedIndex === shownIndex.current || feedIndex < 0 || feedIndex >= items.length) return;
    shownIndex.current = feedIndex;
    listRef.current?.scrollToIndex({ index: feedIndex, animated: false });
  }, [feedIndex, items.length, pageH]);

  // Feed tab pressed again while already on Feed → jump to the first card.
  // Only consume each nonce once; deps include pageH/items so we can wait until the list is ready
  // without re-jumping when soft-refresh / load-more grows the feed.
  useEffect(() => {
    if (!feedTopNonce || feedTopNonce === handledTopNonce.current) return;
    if (!pageH || items.length === 0) return;
    handledTopNonce.current = feedTopNonce;
    shownIndex.current = 0;
    setFeedIndex(0);
    listRef.current?.scrollToIndex({ index: 0, animated: true });
  }, [feedTopNonce, pageH, items.length, setFeedIndex]);

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
    if (guessLocked || pullLock.current) return;
    pullLock.current = true;
    setPulling(true);
    // Drop the native spinner immediately so the feed isn't frozen waiting on the network.
    const unlock = setTimeout(() => setPulling(false), PULL_NATIVE_MS);
    refreshFeed(true, { replace: true })
      .then(() => {
        shownIndex.current = 0;
        setFeedIndex(0);
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(unlock);
        setPulling(false);
        pullLock.current = false;
      });
  }, [guessLocked, refreshFeed, setFeedIndex]);

  const onLayout = (e: LayoutChangeEvent) => setPageH(Math.round(e.nativeEvent.layout.height));

  // Locking scroll mid-gesture can leave the list between pages (blank ink). Snap back.
  useEffect(() => {
    if (!guessLocked || !pageH || itemsRef.current.length === 0) return;
    const index = Math.min(Math.max(0, shownIndex.current), itemsRef.current.length - 1);
    const snap = () => listRef.current?.scrollToIndex({ index, animated: false });
    try {
      snap();
    } catch {
      requestAnimationFrame(snap);
    }
  }, [guessLocked, pageH]);

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
          extraData={`${feedIndex}:${isFeedTabActive}:${guessLocked ? 1 : 0}`}
          onScrollToIndexFailed={({ index }) => {
            requestAnimationFrame(() => {
              listRef.current?.scrollToIndex({ index, animated: false });
            });
          }}
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
                  onPlayingChange={setGuessLocked}
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
          scrollEnabled={!guessLocked}
          // Android defaults this true; with paging + scroll lock it can detach the
          // visible cell after PLAY and leave a blank ink page under the chrome.
          removeClippedSubviews={false}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={5}
          viewabilityConfig={VIEWABILITY}
          onViewableItemsChanged={onViewableItemsChanged}
          onScrollEndDrag={onScrollEndDrag}
          onEndReached={() => void loadMoreFeed()}
          onEndReachedThreshold={FEED_PREFETCH_AHEAD}
          refreshControl={
            <RefreshControl
              refreshing={pulling}
              onRefresh={onPull}
              // Keep mounted while locked — swapping RefreshControl out jumps the list and
              // flickers viewability, which blanked / reset in-feed PLAY.
              enabled={!guessLocked}
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
      {featured && isFeedTabActive && feedIndex === 0 ? (
        <View style={{ position: "absolute", top: insets.top + 56, left: 0, right: 0, zIndex: 40, paddingTop: spacing.xs }}>
          <DailyFeaturedBanner
            game={featured}
            onPlay={(game) => {
              capture("daily_featured_played", { game_id: game.key });
              setFeatured(null);
              void markDailyFeaturedPlayed();
              onPlayGame(game);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
