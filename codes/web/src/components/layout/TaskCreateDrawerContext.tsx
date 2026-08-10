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
  noteId?: string;
  parseId?: string;
  status?: StatusKey;
  priority?: PriorityKey;
  startAt?: string;
  endAt?: string;
  title?: string;
  body?: string;
  location?: string;
};

export type TaskEditPrefill = {
  itemId: string;
  workspaceId: string;
  projectId: string;
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
  /** 待编辑的任务（来自便利贴转化） */
  taskToEdit: TaskEditPrefill | null;
  openCreate: (params?: TaskCreatePrefill) => void;
  openTaskEdit: (prefill: TaskEditPrefill) => void;
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
  taskToEdit: null,
  openCreate: () => {},
  openTaskEdit: () => {},
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
  const [taskToEdit, setTaskToEdit] = useState<TaskEditPrefill | null>(null);

  const openCreate = useCallback((params?: TaskCreatePrefill) => {
    setInitialStatus(params?.status ?? "todo");
    setInitialPriority(params?.priority ?? "1");
    setInitialStartAt(params?.startAt ?? "");
    setInitialEndAt(params?.endAt ?? "");
    setInitialTitle(params?.title ?? "");
    setInitialBody(params?.body ?? "");
    setInitialLocation(params?.location ?? "");
    setTaskToEdit(null);
    setOpen(true);
  }, []);

  const openTaskEdit = useCallback((prefill: TaskEditPrefill) => {
    setTaskToEdit(prefill);
    setInitialStatus("todo");
    setInitialPriority("1");
    setInitialStartAt("");
    setInitialEndAt("");
    setInitialTitle("");
    setInitialBody("");
    setInitialLocation("");
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setTaskToEdit(null);
  }, []);

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
        taskToEdit,
        openCreate,
        openTaskEdit,
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
