export type TaskSummary = {
  workId: string;
  url: string;
  title: string;
  snippet: string;
  budgetMinJpy: number | null;
  budgetMaxJpy: number | null;
};

export type BidCandidate = TaskSummary & {
  score: number;
  reason: string;
};

export type TaskDetail = {
  workId: string;
  url: string;
  title: string;
  description: string;
  budgetText: string | null;
  budgetMinJpy: number | null;
  budgetMaxJpy: number | null;
  deadline: string | null;
};

export type BidResult = {
  workId: string;
  attemptedAt: string;
  status: "skipped" | "submitted" | "failed";
  reason?: string;
  stepHistory?: Array<{
    step: string;
    status: "ok" | "skipped" | "failed";
    message?: string;
    at: string;
  }>;
};
