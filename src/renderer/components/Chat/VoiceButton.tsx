/**
 * VoiceButton - botao de voz.
 *
 * v1: Web Speech API (SpeechRecognition) NAO funciona de forma confiavel
 * no Electron sem servicos online (Chromium usa o servico Google STT).
 *
 * Quando rodar em browser (PWA futuro) ou em build com STT local
 * (Whisper.cpp / OpenAI Whisper), reativamos. Por enquanto, mostra
 * mensagem clara e desabilita.
 */

import { useState } from 'react';

interface VoiceButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  lang?: string;
}

export function VoiceButton({ disabled, lang = 'pt-BR' }: VoiceButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);

  function handleClick() {
    // Detecta se Web Speech esta disponivel (so funciona em browser real)
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError(`Reconhecimento de voz indisponivel nesta build do Electron. Idiomas: ${lang}. Use o teclado.`);
      setShowHint(true);
      setTimeout(() => setShowHint(false), 4000);
      return;
    }

    // Se um dia for ativado, o codigo abaixo executa
    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onerror = (event: any) => {
      setError(`Erro no reconhecimento: ${event.error}`);
    };
    // ... nunca chega aqui em Electron, mas mantido para futuro
  }

  return (
    <>
      <button
        className="voice-btn"
        onClick={handleClick}
        disabled={disabled}
        title="Voz (em breve)"
        type="button"
      >
        🎤
      </button>
      {(error || showHint) && (
        <div
          className="voice-hint"
          style={{
            position: 'absolute',
            bottom: 70,
            left: 16,
            right: 16,
            color: 'var(--text-muted)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
            padding: 10,
            zIndex: 100,
          }}
        >
          {error || '🎤 Entrada de voz chega na v1.1 (Whisper local ou API).'}
        </div>
      )}
    </>
  );
}
