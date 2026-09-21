import { apiClient } from './client';

export interface VoiceNote {
  id: string;
  match_id: string;
  round_number: number | null;
  title: string;
  duration_seconds: number;
  created_at: string;
  author: string | null;
}

export interface DrawingStroke {
  tool: 'pen' | 'arrow';
  color: string;
  width: number;
  points: [number, number][];
}

export interface CoachDrawing {
  id: string;
  match_id: string;
  name: string;
  map_name: string;
  data: DrawingStroke[];
  created_at: string;
  updated_at: string;
  author: string | null;
}

export async function uploadVoiceNote(
  matchId: string,
  blob: Blob,
  opts: { title: string; roundNumber?: number | null; durationSeconds: number },
): Promise<VoiceNote> {
  const form = new FormData();
  form.append('file', blob, 'note.webm');
  form.append('title', opts.title);
  if (opts.roundNumber != null) form.append('round_number', String(opts.roundNumber));
  form.append('duration_seconds', String(opts.durationSeconds));
  const { data } = await apiClient.post<VoiceNote>(`/coach/matches/${matchId}/notes`, form);
  return data;
}

export async function getVoiceNotes(matchId: string): Promise<VoiceNote[]> {
  const { data } = await apiClient.get<VoiceNote[]>(`/coach/matches/${matchId}/notes`);
  return data;
}

export function voiceNoteAudioUrl(noteId: string): string {
  return `${apiClient.defaults.baseURL}/coach/notes/${noteId}/audio`;
}

export async function deleteVoiceNote(noteId: string): Promise<void> {
  await apiClient.delete(`/coach/notes/${noteId}`);
}

export async function saveDrawing(
  matchId: string,
  payload: { name: string; map_name: string; data: DrawingStroke[] },
): Promise<CoachDrawing> {
  const { data } = await apiClient.post<CoachDrawing>(
    `/coach/matches/${matchId}/drawings`,
    payload,
  );
  return data;
}

export async function getDrawings(matchId: string): Promise<CoachDrawing[]> {
  const { data } = await apiClient.get<CoachDrawing[]>(`/coach/matches/${matchId}/drawings`);
  return data;
}

export async function deleteDrawing(drawingId: string): Promise<void> {
  await apiClient.delete(`/coach/drawings/${drawingId}`);
}
