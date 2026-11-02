import { createContext } from "react";
export const ModalContext = createContext<{
  footer: HTMLDivElement | null;
  formId: string;
} | null>(null);
