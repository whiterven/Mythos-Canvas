export interface StoryConfig {
  corePremise: string;
  genre: string;
  tone: string;
  narrativeStyle: string;
  targetAudience: string;
  lengthStructure: string;
  chapterCount: string;
  keyElements: string;
  complexity: string;
  endingType: string;
  constraints: string;
  existingContent?: string;
}

export interface QuestionOption {
  label: string;
  value: string;
}

export enum AppView {
  WIZARD = 'WIZARD',
  STORY_RESULT = 'STORY_RESULT',
  IMAGE_STUDIO = 'IMAGE_STUDIO',
  DASHBOARD = 'DASHBOARD',
  HISTORY = 'HISTORY',
  CHAT = 'CHAT'
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  title: string;
  excerpt: string;
  content: string;
  config: StoryConfig;
}

export interface PageData {
  content: string;
  chapterTitle: string;
  pageNumber: number;
}