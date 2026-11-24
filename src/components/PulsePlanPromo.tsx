import {
  ArrowUpRight,
  BellRing,
  CalendarDays,
  Link2,
  Repeat,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const PULSEPLAN_URL = "https://pulseplan.pages.dev/";

const HIGHLIGHTS = [
  {
    icon: CalendarDays,
    title: "Agenda, Week & Month Views",
    description:
      "Switch views effortlessly and filter by all events, invites, or pending responses.",
  },
  {
    icon: Link2,
    title: "1-Tap Shareable RSVP Links",
    description:
      "Send a direct event link to friends so they can check details and RSVP in seconds.",
  },
  {
    icon: Repeat,
    title: "Recurring Schedules",
    description:
      "Plan repeating hangouts, game nights, and study sessions with per-occurrence RSVPs.",
  },
  {
    icon: BellRing,
    title: "Instant Push Reminders & PWA",
    description:
      "Install PulsePlan on your phone or desktop for real-time browser and mobile alerts.",
  },
] as const;

export function PulsePlanPromo() {
  return (
    <section
      className="schedule-panel glass-surface overflow-y-auto custom-schedule-scrollbar"
      aria-label="Server schedule"
    >
      <div className="flex-1 flex flex-col items-center justify-center py-4 px-2 sm:px-6">
        <div className="w-full max-w-2xl flex flex-col items-center text-center gap-5">
          {/* Status pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium">
            <Sparkles size={13} />
            <span>Built-in schedule is temporarily disabled · Try my dedicated app</span>
          </div>

          {/* Brand & Headline */}
          <div className="space-y-2.5">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/15 border border-primary/30 text-primary grid place-items-center shadow-sm">
              <CalendarDays size={24} />
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight font-display text-foreground">
              Meet <span className="text-primary">PulsePlan</span>
            </h2>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
              The in-app schedule section is taking a break. I built{" "}
              <strong className="text-foreground font-medium">PulsePlan</strong> as a dedicated,
              faster shared event scheduler—with recurring events, 1-tap RSVP links, and push
              reminders.
            </p>
          </div>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
            {HIGHLIGHTS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-xl border border-border/80 bg-card/50 p-3.5 flex items-start gap-3 transition-colors hover:border-primary/35 hover:bg-card/75"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/12 border border-primary/25 text-primary grid place-items-center shrink-0 mt-0.5">
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[13px] font-semibold text-foreground leading-snug">
                      {item.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Primary CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1 w-full sm:w-auto">
            <Button asChild size="lg" className="w-full sm:w-auto font-semibold gap-2 px-6">
              <a href={PULSEPLAN_URL} target="_blank" rel="noopener noreferrer">
                <span>Open PulsePlan</span>
                <ArrowUpRight size={16} />
              </a>
            </Button>
            <a
              href={PULSEPLAN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-3 py-2 rounded-lg border border-border/70 bg-secondary/40"
            >
              <Smartphone size={13} />
              <span>pulseplan.pages.dev</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
