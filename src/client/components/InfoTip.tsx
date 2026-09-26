import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

/** A tap or keyboard-accessible explanation, including on touch screens. */
export function InfoTip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const panel = dialog.current;
    panel?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      panel?.close();
      document.body.style.overflow = previousOverflow;
      trigger.current?.focus({ preventScroll: true });
    };
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="info-trigger"
        aria-label={`About ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Icon name="info" size={16} />
      </button>
      {open &&
        createPortal(
          <dialog
            ref={dialog}
            id={id}
            className="info-popover"
            aria-labelledby={`${id}-title`}
            aria-modal="true"
            onCancel={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }}
            onClick={(event) => {
              if (event.target !== event.currentTarget) return;
              const box = event.currentTarget.getBoundingClientRect();
              if (
                event.clientX < box.left ||
                event.clientX > box.right ||
                event.clientY < box.top ||
                event.clientY > box.bottom
              )
                setOpen(false);
            }}
          >
            <div className="info-heading">
              <h2 id={`${id}-title`}>{label}</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close explanation"
                onClick={() => setOpen(false)}
                autoFocus
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="info-body">{children}</div>
          </dialog>,
          document.body,
        )}
    </>
  );
}

export function InfoLabel({
  htmlFor,
  label,
  children,
}: {
  htmlFor?: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="info-label">
      {htmlFor ? (
        <label className="form-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="form-label">{label}</span>
      )}
      <InfoTip label={label}>{children}</InfoTip>
    </div>
  );
}
