import type { MatchedEvent } from './recon-events.js';

export class ProofService {
  async onMatched(_event: MatchedEvent) {
    // Stub listener for phase 1; real accounting integration will be wired later.
    return;
  }
}
