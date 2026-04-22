import type { MatchedEvent } from './recon-events.js';

export class SplitService {
  async onMatched(_event: MatchedEvent) {
    // Stub listener for phase 1; real split settlement integration will be wired later.
    return;
  }
}
