"use client";

import { startTransition, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export default function FilterResetButton({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.currentTarget.form?.reset();
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <button type="button" className={className} onClick={handleClick}>
      {children}
    </button>
  );
}
