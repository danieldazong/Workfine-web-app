import React, { useState, useRef, useCallback } from "react";
import LinkAvatar from "./LinkAvatar";
import { resolvePlatform } from "../lib/linkPlatform";

// Floating, hover-only link preview. Overlays on hover; never shifts layout.
// Pure presentation: no network fetch, no secrets. Wraps the existing <a>.
export default function LinkPreviewCard({
  href,
  label,
  isMine,
  children,
}: {
  href: string;
  label: string;
  isMine: boolean;
  children: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const hideTimer = useRef<number | null>(null);

  const open = useCallback(() => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setShow(true);
  }, []);

  const close = useCallback(() => {
    hideTimer.current = window.setTimeout(() => setShow(false), 120);
  }, []);

  let host = "";
  try {
    host = new URL(href).hostname.replace(/^www\./, "");
  } catch {
    host = href;
  }

  const info = resolvePlatform(href, label);

  return (
    <span
      className="relative inline-block"
      onMouseEnter={open}
      onMouseLeave={close}
    >
      {children}

      {show && (
        <span
          onMouseEnter={open}
          onMouseLeave={close}
                    className="absolute bottom-full right-0 mb-2 z-[85] block w-64 max-w-[min(260px,calc(100vw-32px))] cursor-default rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-2xl"
          role="tooltip"
        >
          <span className="flex items-center gap-2.5">
            <LinkAvatar url={href} title={label} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-800">
                {label || info.label}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                {host}
              </span>
            </span>
          </span>

          <span className="mt-2 block truncate text-[11px] font-medium text-violet-600">
            {info.label}
          </span>
        </span>
      )}
    </span>
  );
}
