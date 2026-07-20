/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { Link, useNavigate } from "react-router-dom";
import {
  CheckSquare,
  Clock,
  Users,
  LayoutDashboard,
  Link2,
  FolderKanban,
  ArrowRight,
  Check,
  Sparkles,
  Calendar,
  BarChart3,
  MessageSquare,
  UsersRound,
  Settings,
  Plus,
  Star,
  Play,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function LandingPage() {
  const revealRef = useScrollReveal();

  // >>> DO NOT MODIFY: non-blocking redirect guard (fixes blank-page issue) <<<
  const { user } = useAuth();
  const navigate = useNavigate();


  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

            const [scrolled, setScrolled] = useState(false);

  // Lenis smooth (momentum) scroll — scoped to this page only.
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      ScrollTrigger.update();
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    // Keep sticky-nav border logic working with Lenis's scroll.
    lenis.on("scroll", ({ scroll }: { scroll: number }) => {
      setScrolled(scroll > 8);
    });

    // Smooth-scroll in-page anchor links via Lenis.
    const onAnchorClick = (e: Event) => {
      const target = e.currentTarget as HTMLAnchorElement;
      const hash = target.getAttribute("href");
      if (hash && hash.startsWith("#") && hash.length > 1) {
        const el = document.querySelector(hash);
        if (el) {
          e.preventDefault();
          lenis.scrollTo(el as HTMLElement, { offset: -80 });
        }
      }
    };
    const anchors = Array.from(
      document.querySelectorAll('a[href^="#"]')
    ) as HTMLAnchorElement[];
    anchors.forEach((a) => a.addEventListener("click", onAnchorClick));

    const refreshT = setTimeout(() => ScrollTrigger.refresh(), 400);

    return () => {
      clearTimeout(refreshT);
      cancelAnimationFrame(rafId);
      anchors.forEach((a) => a.removeEventListener("click", onAnchorClick));
      lenis.destroy();
    };
  }, []);


  // <<< END non-blocking redirect guard >>>

  const features: { icon: typeof FolderKanban; title: string; body: string; tone: string; hero?: boolean; visual?: string; full?: boolean; caption?: string; }[] = [
  {
    icon: FolderKanban,
    title: "Four ways to see your work",
    body: "Board, calendar, timeline, and list views — switch however your team thinks best.",
    tone: "bg-violet-50 text-violet-600",
    hero: true,
    visual: "board",
  },
  {
    icon: LayoutDashboard,
    title: "Insight at a glance",
    body: "A clean dashboard surfaces what's overdue, active, and completed this week.",
    tone: "bg-blue-50 text-blue-600",
  },
  {
    icon: CheckSquare,
    title: "My Tasks, focused",
    body: "Every task assigned to or shared with you, gathered into one focused view.",
    tone: "bg-emerald-50 text-emerald-600",
  },
  {
    icon: BarChart3,
    title: "Progress you can measure",
    body: "Visual insights show how much your team is shipping, week over week.",
    tone: "bg-amber-50 text-amber-600",
  },
  {
    icon: Users,
    title: "Roles that keep order",
    body: "Owners, members, and viewers — everyone gets exactly the access they need.",
    tone: "bg-indigo-50 text-indigo-600",
    hero: true,
    visual: "roles",
    full: true,
    caption: "Granular permissions, zero confusion — no surprises about who can do what.",
  },
  {
    icon: Link2,
    title: "Your links, one click away",
    body: "Pin the tools you use every day right on your dashboard for instant access.",
    tone: "bg-rose-50 text-rose-600",
  },
];




  const benefits = [
    "Free to get started — no credit card",
    "Set up your workspace in minutes",
    "Real-time sync across your whole team",
  ];
    // Rotating hero word — each verb answers a real pain point, with its own color.
  const rotatingWords = [
    { text: "Plan",  dot: "bg-violet-500", pill: "bg-violet-100", label: "text-violet-900" },
    { text: "Track", dot: "bg-blue-500",   pill: "bg-blue-100",   label: "text-blue-900" },
    { text: "Ship",  dot: "bg-green-500",  pill: "bg-green-100",  label: "text-green-900" },
    { text: "Align", dot: "bg-amber-500",  pill: "bg-amber-100",  label: "text-amber-900" },
    { text: "Focus", dot: "bg-rose-500",   pill: "bg-rose-100",   label: "text-rose-900" },
  ];

  const [wordIndex, setWordIndex] = useState(0);
  useEffect(() => {
        const id = setInterval(() => {
      setWordIndex((i) => (i + 1) % rotatingWords.length);
    }, 6000);
    return () => clearInterval(id);
  }, []);
  const word = rotatingWords[wordIndex];
    // Click-and-drag panning WITH momentum/inertia for the "Recommended by" row.
  const dragRow = useRef<HTMLDivElement | null>(null);
  const drag = useRef({
    down: false,
    startX: 0,
    startScroll: 0,
    lastX: 0,
    lastT: 0,
    velocity: 0,
    raf: 0,
  });

  const onDragStart = (e: React.MouseEvent) => {
    const el = dragRow.current;
    if (!el) return;
    cancelAnimationFrame(drag.current.raf);
    drag.current.down = true;
    drag.current.startX = e.pageX;
    drag.current.startScroll = el.scrollLeft;
    drag.current.lastX = e.pageX;
    drag.current.lastT = performance.now();
    drag.current.velocity = 0;
  };

  const onDragMove = (e: React.MouseEvent) => {
    const el = dragRow.current;
    if (!el || !drag.current.down) return;
    e.preventDefault();
    el.scrollLeft = drag.current.startScroll - (e.pageX - drag.current.startX);
    const now = performance.now();
    const dt = now - drag.current.lastT;
    if (dt > 0) {
      drag.current.velocity = (drag.current.lastX - e.pageX) / dt;
    }
    drag.current.lastX = e.pageX;
    drag.current.lastT = now;
  };

  const onDragEnd = () => {
    const el = dragRow.current;
    if (!el || !drag.current.down) return;
    drag.current.down = false;
    let v = drag.current.velocity * 16;
    const glide = () => {
      if (Math.abs(v) < 0.4) return;
      el.scrollLeft += v;
      v *= 0.94;
      drag.current.raf = requestAnimationFrame(glide);
    };
    drag.current.raf = requestAnimationFrame(glide);
  };
    // ── Hero mockup 3D tilt (parallax perspective) ──────────────
  const tiltRef = useRef<HTMLDivElement | null>(null);
  const tiltSetters = useRef<{
    rx: (v: number) => void;
    ry: (v: number) => void;
    s: (v: number) => void;
  } | null>(null);

  useEffect(() => {
    const el = tiltRef.current;
    if (!el) return;
        gsap.set(el, { transformPerspective: 1000, transformOrigin: "center" });
    tiltSetters.current = {
      rx: gsap.quickTo(el, "rotationX", { duration: 0.6, ease: "power3.out" }),
      ry: gsap.quickTo(el, "rotationY", { duration: 0.6, ease: "power3.out" }),
      s: gsap.quickTo(el, "scale", { duration: 0.6, ease: "power3.out" }),
    };
  }, []);

  const MAX_TILT = 7;

  const onTiltMove = (e: React.MouseEvent) => {
    const el = tiltRef.current;
    const setters = tiltSetters.current;
    if (!el || !setters) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    setters.ry((px - 0.5) * 2 * MAX_TILT);
    setters.rx((0.5 - py) * 2 * MAX_TILT);
    setters.s(1.02);
  };

  const onTiltLeave = () => {
    const setters = tiltSetters.current;
    if (!setters) return;
    setters.rx(0);
    setters.ry(0);
    setters.s(1);
  };

    // Feature pills double as interactive tabs that drive the dashboard mockup.
  // Each pill maps to which sidebar item highlights + what the board top-bar
  // label reads. "Board/List/Calendar/Timeline" are project views → they all
  // highlight the "Dashboard" sidebar item (as in the real app). "My Tasks"
  // and "Insights" highlight their own matching sidebar items.
            const featurePills = [
    { id: "Dashboard", sidebar: "Dashboard", viewLabel: "Dashboard view" },
    { id: "Insights",  sidebar: "Insights",  viewLabel: "Insights view" },
    { id: "Calendar",  sidebar: "Calendar",  viewLabel: "Calendar view" },
    { id: "Timeline",  sidebar: "Dashboard", viewLabel: "Timeline view" },
    { id: "My Tasks",  sidebar: "My Tasks",  viewLabel: "My Tasks view" },
  ];




  const [activeView, setActiveView] = useState(featurePills[0]);


    // Avatar cloud — real licensed portraits in public/avatars.
  // Each entry pairs an image src with a gradient fallback (used if the
  // image ever fails to load, so the row never breaks).
  const avatars = [
    { src: "/avatars/a1.jpg", fallback: "from-violet-400 to-indigo-500" },
    { src: "/avatars/a2.jpg", fallback: "from-emerald-400 to-teal-500" },
    { src: "/avatars/a3.jpg", fallback: "from-pink-400 to-rose-500" },
    { src: "/avatars/a4.jpg", fallback: "from-amber-400 to-orange-500" },
    { src: "/avatars/a5.jpg", fallback: "from-sky-400 to-blue-500" },
    { src: "/avatars/a6.jpg", fallback: "from-fuchsia-400 to-purple-500" },
  ];

    // ── Mockup content per active view ──────────────────────────────
  // Dashboard keeps the original kanban board. Calendar / My Tasks /
  // Insights each render their own polished interior. Timeline falls
  // back to the board (no distinct sidebar item to represent it).
  const renderMockupView = () => {
    switch (activeView.id) {
      // ── Calendar view ───────────────────────────────────────────
      case "Calendar":
        return (
          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-bold text-slate-700">March 2026</p>
              <div className="flex gap-1">
                <span className="h-5 w-5 rounded-md bg-slate-100" />
                <span className="h-5 w-5 rounded-md bg-slate-100" />
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[8px] font-semibold uppercase tracking-wide text-slate-400">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div key={i} className="pb-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => {
                const day = i - 2; // start offset
                const isValid = day >= 1 && day <= 31;
                const events: Record<number, { tone: string; label: string }> = {
                  4: { tone: "bg-violet-100 text-violet-700", label: "Kickoff" },
                  9: { tone: "bg-amber-100 text-amber-700", label: "Docs" },
                  15: { tone: "bg-rose-100 text-rose-700", label: "Launch" },
                  22: { tone: "bg-green-100 text-green-700", label: "Review" },
                };
                const ev = events[day];
                return (
                  <div
                    key={i}
                    className={`flex h-11 flex-col rounded-md border p-1 ${
                      isValid ? "border-slate-100 bg-white" : "border-transparent bg-transparent"
                    }`}
                  >
                    {isValid && (
                      <>
                        <span className="text-[8px] font-semibold text-slate-400">{day}</span>
                        {ev && (
                          <span className={`mt-auto truncate rounded px-1 py-0.5 text-[7px] font-semibold ${ev.tone}`}>
                            {ev.label}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );

      // ── My Tasks view ───────────────────────────────────────────
      case "My Tasks": {
        const rows = [
          { title: "Fix login bug", tag: "High", tone: "bg-red-50 text-red-600", due: "Today", grad: "from-violet-400 to-indigo-500", done: false },
          { title: "Ship landing page", tag: "In progress", tone: "bg-violet-50 text-violet-600", due: "in 2h", grad: "from-emerald-400 to-teal-500", done: false },
          { title: "Write docs", tag: "Medium", tone: "bg-amber-50 text-amber-600", due: "Fri", grad: "from-pink-400 to-rose-500", done: false },
          { title: "Design review", tag: "Done", tone: "bg-green-50 text-green-600", due: "Mon", grad: "from-amber-400 to-orange-500", done: true },
          { title: "Kickoff call", tag: "Done", tone: "bg-green-50 text-green-600", due: "Mon", grad: "from-sky-400 to-blue-500", done: true },
        ];
        return (
          <div className="p-4">
            <div className="space-y-2">
              {rows.map((r) => (
                <div
                  key={r.title}
                  className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5 shadow-sm"
                >
                  <span
                    className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-md border ${
                      r.done ? "border-green-500 bg-green-500 text-white" : "border-slate-300"
                    }`}
                  >
                    {r.done && <Check size={10} strokeWidth={3} />}
                  </span>
                  <p className={`flex-1 truncate text-[12px] font-medium ${r.done ? "text-slate-400 line-through" : "text-slate-700"}`}>
                    {r.title}
                  </p>
                  <span className={`hidden rounded px-2 py-0.5 text-[9px] font-semibold sm:inline-flex ${r.tone}`}>{r.tag}</span>
                  <span className="w-10 text-right text-[9px] font-medium text-slate-400">{r.due}</span>
                  <div className={`h-5 w-5 flex-shrink-0 rounded-full bg-gradient-to-br ${r.grad}`} />
                </div>
              ))}
            </div>
          </div>
        );
      }

      // ── Insights view ───────────────────────────────────────────
      case "Insights": {
        const bars = [
          { day: "Mon", h: "40%" },
          { day: "Tue", h: "65%" },
          { day: "Wed", h: "50%" },
          { day: "Thu", h: "85%" },
          { day: "Fri", h: "70%" },
        ];
        return (
          <div className="p-4">
            {/* stat cards */}
            <div className="mb-4 grid grid-cols-3 gap-2.5">
              {[
                { v: "12", l: "Completed", tone: "text-green-600" },
                { v: "8", l: "Active", tone: "text-violet-600" },
                { v: "1", l: "Overdue", tone: "text-red-600" },
              ].map((s) => (
                <div key={s.l} className="rounded-lg border border-slate-100 bg-white p-2.5 shadow-sm">
                  <p className={`text-lg font-extrabold ${s.tone}`}>{s.v}</p>
                  <p className="text-[9px] font-medium text-slate-400">{s.l}</p>
                </div>
              ))}
            </div>
            {/* bar chart */}
            <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
              <p className="mb-3 text-[10px] font-bold text-slate-600">Tasks completed this week</p>
              <div className="flex h-28 items-end justify-between gap-2">
                {bars.map((b) => (
                  <div key={b.day} className="flex flex-1 flex-col items-center gap-1.5">
                    <div className="flex h-full w-full items-end">
                      <div
                        className="w-full rounded-t-md bg-gradient-to-t from-violet-500 to-indigo-400"
                        style={{ height: b.h }}
                      />
                    </div>
                    <span className="text-[8px] font-medium text-slate-400">{b.day}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }

      // ── Dashboard (+ Timeline fallback): original kanban board ───
      default:
  return (
    <div className="grid grid-cols-3 gap-4 p-6">
            {/* To Do */}
            <div className="rounded-xl bg-slate-50 p-2.5">
              <div className="mb-2.5 flex items-center gap-1.5 px-1">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">To do</span>
              </div>
              <div className="mb-2.5 rounded-lg border border-slate-100 bg-white p-2.5 shadow-sm">
                <div className="mb-2 inline-flex rounded bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">High</div>
                <p className="text-[12px] font-medium leading-snug text-slate-700">Fix login bug</p>
                <div className="mt-2.5 h-5 w-5 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500" />
              </div>
              <div className="rounded-lg border border-slate-100 bg-white p-2.5 shadow-sm">
                <div className="mb-2 inline-flex rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">Medium</div>
                <p className="text-[12px] font-medium leading-snug text-slate-700">Write docs</p>
                <div className="mt-2.5 h-5 w-5 rounded-full bg-gradient-to-br from-pink-400 to-rose-500" />
              </div>
            </div>

            {/* Doing */}
            <div className="rounded-xl bg-slate-50 p-2.5">
              <div className="mb-2.5 flex items-center gap-1.5 px-1">
                <span className="h-2 w-2 rounded-full bg-violet-500" />
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Doing</span>
              </div>
              <div className="rounded-lg border border-violet-100 bg-white p-2.5 shadow-sm ring-1 ring-violet-100">
                <div className="mb-2 inline-flex rounded bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-600">In progress</div>
                <p className="text-[12px] font-medium leading-snug text-slate-700">Ship landing page</p>
                <div className="mt-2.5 flex -space-x-1.5">
                  <div className="h-5 w-5 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 ring-2 ring-white" />
                  <div className="h-5 w-5 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 ring-2 ring-white" />
                </div>
              </div>
            </div>

            {/* Done */}
            <div className="rounded-xl bg-slate-50 p-2.5">
              <div className="mb-2.5 flex items-center gap-1.5 px-1">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Done</span>
              </div>
              <div className="mb-2.5 rounded-lg border border-slate-100 bg-white p-2.5 opacity-80 shadow-sm">
                <div className="mb-2 inline-flex rounded bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-600">Done</div>
                <p className="text-[12px] font-medium leading-snug text-slate-500 line-through">Design review</p>
                <div className="mt-2.5 h-5 w-5 rounded-full bg-gradient-to-br from-amber-400 to-orange-500" />
              </div>
              <div className="rounded-lg border border-slate-100 bg-white p-2.5 opacity-80 shadow-sm">
                <div className="mb-2 inline-flex rounded bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-600">Done</div>
                <p className="text-[12px] font-medium leading-snug text-slate-500 line-through">Kickoff call</p>
                <div className="mt-2.5 h-5 w-5 rounded-full bg-gradient-to-br from-sky-400 to-blue-500" />
              </div>
            </div>
          </div>
        );
    }
  };



   return (
           <div ref={revealRef} className="min-h-screen w-full bg-white text-slate-900 antialiased">
      {/* ── Scoped animation styles (no index.css touch, no new dependency) ── */}
      <style>{`
        @keyframes wfFadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes wfFloat {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-8px); }
        }
        .wf-fade-up { opacity: 0; animation: wfFadeUp 0.7s ease-out forwards; }
        .wf-delay-1 { animation-delay: 0.08s; }
        .wf-delay-2 { animation-delay: 0.16s; }
        .wf-delay-3 { animation-delay: 0.24s; }
        .wf-delay-4 { animation-delay: 0.32s; }
        .wf-float   { animation: wfFloat 4s ease-in-out infinite; }
        .wf-float-slow { animation: wfFloat 5.5s ease-in-out infinite; }
                @keyframes wfWordIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .wf-word { animation: wfWordIn 0.45s ease-out; }
                                        @keyframes wfBorderSpin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(360deg); }
        }
        .wf-gradient-badge {
          position: relative;
          display: inline-flex;
          border-radius: 9999px;
                    padding: 1px;
          overflow: hidden;
          z-index: 0;
        }
        .wf-gradient-badge::before {
          content: "";
          position: absolute;
          z-index: -1;
          left: 50%;
          top: 50%;
          width: 300%;
          aspect-ratio: 1;
          transform-origin: center;
                              background: conic-gradient(
            from 0deg,
            #e2e8f0 0%,
            #e2e8f0 55%,
            #8b5cf6 68%,
            #ec4899 78%,
            #f59e0b 86%,
            #10b981 94%,
            #e2e8f0 100%
          );

          animation: wfBorderSpin 8s linear infinite;
        }
                  .wf-drag-row::-webkit-scrollbar { display: none; }
        @media (prefers-reduced-motion: reduce) {
          .wf-fade-up, .wf-float, .wf-float-slow, .wf-word { animation: none; opacity: 1; }
          .wf-gradient-badge::before { animation: none; }
        }
      `}</style>

            {/* ── Top nav ─────────────────────────────────────────────── */}
<header
  className={`sticky top-0 z-40 transition-all duration-300 ${
    scrolled ? "px-4 pt-3" : "px-0 py-4"
  }`}
>
  <div
    className={`mx-auto flex h-16 items-center px-6 transition-all duration-300 ${
      scrolled
        ? "max-w-5xl rounded-full border border-white/40 bg-white/50 shadow-lg shadow-slate-900/10 backdrop-blur-xl backdrop-saturate-150"
        : "max-w-7xl border border-transparent bg-transparent"
    }`}
  >
    {/* Left: logo */}
    <Link to="/" className="flex flex-shrink-0 items-center gap-2">
      <img src="/logo.png?v=2" alt="WorkFine" className="h-8 w-8 rounded-lg object-contain" />
      <span className="text-xl tracking-tight">
        <span className="font-extrabold">Work</span>
        <span className="font-light">Fine</span>
      </span>
    </Link>

    {/* Center: nav */}
    <nav className="hidden flex-1 items-center justify-center gap-1 text-sm font-medium text-slate-600 md:flex">
      <a href="#features" className="rounded-lg px-3 py-2 transition-colors hover:bg-slate-50 hover:text-slate-900">Features</a>
      <a href="#how" className="rounded-lg px-3 py-2 transition-colors hover:bg-slate-50 hover:text-slate-900">How it works</a>
      <a href="#features" className="rounded-lg px-3 py-2 transition-colors hover:bg-slate-50 hover:text-slate-900">Solutions</a>
      <a href="#" className="rounded-lg px-3 py-2 transition-colors hover:bg-slate-50 hover:text-slate-900">Pricing</a>
      <a href="#" className="rounded-lg px-3 py-2 transition-colors hover:bg-slate-50 hover:text-slate-900">Resources</a>
    </nav>

    {/* Right: actions */}
    <div className="flex flex-shrink-0 items-center gap-3">
      <Link to="/login" className="hidden text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 sm:block">
        Log in
      </Link>
      <Link to="/login" className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700">
        Get started free
      </Link>
    </div>
  </div>
</header>



      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-[760px] max-w-6xl bg-gradient-to-b from-violet-100/70 via-indigo-50/40 to-transparent blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -left-10 top-52 -z-10 h-44 w-44 rounded-full bg-violet-300/30 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute right-0 top-32 -z-10 h-52 w-52 rounded-full bg-indigo-300/30 blur-3xl" />

                             <div className="mx-auto grid max-w-7xl items-center gap-x-16 gap-y-12 px-6 pt-16 lg:grid-cols-[1fr_1.25fr] md:pt-24 lg:gap-x-20">
          {/* Left column: copy */}
          <div className="text-center lg:text-left">
                        {/* avatar cloud (Notion-style trust signal) — real licensed portraits */}
                        <div className="wf-fade-up mb-8 flex items-center justify-center gap-3 lg:justify-start">
              <div className="flex -space-x-2">
                {avatars.map((a, i) => (
                  <div
                    key={i}
                    className={`h-8 w-8 overflow-hidden rounded-full bg-gradient-to-br ${a.fallback} ring-2 ring-white`}
                  >
                    <img
                      src={a.src}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        // Graceful fallback: hide the broken img, gradient shows through.
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                ))}
              </div>
              <span className="ml-1 text-xs font-medium text-slate-500">Loved by growing teams</span>
            </div>


                                   <span className="wf-fade-up wf-delay-1 wf-gradient-badge inline-flex">
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-violet-700">
                <Sparkles size={13} />
                Work, finely organized
              </span>
            </span>



                                    <h1 className="wf-fade-up wf-delay-1 mt-6 text-5xl font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
              <span className="block">Where teams</span>
              <span className="block">
                that{" "}
                                <span className="inline-flex min-w-[10rem] justify-start align-middle">
                  <span
                    key={word.text}
                    className={`wf-word relative inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium leading-none ${word.pill} ${word.label}`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${word.dot}`} />
                    {word.text}
                  </span>
                </span>
              </span>
              <span className="block">together.</span>
            </h1>


                        <p className="wf-fade-up wf-delay-2 mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-500 lg:mx-0">
              WorkFine keeps your projects, deadlines, and people in sync — so your
              team always knows what's next and nothing falls through the cracks.
            </p>

            {/* benefit bullets (ClickUp-style) */}
                       <ul className="wf-fade-up wf-delay-2 mx-auto mt-6 max-w-md space-y-2.5 text-left lg:mx-0">
                 {benefits.map((b) => (
                <li key={b} className="flex items-center gap-2.5 text-sm font-medium text-slate-600">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                    <Check size={12} strokeWidth={3} />
                  </span>
                  {b}
                </li>
              ))}
            </ul>


            <div className="wf-fade-up wf-delay-3 mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <Link to="/login" className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition-all hover:bg-violet-700 hover:shadow-violet-600/30">
                Get started free
                <ArrowRight size={16} />
              </Link>
              <a href="#features" className="rounded-full border border-slate-200 bg-white px-8 py-3.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                See what's inside
              </a>
            </div>

                        {/* feature-pill row — interactive tabs that drive the mockup */}
            <div className="wf-fade-up wf-delay-4 mt-8 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              {featurePills.map((p) => {
                const isActive = activeView.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActiveView(p)}
                    aria-pressed={isActive}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all ${
                      isActive
                        ? "border-violet-600 bg-violet-600 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                    }`}
                  >
                    {p.id}
                  </button>
                );
              })}
            </div>

          </div>

          {/* Right column: enlarged, realistic WorkFine dashboard mockup */}
                                        <div
            ref={tiltRef}
            onMouseMove={onTiltMove}
            onMouseLeave={onTiltLeave}
            className="wf-fade-up wf-delay-3 relative will-change-transform"
            style={{ perspective: "1200px", transformStyle: "preserve-3d" }}
          >


                        {/* richer floating annotation chips (Monday-style) */}
            {/* ✓ Task completed → top-right */}
            <div className="wf-float absolute -right-4 -top-4 z-20 hidden rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-lg lg:block">
              <p className="text-xs font-semibold text-green-700">✓ Task completed</p>
              <p className="text-[10px] text-slate-400">Design review · just now</p>
            </div>
            {/* ⏱ Due in 2h → bottom-left */}
            <div className="wf-float-slow absolute -bottom-4 -left-4 z-20 hidden rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-lg lg:block">
              <p className="text-xs font-semibold text-amber-700">⏱ Due in 2h</p>
              <p className="text-[10px] text-slate-400">Ship landing page</p>
            </div>
            {/* 👥 3 members online → lower-right, clear of task rows */}
            <div className="wf-float absolute -right-3 bottom-1/4 z-20 hidden rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-lg xl:block" style={{ animationDelay: "1.2s" }}>
              <p className="text-xs font-semibold text-violet-700">👥 3 members online</p>
            </div>


            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15">
              {/* window chrome */}
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                <span className="h-3 w-3 rounded-full bg-red-400" />
                <span className="h-3 w-3 rounded-full bg-amber-400" />
                <span className="h-3 w-3 rounded-full bg-green-400" />
                                <span className="ml-4 text-xs font-medium text-slate-400">WorkFine — {activeView.id}</span>
              </div>

              {/* app body: real WorkFine layout — dark sidebar + main */}
              <div className="flex h-[420px]">
                {/* dark navy sidebar (mirrors real app) */}
                <div className="hidden w-44 flex-shrink-0 flex-col bg-slate-900 p-3 sm:flex">
                  {/* logo */}
                  <div className="mb-4 flex items-center gap-2 px-1">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 text-[11px] font-black text-white">W</div>
                    <span className="text-sm font-bold text-white">
                      Work<span className="font-light">Fine</span>
                    </span>
                  </div>

                  <p className="mb-1.5 px-2 text-[9px] font-semibold uppercase tracking-widest text-slate-500">Workspace</p>
                                    {[
                    { icon: LayoutDashboard, label: "Dashboard" },
                    { icon: BarChart3, label: "Insights" },
                    { icon: Calendar, label: "Calendar" },
                    { icon: CheckSquare, label: "My Tasks" },
                    { icon: MessageSquare, label: "Conversations" },
                    { icon: UsersRound, label: "Team" },
                    { icon: Settings, label: "Settings" },
                  ].map((it) => {
                    const active = activeView.sidebar === it.label;
                    return (
                      <div
                        key={it.label}
                        className={`mb-0.5 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
                          active ? "bg-violet-600/25 text-violet-200" : "text-slate-400"
                        }`}
                      >
                        <it.icon size={13} />
                        {it.label}
                      </div>
                    );
                  })}


                  <div className="mb-1.5 mt-4 flex items-center justify-between px-2">
                    <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">My Projects</span>
                    <Plus size={11} className="text-slate-500" />
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1 text-[11px] text-slate-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-400" /> Marketing Site
                  </div>

                  {/* user card pinned bottom */}
                  <div className="mt-auto flex items-center gap-2 rounded-lg bg-slate-800/60 p-2">
                    <div className="h-7 w-7 flex-shrink-0 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500" />
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-semibold text-white">Alex Morgan</p>
                      <p className="truncate text-[9px] text-slate-400">alex@workfine.app</p>
                    </div>
                  </div>
                </div>

                {/* main content — kanban board */}
                <div className="flex-1 overflow-hidden bg-white">
                  {/* top bar */}
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                                      <div>
                      <p className="text-sm font-bold text-slate-800">Marketing Site</p>
                      <p className="text-[10px] text-slate-400">{activeView.viewLabel}</p>
                    </div>
                    <div className="rounded-full bg-violet-600 px-3 py-1.5 text-[10px] font-semibold text-white">+ New task</div>
                  </div>

                                    {/* dynamic content — changes with the active view */}
                  <div key={activeView.id} className="wf-fade-up flex-1 overflow-hidden">
                    {renderMockupView()}
                  </div>

                </div>
              </div>
                                               </div>
          </div>
        </div>

              </section>


      {/* ── Social proof strip ──────────────────────────────────── */}
            <section className="border-b border-slate-100 bg-white pt-24 pb-14">
        <div className="mx-auto max-w-6xl px-6">
                                            <p className="mb-8 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Why teams choose WorkFine
          </p>

          <div className="grid divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              { icon: Sparkles, title: "Effortlessly simple", body: "Clean by design. No manual, no learning curve — your team is productive on day one.", tone: "bg-violet-50 text-violet-600 group-hover:bg-violet-100" },
              { icon: Users, title: "Built for teams", body: "Share tasks with the right people and stay in sync in real time, automatically.", tone: "bg-blue-50 text-blue-600 group-hover:bg-blue-100" },
              { icon: Clock, title: "Never miss a deadline", body: "Live countdowns and gentle alerts keep every due date front and center.", tone: "bg-amber-50 text-amber-600 group-hover:bg-amber-100" },
            ].map((item) => (
              <div key={item.title} className="group p-6 transition-colors hover:bg-slate-50/60">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${item.tone}`}>
                  <item.icon size={19} />
                </div>
                <p className="mt-4 text-base font-semibold text-slate-900">{item.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{item.body}</p>
              </div>
            ))}
          </div>

        </div>
      </section>

                 {/* ── Problem ─────────────────────────────────────────────── */}
                 <section id="problem" className="scroll-mt-20 bg-slate-50 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-red-600 ring-1 ring-red-100">
              The problem
            </span>
           <h2 className="mx-auto mt-7 max-w-4xl text-3xl font-bold leading-[1.1] tracking-tight text-slate-900 md:text-4xl lg:text-5xl">
  <span className="block">Work slips through the cracks</span>
  <span className="block">when it lives in ten places</span>
</h2>
<p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-500 md:text-xl">
  Chat threads, sticky notes, spreadsheets, inboxes. When work is scattered, things get missed — and your team spends more time chasing tasks than doing them.
</p>


          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {[
              {
                stat: "9+",
                unit: "tools per team",
                title: "Everything is scattered",
                body: "The average team juggles nine apps to track one project — context lives everywhere and nowhere.",
                accent: "from-rose-400 to-red-500",
                statColor: "text-rose-600",
              },
              {
                stat: "1 in 4",
                unit: "deadlines missed",
                title: "Things quietly slip",
                body: "When due dates hide across different tools, they pass unnoticed — until it's already too late.",
                accent: "from-amber-400 to-orange-500",
                statColor: "text-amber-600",
              },
              {
                stat: "5 hrs",
                unit: "lost each week",
                title: "Time disappears",
                body: "Hours vanish every week to status pings, 'where is this?' messages, and endless tab-switching.",
                accent: "from-violet-400 to-indigo-500",
                statColor: "text-violet-600",
              },
                        ].map((item, i) => (
                            <div
                key={item.title}
                data-reveal-card
                data-reveal-dir={i === 0 ? "left" : i === 2 ? "right" : "up"}
                className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-7 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              >

                {/* top accent bar */}
                <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${item.accent}`} />

                <div className="flex items-baseline gap-2">
                  <span className={`text-4xl font-extrabold tracking-tight ${item.statColor}`}>
                    {item.stat}
                  </span>
                  <span className="text-sm font-medium text-slate-400">{item.unit}</span>
                </div>

                <h3 className="mt-5 text-lg font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{item.body}</p>
              </div>
            ))}
          </div>

          {/* bridge into the solution */}
          <div className="mt-14 text-center">
            <p className="text-base font-medium text-slate-600">
              WorkFine brings it all into one calm, organized place.
            </p>
            <a
              href="#features"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700"
            >
              See how it works
              <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </section>



  {/* ── Features ────────────────────────────────────────────── */}
<section id="features" data-reveal className="scroll-mt-20 bg-slate-50 py-24">
  <div className="mx-auto max-w-6xl px-6">
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight text-slate-900 md:text-5xl lg:text-6xl">
  Everything your team needs to move work forward
</h2>

    </div>

    {/* bento grid: two wide hero cards bookend a clean middle row */}
    <div className="mt-14 grid grid-flow-row-dense gap-5 md:grid-cols-3">
      {features.map((f) =>
        f.hero ? (
          // ── Hero card (spans 2 cols) ──
          <div
            key={f.title}
            className={`group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-7 shadow-sm transition-shadow hover:shadow-md ${f.full ? "md:col-span-3" : "md:col-span-2"}`}
          >
                        <div className={`flex flex-col gap-6 sm:flex-row sm:items-center ${f.full ? "sm:gap-10" : ""}`}>
              {/* copy */}
              <div className="flex-1">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${f.tone}`}>
                  <f.icon size={22} />
                </div>
                <h3 className="mt-4 text-xl font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{f.body}</p>
                {f.caption && (
                  <p className="mt-3 text-sm font-medium text-slate-400">{f.caption}</p>
                )}
              </div>

              {/* mini visual — differs per hero card */}
              <div className={`flex-shrink-0 ${f.full ? "sm:w-80" : "sm:w-64"}`}>

                {f.visual === "roles" ? (
                  // roles/permissions mini visual
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="space-y-2">
                      {[
                        { name: "Alex Morgan", role: "Owner", tone: "bg-violet-100 text-violet-700", grad: "from-violet-400 to-indigo-500" },
                        { name: "Jamie Lee", role: "Member", tone: "bg-blue-100 text-blue-700", grad: "from-emerald-400 to-teal-500" },
                        { name: "Sam Rivera", role: "Viewer", tone: "bg-slate-200 text-slate-600", grad: "from-pink-400 to-rose-500" },
                      ].map((m) => (
                        <div key={m.name} className="flex items-center gap-2 rounded-lg bg-white p-1.5">
                          <div className={`h-5 w-5 flex-shrink-0 rounded-full bg-gradient-to-br ${m.grad}`} />
                          <span className="flex-1 truncate text-[10px] font-medium text-slate-600">{m.name}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[8px] font-semibold ${m.tone}`}>{m.role}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  // board view-switcher mini visual
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    {/* view tabs */}
                    <div className="mb-3 flex gap-1.5">
                      {["Board", "Calendar", "Timeline", "List"].map((v, i) => (
                        <span
                          key={v}
                          className={`rounded-md px-2 py-1 text-[9px] font-semibold ${
                            i === 0 ? "bg-violet-600 text-white" : "bg-white text-slate-500"
                          }`}
                        >
                          {v}
                        </span>
                      ))}
                    </div>
                    {/* mini board */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { dot: "bg-slate-400", cards: ["bg-rose-100", "bg-amber-100"] },
                        { dot: "bg-violet-500", cards: ["bg-violet-100"] },
                        { dot: "bg-green-500", cards: ["bg-green-100", "bg-green-100"] },
                      ].map((col, i) => (
                        <div key={i} className="rounded-lg bg-white p-1.5">
                          <span className={`mb-1.5 block h-1 w-4 rounded-full ${col.dot}`} />
                          <div className="space-y-1">
                            {col.cards.map((c, j) => (
                              <div key={j} className={`h-4 rounded ${c}`} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          // ── Compact card ──
          <div
            key={f.title}
            className="group rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${f.tone}`}>
              <f.icon size={22} />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">{f.body}</p>
          </div>
        )
      )}
    </div>
  </div>
</section>



      {/* ── How it works ────────────────────────────────────────── */}
<section id="how" data-reveal className="scroll-mt-20 py-24">
  <div className="mx-auto max-w-5xl px-6">
    <div className="mx-auto max-w-3xl text-center">
  <h2 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl lg:text-6xl">
    Up and running{" "}
    <span
      className="whitespace-nowrap italic font-normal"
      style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif' }}
    >
      in minutes
    </span>
  </h2>
  <p className="mt-5 text-lg text-slate-500 md:text-xl">
    No setup headaches — just create, invite, and get to work.
  </p>
</div>


    <div className="relative mt-16">
      {/* connecting track (desktop only) */}
      <div
        aria-hidden="true"
        className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent md:block"
      />

      <div className="grid gap-10 md:grid-cols-3">
        {[
          { step: "1", icon: FolderKanban, title: "Create your workspace", body: "Sign up and your personal workspace is ready instantly.", tone: "bg-violet-50 text-violet-600" },
          { step: "2", icon: CheckSquare, title: "Add projects & tasks", body: "Break work into projects, add due dates, organize your way.", tone: "bg-blue-50 text-blue-600" },
          { step: "3", icon: UsersRound, title: "Invite your team", body: "Bring people in and watch progress unfold in real time.", tone: "bg-emerald-50 text-emerald-600" },
        ].map((s) => (
          <div key={s.step} className="relative text-center">
            {/* icon node sits on the track */}
            <div className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.tone}`}>
                <s.icon size={18} />
              </div>
              {/* step badge */}
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white ring-2 ring-white">
                {s.step}
              </span>
            </div>
            <h3 className="mt-5 text-lg font-semibold text-slate-900">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
</section>


      {/* ── Testimonial ─────────────────────────────────────────── */}
<section data-reveal className="pt-4 pb-20">
  <div className="mx-auto max-w-3xl px-6">
    <figure className="rounded-3xl border border-slate-100 bg-slate-50 p-10 text-center md:p-14">
      {/* stars */}
      <div className="flex justify-center gap-1 text-amber-400" aria-label="Rated 5 out of 5">
        {[...Array(5)].map((_, i) => (
          <Star key={i} size={18} className="fill-current" />
        ))}
      </div>

      {/* quote */}
      <blockquote className="mt-6 text-xl font-medium leading-relaxed text-slate-800 md:text-2xl">
        "WorkFine keeps our whole team on the same page. We ship faster and
        nothing slips through the cracks."
      </blockquote>

      {/* attribution */}
      <figcaption className="mt-8 flex items-center justify-center gap-3">
  <img
    src="/avatars/a3.jpg"
    alt="Sarah Chen"
    className="h-11 w-11 rounded-full object-cover ring-2 ring-white"
    onError={(e) => {
      const el = e.currentTarget;
      el.style.display = "none";
      el.nextElementSibling?.classList.remove("hidden");
    }}
  />
  {/* gradient fallback if the avatar image fails to load */}
  <div className="hidden h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-pink-400 to-rose-500 text-sm font-semibold text-white ring-2 ring-white">
    SC
  </div>
  <div className="text-left">
    <div className="text-sm font-semibold text-slate-900">Sarah Chen</div>
    <div className="text-xs text-slate-500">Head of Operations, Northwind Studio</div>
  </div>
</figcaption>
    </figure>
  </div>
</section>


      {/* ── Dark brand-statement band (closing moment) ──────────── */}
<section className="relative overflow-hidden bg-slate-950 px-6 py-28">
  {/* ambient glow — echoes the hero palette on dark */}
  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[500px] max-w-4xl bg-gradient-to-b from-violet-600/20 via-indigo-600/10 to-transparent blur-3xl" />
  <div aria-hidden="true" className="pointer-events-none absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-violet-600/20 blur-3xl" />
  <div aria-hidden="true" className="pointer-events-none absolute -right-20 top-10 h-72 w-72 rounded-full bg-indigo-600/20 blur-3xl" />

  <div className="relative mx-auto max-w-3xl text-center">
    <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-violet-300 ring-1 ring-white/10">
      <Sparkles size={13} />
      Work, finely organized
    </span>

    <h2 className="mt-7 text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl md:text-6xl">
  <span className="whitespace-nowrap">Everything your team needs,</span>
  <br className="hidden sm:block" />{" "}
  <span
    className="whitespace-nowrap font-normal italic bg-gradient-to-r from-violet-400 via-indigo-300 to-violet-400 bg-clip-text text-transparent"
    style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif' }}
  >
    finally in one place.
  </span>
</h2>



    <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-400">
      Stop chasing tasks across ten different tools. Bring your projects,
      deadlines, and people together — and finally feel on top of it all.
    </p>

    <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
      <Link
        to="/login"
        className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-slate-900 shadow-lg shadow-black/20 transition-all hover:bg-slate-100"
      >
        Get started free
        <ArrowRight size={16} />
      </Link>
      <a
        href="#features"
        className="rounded-full border border-white/15 bg-white/5 px-8 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
      >
        See what's inside
      </a>
    </div>

    <p className="mt-6 text-xs font-medium text-slate-500">
      Free to get started · No credit card required
    </p>
  </div>
</section>

{/* ── Recommended by ──────────────────────────────────────── */}
<section data-reveal className="bg-slate-50 pt-32 pb-16">
  <div className="mx-auto max-w-6xl px-6">
    {/* heading */}
    <div className="text-center">
      <h2 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl lg:text-6xl">
        Recommended by{" "}
        <span
          className="italic font-normal"
          style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif' }}
        >
          teams that ship
        </span>
      </h2>
      <p className="mt-5 text-lg text-slate-500 md:text-xl">
        Founders, operators, and product leaders who run on WorkFine.
      </p>
    </div>

    {/* credibility cards — horizontal row with faded edges */}
    <div
      ref={dragRow}
      onMouseDown={onDragStart}
      onMouseMove={onDragMove}
      onMouseUp={onDragEnd}
      onMouseLeave={onDragEnd}
      className="wf-drag-row mt-16 flex cursor-grab select-none gap-6 overflow-x-auto px-6 pb-2 active:cursor-grabbing"
      style={{
        WebkitMaskImage:
          "linear-gradient(to right, transparent 0, #000 8%, #000 92%, transparent 100%)",
        maskImage:
          "linear-gradient(to right, transparent 0, #000 8%, #000 92%, transparent 100%)",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
           {[
        { name: "Marcus Bell", role: "Founder @ Northwind Studio", src: "/avatars/a1.jpg", grad: "from-violet-400 to-indigo-500" },
        { name: "Elena Ross", role: "CEO @ Brightpath Labs", src: "/avatars/a5.jpg", grad: "from-sky-400 to-blue-500" },
        { name: "David Chen", role: "Head of Ops @ Meridian Co", src: "/avatars/a2.jpg", grad: "from-emerald-400 to-teal-500" },
        { name: "Sophie Lang", role: "Founder @ Cedar & Co", src: "/avatars/a4.jpg", grad: "from-amber-400 to-orange-500" },
        { name: "Priya Nair", role: "Product Lead @ Loomwork", src: "/avatars/a6.jpg", grad: "from-fuchsia-400 to-purple-500" },
      ].map((p, i) => (

        <div
          key={i}
          className="flex w-80 flex-shrink-0 items-center gap-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className={`h-14 w-14 flex-shrink-0 overflow-hidden rounded-full bg-gradient-to-br ${p.grad} ring-2 ring-white`}>
            <img
              src={p.src}
              alt={p.name}
              loading="lazy"
              draggable={false}
              className="h-full w-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-slate-900">{p.name}</p>
            <p className="truncate text-sm text-slate-500">{p.role}</p>
          </div>
        </div>
      ))}
    </div>

   {/* video */}
   <div className="mt-16">
  <button
    type="button"
    aria-label="Play video"
    className="group relative mx-auto block aspect-video w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-slate-900 shadow-2xl shadow-slate-900/15"
  >
    {/* thumbnail */}
    <img
  src="/About-Video.webp"
  alt="WorkFine product overview video"
      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      draggable={false}
    />
    {/* subtle dark overlay for contrast */}
    <div className="absolute inset-0 bg-black/10 transition-colors group-hover:bg-black/20" />
    {/* YouTube-style red play button */}
    <span className="absolute left-1/2 top-1/2 flex h-16 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-red-600 shadow-lg transition-transform group-hover:scale-105">
      <Play size={30} className="ml-0.5 fill-white text-white" />
    </span>
  </button>
  <p className="mt-6 text-center text-sm font-medium text-slate-400">
    See WorkFine in action — 90-second overview
  </p>
</div>

  </div>
</section>


      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800 bg-slate-950">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
            {/* Brand column */}
            <div className="max-w-xs">
              <div className="flex items-center gap-2">
                <img src="/logo.png?v=2" alt="WorkFine" className="h-8 w-8 rounded-lg object-contain" />
                <span className="text-lg tracking-tight">
                  <span className="font-extrabold text-white">Work</span>
                  <span className="font-light text-slate-400">Fine</span>
                </span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-slate-400">
                Keep your projects, deadlines, and people in sync — so nothing falls through the cracks.
              </p>
              <Link
                to="/login"
                className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
              >
                Get started free
                <ArrowRight size={15} />
              </Link>
            </div>

            {/* Link columns */}
            {[
              {
                heading: "Product",
                links: [
                  { label: "Features", href: "#features" },
                  { label: "How it works", href: "#how" },
                  { label: "Pricing", href: "#" },
                  { label: "Solutions", href: "#features" },
                ],
              },
              {
                heading: "Company",
                links: [
                  { label: "About", href: "#" },
                  { label: "Careers", href: "#" },
                  { label: "Contact", href: "#" },
                  { label: "Blog", href: "#" },
                ],
              },
              {
                heading: "Legal",
                links: [
                  { label: "Privacy", href: "#" },
                  { label: "Terms", href: "#" },
                  { label: "Security", href: "#" },
                ],
              },
            ].map((col) => (
              <div key={col.heading}>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  {col.heading}
                </p>
                <ul className="mt-4 space-y-3">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        className="text-sm text-slate-400 transition-colors hover:text-white"
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-8 text-sm text-slate-500 sm:flex-row">
            <p>© {new Date().getFullYear()} WorkFine. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <a href="#" className="transition-colors hover:text-slate-300">Privacy</a>
              <a href="#" className="transition-colors hover:text-slate-300">Terms</a>
              <a href="#" className="transition-colors hover:text-slate-300">Status</a>
            </div>
                      </div>
          </div>
        </footer>
    </div>
  );
}



