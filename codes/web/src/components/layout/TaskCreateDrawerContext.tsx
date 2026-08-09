"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { PriorityKey, StatusKey } from "@/types/api/views/schedule";

type CreateParams = {
  status?: StatusKey;
  priority?: PriorityKey;
  startAt?: string;
  endAt?: string;
};

type TaskCreateDrawerContextValue = {
  open: boolean;
  initialStatus: StatusKey;
  initialPriority: PriorityKey;
  initialStartAt: string;
  initialEndAt: string;
  openCreate: (params?: CreateParams) => void;
  close: () => void;
};

const TaskCreateDrawerContext = createContext<TaskCreateDrawerContextValue>({
  open: false,
  initialStatus: "todo",
  initialPriority: "1",
  initialStartAt: "",
  initialEndAt: "",
  openCreate: () => {},
  close: () => {},
});

export function TaskCreateDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialStatus, setInitialStatus] = useState<StatusKey>("todo");
  const [initialPriority, setInitialPriority] = useState<PriorityKey>("1");
  const [initialStartAt, setInitialStartAt] = useState("");
  const [initialEndAt, setInitialEndAt] = useState("");

  const openCreate = useCallback((params?: CreateParams) => {
    setInitialStatus(params?.status ?? "todo");
    setInitialPriority(params?.priority ?? "1");
    setInitialStartAt(params?.startAt ?? "");
    setInitialEndAt(params?.endAt ?? "");
    setOpen(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return (
    <TaskCreateDrawerContext.Provider
      value={{ open, initialStatus, initialPriority, initialStartAt, initialEndAt, openCreate, close }}
    >
      {children}
    </TaskCreateDrawerContext.Provider>
  );
}

export function useTaskCreateDrawer() {
  return useContext(TaskCreateDrawerContext);
}
