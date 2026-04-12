"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { registerModernDialogPresenter } from '@/lib/modernDialog';

type DialogKind = 'alert' | 'confirm' | 'prompt';

type DialogRequest = {
  kind: DialogKind;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  placeholder?: string;
  defaultValue?: string;
};

type QueueItem = {
  request: DialogRequest;
  resolve: (value: any) => void;
};

export function ModernDialogHost() {
  const queueRef = useRef<QueueItem[]>([]);
  const [activeItem, setActiveItem] = useState<QueueItem | null>(null);
  const [promptValue, setPromptValue] = useState('');

  const request = activeItem?.request ?? null;

  const startNext = () => {
    if (activeItem) return;
    const next = queueRef.current.shift() ?? null;
    setActiveItem(next);
    if (next?.request.kind === 'prompt') {
      setPromptValue(next.request.defaultValue || '');
    }
  };

  useEffect(() => {
    const unregister = registerModernDialogPresenter((incomingRequest) => {
      return new Promise((resolve) => {
        queueRef.current.push({ request: incomingRequest, resolve });
        setActiveItem((current) => {
          if (current) return current;
          const next = queueRef.current.shift() ?? null;
          if (next?.request.kind === 'prompt') {
            setPromptValue(next.request.defaultValue || '');
          }
          return next;
        });
      });
    });

    return unregister;
  }, []);

  const closeWith = (value: any) => {
    if (!activeItem) return;
    activeItem.resolve(value);
    setActiveItem(null);
    setTimeout(() => startNext(), 0);
  };

  const title = useMemo(() => {
    if (!request) return '';
    if (request.title) return request.title;
    if (request.kind === 'confirm') return 'Please confirm';
    if (request.kind === 'prompt') return 'Input required';
    return 'Notice';
  }, [request]);

  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => { if (!open) closeWith(request?.kind === 'confirm' ? false : null); }}>
      <DialogContent className="w-[92vw] max-w-md rounded-2xl border border-border bg-background p-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{request?.message || ''}</DialogDescription>
        </DialogHeader>

        {request && (
          <div className="bg-linear-to-r from-rose-600/10 via-orange-500/10 to-amber-500/10 p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-rose-100 p-2 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-foreground">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{request.message}</p>
              </div>
            </div>

            {request.kind === 'prompt' && (
              <div className="mt-4">
                <Input
                  autoFocus
                  placeholder={request.placeholder || 'Enter value'}
                  value={promptValue}
                  onChange={(e) => setPromptValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      closeWith(promptValue);
                    }
                  }}
                />
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              {request.kind !== 'alert' && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => closeWith(request.kind === 'confirm' ? false : null)}
                >
                  {request.cancelText || 'Cancel'}
                </Button>
              )}

              <Button
                type="button"
                onClick={() => closeWith(request.kind === 'confirm' ? true : request.kind === 'prompt' ? promptValue : undefined)}
                className={request.kind === 'confirm' && request.destructive
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-linear-to-r from-rose-600 to-pink-600 text-white hover:from-rose-700 hover:to-pink-700'}
              >
                {request.confirmText || (request.kind === 'alert' ? 'OK' : 'Confirm')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
