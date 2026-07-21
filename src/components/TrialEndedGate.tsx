/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Full-screen "trial ended" gate. Renders NOTHING unless TRIAL_GATE_ENABLED is
 * true AND the current account's trial is expired (per-account). Ships OFF by
 * default so it locks out nobody until real billing is wired.
 *
 * NOTE: This is a UX nudge only — NOT security. Durable enforcement belongs in
 * firestore.rules. Do not treat this as an access-control boundary.
 */
import { useNavigate } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import { getTrialStatus, TRIAL_GATE_ENABLED } from "../lib/trial";

export default function TrialEndedGate() {
  const { workspaceData } = useAppData();
  const navigate = useNavigate();

  if (!TRIAL_GATE_ENABLED) return null;

  const trial = getTrialStatus(workspaceData);
  if (!trial.ready || !trial.expired) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
          <span className="text-2xl">⏳</span>
        </div>
        <h2 className="text-lg font-bold text-slate-900">
          Your 30-day advanced free trial has ended
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Choose a plan to keep using your workspace. Your data is safe and will
          be available as soon as you pick a plan.
        </p>
        <button
          type="button"
          onClick={() => navigate("/billing")}
          className="mt-6 w-full rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
        >
          Choose a plan
        </button>
      </div>
    </div>
  );
}
