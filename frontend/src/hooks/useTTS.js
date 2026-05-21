import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Voice configurations for supported languages
 * Maps language code to preferred voice names across browsers
 */
const VOICE_PREFERENCES = {
  en: ['Google UK English Female', 'Microsoft Zira', 'Samantha', 'Google US English'],
  hi: ['Google हिन्दी', 'Microsoft Hemant', 'Hindi India', 'hi-IN'],
  ta: ['Google தமிழ்', 'Microsoft Valluvar', 'Tamil India', 'ta-IN']
};

/**
 * Custom hook for browser Text-to-Speech using Web Speech API
 * Supports English, Hindi, and Tamil with automatic voice selection
 * Zero latency — runs entirely client-side
 */
export function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const utteranceRef = useRef(null);
  const queueRef = useRef([]);
  const isProcessingRef = useRef(false);

  // Load available voices
  useEffect(() => {
    function loadVoices() {
      const voices = window.speechSynthesis?.getVoices() || [];
      setAvailableVoices(voices);
    }

    loadVoices();

    // Chrome loads voices asynchronously
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  /**
   * Find the best voice for a given language
   */
  const findVoice = useCallback((lang) => {
    if (availableVoices.length === 0) return null;

    const preferences = VOICE_PREFERENCES[lang] || VOICE_PREFERENCES.en;

    // Try to match preferred voices first
    for (const pref of preferences) {
      const voice = availableVoices.find(v =>
        v.name.includes(pref) || v.lang.startsWith(pref)
      );
      if (voice) return voice;
    }

    // Fallback: find any voice matching the language
    const langPrefix = lang === 'en' ? 'en' : lang === 'hi' ? 'hi' : 'ta';
    const fallback = availableVoices.find(v => v.lang.startsWith(langPrefix));
    if (fallback) return fallback;

    // Last resort: default voice
    return availableVoices.find(v => v.default) || availableVoices[0];
  }, [availableVoices]);

  /**
   * Speak text in the specified language
   * @param {string} text - Text to speak
   * @param {string} lang - Language code (en, hi, ta)
   * @param {Object} options - Optional rate, pitch, volume
   */
  const speak = useCallback((text, lang = 'en', options = {}) => {
    if (!window.speechSynthesis || !text) return;

    // Add to queue
    queueRef.current.push({ text, lang, options });

    // Process queue if not already processing
    if (!isProcessingRef.current) {
      processQueue();
    }
  }, [findVoice]);

  /**
   * Process the speech queue sequentially
   */
  function processQueue() {
    if (queueRef.current.length === 0) {
      isProcessingRef.current = false;
      setIsSpeaking(false);
      return;
    }

    isProcessingRef.current = true;
    setIsSpeaking(true);

    const { text, lang, options } = queueRef.current.shift();
    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;

    // Set voice
    const voice = findVoice(lang);
    if (voice) {
      utterance.voice = voice;
      setSelectedVoice(voice);
    }

    // Set language
    const langMap = { en: 'en-US', hi: 'hi-IN', ta: 'ta-IN' };
    utterance.lang = langMap[lang] || 'en-US';

    // Set options with defaults
    utterance.rate = options.rate || 1.0;
    utterance.pitch = options.pitch || 1.0;
    utterance.volume = options.volume || 1.0;

    utterance.onend = () => {
      processQueue();
    };

    utterance.onerror = (event) => {
      if (event.error !== 'canceled') {
        console.error('TTS error:', event.error);
      }
      processQueue();
    };

    window.speechSynthesis.speak(utterance);
  }

  /**
   * Stop speaking immediately (barge-in support)
   */
  const stop = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    queueRef.current = [];
    isProcessingRef.current = false;
    setIsSpeaking(false);
  }, []);

  /**
   * Check if TTS is supported
   */
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  return {
    speak,
    stop,
    isSpeaking,
    isSupported,
    availableVoices,
    selectedVoice
  };
}
