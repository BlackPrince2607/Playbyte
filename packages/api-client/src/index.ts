export type CrowdSnapshot = {
  event: string;
  momentId: string;
  version: number;
  generatedAt: string | null;
  totalResponses: number;
  optionCounts: Record<string, number>;
  joinedLastMinute: number;
  volumeState: "nascent" | "building" | "mature";
};

export type MomentOption = { id: string; label: string; sortOrder: number };

export type MomentCard = {
  type: "moment";
  id: string;
  cardType: "predict" | "pulse" | "reaction";
  prompt: string;
  category: { slug: string; name: string } | null;
  status: string;
  options: MomentOption[];
  myOptionId: string | null;
  result: CrowdSnapshot | null;
  friends?: { userId: string; displayName: string; optionId: string }[];
};

export type MiniGameCard = {
  type: "mini_game";
  key: string;
  title: string;
  blurb: string;
  config: Record<string, unknown>;
};

export type FeedItem = MomentCard | MiniGameCard;
