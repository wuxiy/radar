// Retain medical thresholds and all-dynamics visibility until owner-labelled evidence supports changes.
import { SELECTION as common } from "../../selection.ts";
export const SELECTION = { ...common, classes: {} as Record<string, { label: string; threshold: number }>, browseFloor: 0 } as const;
