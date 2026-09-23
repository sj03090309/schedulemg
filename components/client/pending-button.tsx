"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

/** 서버 액션 폼 안에서 쓰는 제출 버튼. 처리 중에는 흐려지고 다시 누를 수 없다. */
export function PendingButton({ className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} transition-opacity ${pending ? "opacity-50" : ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}
