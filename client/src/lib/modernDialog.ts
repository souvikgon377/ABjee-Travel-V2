export type DialogKind = 'alert' | 'confirm' | 'prompt';

type AlertRequest = {
  kind: 'alert';
  title?: string;
  message: string;
};

type ConfirmRequest = {
  kind: 'confirm';
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type PromptRequest = {
  kind: 'prompt';
  title?: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
};

type DialogRequest = AlertRequest | ConfirmRequest | PromptRequest;

type DialogPresenter = <T>(request: DialogRequest) => Promise<T>;

let presenter: DialogPresenter | null = null;

export function registerModernDialogPresenter(nextPresenter: DialogPresenter): () => void {
  presenter = nextPresenter;
  return () => {
    if (presenter === nextPresenter) {
      presenter = null;
    }
  };
}

function toMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
}

export async function modernAlert(message: unknown, title = 'Notice'): Promise<void> {
  const text = toMessage(message);
  if (presenter) {
    await presenter<void>({ kind: 'alert', title, message: text });
    return;
  }

  if (typeof window !== 'undefined') {
    window.alert(text);
  }
}

export async function modernConfirm(
  message: unknown,
  options: Omit<ConfirmRequest, 'kind' | 'message'> = {}
): Promise<boolean> {
  const text = toMessage(message);
  if (presenter) {
    return presenter<boolean>({ kind: 'confirm', message: text, ...options });
  }

  if (typeof window !== 'undefined') {
    return window.confirm(text);
  }

  return false;
}

export async function modernPrompt(
  message: unknown,
  options: Omit<PromptRequest, 'kind' | 'message'> = {}
): Promise<string | null> {
  const text = toMessage(message);
  if (presenter) {
    return presenter<string | null>({ kind: 'prompt', message: text, ...options });
  }

  if (typeof window !== 'undefined') {
    return window.prompt(text, options.defaultValue);
  }

  return null;
}
