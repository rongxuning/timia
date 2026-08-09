"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { PriorityKey, StatusKey } from "@/types/api/views/schedule";

export type TaskCreatePrefill = {
  status?: StatusKey;
  priority?: PriorityKey;
  startAt?: string;
  endAt?: string;
  title?: string;
  body?: string;
  location?: string;
};

type TaskCreateDrawerContextValue = {
  open: boolean;
  initialStatus: StatusKey;
  initialPriority: PriorityKey;
  initialStartAt: string;
  initialEndAt: string;
  initialTitle: string;
  initialBody: string;
  initialLocation: string;
  openCreate: (params?: TaskCreatePrefill) => void;
  close: () => void;
};

const TaskCreateDrawerContext = createContext<TaskCreateDrawerContextValue>({
  open: false,
  initialStatus: "todo",
  initialPriority: "1",
  initialStartAt: "",
  initialEndAt: "",
  initialTitle: "",
  initialBody: "",
  initialLocation: "",
  openCreate: () => {},
  close: () => {},
});

export function TaskCreateDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialStatus, setInitialStatus] = useState<StatusKey>("todo");
  const [initialPriority, setInitialPriority] = useState<PriorityKey>("1");
  const [initialStartAt, setInitialStartAt] = useState("");
  const [initialEndAt, setInitialEndAt] = useState("");
  const [initialTitle, setInitialTitle] = useState("");
  const [initialBody, setInitialBody] = useState("");
  const [initialLocation, setInitialLocation] = useState("");

  const openCreate = useCallback((params?: TaskCreatePrefill) => {
    setInitialStatus(params?.status ?? "todo");
    setInitialPriority(params?.priority ?? "1");
    setInitialStartAt(params?.startAt ?? "");
    setInitialEndAt(params?.endAt ?? "");
    setInitialTitle(params?.title ?? "");
    setInitialBody(params?.body ?? "");
    setInitialLocation(params?.location ?? "");
    setOpen(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return (
    <TaskCreateDrawerContext.Provider
      value={{
        open,
        initialStatus,
        initialPriority,
        initialStartAt,
        initialEndAt,
        initialTitle,
        initialBody,
        initialLocation,
        openCreate,
        close,
      }}
    >
      {children}
    </TaskCreateDrawerContext.Provider>
  );
}

export function useTaskCreateDrawer() {
  return useContext(TaskCreateDrawerContext);
}
