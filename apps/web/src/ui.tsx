import {
  useEffect,
  useLayoutEffect,
  type TextareaHTMLAttributes,
  useId,
  cloneElement,
  isValidElement,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { X } from "lucide-react";
export function Button({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={"button " + className} {...props}>
      {children}
    </button>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isValidElement<{ id?: string; "aria-describedby"?: string }>(children)
        ? cloneElement(children, {
            id,
            "aria-describedby": hint
              ? [children.props["aria-describedby"], id + "-hint"]
                  .filter(Boolean)
                  .join(" ")
              : children.props["aria-describedby"],
          })
        : children}
      {hint && <small id={id + "-hint"}>{hint}</small>}
    </div>
  );
}
export function Select({
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props}>{children}</select>;
}
export function Range({
  label,
  low,
  high,
  value,
  onChange,
}: {
  label: string;
  low: string;
  high: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="range">
      <span>
        {label}
        <b>{value}</b>
      </span>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => onChange(+e.target.value)}
      />
      <small>
        <span>{low}</span>
        <span>{high}</span>
      </small>
    </label>
  );
}
export function Dialog({
  title,
  close,
  children,
  wide = false,
  className = "",
  initialFocus,
  returnFocus,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
  className?: string;
  initialFocus?: string;
  returnFocus?: () => HTMLElement | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    ref.current?.showModal();
    if (initialFocus)
      ref.current?.querySelector<HTMLElement>(initialFocus)?.focus();
    return () => {
      ref.current?.close();
      requestAnimationFrame(() =>
        (returnFocus?.() ?? (opener?.isConnected ? opener : null))?.focus(),
      );
    };
  }, []);
  return (
    <dialog
      className={(wide ? "dialog wide" : "dialog") + " " + className}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
      aria-label={title}
    >
      <header>
        <h2>{title}</h2>
        <Button aria-label="Close dialog" onClick={close}>
          <X size={18} />
        </Button>
      </header>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
export function ConfirmDelete({
  title,
  confirmLabel,
  ariaLabel = confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  confirmLabel: string;
  ariaLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-label={ariaLabel}
      className="delete-confirm"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <p>{title}</p>
      <div className="row wrap">
        <Button autoFocus onClick={onCancel}>
          Cancel
        </Button>
        <Button className="danger solid" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
export function download(
  filename: string,
  text: string | Blob,
  type = "text/plain",
) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    typeof text === "string" ? new Blob([text], { type }) : text,
  );
  link.download = filename;
  try {
    link.click();
  } catch (error) {
    URL.revokeObjectURL(link.href);
    throw error;
  }
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
export function safeURL(url: string) {
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol)
      ? parsed.href
      : undefined;
  } catch {
    return undefined;
  }
}

/** A real textarea that grows without disrupting system dictation or native selection. */
export function GrowingTextarea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(300, Math.max(100, el.scrollHeight)) + "px";
    el.style.overflowY = el.scrollHeight > 300 ? "auto" : "hidden";
  }, [props.value]);
  return (
    <textarea
      {...props}
      ref={ref}
      rows={props.rows ?? 4}
      className={"growing-textarea " + (props.className ?? "")}
    />
  );
}
