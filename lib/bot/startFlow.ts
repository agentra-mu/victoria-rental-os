import type { WhatsAppReply } from "@/lib/whatsapp/replies";
import { resetFlowState } from "./actions";
import type { TurnCtx } from "./context";
import { enterStep } from "./flow";

/**
 * "View cars" starts at the car list; "Check availability" starts at the
 * dates and shows only the cars that are free for them.
 */
export async function startBookingFlow(
  ctx: TurnCtx,
  mode: "fleet" | "availability",
): Promise<WhatsAppReply[]> {
  resetFlowState(ctx);
  return enterStep(ctx, mode === "fleet" ? "CHOOSE_CAR" : "PICKUP_DATETIME");
}
