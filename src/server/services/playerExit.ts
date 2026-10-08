// What happens when a player is gone for good (the reconnect grace period ran out) or the
// server shuts down: an unfinished shift is ended as if time ran out and saved to their slot
// (so leaving can't dodge a FIRED), then everything about their session is cleared. The
// order matters: the shift must be saved while the session still knows the slot.

export interface ExitServices {
  shifts: { abandon: (playerId: string) => void; removePlayer: (playerId: string) => void };
  calls: { removePlayer: (playerId: string) => void };
  cards: { clearCards: (playerId: string) => void };
  stats: { removePlayer: (playerId: string) => void };
  saves: { removePlayer: (playerId: string) => void };
}

export function endPlayerSession(services: ExitServices, playerId: string): void {
  services.shifts.abandon(playerId);
  services.shifts.removePlayer(playerId);
  services.calls.removePlayer(playerId);
  services.cards.clearCards(playerId);
  services.stats.removePlayer(playerId);
  services.saves.removePlayer(playerId);
}
