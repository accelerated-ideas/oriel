"use client";
import { useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScene } from "./motion";
import { FeatureScene, SCENES, Stage } from "./feature-scenes";

// Each point is a moment in its scene (SCENES[i].beats, in the same order),
// and lights up while the scene shows it.
const FEATURES = [
  {
    title: "A real conversation, not a chat box",
    text: "One click starts a call, in any of ten languages. People talk to it the way they'd talk to your best support person, and every call is saved as a transcript.",
    points: [
      "Answers out loud, in a natural voice",
      "Stops when they cut in, and answers that instead",
      "Switches to typing whenever they'd rather type",
    ],
  },
  {
    title: "It knows where your users are",
    text: "It sees the page they're on, who they are, and how your product is laid out. So “where are my invoices?” gets them to the invoice, not a link to the docs.",
    points: [
      "Sees the page they're on and who they are",
      "Takes them to the right page, mid-call",
      "Points at buttons, fields and numbers",
    ],
  },
  {
    title: "It does the thing, not just explains it",
    text: "It looks up billing, changes plans and creates records for the person it's talking to, so they never have to hunt for the right screen.",
    points: [
      "Says what it will do, and waits for a yes",
      "Runs it in Stripe, your API or your app",
      "Acts only on the signed-in user's account",
    ],
  },
  {
    title: "Every frustration becomes a finding",
    text: "When someone is stuck or annoyed, it helps them first, then writes up what went wrong for your team. You hear about it today, not in next quarter's churn numbers.",
    points: [
      "Asks what happened, like a good researcher",
      "Writes up what they tried and what they expected",
      "Links the person, the page and the conversation",
    ],
  },
];

// On wide screens the scene stays pinned while the text scrolls past it, and
// changes to match whichever capability is in the middle of the screen.
export function Features() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  // Visitors who prefer reduced motion see still moments, and can play them.
  const [optedIn, setOptedIn] = useState(false);
  const scene = SCENES[active];
  const clock = useScene<HTMLDivElement>(scene.loop, scene.still, { paused, playWhenReduced: optedIn, restart: active });
  const playing = !paused && (!clock.still || optedIn);

  return (
    <section id="features" className="scroll-mt-16 px-3 sm:px-5 lg:pb-16">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-14 xl:gap-20">
        <div className="hidden lg:block">
          <div className="sticky top-16 flex h-[calc(100dvh-4rem)] max-h-[860px] items-center">
            <div ref={clock.ref} className="w-full">
              <Stage
                fitScreen
                palette={scene.palette}
                control={
                  <PlayToggle
                    playing={playing}
                    onToggle={() => {
                      if (playing) return setPaused(true);
                      setPaused(false);
                      setOptedIn(true);
                    }}
                  />
                }
              >
                {(layout) => <FeatureScene index={active} time={clock.time} layout={layout} />}
              </Stage>
            </div>
          </div>
        </div>

        <div>
          {FEATURES.map((feature, index) => (
            <Chapter
              key={feature.title}
              index={index}
              active={index === active}
              wideTime={index === active ? clock.time : null}
              wideLive={playing}
              onEnter={() => setActive(index)}
              onWideSeek={(at) => {
                clock.seek(at);
                setPaused(false);
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Chapter({
  index,
  active,
  wideTime,
  wideLive,
  onEnter,
  onWideSeek,
}: {
  index: number;
  active: boolean;
  /** The pinned scene's clock, while this chapter is the one showing. */
  wideTime: number | null;
  wideLive: boolean;
  onEnter: () => void;
  onWideSeek: (at: number) => void;
}) {
  const feature = FEATURES[index];
  const scene = SCENES[index];
  const ref = useRef<HTMLDivElement>(null);
  // True while the chapter crosses the middle of the screen.
  const centered = useInView(ref, { margin: "-50% 0px -50% 0px" });

  useEffect(() => {
    if (centered) onEnter();
  }, [centered]);

  // Below the wide layout, the scene sits above the text with its own clock.
  // It only runs while on screen, so it's idle on wide screens, where it's hidden.
  const [paused, setPaused] = useState(false);
  const [optedIn, setOptedIn] = useState(false);
  const clock = useScene<HTMLDivElement>(scene.loop, scene.still, { paused, playWhenReduced: optedIn });
  const playing = !paused && (!clock.still || optedIn);

  // With reduced motion a point shows the end of its moment, which reads better as a still.
  const seekTo = (beat: number, live: boolean) => (live ? scene.beats[beat][0] : scene.beats[beat][1] - 0.3);

  return (
    <div ref={ref} className="flex flex-col justify-center py-14 sm:py-20 lg:min-h-[92dvh] lg:py-0">
      <div ref={clock.ref} className="mx-auto mb-10 w-full max-w-[782px] lg:hidden">
        <Stage
          palette={scene.palette}
          control={
            <PlayToggle
              playing={playing}
              onToggle={() => {
                if (playing) return setPaused(true);
                setPaused(false);
                setOptedIn(true);
              }}
            />
          }
        >
          {(layout) => <FeatureScene index={index} time={clock.time} layout={layout} />}
        </Stage>
      </div>

      <div className={cn("transition-opacity duration-500 ease-out", !active && "lg:opacity-25")}>
        <h2 className="headline text-[38px] leading-[0.98] font-semibold tracking-[-0.04em] text-balance sm:text-[52px] lg:text-[44px] xl:text-[52px]">
          {feature.title}
        </h2>
        <p className="mt-6 max-w-[500px] text-[17.5px] leading-relaxed text-pretty text-ink-2">{feature.text}</p>

        <Points
          className="lg:hidden"
          points={feature.points}
          beats={scene.beats}
          time={clock.time}
          live={playing}
          onPick={(beat) => {
            clock.seek(seekTo(beat, playing));
            setPaused(false);
          }}
        />
        <Points
          className="hidden lg:block"
          points={feature.points}
          beats={scene.beats}
          time={wideTime}
          live={wideLive}
          onPick={(beat) => {
            if (active) return onWideSeek(seekTo(beat, wideLive));
            // Bring the chapter to the middle of the screen; its scene starts there.
            ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />
      </div>
    </div>
  );
}

// The chapter's points, as a vertical timeline of its scene: the one playing
// now has a moving wave and its line fills as the moment plays out. Picking a
// point jumps the scene to it.
function Points({
  points,
  beats,
  time,
  live,
  onPick,
  className,
}: {
  points: string[];
  beats: readonly (readonly [number, number])[];
  /** Null while another chapter is showing. */
  time: number | null;
  live: boolean;
  onPick: (beat: number) => void;
  className?: string;
}) {
  return (
    <ol className={cn("mt-9 max-w-[500px] border-t border-line", className)}>
      {points.map((point, index) => {
        const [from, to] = beats[index];
        const state = time === null ? "idle" : time >= to ? "done" : time >= from ? "now" : "next";
        const filled = state === "done" ? 1 : state === "now" ? (live ? (time! - from) / (to - from) : 1) : 0;
        return (
          <li key={point} className="relative border-b border-line">
            <button
              type="button"
              onClick={() => onPick(index)}
              aria-current={state === "now" ? "step" : undefined}
              className="group flex w-full items-center gap-3.5 py-3.5 text-left text-[15.5px]"
            >
              <span className="grid size-4 shrink-0 place-items-center" aria-hidden>
                {state === "now" ? (
                  <span className="flex h-3 items-center gap-[2px]">
                    {[0, 1, 2].map((bar) => (
                      <span
                        key={bar}
                        className={cn("h-full w-[2.5px] rounded-full bg-accent", live && "animate-wave")}
                        style={{ animationDelay: `${-bar * 180}ms`, animationDuration: `${460 + bar * 90}ms` }}
                      />
                    ))}
                  </span>
                ) : (
                  <span
                    className={cn(
                      "size-1.5 rounded-full transition-colors duration-300",
                      state === "done" ? "bg-accent" : state === "idle" ? "bg-accent" : "bg-line-strong group-hover:bg-faint",
                    )}
                  />
                )}
              </span>
              <span
                className={cn(
                  "transition-colors duration-300",
                  state === "now" ? "text-ink" : state === "next" ? "text-muted group-hover:text-ink-2" : "text-ink-2",
                )}
              >
                {point}
              </span>
            </button>
            <span
              className="pointer-events-none absolute -bottom-px left-0 h-px w-full origin-left bg-ink transition-transform duration-100 ease-linear"
              style={{ transform: `scaleX(${filled})` }}
              aria-hidden
            />
          </li>
        );
      })}
    </ol>
  );
}

function PlayToggle({ playing, onToggle }: { playing: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={playing ? "Pause the demo" : "Play the demo"}
      title={playing ? "Pause" : "Play"}
      className="grid size-8 place-items-center rounded-full bg-white/70 text-ink-2 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] backdrop-blur-md transition-[background-color,color,scale] duration-150 ease-out hover:bg-white hover:text-ink active:scale-[0.94]"
    >
      {playing ? <Pause className="size-3.5" fill="currentColor" /> : <Play className="size-3.5 translate-x-px" fill="currentColor" />}
    </button>
  );
}
