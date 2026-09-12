import { Platform } from 'react-native';

const defaultUrl = 'https://voicepad-transcription.onrender.com';

const TRANSCRIPTION_API_URL =
  process.env.EXPO_PUBLIC_TRANSCRIPTION_API_URL?.trim() || defaultUrl;

export type SummaryResult = {
  summary: string;
  model?: string;
};

/**
 * Sends a transcript to the backend proxy to generate an AI Executive Summary,
 * Key Takeaways, and Action Items via Groq Llama 3.3.
 */
export async function generateAISummary(transcript: string): Promise<SummaryResult> {
  const clean = transcript?.trim();
  if (!clean) {
    throw new Error('Transcript text is empty.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(`${TRANSCRIPTION_API_URL}/summarize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('AI summary generation timed out. Please retry.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export type OCRResult = {
  text: string;
  title: string;
  model?: string;
};

/**
 * Sends a captured or picked image to the backend OCR vision endpoint
 * to extract and transcribe text via Groq Llama 3.2 Vision.
 */
export async function transcribeImage(base64Image: string, mimeType = 'image/jpeg'): Promise<OCRResult> {
  const clean = base64Image?.trim();
  if (!clean) throw new Error('Image data is empty.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(`${TRANSCRIPTION_API_URL}/ocr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
      throw new Error('No text could be extracted from the image.');
    }

    return {
      text: payload.text.trim(),
      title: payload.title || 'Photo Note',
      model: payload.model,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Image transcription timed out. Please retry.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

