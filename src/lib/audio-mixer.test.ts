import { describe, it, expect } from 'vitest';
import { mixCapture } from '@/lib/audio-mixer';

// jsdom has no Web Audio, which makes it exactly the environment worth
// asserting about: the mixer must DEGRADE to a plain microphone recording
// rather than fail. Recording someone talking in a room is the product's
// baseline and it cannot be allowed to depend on a mixing feature that only
// matters for video calls.

const track = (kind: 'audio' | 'video' = 'audio') => ({ kind, readyState: 'live', stop() {} });

function fakeStream(audioTracks = 1) {
  const tracks = Array.from({ length: audioTracks }, () => track());
  return {
    getAudioTracks: () => tracks,
    getTracks: () => tracks,
  } as unknown as MediaStream;
}

describe('mixCapture', () => {
  it('hands back the microphone untouched when there is no call audio', () => {
    const mic = fakeStream();
    const result = mixCapture(mic, null);

    expect(result.stream).toBe(mic);
    expect(result.hasSystemAudio).toBe(false);
    expect(result.sourceTracks).toHaveLength(1);
  });

  it('reports no call audio when the share carried no audio track', () => {
    // The commonest trap in getDisplayMedia: the user shares a window, or
    // forgets the "share audio" checkbox. The share succeeds and is silent.
    const mic = fakeStream();
    const silentShare = fakeStream(0);
    const result = mixCapture(mic, silentShare);

    expect(result.hasSystemAudio).toBe(false);
    expect(result.stream).toBe(mic);
  });

  it('exposes every source track, since those are what the watchdog watches', () => {
    const result = mixCapture(fakeStream(), fakeStream(0));
    // A mixed stream's own track never ends, mutes, or reports anything, so
    // watching it would be watching nothing.
    expect(result.sourceTracks).toHaveLength(1);
  });

  it('refuses to pretend it captured something when given nothing', () => {
    expect(() => mixCapture(null, null)).toThrow(/fuente de audio/i);
  });

  it('stopping releases every source', () => {
    const stopped: string[] = [];
    const mk = (name: string) =>
      ({
        getAudioTracks: () => [{ kind: 'audio', readyState: 'live', stop: () => stopped.push(name) }],
        getTracks: () => [{ kind: 'audio', readyState: 'live', stop: () => stopped.push(name) }],
      }) as unknown as MediaStream;

    // Leaving either of these running keeps the microphone light on, or
    // Chrome's "you are sharing your screen" bar up, after recording ended.
    mixCapture(mk('mic'), mk('system')).stop();
    expect(stopped).toContain('mic');
    expect(stopped).toContain('system');
  });
});
