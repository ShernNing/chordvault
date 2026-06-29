import { useState } from "react";
import { Link } from "react-router-dom";
import {
  LayoutGrid,
  Plus,
  FileUp,
  ListMusic,
  Guitar,
  BarChart3,
  Music2,
  Zap,
  Type,
  CloudOff,
  ArrowRightLeft,
  Hash,
  Sparkles,
  ChevronDown,
  BookOpen,
  Eye,
  Shield,
  ShieldCheck,
  Play,
  Lock,
  KeyRound,
} from "lucide-react";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../lib/toast";
import { Modal, Button } from "../ui";

// ─── Guide content ───────────────────────────────────────────────────────────
// One source of truth for both the first-run WelcomeModal and the always-on
// GuideSection in Profile. Each step is role-gated by an optional `show(auth)`
// predicate so members don't see buttons they can't use.

const STEPS = [
  {
    icon: LayoutGrid,
    title: "Library",
    to: "/",
    body: "Every song your team has, in one place. Search by title, artist or tag, filter by key, and sort however you like. Tap a card to open the chord sheet.",
  },
  {
    icon: Plus,
    title: "Add a song",
    to: "/songs/new",
    body: "Paste a chord sheet and ChordVault lays out chords over lyrics automatically. Set the original key, artist and tags.",
    show: (a) => a.canAddSongs,
  },
  {
    icon: FileUp,
    title: "Import",
    to: "/import",
    body: "Bulk-add songs by pasting or uploading multiple chord sheets at once instead of one at a time.",
    show: (a) => a.canAddSongs,
  },
  {
    icon: ArrowRightLeft,
    title: "Transpose on the fly",
    body: "Open any song and change its key, chords shift instantly. The saved original key never changes, so it's safe to transpose for whoever's playing.",
  },
  {
    icon: Hash,
    title: "Nashville numbers",
    body: "Toggle chords to the Nashville number system (1, 4, 5…) so the chart reads the same in any key, handy for bands that think in numbers.",
  },
  {
    icon: ListMusic,
    title: "Setlists",
    to: "/setlists",
    body: "Group songs for a service or event, drag to reorder, and set a per-song key. Hit Perform for a clean full-screen flow you swipe through live.",
  },
  {
    icon: Zap,
    title: "Stage mode",
    body: "The lightning bolt in the top bar switches to high-contrast colors built for a dim stage. Pick the accent color that reads best from your setup.",
  },
  {
    icon: Guitar,
    title: "Chord Voicings",
    to: "/voicings",
    body: "A reference library of chord shapes and fingerings to pull up when you need a voicing.",
  },
  {
    icon: BarChart3,
    title: "Stats",
    to: "/stats",
    body: "See what's played most, library totals, and key distribution across your songs.",
  },
  {
    icon: Type,
    title: "Make it readable",
    to: "/profile",
    body: "Set chord & lyric size and font in Profile → Display settings. Switch dark mode and themes from the top bar. All saved to this browser.",
  },
];

// Role line shown at the top of the guide, sets expectations on what this
// person can actually do.
const ROLE_NOTE = {
  member: {
    icon: Eye,
    text: "You're a Member: view every song and build or edit setlists. These need a Leader or Superuser, ask one to promote you.",
    limits: ["Add songs", "Edit songs", "Delete songs", "Change user roles"],
    requestAccess: true,
  },
  leader: {
    icon: Shield,
    text: "You're a Leader: add songs and edit or delete the ones you added, plus everything Members can do.",
  },
  superuser: {
    icon: ShieldCheck,
    text: "You're a Superuser: full control over every song, plus user & role management in the Admin panel below.",
  },
};

function visibleSteps(auth) {
  return STEPS.filter((s) => !s.show || s.show(auth));
}

// ─── Single step row ──────────────────────────────────────────────────────────
function StepRow({ step, onNavigate }) {
  const Icon = step.icon;
  const inner = (
    <div className='flex gap-3'>
      <div className='shrink-0 w-8 h-8 rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)] flex items-center justify-center'>
        <Icon size={15} />
      </div>
      <div className='min-w-0'>
        <div className='flex items-center gap-1.5'>
          <span className='text-sm font-semibold text-[var(--color-ink)]'>
            {step.title}
          </span>
          {step.to && (
            <span className='text-[10px] text-[var(--color-ink-muted)]'>↗</span>
          )}
        </div>
        <p className='text-xs text-[var(--color-ink-soft)] mt-0.5 leading-relaxed'>
          {step.body}
        </p>
      </div>
    </div>
  );

  if (step.to) {
    return (
      <Link
        to={step.to}
        onClick={onNavigate}
        className='block rounded-lg p-2 -m-2 hover:bg-[var(--color-bg-warm)] transition-colors'
      >
        {inner}
      </Link>
    );
  }
  return <div className='p-2 -m-2'>{inner}</div>;
}

function RoleNote({ role }) {
  const note = ROLE_NOTE[role] || ROLE_NOTE.member;
  const Icon = note.icon;
  const { email } = useAuth();
  const toast = useToast();

  const requestAccess = () => {
    const who = email || "my account";
    const msg = `Hi! I'm using ChordVault as a Member (${who}) and would like Leader access so I can add and edit songs. Could you promote me? Thanks!`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(msg)
        .then(() =>
          toast.success("Request copied — send it to a Leader or Superuser."),
        )
        .catch(() => toast.info(msg));
    } else {
      toast.info(msg);
    }
  };

  return (
    <div className='flex items-start gap-2 p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-warm)]'>
      <Icon size={14} className='text-[var(--color-accent)] mt-0.5 shrink-0' />
      <div className='min-w-0 space-y-2.5'>
        <p className='text-xs text-[var(--color-ink-soft)] leading-relaxed'>
          {note.text}
        </p>
        {note.limits && (
          <div className='space-y-1'>
            <p className='text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]'>
              Needs a Leader or Superuser
            </p>
            <ul className='flex flex-wrap gap-1.5'>
              {note.limits.map((l) => (
                <li
                  key={l}
                  className='flex items-center gap-1 text-[11px] text-[var(--color-ink-soft)] px-1.5 py-0.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)]'
                >
                  <Lock size={9} className='text-[var(--color-ink-muted)]' /> {l}
                </li>
              ))}
            </ul>
          </div>
        )}
        {note.requestAccess && (
          <Button variant='secondary' size='sm' onClick={requestAccess}>
            <KeyRound size={12} /> Request more access
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── First-run welcome modal ─────────────────────────────────────────────────
// Controlled. AppShell shows it once per browser; Profile re-opens it on demand.
export function WelcomeModal({ isOpen, onClose }) {
  const auth = useAuth();
  const steps = visibleSteps(auth);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={null} className='max-w-lg'>
      <div className='space-y-4'>
        <div className='flex items-center gap-2'>
          <div className='w-9 h-9 rounded-lg bg-[var(--color-ink)] text-[var(--color-bg)] flex items-center justify-center'>
            <Music2 size={18} />
          </div>
          <div>
            <h2 className='font-display text-lg text-[var(--color-ink)] flex items-center gap-1.5'>
              Welcome to ChordVault{" "}
              <Sparkles size={15} className='text-[var(--color-accent)]' />
            </h2>
            <p className='text-xs text-[var(--color-ink-muted)]'>
              Your team's chord charts, setlists and stage view, here's the
              quick tour.
            </p>
          </div>
        </div>

        {auth.isLoggedIn ? (
          <RoleNote role={auth.role} />
        ) : (
          <div className='flex items-start gap-2 p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-warm)]'>
            <CloudOff size={14} className='text-amber-500 mt-0.5 shrink-0' />
            <p className='text-xs text-[var(--color-ink-soft)] leading-relaxed'>
              You're not signed in, songs stay only in this browser. Sign in
              from the top bar to sync your library across devices.
            </p>
          </div>
        )}

        <div className='space-y-3 max-h-[45vh] overflow-y-auto pr-1'>
          {steps.map((step) => (
            <StepRow key={step.title} step={step} onNavigate={onClose} />
          ))}
        </div>

        <div className='flex items-center justify-between pt-1 border-t border-[var(--color-border)]'>
          <span className='text-[10px] text-[var(--color-ink-muted)]'>
            Find this again any time in Profile.
          </span>
          <Button variant='primary' size='sm' onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Always-on guide section (Profile page) ──────────────────────────────────
export function GuideSection() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const steps = visibleSteps(auth);

  return (
    <div className='border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-warm)] overflow-hidden'>
      <button
        onClick={() => setOpen((o) => !o)}
        className='w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[var(--color-bg)] transition-colors'
      >
        <BookOpen size={15} className='text-[var(--color-accent)] shrink-0' />
        <div className='flex-1 min-w-0'>
          <h2 className='text-sm font-semibold text-[var(--color-ink)]'>
            How ChordVault works
          </h2>
          <p className='text-[11px] text-[var(--color-ink-muted)]'>
            A quick guide to every section and what your role can do
          </p>
        </div>
        <ChevronDown
          size={16}
          className={`text-[var(--color-ink-muted)] shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className='px-4 pb-4 space-y-4 border-t border-[var(--color-border)] pt-4'>
          {auth.isLoggedIn && <RoleNote role={auth.role} />}
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
            {steps.map((step) => (
              <StepRow key={step.title} step={step} />
            ))}
          </div>
          <div className='flex items-center gap-2 pt-1'>
            <Button
              variant='secondary'
              size='sm'
              onClick={() => setReplayOpen(true)}
            >
              <Play size={12} /> Replay welcome tour
            </Button>
          </div>
        </div>
      )}

      <WelcomeModal isOpen={replayOpen} onClose={() => setReplayOpen(false)} />
    </div>
  );
}
