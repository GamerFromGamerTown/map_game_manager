import { GameState } from "../types";

export const countryName = (state: GameState, id: string): string =>
  state.countries.find((country) => country.id === id)?.name ?? "Unknown";

export const countryShortName = (state: GameState, id: string): string => {
  const country = state.countries.find((item) => item.id === id);
  return country?.short_name?.trim() || country?.name || "Unknown";
};
