/**
 * Centralized SFX (Sound Effects) System for Synchron
 * 
 * This module provides procedural audio synthesis for important user actions.
 * All sounds are generated using Web Audio API oscillators - no external audio files.
 * 
 * Sound Design Philosophy:
 * - Premium, minimal, calm, responsive
 * - Suitable for productivity/focus applications
 * - Clearly audible but never distracting or game-like
 * - Cohesive sound language across all events
 */

type AudioContextConstructor = typeof AudioContext;

/**
 * Cross-browser AudioContext constructor (handles webkit prefix for Safari)
 */
function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const win = window as typeof window & { webkitAudioContext?: AudioContextConstructor };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

/**
 * SFX event types for different user actions
 */
export type SfxEvent = "start" | "pauseResume" | "habitComplete" | "pomodoroTransition" | "timerComplete";

/**
 * SFX system configuration
 */
interface SfxConfig {
  enabled: boolean;
  volume: number; // 0-100
  sfxEnabled: {
    start: boolean;
    pauseResume: boolean;
    habitComplete: boolean;
    pomodoroTransition: boolean;
    timerComplete: boolean;
  };
}

/**
 * Internal SFX state
 */
interface SfxState {
  audioContext: AudioContext | null;
  config: SfxConfig;
}

const state: SfxState = {
  audioContext: null,
  config: {
    enabled: true,
    volume: 80,
    sfxEnabled: {
      start: true,
      pauseResume: true,
      habitComplete: true,
      pomodoroTransition: true,
      timerComplete: true,
    },
  },
};

/**
 * Get or create the shared AudioContext (lazy initialization)
 */
function getAudioContext(): AudioContext | null {
  if (!state.audioContext) {
    const Ctor = getAudioContextConstructor();
    if (!Ctor) return null;
    state.audioContext = new Ctor();
  }
  return state.audioContext;
}

/**
 * Prime the AudioContext by resuming it if suspended
 * Should be called from a user gesture (e.g., button click) to avoid autoplay blocking
 */
export function primeAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {
      // Autoplay was blocked; sounds simply won't play this run
    });
  }
}

/**
 * Configure the SFX system
 */
export function configureSfx(config: Partial<SfxConfig>): void {
  if (config.enabled !== undefined) {
    state.config.enabled = config.enabled;
  }
  if (config.volume !== undefined) {
    state.config.volume = Math.max(0, Math.min(100, config.volume));
  }
  if (config.sfxEnabled !== undefined) {
    state.config.sfxEnabled = {
      ...state.config.sfxEnabled,
      ...config.sfxEnabled,
    };
  }
}

/**
 * Play a single tone with envelope
 * @param ctx - AudioContext
 * @param frequency - Frequency in Hz
 * @param startTime - Start time in seconds
 * @param duration - Duration in seconds
 * @param maxGain - Maximum gain (volume) before volume multiplier
 */
function playTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  maxGain: number = 0.18,
): void {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;

  // Apply volume multiplier (0-100 mapped to 0-1)
  const volumeMultiplier = state.config.volume / 100;
  const adjustedMaxGain = maxGain * volumeMultiplier;

  // Envelope: quick attack, exponential decay
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(adjustedMaxGain, startTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.05);
}

/**
 * Play a frequency sweep (rising or falling)
 * @param ctx - AudioContext
 * @param startFreq - Starting frequency in Hz
 * @param endFreq - Ending frequency in Hz
 * @param startTime - Start time in seconds
 * @param duration - Duration in seconds
 * @param maxGain - Maximum gain (volume) before volume multiplier
 */
function playSweep(
  ctx: AudioContext,
  startFreq: number,
  endFreq: number,
  startTime: number,
  duration: number,
  maxGain: number = 0.18,
): void {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(startFreq, startTime);
  oscillator.frequency.linearRampToValueAtTime(endFreq, startTime + duration);

  // Apply volume multiplier (0-100 mapped to 0-1)
  const volumeMultiplier = state.config.volume / 100;
  const adjustedMaxGain = maxGain * volumeMultiplier;

  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(adjustedMaxGain, startTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.05);
}

/**
 * SFX: Start - Very short, subtle confirmation sound
 * Used when a focus timer/session starts
 */
function playStart(ctx: AudioContext): void {
  const now = ctx.currentTime;
  // Single gentle ping
  playTone(ctx, 880, now, 0.12, 0.12); // A5, quieter
}

/**
 * SFX: Pause/Resume - Very short confirmation sound
 * Used when a running timer is paused or resumed
 * Subtle enough to not become annoying during repeated interactions
 */
function playPauseResume(ctx: AudioContext): void {
  const now = ctx.currentTime;
  // Two very short, soft taps
  playTone(ctx, 659.25, now, 0.08, 0.10); // E5
  playTone(ctx, 783.99, now + 0.08, 0.08, 0.10); // G5
}

/**
 * SFX: Habit Complete - Tiny, satisfying completion sound
 * Feels like a clean confirmation rather than a notification
 * Shorter and quieter than timer completion
 */
function playHabitComplete(ctx: AudioContext): void {
  const now = ctx.currentTime;
  // Gentle rising arpeggio
  playTone(ctx, 523.25, now, 0.10, 0.08); // C5
  playTone(ctx, 659.25, now + 0.08, 0.10, 0.08); // E5
  playTone(ctx, 783.99, now + 0.16, 0.12, 0.08); // G5
}

/**
 * SFX: Pomodoro Transition - Used when transitioning between Pomodoro focus and break states
 * Recognizably different from habitComplete
 * Calm and concise
 */
function playPomodoroTransition(ctx: AudioContext): void {
  const now = ctx.currentTime;
  // Gentle sweep with a second confirming tone
  playSweep(ctx, 659.25, 880, now, 0.20, 0.14); // E5 -> A5
  playTone(ctx, 1046.50, now + 0.20, 0.15, 0.12); // C6
}

/**
 * SFX: Timer Complete - Primary completion sound
 * Preserves the spirit of the existing two-tone chime
 * Most noticeable SFX, while still fitting Synchron's minimalist aesthetic
 */
function playTimerComplete(ctx: AudioContext): void {
  const now = ctx.currentTime;
  // Two-tone rising interval (preserved from original implementation)
  playTone(ctx, 880, now, 0.22, 0.18); // A5
  playTone(ctx, 1174.66, now + 0.22, 0.28, 0.18); // D6
}

/**
 * Sound implementations for each event type
 */
const soundImplementations: Record<SfxEvent, (ctx: AudioContext) => void> = {
  start: playStart,
  pauseResume: playPauseResume,
  habitComplete: playHabitComplete,
  pomodoroTransition: playPomodoroTransition,
  timerComplete: playTimerComplete,
};

/**
 * Play a sound effect for a specific event
 * @param event - The SFX event to play
 */
export function playSfx(event: SfxEvent): void {
  // Check master enabled flag
  if (!state.config.enabled) return;

  // Check per-sound enabled flag
  if (!state.config.sfxEnabled[event]) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const implementation = soundImplementations[event];
  if (!implementation) return;

  const fire = () => {
    try {
      implementation(ctx);
    } catch (error) {
      // Fail silently - don't break app functionality if audio fails
      console.error(`Failed to play SFX event "${event}":`, error);
    }
  };

  if (ctx.state === "suspended") {
    ctx.resume().then(fire).catch(() => {
      // Blocked without a fresh gesture; skip this sound silently
    });
  } else {
    fire();
  }
}
