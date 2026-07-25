'use client';

import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';

interface LegalDisclaimerProps {
  type: 'recording_consent' | 'accuracy' | 'data_processing' | 'liability';
  dismissible?: boolean;
}

const disclaimers: Record<string, { title: string; message: string; severity: 'warning' | 'info' }> = {
  recording_consent: {
    title: '⚠️ Consentimiento de Grabación Requerido',
    message:
      'Eres responsable legal de obtener consentimiento informado de TODOS los participantes antes de grabar. Las leyes de grabación varían por país/estado. No informar a los participantes puede ser un delito.',
    severity: 'warning',
  },
  accuracy: {
    title: 'ℹ️ Precisión de Transcripciones',
    message:
      'Las transcripciones generadas por IA pueden contener errores, especialmente con acentos, jerga técnica o audio de baja calidad. Revisa siempre el contenido de la minuta antes de compartirlo.',
    severity: 'info',
  },
  data_processing: {
    title: 'ℹ️ Procesamiento de Datos',
    message:
      'Tu audio se procesa en servidores de Groq, Gemini y Supabase para transcripción y análisis. Ver Política de Privacidad para detalles sobre retención y seguridad.',
    severity: 'info',
  },
  liability: {
    title: '⚠️ Limitación de Responsabilidad',
    message:
      'ZRNote es un servicio free-tier sin garantía de disponibilidad 24/7 o precisión en los resultados. El usuario es responsable de mantener copias de seguridad de datos críticos.',
    severity: 'warning',
  },
};

export default function LegalDisclaimer({ type, dismissible = true }: LegalDisclaimerProps) {
  const [dismissed, setDismissed] = useState(false);
  const disclaimer = disclaimers[type];

  if (dismissed) return null;

  const isWarning = disclaimer.severity === 'warning';
  const bgColor = isWarning
    ? 'bg-red-50 dark:bg-red-900/20'
    : 'bg-blue-50 dark:bg-blue-900/20';
  const borderColor = isWarning
    ? 'border-red-200 dark:border-red-800'
    : 'border-blue-200 dark:border-blue-800';
  const textColor = isWarning
    ? 'text-red-800 dark:text-red-200'
    : 'text-blue-800 dark:text-blue-200';
  const iconColor = isWarning ? 'text-red-600' : 'text-blue-600';

  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg p-4 mb-4`}>
      <div className="flex gap-3">
        <AlertTriangle className={`w-5 h-5 ${iconColor} flex-shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <h3 className={`font-semibold ${textColor} mb-1`}>
            {disclaimer.title}
          </h3>
          <p className={`text-sm ${textColor}`}>
            {disclaimer.message}
          </p>
        </div>
        {dismissible && (
          <button
            onClick={() => setDismissed(true)}
            className={`${textColor} hover:opacity-70 transition-opacity flex-shrink-0`}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
