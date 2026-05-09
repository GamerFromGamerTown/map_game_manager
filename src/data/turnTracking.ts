import { TurnTrackedEntity } from "../types";

const TRACKING_FIELDS = new Set(["created_turn", "updated_turn", "updated_fields"]);
const NON_ACTION_FIELDS = new Set(["notes"]);

const changedFieldsFromPatch = (patch: Record<string, unknown>): string[] =>
  Object.keys(patch).filter((field) => !TRACKING_FIELDS.has(field) && !NON_ACTION_FIELDS.has(field));

export const withCreatedTurn = <T extends object>(entity: T, turnNumber: number): T & TurnTrackedEntity => ({
  ...entity,
  created_turn: turnNumber
});

export const withUpdatedTurn = <T extends TurnTrackedEntity>(
  entity: T,
  patch: Partial<T>,
  turnNumber: number
): T => {
  const changedFields = changedFieldsFromPatch(patch as Record<string, unknown>);
  if (changedFields.length === 0 || entity.created_turn === turnNumber) {
    return { ...entity, ...patch };
  }

  const previousFields = entity.updated_turn === turnNumber ? entity.updated_fields ?? [] : [];
  return {
    ...entity,
    ...patch,
    updated_turn: turnNumber,
    updated_fields: Array.from(new Set([...previousFields, ...changedFields]))
  };
};
