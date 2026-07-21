/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Billing mockup page. Presentational only — no real checkout yet.
 * Matches SettingsPage styling (bg-[#f4f5f7], white rounded-2xl cards).
 */
import { Check, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import { getTrialStatus } from "../lib/trial";

export default function BillingPage() {
  const navigate = useNavigate();
  const { workspaceData } = useAppData();
  const trial = getTrialStatus(workspaceData);
  const currentPlan = String(workspaceData?.plan || "free").toLowerCase();


  const plans = [
    {
      id: "free",
      name: "Free",
      price: "$0",
      period: "forever",
      features: ["Up to 10 members", "Basic projects & tasks", "Community support"],
    },
    {
      id: "pro",
      name: "Pro",
      price: "$12",
      period: "per user / month",
      features: ["Unlimited members", "Advanced insights", "Priority support", "Guest sharing"],
      highlight: true,
    },
    {
      id: "business",
      name: "Business",
      price: "$29",
      period: "per user / month",
      features: ["Everything in Pro", "SSO & admin controls", "Audit logs", "Dedicated manager"],
    },
  ];

    return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#f4f5f7]">
      {/* Standalone top bar — logo + back link only. No app sidebar/navbar,
          so the plan choice reads as a dedicated decision screen (Asana-style). */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png?v=2"
            alt="WorkFine"
            className="h-8 w-8 flex-shrink-0 rounded-lg object-contain"
          />
          <span className="text-xl tracking-tight">
            <span className="font-extrabold text-slate-900">Work</span>
            <span className="font-light text-slate-900">Fine</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </button>
      </div>

      <div className="mx-auto max-w-6xl px-6 pb-10 pt-14">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Billing & Plans</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Choose the plan that fits your team. This is a preview — checkout is coming soon.
          </p>
        </div>


        {trial.ready && !trial.active && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-700">
            {trial.expired
              ? "Your 30-day advanced free trial has ended. Choose a plan to continue."
              : `You're on the advanced free trial — ${trial.daysLeft} ${trial.daysLeft === 1 ? "day" : "days"} left.`}
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            return (
              <div
                key={plan.id}
                className={`rounded-2xl border bg-white p-6 shadow-sm transition-shadow hover:shadow-md ${
                  plan.highlight ? "border-violet-300 ring-1 ring-violet-200" : "border-slate-200"
                }`}
              >
                {plan.highlight && (
                  <span className="mb-3 inline-flex rounded-full bg-violet-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-semibold text-slate-800">{plan.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-slate-900">{plan.price}</span>
                  <span className="text-xs font-medium text-slate-400">{plan.period}</span>
                </div>
                <ul className="mt-5 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <Check size={11} strokeWidth={3} />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={isCurrent}
                  onClick={() => alert("Checkout is coming soon.")}
                  className={`mt-6 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                    isCurrent
                      ? "cursor-default bg-slate-100 text-slate-400"
                      : plan.highlight
                        ? "bg-violet-600 text-white hover:bg-violet-700"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {isCurrent ? "Current plan" : "Choose plan"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
