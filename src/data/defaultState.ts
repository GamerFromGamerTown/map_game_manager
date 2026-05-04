import rawDefaultState from "./default-state.json";
import { normalizeLoadedState } from "./migrations";
import { validateGameState } from "./validation";
import type { GameState } from "../types";

const bundledDefaultState = normalizeLoadedState(validateGameState(rawDefaultState));

export const createBundledState = (): GameState => structuredClone(bundledDefaultState);
