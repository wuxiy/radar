import { createContext, useContext, useEffect } from "react";
import type { AdminMe } from "@aihot/contracts/admin";
import type { SourceIndustry } from "@aihot/contracts/source-management";

export interface SourceManagementContextValue {
  industry: SourceIndustry;
  me: AdminMe;
  setDirty: (dirty: boolean) => void;
  setPending: (pending: boolean) => void;
}

export const SourceManagementContext = createContext<SourceManagementContextValue | null>(null);
export const useSourceManagement = () => useContext(SourceManagementContext);

/** The existing industry admin and the unified page share the same source views. */
export function useSourcePath() {
  const management = useSourceManagement();
  return (suffix = "") => management ? `/sources${suffix}?industry=${management.industry}` : `/admin/sources${suffix}`;
}

export function useSourceDraftGuard(dirty: boolean) {
  const management = useSourceManagement();
  const setDirty = management?.setDirty;
  useEffect(() => {
    setDirty?.(dirty);
    return () => setDirty?.(false);
  }, [dirty, setDirty]);
  return () => setDirty?.(false);
}
