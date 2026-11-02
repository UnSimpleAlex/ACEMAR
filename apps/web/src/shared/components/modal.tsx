import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { ModalContext } from "./modal-context";
export function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const formId = useId();
  const [footer, setFooter] = useState<HTMLDivElement | null>(null);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className="modal"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <ModalContext.Provider value={{ footer, formId }}>
            <div className="modal-heading">
              <div>
                <Dialog.Title>{title}</Dialog.Title>
                <Dialog.Description>
                  {description ?? "Revisa la información antes de continuar."}
                </Dialog.Description>
              </div>
              <Dialog.Close className="icon-btn" aria-label="Cerrar">
                <X />
              </Dialog.Close>
            </div>
            <div className="modal-body">{children}</div>
            <div className="modal-footer" ref={setFooter} />
          </ModalContext.Provider>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
