/**
 * VoiceButton - botao de voz com Web Speech API.
 *
 * STT (speech-to-text) via window.SpeechRecognition.
 * Idiomas suportados: pt-BR (default), en-US, es-ES.
 *
 * Requer HTTPS ou localhost para funcionar (CORS em navegadores).
 */

import { useEffect, useRef, useState } from 'react';

// Tipos do Web Speech API (nao vem por padrao no TS)
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface VoiceButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  lang?: string;
}

export function VoiceButton({ onTranscript, disabled, lang = 'pt-BR' }: VoiceButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  function startRecording() {
    setError(null);
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Seu navegador nao suporta Web Speech API. Use Chrome/Edge.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = (event: any) => {
      setIsRecording(false);
      setError(`Erro no reconhecimento: ${event.error}`);
    };

    let finalTranscript = '';
    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interim += transcript;
        }
      }
      if (finalTranscript) {
        onTranscript(finalTranscript.trim());
        try {
          recognition.stop();
        } catch {
          // ignore
        }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      setError(`Falha ao iniciar gravacao: ${(err as Error).message}`);
      setIsRecording(false);
    }
  }

  function stopRecording() {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
  }

  function handleClick() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  return (
    <>
      <button
        className={`voice-btn ${isRecording ? 'recording' : ''}`}
        onClick={handleClick}
        disabled={disabled}
        title={isRecording ? 'Parar gravacao' : 'Falar (voz)'}
        type="button"
      >
        {isRecording ? '⏹' : '🎤'}
      </button>
      {error && (
        <div className="voice-error" style={{ position: 'absolute', bottom: 70, color: 'var(--danger)', fontSize: 12, padding: 8 }}>
          {error}
        </div>
      )}
    </>
  );
}
