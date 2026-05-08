import rawDefaultState from "./default-state.json";
import { normalizeLoadedState } from "./migrations";
import { validateGameState } from "./validation";
import type { GameState } from "../types";

const emptySaveState = normalizeLoadedState(validateGameState(rawDefaultState));

export const createEmptyState = (): GameState => structuredClone(emptySaveState);
