export type CrowdSnapshot = {
  event?: string;
  momentId?: string;
  version?: number;
  generatedAt?: string | null;
  totalResponses: number;
  optionCounts: Record<string, number>;
  joinedLastMinute?: number;
  volumeState?: "nascent" | "building" | "mature" | string;
  correctOptionId?: string | null;
};

export type MomentOption = {
  id: string;
  label: string | null;
  imageUrl?: string | null;
  sortOrder: number;
};

export type ContentTag = { slug: string; name: string };

export type MomentCard = {
  type: "moment";
  id: string;
  cardType: "predict" | "pulse" | "reaction" | string;
  prompt: string;
  promptImageUrl?: string | null;
  scoringMode?: "none" | "correct_option" | string;
  tags?: ContentTag[];
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
