import React from "react";
import {
  resolvePlatform,
  platformGradientSeed,
  monogramGradient,
} from "../lib/linkPlatform";

// Inline white-glyph SVG logos (simplified brand marks) shown on the brand
// color. Bundled locally — no network calls, no secrets. Unknown links fall
// back to the monogram gradient + initial.
const ICONS: Record<string, React.ReactNode> = {
  youtube: (
    <path d="M23 12s0-3.2-.4-4.7a2.5 2.5 0 0 0-1.8-1.8C19.3 5 12 5 12 5s-7.3 0-8.8.5A2.5 2.5 0 0 0 1.4 7.3C1 8.8 1 12 1 12s0 3.2.4 4.7a2.5 2.5 0 0 0 1.8 1.8C4.7 19 12 19 12 19s7.3 0 8.8-.5a2.5 2.5 0 0 0 1.8-1.8C23 15.2 23 12 23 12zM9.8 15.3V8.7l5.7 3.3-5.7 3.3z" fill="#fff" />
  ),
  facebook: (
    <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.5 2.9h-2.4v7A10 10 0 0 0 22 12z" fill="#fff" />
  ),
  zoom: (
    <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h8A1.5 1.5 0 0 1 14 8.5v7A1.5 1.5 0 0 1 12.5 17h-8A1.5 1.5 0 0 1 3 15.5v-7zM15 10l4-2.3c.5-.3 1 .1 1 .6v7.4c0 .5-.5.9-1 .6L15 14v-4z" fill="#fff" />
  ),
  instagram: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="5" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.5" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="17" cy="7" r="1.2" fill="#fff" />
    </>
  ),
  x: (
    <path d="M17.5 4h2.6l-5.7 6.5 6.7 8.9h-5.2l-4.1-5.4-4.7 5.4H4.5l6.1-7L4.2 4h5.3l3.7 4.9L17.5 4zm-.9 13.3h1.4L8.5 5.6H7l9.6 11.7z" fill="#fff" />
  ),
  linkedin: (
    <path d="M6.9 8.5H4V20h2.9V8.5zM5.4 4a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zM20 20h-2.9v-5.6c0-1.3 0-3-1.9-3s-2.1 1.4-2.1 2.9V20H10.2V8.5h2.8v1.6h.1c.4-.8 1.4-1.6 2.8-1.6 3 0 3.6 2 3.6 4.5V20z" fill="#fff" />
  ),
  github: (
    <path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .8.1-.6.3-1.1.6-1.4-2.2-.2-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.2-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.3 9.3 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.5.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2z" fill="#fff" />
  ),
  slack: (
    <path d="M9 3a1.5 1.5 0 0 0 0 3h1.5V4.5A1.5 1.5 0 0 0 9 3zm0 4.5H4.5a1.5 1.5 0 1 0 0 3H9a1.5 1.5 0 0 0 0-3zM21 15a1.5 1.5 0 0 0 0-3h-1.5v1.5A1.5 1.5 0 0 0 21 15zm-4.5 0h1.5v4.5a1.5 1.5 0 1 1-3 0V16.5A1.5 1.5 0 0 1 16.5 15zM15 3a1.5 1.5 0 0 1 1.5 1.5V9a1.5 1.5 0 0 1-3 0V4.5A1.5 1.5 0 0 1 15 3zM3 15a1.5 1.5 0 0 1 1.5-1.5H9a1.5 1.5 0 0 1 0 3H4.5A1.5 1.5 0 0 1 3 15z" fill="#fff" />
  ),
  figma: (
    <path d="M9 3h3v6H9a3 3 0 1 1 0-6zm3 0h3a3 3 0 0 1 0 6h-3V3zm0 6h3a3 3 0 1 1-3 3V9zm-3 0h3v3a3 3 0 1 1-3-3zm0 6h3v3a3 3 0 1 1-3-3z" fill="#fff" />
  ),
  meet: (
    <path d="M13 6H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h9v-4l3 2.5V7.5L13 10V6zM17 8.5l4-2.3v11.6l-4-2.3V8.5z" fill="#fff" />
  ),
  google: (
    <path d="M21 12.2c0-.6-.1-1.2-.2-1.7H12v3.4h5c-.2 1.1-.9 2-1.9 2.7v2.2h3C19.8 17.1 21 14.9 21 12.2zM12 21c2.4 0 4.5-.8 6-2.2l-3-2.2c-.8.6-1.9.9-3 .9-2.3 0-4.3-1.6-5-3.7H3.9v2.3A9 9 0 0 0 12 21zM7 12c0-.6.1-1.2.3-1.8V7.9H3.9a9 9 0 0 0 0 8.1L7 13.8c-.2-.6-.3-1.2-.3-1.8zM12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 3.9 7.9L7 10.2C7.7 8.1 9.7 6.6 12 6.6z" fill="#fff" />
  ),
  whatsapp: (
    <path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3zm0 2a7 7 0 0 1 5.9 10.8l-.3.4.6 2.2-2.3-.6-.4.2A7 7 0 1 1 12 5zm-2.6 3.3c-.2 0-.5.1-.7.4-.2.3-.9.9-.9 2.1s.9 2.5 1 2.6c.1.2 1.7 2.7 4.2 3.7 2 .8 2.4.6 2.9.6.5 0 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.7-.4c-.4-.2-1.1-.6-1.3-.6-.2-.1-.3-.1-.5.1l-.6.8c-.1.1-.3.2-.5.1-.3-.1-1.1-.4-2-1.2-.7-.7-1.2-1.4-1.3-1.7-.1-.2 0-.4.1-.5l.4-.4c.1-.2.2-.3.2-.5s0-.4-.1-.5c0-.1-.5-1.2-.7-1.7-.1-.3-.3-.3-.5-.3h-.3z" fill="#fff" />
  ),
  discord: (
    <path d="M19.5 6.5A15 15 0 0 0 15.6 5l-.2.4a12 12 0 0 1 3.5 1.7 12.5 12.5 0 0 0-10.8 0A12 12 0 0 1 11.6 5.4L11.4 5a15 15 0 0 0-3.9 1.5C4.9 10.3 4.3 14 4.6 17.6A15 15 0 0 0 9 19.8l.3-.5c-.6-.2-1.2-.5-1.7-.9l.4-.3a9 9 0 0 0 7.9 0l.4.3c-.5.4-1.1.7-1.7.9l.3.5a15 15 0 0 0 4.5-2.2c.4-4.2-.6-7.8-2-11.1zM9.8 15.3c-.8 0-1.5-.8-1.5-1.7s.7-1.7 1.5-1.7 1.5.8 1.5 1.7-.7 1.7-1.5 1.7zm4.4 0c-.8 0-1.5-.8-1.5-1.7s.7-1.7 1.5-1.7 1.5.8 1.5 1.7-.7 1.7-1.5 1.7z" fill="#fff" />
  ),
};

// Shared avatar used IDENTICALLY in Settings and Dashboard so the same link
// always renders the same look.
export default function LinkAvatar({
  url,
  title,
  size = 36,
}: {
  url: string;
  title?: string;
  size?: number;
}) {
  const info = resolvePlatform(url, title);
  const hasLogo = !!info.iconKey && !!ICONS[info.iconKey];
  const useGradient = !info.color;
  const background = useGradient
    ? monogramGradient(platformGradientSeed(url, title))
    : info.color;

  return (
    <div
      className="rounded-lg flex items-center justify-center text-white font-bold select-none flex-shrink-0 overflow-hidden"
      style={{ width: size, height: size, background, fontSize: size * 0.42 }}
      title={info.label}
      aria-label={info.label}
    >
      {hasLogo ? (
        <svg
          width={size * 0.6}
          height={size * 0.6}
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          {ICONS[info.iconKey]}
        </svg>
      ) : (
        info.initial
      )}
    </div>
  );
}
