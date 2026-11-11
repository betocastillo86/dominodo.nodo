/**
 * `GET /chat-feedback/summary`, typed exactly as the API returns it.
 *
 * Domi's answer feedback (dominodo.domi ADR-0019 §12), already pinned to this
 * conjunto server-side by `X-Tenant`. Two counting rules the UI must honour:
 * - `unanswered = asked − answered`, never `deflections − answered`: the
 *   question is put at most once per conversation, so a deflection that was
 *   never asked is not silence.
 * - `responseRate` (answered / asked) and `helpfulRate` (helpful / answered)
 *   are `null`, never `0`, when their denominator is zero — "nobody was asked"
 *   is not "everybody said no".
 *
 * The range bounds when Domi ANSWERED, not when the resident gave the verdict.
 */
export interface ChatFeedbackSummaryDto {
  tenant: string | null;
  from: string | null;
  to: string | null;
  deflections: number;
  asked: number;
  answered: number;
  helpful: number;
  notHelpful: number;
  unanswered: number;
  responseRate: number | null;
  helpfulRate: number | null;
}

/** Same code the API's `[HasPermission]` checks on the endpoint. */
export const CHAT_FEEDBACK_PERMISSION = 'chat.feedback';
