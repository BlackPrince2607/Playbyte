import { api, type CommentsPage, type MomentComment } from "../api";

export const COMMENT_MAX = 280;

export function setLike(momentId: string, liked: boolean) {
  return api<{ liked: boolean; likes: number }>(`/v1/moments/${momentId}/like`, { method: liked ? "PUT" : "DELETE" });
}

export function recordShare(momentId: string, channel = "system") {
  return api<{ created: boolean; shares: number }>(`/v1/moments/${momentId}/shares`, {
    method: "POST",
    body: JSON.stringify({ channel }),
  });
}

export function fetchComments(momentId: string, cursor?: string | null) {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return api<CommentsPage>(`/v1/moments/${momentId}/comments${qs}`);
}

export function postComment(momentId: string, body: string) {
  return api<{ comment: MomentComment; total: number }>(`/v1/moments/${momentId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function deleteComment(momentId: string, commentId: string) {
  return api<{ deleted: boolean; total: number }>(`/v1/moments/${momentId}/comments/${commentId}`, {
    method: "DELETE",
  });
}

export function reportComment(commentId: string) {
  return api<{ id: string }>(`/v1/reports`, {
    method: "POST",
    body: JSON.stringify({ targetType: "comment", targetId: commentId }),
  });
}