"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";
import { BRAND } from "@/config/brand";
import { usePrefersReducedMotion } from "./motion";

const FILM_URL =
  "https://cdn12.deliverthatstuff.xyz/assets/voice-agent-launch-film-16x9-v6g-music-cinematic.mp4";

const CONTROL =
  "absolute right-3 bottom-3 grid size-9 place-items-center rounded-full bg-zinc-800/75 text-zinc-100 shadow-[0_1px_3px_rgb(0_0_0/0.35)] backdrop-blur-md transition-[background-color,scale] duration-150 ease-out hover:bg-zinc-700/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 active:scale-[0.94] sm:right-5 sm:bottom-5 sm:size-10";

// The launch film. It starts muted, since browsers only play video on their
// own without sound, and the button turns the sound on. With reduced motion
// it waits for a click. It pauses while scrolled out of view.
export function HeroFilm() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduce = usePrefersReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  // The browser refused to start it (low power mode, for one).
  const [blocked, setBlocked] = useState(false);
  // Whether it should play while on screen.
  const wantedRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    wantedRef.current = !reduce;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) video.pause();
      else if (wantedRef.current) video.play().catch(() => setBlocked(true));
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, [reduce]);

  function start() {
    const video = videoRef.current;
    if (!video) return;
    wantedRef.current = true;
    video.muted = false;
    void video.play();
  }

  function toggleSound() {
    const video = videoRef.current;
    if (video) video.muted = !video.muted;
  }

  const waiting = !playing && (reduce || blocked);

  // A thick black frame; the film's corners follow its curve.
  return (
    <div className="rounded-[22px] bg-zinc-950 p-[5px] sm:rounded-[30px] sm:p-2">
      <div className="relative overflow-hidden rounded-[17px] bg-zinc-900 sm:rounded-[22px]">
        <video
          ref={videoRef}
          src={FILM_URL}
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          aria-label={`${BRAND.name} launch film`}
          className="block aspect-video w-full object-cover"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
        />
        {waiting ? (
          <button
            type="button"
            onClick={start}
            aria-label="Play the film"
            title="Play"
            className={CONTROL}
          >
            <Play className="size-4 translate-x-px" fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={toggleSound}
            aria-label={muted ? "Turn sound on" : "Turn sound off"}
            title={muted ? "Sound on" : "Sound off"}
            className={CONTROL}
          >
            {muted ? (
              <VolumeX className="size-[18px]" />
            ) : (
              <Volume2 className="size-[18px]" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
