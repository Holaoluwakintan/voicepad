import { TRANSCRIPTION_API_URL, toFriendlyErrorMessage } from '@/lib/utils';
import { getAuthHeaders } from '@/lib/supabase';

export type SummaryResult = {
  summary: string;
  model?: string;
};

/**
 * Sends a transcript to the backend proxy to generate an AI Executive Summary,
 * Key Takeaways, and Action Items.
 */
export async function generateAISummary(transcript: string): Promise<SummaryResult> {
  const clean = transcript?.trim();
  if (!clean) {
    throw new Error('Transcript text is empty.');
  }

  const attempt = async () => {
    const authHeaders = await getAuthHeaders();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
      const response = await fetch(`${TRANSCRIPTION_API_URL}/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ text: clean }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || `Summary request failed (${response.status})`);
      }

      if (!payload?.summary || typeof payload.summary !== 'string') {
        throw new Error('AI returned an empty summary.');
      }

      return {
        summary: payload.summary.trim(),
        model: payload.model,
      };
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    return await attempt();
  } catch (firstErr) {
    const raw = String(firstErr);
    if (raw.includes('AbortError') || raw.includes('timed out') || raw.includes('502') || raw.includes('503')) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        return await attempt();
      } catch (secondErr) {
        throw new Error(toFriendlyErrorMessage(secondErr, 'Unable to generate AI summary at this time. Please retry shortly.'));
      }
    }
    throw new Error(toFriendlyErrorMessage(firstErr, 'Unable to generate AI summary. Please retry.'));
  }
}

export type OCRResult = {
  text: string;
  title: string;
  model?: string;
};

/**
 * Sends a captured or picked image to the backend OCR vision endpoint
 * to extract and transcribe text via Groq Vision models.
 */
export async function transcribeImage(base64Image: string, mimeType = 'image/jpeg'): Promise<OCRResult> {
  const clean = base64Image?.trim();
  if (!clean) throw new Error('Image data is empty.');

  const attempt = async () => {
    const authHeaders = await getAuthHeaders();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
      const response = await fetch(`${TRANSCRIPTION_API_URL}/ocr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          image: clean.startsWith('data:') ? clean : `data:${mimeType};base64,${clean}`,
        }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `Image transcription failed (${response.status})`);
      }

      if (!payload?.text || typeof payload.text !== 'string') {
        throw new Error('No readable text could be detected in this photo.');
      }

      return {
        text: payload.text.trim(),
        title: payload.title || 'Photo Note',
        model: payload.model,
      };
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    return await attempt();
  } catch (firstErr) {
    const raw = String(firstErr);
    if (raw.includes('AbortError') || raw.includes('timed out') || raw.includes('502') || raw.includes('503')) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        return await attempt();
      } catch (secondErr) {
        throw new Error(toFriendlyErrorMessage(secondErr, 'Image transcription timed out. The server is waking up; please retry.'));
      }
    }
    throw new Error(toFriendlyErrorMessage(firstErr, 'Could not read text from image. Please ensure the image is clear and retry.'));
  }
}


