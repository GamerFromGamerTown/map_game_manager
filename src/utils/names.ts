import { GameState } from "../types";

export const countryName = (state: GameState, id: string): string =>
  state.countries.find((country) => country.id === id)?.name ?? "Unknown";
