import { useContext, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ModalContext } from "./modal-context";
/** Keep dialog actions outside its scrolling content, with native form submission. */
export function ActionBar({ children }: { children: ReactNode }) {
  const modal = useContext(ModalContext),
    anchor = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const form = anchor.current?.closest("form");
    if (form && modal) form.id = modal.formId;
  }, [modal]);
  const bar = <div className="form-actions">{children}</div>;
  return (
    <>
      <span hidden ref={anchor} />
      {modal?.footer ? createPortal(bar, modal.footer) : bar}
    </>
  );
}
