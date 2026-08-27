// 버튼 클릭 피드백용 효과음. 외부 오디오 파일 없이 Web Audio API로 짧은 톤을 합성한다.
// "실험 조건 추가" = 짧은 단음, "분석 실행" = 그보다 뚜렷하게 긴 2음 상승 스윕으로 구분한다.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playTone(ctx: AudioContext, freq: number, startTime: number, durationSec: number, peakGain: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + durationSec + 0.02);
}

// 실험 조건 추가: 짧은 단음 "삑"
export function playAddConditionSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  playTone(ctx, 920, ctx.currentTime, 0.09, 0.18);
}

// 분석 실행: 뚜렷하게 긴 2음 상승 스윕 "삐-뽀"
export function playAnalyzeSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  playTone(ctx, 520, now, 0.26, 0.2);
  playTone(ctx, 780, now + 0.13, 0.26, 0.2);
}
