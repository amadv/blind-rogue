import { Audio } from 'expo-av';

// Audio file imports
const windSound = require('@/assets/audio/wind.mp3');
const caveSound = require('@/assets/audio/cave.mp3');
const stepSound = require('@/assets/audio/step.mp3');
const goblinSound = require('@/assets/audio/goblin.wav');
const attackSound = require('@/assets/audio/attack.mp3');
const startSound = require('@/assets/audio/start.wav');
const trapSound = require('@/assets/audio/trap.wav');
const fallingSound = require('@/assets/audio/falling.mp3');

let audioContext: AudioContext | null = null;
let audioModeSet = false;

// Sound cache for reusing audio objects
const soundCache: { [key: string]: Audio.Sound | null } = {
  wind: null,
  cave: null,
  step: null,
  goblin: null,
  attack: null,
  start: null,
  trap: null,
  falling: null,
};

// Goblin sound instances - one per goblin ID
const goblinSoundInstances: Map<number, Audio.Sound> = new Map();

/**
 * Initialize audio context (for web) or ensure audio is ready
 */
async function initAudio() {
  if (typeof window !== 'undefined' && !audioContext) {
    try {
      audioContext = new AudioContext();
    } catch (error) {
      console.warn('Failed to create AudioContext:', error);
    }
  }
  // Request audio permissions on mobile
  if (!audioModeSet) {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
      });
      audioModeSet = true;
    } catch (error) {
      console.warn('Audio setup error:', error);
    }
  }
}

/**
 * Helper function to play an audio file from cache or load it
 */
async function playAudioFile(
  soundKey: keyof typeof soundCache,
  audioSource: any,
  volume: number = 1.0
): Promise<void> {
  try {
    await initAudio();
    
    let sound = soundCache[soundKey];
    
    // Load sound if not cached
    if (!sound) {
      const { sound: newSound } = await Audio.Sound.createAsync(
        audioSource,
        { shouldPlay: false, volume }
      );
      sound = newSound;
      soundCache[soundKey] = sound;
    }
    
    // Reset position and play
    await sound.setPositionAsync(0);
    await sound.setVolumeAsync(volume);
    await sound.playAsync();
  } catch (error) {
    console.warn(`Error playing ${soundKey} sound:`, error);
  }
}

/**
 * Play tone on mobile using expo-av with generated audio
 */
async function playToneMobile(frequency: number, duration: number, volume: number = 0.3): Promise<void> {
  try {
    await initAudio();
    
    // Generate WAV file data URI
    const sampleRate = 44100;
    const numSamples = Math.floor(duration * sampleRate);
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, numSamples * 2, true);
    
    // Generate audio samples
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const sample = Math.sin(2 * Math.PI * frequency * t) * volume;
      // Apply fade out
      const fadeOut = 1 - (i / numSamples);
      const finalSample = Math.max(-1, Math.min(1, sample * fadeOut));
      view.setInt16(44 + i * 2, finalSample * 0x7FFF, true);
    }
    
    // Convert to base64
    const bytes = new Uint8Array(buffer);
    const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
    const base64 = btoa(binary);
    const dataUri = `data:audio/wav;base64,${base64}`;
    
    // Play using expo-av
    const { sound } = await Audio.Sound.createAsync(
      { uri: dataUri },
      { shouldPlay: true, volume: 1.0 }
    );
    
    // Wait for playback to complete
    return new Promise((resolve) => {
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().then(() => resolve()).catch(() => resolve());
        }
      });
      
      // Fallback timeout
      setTimeout(() => {
        sound.unloadAsync().catch(() => {});
        resolve();
      }, duration * 1000 + 100);
    });
  } catch (error) {
    console.warn('Error playing tone on mobile:', error);
    // Fallback: just wait
    return new Promise((resolve) => setTimeout(resolve, duration * 1000));
  }
}

/**
 * Generate a tone using Web Audio API or expo-av
 */
function generateTone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume: number = 0.3
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      if (typeof window !== 'undefined' && window.AudioContext) {
        // Web platform - use Web Audio API
        const ctx = audioContext || new AudioContext();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.type = type;
        oscillator.frequency.value = frequency;
        gainNode.gain.setValueAtTime(volume, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

        oscillator.onended = () => resolve();

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + duration);
      } else {
        // Mobile platform - generate and play tone using expo-av
        playToneMobile(frequency, duration, volume)
          .then(() => resolve())
          .catch((error) => {
            console.warn('[Audio] Error playing tone on mobile:', error);
            resolve();
          });
      }
    } catch (error) {
      console.warn('Error generating tone:', error);
      resolve();
    }
  });
}

/**
 * Play wind sound (low frequency noise for edge/no path)
 */
export async function playWindSound(): Promise<void> {
  try {
    console.log('[Audio] Playing wind sound');
    /**
    await initAudio();
    // Low frequency noise-like sound - use sawtooth-like effect
    const frequencies = [80, 100, 120];
    const randomFreq = frequencies[Math.floor(Math.random() * frequencies.length)];
    // Play multiple tones to create noise effect
    await generateTone(randomFreq, 0.3, 'sawtooth', 0.25);
    // Add a second tone for texture
    setTimeout(async () => {
      await generateTone(randomFreq * 1.2, 0.2, 'sawtooth', 0.15).catch(() => {});
    }, 50);
    */

    await playAudioFile('wind', windSound, 0.7);
    console.log('[Audio] Wind sound completed');
  } catch (error) {
    console.warn('playWindSound error:', error);
  }
}

/**
 * Play cave sound (echo/reverb effect for valid path direction)
 * This is the sound when you hear in the correct direction (path available)
 */
export async function playCaveSound(): Promise<void> {
  try {
    console.log('[Audio] Playing cave sound (path available)');
    /**
    await initAudio();
    // Faint echo-like sound with multiple tones - higher, clearer than wind
    const baseFreq = 250 + Math.random() * 50; // Random between 250-300Hz
    await generateTone(baseFreq, 0.25, 'sine', 0.2);
    setTimeout(async () => {
      await generateTone(baseFreq * 1.5, 0.2, 'sine', 0.15).catch(() => {});
    }, 60);
    setTimeout(async () => {
      await generateTone(baseFreq * 2, 0.15, 'sine', 0.1).catch(() => {});
    }, 120);
    */
    await playAudioFile('cave', caveSound, 0.7);
    console.log('[Audio] Cave sound completed');
  } catch (error) {
    console.warn('playCaveSound error:', error);
  }
}

/**
 * Play random hearing sound (when using one finger to hear)
 * This plays a subtle sound to indicate the hearing action
 */
export async function playHearSound(): Promise<void> {
  try {
    console.log('[Audio] Playing hear sound');
    await initAudio();
    // Random subtle sound when hearing
    const frequencies = [150, 180, 220, 260];
    const randomFreq = frequencies[Math.floor(Math.random() * frequencies.length)];
    await generateTone(randomFreq, 0.15, 'sine', 0.1);
    console.log('[Audio] Hear sound completed');
  } catch (error) {
    console.warn('playHearSound error:', error);
  }
}

/**
 * Play step sound (short sound for movement)
 */
export async function playStepSound(): Promise<void> {
  try {
    console.log('[Audio] Playing step sound');
    /**
    await initAudio();
    // Short, subtle step sound
    await generateTone(150, 0.1, 'square', 0.2);
    */
    await playAudioFile('step', stepSound, 0.6);
    console.log('[Audio] Step sound completed');
  } catch (error) {
    console.warn('playStepSound error:', error);
  }
}

/**
 * Play death sound (dramatic sound for falling off edge)
 */
export async function playDeathSound(): Promise<void> {
  try {
    console.log('[Audio] Playing falling/death sound');
    await playAudioFile('falling', fallingSound, 0.8);
    console.log('[Audio] Falling sound completed');
  } catch (error) {
    console.warn('playDeathSound error:', error);
  }
}

/**
 * Play win sound (when reaching the end)
 */
export async function playWinSound(): Promise<void> {
  try {
    await initAudio();
    // Ascending triumphant sound
    const frequencies = [200, 300, 400, 500];
    for (let i = 0; i < frequencies.length; i++) {
      setTimeout(async () => {
        await generateTone(frequencies[i], 0.2, 'sine', 0.3).catch(() => {});
      }, i * 100);
    }
  } catch (error) {
    console.warn('playWinSound error:', error);
  }
}

/**
 * Play tick sound (for trap countdown)
 */
export async function playTickSound(): Promise<void> {
  try {
    await initAudio();
    // Short, sharp tick sound
    await generateTone(800, 0.1, 'square', 0.4);
  } catch (error) {
    console.warn('playTickSound error:', error);
  }
}

/**
 * Start or update goblin sound for a specific goblin
 * Creates a looping sound that fades based on distance
 * @param goblinId - Unique ID of the goblin
 * @param volume - Volume based on distance (0.0 to 1.0)
 */
export async function startGoblinSound(goblinId: number, volume: number): Promise<void> {
  try {
    await initAudio();
    
    let sound = goblinSoundInstances.get(goblinId);
    
    // Create new sound instance if it doesn't exist
    if (!sound) {
      const { sound: newSound } = await Audio.Sound.createAsync(
        goblinSound,
        { shouldPlay: false, volume, isLooping: true }
      );
      sound = newSound;
      goblinSoundInstances.set(goblinId, sound);
      
      // Start playing
      await sound.setPositionAsync(0);
      await sound.playAsync();
      console.log(`[Audio] Goblin ${goblinId} sound started (looping)`);
    } else {
      // Check if sound is still playing, restart if needed
      try {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          // Ensure looping is enabled
          if (!status.isLooping) {
            await sound.setIsLoopingAsync(true);
          }
          
          // If sound stopped playing, restart it
          if (!status.isPlaying) {
            await sound.setPositionAsync(0);
            await sound.playAsync();
            console.log(`[Audio] Goblin ${goblinId} sound restarted`);
          }
          
          // Update volume smoothly
          await sound.setVolumeAsync(volume);
        }
      } catch (statusError) {
        // If status check fails, try to restart the sound
        console.warn(`Status check failed for goblin ${goblinId}, restarting sound:`, statusError);
        try {
          await sound.setIsLoopingAsync(true);
          await sound.setPositionAsync(0);
          await sound.setVolumeAsync(volume);
          await sound.playAsync();
        } catch (restartError) {
          console.warn(`Failed to restart goblin ${goblinId} sound:`, restartError);
        }
      }
    }
  } catch (error) {
    console.warn(`startGoblinSound error for goblin ${goblinId}:`, error);
  }
}

/**
 * Stop goblin sound for a specific goblin
 * @param goblinId - Unique ID of the goblin
 */
export async function stopGoblinSound(goblinId: number): Promise<void> {
  try {
    const sound = goblinSoundInstances.get(goblinId);
    if (sound) {
      try {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          await sound.stopAsync();
          await sound.setPositionAsync(0).catch(() => {});
          console.log(`[Audio] Goblin ${goblinId} sound stopped`);
        }
      } catch (statusError) {
        console.warn(`Status check failed for goblin ${goblinId}, attempting to stop anyway:`, statusError);
        await sound.stopAsync().catch(() => {});
        await sound.setPositionAsync(0).catch(() => {});
      }
    }
  } catch (error) {
    console.warn(`stopGoblinSound error for goblin ${goblinId}:`, error);
  }
}

/**
 * Stop all goblin sounds (cleanup)
 */
export async function stopAllGoblinSounds(): Promise<void> {
  try {
    const goblinIds = Array.from(goblinSoundInstances.keys());
    await Promise.all(goblinIds.map(id => stopGoblinSound(id)));
    goblinSoundInstances.clear();
    console.log('[Audio] All goblin sounds stopped');
  } catch (error) {
    console.warn('stopAllGoblinSounds error:', error);
  }
}

/**
 * Play goblin sound using goblin.mp3 (legacy function - kept for compatibility)
 * Volume should be based on distance (0.0 to 1.0)
 * Distance: 2 blocks = quiet (0.2), 1 block = medium (0.6), 0 blocks = loud (1.0)
 */
export async function playGoblinSound(volume: number = 0.5): Promise<void> {
  try {
    await playAudioFile('goblin', goblinSound, volume);
  } catch (error) {
    console.warn('playGoblinSound error:', error);
  }
}

/**
 * Play attack sound (for double tap backstab)
 */
export async function playAttackSound(): Promise<void> {
  try {
    await playAudioFile('attack', attackSound, 0.8);
  } catch (error) {
    console.warn('playAttackSound error:', error);
  }
}

/**
 * Play start sound (when starting a level)
 */
export async function playStartSound(): Promise<void> {
  try {
    await playAudioFile('start', startSound, 0.8);
  } catch (error) {
    console.warn('playStartSound error:', error);
  }
}

/**
 * Play trap sound (looping while player is on trap)
 */
export async function playTrapSound(): Promise<void> {
  try {
    await initAudio();
    
    let sound = soundCache.trap;
    
    // Load sound if not cached
    if (!sound) {
      const { sound: newSound } = await Audio.Sound.createAsync(
        trapSound,
        { shouldPlay: false, volume: 0.7, isLooping: true }
      );
      sound = newSound;
      soundCache.trap = sound;
    } else {
      // Set looping if already cached
      await sound.setIsLoopingAsync(true);
    }
    
    // Reset position and play
    await sound.setPositionAsync(0);
    await sound.setVolumeAsync(0.7);
    await sound.playAsync();
    console.log('[Audio] Trap sound started (looping)');
  } catch (error) {
    console.warn('playTrapSound error:', error);
  }
}

/**
 * Stop trap sound (when player moves off trap)
 */
export async function stopTrapSound(): Promise<void> {
  try {
    const sound = soundCache.trap;
    if (sound) {
      try {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          // Stop the sound regardless of playing state to ensure it stops
          await sound.stopAsync();
          // Reset position for next time
          await sound.setPositionAsync(0).catch(() => {});
          console.log('[Audio] Trap sound stopped');
        }
      } catch (statusError) {
        // If status check fails, try to stop anyway
        console.warn('Status check failed, attempting to stop sound anyway:', statusError);
        await sound.stopAsync().catch(() => {});
        await sound.setPositionAsync(0).catch(() => {});
      }
    }
  } catch (error) {
    console.warn('stopTrapSound error:', error);
  }
}

