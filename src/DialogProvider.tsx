import {
  createContext,
  useContext,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

type DialogOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

type InputOptions = DialogOptions & {
  initialValue?: string;
  placeholder?: string;
};

type SelectOptions = DialogOptions & {
  options: Array<{ value: string; label: string }>;
};

type DialogState =
  | (DialogOptions & { kind: "confirm" })
  | (InputOptions & { kind: "input" })
  | (SelectOptions & { kind: "select" });

type DialogApi = {
  confirm: (options: DialogOptions) => Promise<boolean>;
  prompt: (options: InputOptions) => Promise<string | null>;
  select: (options: SelectOptions) => Promise<string | null>;
};

const DialogContext = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [value, setValue] = useState("");
  const resolver = useRef<((value: boolean | string | null) => void) | null>(
    null,
  );

  function open<T extends boolean | string | null>(next: DialogState) {
    resolver.current?.(null);
    setDialog(next);
    setValue(
      next.kind === "input"
        ? next.initialValue || ""
        : next.kind === "select"
          ? next.options[0]?.value || ""
          : "",
    );
    return new Promise<T>((resolve) => {
      resolver.current = resolve as (result: boolean | string | null) => void;
    });
  }

  function finish(result: boolean | string | null) {
    resolver.current?.(result);
    resolver.current = null;
    setDialog(null);
  }

  const api: DialogApi = {
    confirm: (options) => open<boolean>({ ...options, kind: "confirm" }),
    prompt: (options) => open<string | null>({ ...options, kind: "input" }),
    select: (options) => open<string | null>({ ...options, kind: "select" }),
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!dialog) return;
    finish(dialog.kind === "confirm" ? true : value.trim());
  }

  return (
    <DialogContext.Provider value={api}>
      {children}
      {dialog && (
        <div className="app-dialog-backdrop" onClick={() => finish(null)}>
          <form
            className="app-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-dialog-title"
            onSubmit={submit}
            onClick={(event) => event.stopPropagation()}
          >
            <span
              className={dialog.danger ? "dialog-icon danger" : "dialog-icon"}
            >
              {dialog.danger ? "!" : "✓"}
            </span>
            <div>
              <h2 id="app-dialog-title">{dialog.title}</h2>
              <p>{dialog.message}</p>
            </div>
            {dialog.kind === "input" && (
              <input
                autoFocus
                value={value}
                placeholder={dialog.placeholder}
                onChange={(event) => setValue(event.target.value)}
              />
            )}
            {dialog.kind === "select" && (
              <select
                autoFocus
                value={value}
                onChange={(event) => setValue(event.target.value)}
              >
                {dialog.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
            <footer>
              <button
                type="button"
                className="outline"
                onClick={() => finish(null)}
              >
                {dialog.cancelText || "Cancelar"}
              </button>
              <button
                className={dialog.danger ? "danger-action" : "primary"}
                disabled={dialog.kind !== "confirm" && !value.trim()}
              >
                {dialog.confirmText || "Confirmar"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context)
    throw new Error("useDialog precisa estar dentro de DialogProvider");
  return context;
}
