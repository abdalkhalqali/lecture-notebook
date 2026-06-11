import AsyncStorage from '@react-native-async-storage/async-storage';

export interface University {
  id: string;
  name: string;
  createdAt: number;
}

export interface Year {
  id: string;
  universityId: string;
  name: string;
  createdAt: number;
}

export interface Subject {
  id: string;
  yearId: string;
  name: string;
  color: string;
  icon: string;
  createdAt: number;
}

export interface LectureAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uri: string;
  textContent?: string;
  createdAt: number;
}

export interface Lecture {
  id: string;
  subjectId: string;
  title: string;
  date: number;
  audioUri?: string;
  audioDuration?: number;
  videoUri?: string;
  imageUris?: string[];
  attachments?: LectureAttachment[];
  transcript?: string;
  summary?: string;
  keyPoints?: string[];
  tags?: string[];
  questions?: QuestionAnswer[];
  pages: LecturePage[];
  createdAt: number;
  updatedAt: number;
}

export interface QuestionAnswer {
  question: string;
  answer: string;
}

export type PageTemplate =
  | 'blank' | 'grid' | 'cornell' | 'math' | 'lined' | 'timeline'
  | 'dotted' | 'isometric' | 'music' | 'bullet' | 'weekly' | 'hexagonal';
export type ShapeType = 'rect' | 'circle' | 'triangle' | 'arrow' | 'line';

export interface LecturePage {
  id: string;
  type: PageTemplate;
  strokes: Stroke[];
  textBoxes: TextBox[];
  shapes: CanvasShape[];
  createdAt: number;
}

export interface Stroke {
  id: string;
  points: number[];
  color: string;
  width: number;
  tool: 'pen' | 'pencil' | 'highlighter' | 'eraser';
}

export interface TextBox {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
}

export interface CanvasShape {
  id: string;
  type: ShapeType;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
  filled: boolean;
}

function uid(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

const KEYS = {
  universities: 'nb:universities',
  years: 'nb:years',
  subjects: 'nb:subjects',
  lectures: 'nb:lectures',
};

async function getList<T>(key: string): Promise<T[]> {
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) : [];
}

async function setList<T>(key: string, items: T[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(items));
}

// ── Universities ──────────────────────────────────────────
export async function getUniversities(): Promise<University[]> {
  return getList<University>(KEYS.universities);
}

export async function createUniversity(name: string): Promise<University> {
  const item: University = { id: uid(), name, createdAt: Date.now() };
  const list = await getUniversities();
  await setList(KEYS.universities, [...list, item]);
  return item;
}

export async function deleteUniversity(id: string): Promise<void> {
  const list = await getUniversities();
  await setList(KEYS.universities, list.filter(u => u.id !== id));
  const years = await getYears(id);
  for (const y of years) await deleteYear(y.id);
}

// ── Years ─────────────────────────────────────────────────
export async function getYears(universityId?: string): Promise<Year[]> {
  const list = await getList<Year>(KEYS.years);
  return universityId ? list.filter(y => y.universityId === universityId) : list;
}

export async function createYear(universityId: string, name: string): Promise<Year> {
  const item: Year = { id: uid(), universityId, name, createdAt: Date.now() };
  const list = await getList<Year>(KEYS.years);
  await setList(KEYS.years, [...list, item]);
  return item;
}

export async function deleteYear(id: string): Promise<void> {
  const list = await getList<Year>(KEYS.years);
  await setList(KEYS.years, list.filter(y => y.id !== id));
  const subjects = await getSubjects(id);
  for (const s of subjects) await deleteSubject(s.id);
}

// ── Subjects ──────────────────────────────────────────────
export async function getSubjects(yearId?: string): Promise<Subject[]> {
  const list = await getList<Subject>(KEYS.subjects);
  return yearId ? list.filter(s => s.yearId === yearId) : list;
}

export async function createSubject(yearId: string, name: string, color: string, icon: string): Promise<Subject> {
  const item: Subject = { id: uid(), yearId, name, color, icon, createdAt: Date.now() };
  const list = await getList<Subject>(KEYS.subjects);
  await setList(KEYS.subjects, [...list, item]);
  return item;
}

export async function deleteSubject(id: string): Promise<void> {
  const list = await getList<Subject>(KEYS.subjects);
  await setList(KEYS.subjects, list.filter(s => s.id !== id));
  const lectures = await getLectures(id);
  for (const l of lectures) await deleteLecture(l.id);
}

// ── Lectures ──────────────────────────────────────────────
export async function getLectures(subjectId?: string): Promise<Lecture[]> {
  const list = await getList<Lecture>(KEYS.lectures);
  const filtered = subjectId ? list.filter(l => l.subjectId === subjectId) : list;
  return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getLecture(id: string): Promise<Lecture | null> {
  const list = await getLectures();
  return list.find(l => l.id === id) ?? null;
}

export async function createLecture(subjectId: string, title: string): Promise<Lecture> {
  const now = Date.now();
  const defaultPage: LecturePage = {
    id: uid(),
    type: 'blank',
    strokes: [],
    textBoxes: [],
    shapes: [],
    createdAt: now,
  };
  const item: Lecture = {
    id: uid(),
    subjectId,
    title,
    date: now,
    imageUris: [],
    pages: [defaultPage],
    createdAt: now,
    updatedAt: now,
  };
  const list = await getList<Lecture>(KEYS.lectures);
  await setList(KEYS.lectures, [...list, item]);
  return item;
}

export async function updateLecture(id: string, updates: Partial<Lecture>): Promise<void> {
  const list = await getList<Lecture>(KEYS.lectures);
  const idx = list.findIndex(l => l.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...updates, updatedAt: Date.now() };
  await setList(KEYS.lectures, list);
}

export async function deleteLecture(id: string): Promise<void> {
  const list = await getList<Lecture>(KEYS.lectures);
  await setList(KEYS.lectures, list.filter(l => l.id !== id));
}

export async function searchLectures(query: string): Promise<Lecture[]> {
  const list = await getLectures();
  const q = query.toLowerCase();
  return list.filter(l =>
    l.title.toLowerCase().includes(q) ||
    l.transcript?.toLowerCase().includes(q) ||
    l.summary?.toLowerCase().includes(q) ||
    l.tags?.some(t => t.toLowerCase().includes(q))
  );
}
