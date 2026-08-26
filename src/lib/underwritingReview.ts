export type UnderwritingReviewSlot = {
  starts_at: string;
  label: string;
  date_label: string;
  duration_min?: number;
  buffer_before_min?: number;
  buffer_after_min?: number;
};

export type UnderwritingReviewPreference = {
  id: string;
  dealer_id: string;
  rep_user_id: string | null;
  timezone: string;
  slots: UnderwritingReviewSlot[];
  status: "pending" | "selected" | "booked" | "expired";
  submitted_at: string;
  selected_slot_at: string | null;
  selected_by_user_id: string | null;
  appointment_id: string | null;
};

export function activeUnderwritingReviewPreference(
  preferences: UnderwritingReviewPreference[] | undefined,
): UnderwritingReviewPreference | null {
  return (
    preferences?.find((item) =>
      item.status === "pending" || item.status === "selected" || item.status === "booked",
    ) ?? null
  );
}
