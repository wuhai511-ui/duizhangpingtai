import type { MatchedEvent } from './recon-events.js';

export class SettlementService {
  async onMatched(_event: MatchedEvent) {
    // Stub listener for phase 1; real settlement confirmation will be wired later.
    return;
  }
}
