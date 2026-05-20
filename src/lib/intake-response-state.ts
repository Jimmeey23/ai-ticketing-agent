interface MoreInfoState {
  hasDetailForm: boolean;
  remainingMissingFieldCount: number;
  aiNeedsMoreInfo?: boolean;
}

export function shouldHoldDraftForMoreInfo(state: MoreInfoState): boolean {
  return state.hasDetailForm || state.remainingMissingFieldCount > 0;
}
