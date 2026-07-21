/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";
import { useAppData } from "../context/AppDataContext";
import { getTrialStatus } from "../lib/trial";


const TRIAL_LENGTH_DAYS = 30;

/**
 * Reads the workspace creation timestamp and derives the 30-day trial window.
 * Pure/derived — no Firestore writes, no billing, no secrets. Presentational.
 */
function resolveWorkspaceCreatedMs(workspaceData: any): number {
  const createdAt = workspaceData?.createdAt;
  if (!createdAt) return 0;
  if (typeof createdAt?.toMillis === "function") return createdAt.toMillis();
  if (typeof createdAt?.seconds === "number") return createdAt.seconds * 1000;
  const parsed = new Date(createdAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function TrialStatusCard({
  isCollapsed = false,
}: {
  isCollapsed?: boolean;
}) {
    const { workspaceData } = useAppData();
  const navigate = useNavigate();

  const { daysLeft, expired, ready } = useMemo(() => {
    const createdMs = resolveWorkspaceCreatedMs(workspaceData);

    // Until the workspace timestamp resolves, render nothing (avoids a flash
    // of "0 days left" on first paint).
    if (!createdMs) {
      return { daysLeft: 0, expired: false, ready: false };
    }

    const endMs = createdMs + TRIAL_LENGTH_DAYS * 24 * 60 * 60 * 1000;
    const remainingMs = endMs - Date.now();
    const days = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));

    return { daysLeft: days, expired: remainingMs <= 0, ready: true };
  }, [workspaceData]);

  if (!ready) return null;

    const handleClick = () => {
    navigate("/billing");
  };


  // Collapsed rail: show a compact ring only, to match the sidebar's icon-rail.
  if (isCollapsed) {
    return (
            <button
        type="button"
        onClick={handleClick}
        title={expired ? "Trial ended" : `Advanced trial — ${daysLeft} days left`}
        aria-label={expired ? "Trial ended" : `Advanced trial — ${daysLeft} days left`}
        className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-800/40 transition-colors hover:bg-white/10"
      >
        <TrialRing daysLeft={daysLeft} expired={expired} size={22} stroke={3} />
      </button>

    );
  }

  return (
    <div className="relative mb-3 rounded-xl border border-slate-700/70 bg-slate-800/40 p-3">
      <div className="flex items-center gap-2.5">
                <TrialRing daysLeft={daysLeft} expired={expired} size={22} stroke={3} />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-xs font-semibold",
              expired ? "text-rose-300" : "text-slate-200"
            )}
          >
            {expired ? "Your trial has ended" : "Advanced free trial"}
          </p>
          {!expired && (
            <p className="truncate text-[11px] font-medium text-slate-400">
              {daysLeft} {daysLeft === 1 ? "day" : "days"} left
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={handleClick}
        className="mt-2.5 w-full rounded-lg bg-amber-300/90 px-3 py-1.5 text-xs font-semibold text-slate-900 transition-colors hover:bg-amber-300"
      >
        {expired ? "Restore plan" : "Upgrade"}
      </button>

    
    </div>
  );
}
/**
 * Progress ring that empties as the trial counts down.
 * Full at 30 days, empty at 0. Pure SVG, presentational only.
 */
function TrialRing({
  daysLeft,
  expired,
  size = 22,
  stroke = 3,
}: {
  daysLeft: number;
  expired: boolean;
  size?: number;
  stroke?: number;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // Fraction of the trial remaining (0..1).
  const fraction = expired
    ? 0
    : Math.max(0, Math.min(1, daysLeft / TRIAL_LENGTH_DAYS));

  const dashOffset = circumference * (1 - fraction);
  const color = expired ? "#fb7185" : "#34d399"; // rose-400 / emerald-400

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="flex-shrink-0 -rotate-90"
    >
      {/* track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#475569"
        strokeWidth={stroke}
      />
      {/* progress */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        style={{ transition: "stroke-dashoffset 0.4s ease" }}
      />
    </svg>
  );
}
