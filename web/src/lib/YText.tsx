import { useEffect, useRef, type CompositionEvent, type FormEvent, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import type * as Y from "yjs";
import { applyDeltaToPos, diffApply, type DeltaOp } from "@shared/text";

type Common = {
  ytext: Y.Text;
  focusKey?: string;
  multiline?: boolean;
};

export function YTextField({ ytext, focusKey, multiline, ...props }: Common & InputHTMLAttributes<HTMLInputElement> & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const composing = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.value = ytext.toString();
    const onRemote = (event: Y.YTextEvent, transaction: Y.Transaction) => {
      if (transaction.origin === "local" || composing.current) return;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      const next = ytext.toString();
      const delta = event.delta as DeltaOp[];
      el.value = next;
      if (document.activeElement === el) {
        el.setSelectionRange(
          Math.min(applyDeltaToPos(start, delta), next.length),
          Math.min(applyDeltaToPos(end, delta), next.length),
        );
      }
    };
    ytext.observe(onRemote);
    return () => ytext.unobserve(onRemote);
  }, [ytext]);

  const apply = (value: string) => {
    if (!composing.current) diffApply(ytext, value);
  };
  const shared = {
    ref: ref as never,
    "data-focus": focusKey,
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: (event: CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      composing.current = false;
      apply(event.currentTarget.value);
    },
    onInput: (event: FormEvent<HTMLInputElement | HTMLTextAreaElement>) => apply(event.currentTarget.value),
  };
  if (multiline) return <textarea {...(props as TextareaHTMLAttributes<HTMLTextAreaElement>)} {...shared} />;
  return <input {...(props as InputHTMLAttributes<HTMLInputElement>)} {...shared} />;
}
