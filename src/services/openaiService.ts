import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import { supabaseLogger } from '../lib/supabase';
import { ChatCompletionMessageParam } from 'openai/resources/chat';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const openaiApiKey = process.env.OPENAI_API_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);
export const openai = new OpenAI({
  apiKey: openaiApiKey,
  dangerouslyAllowBrowser: true
});

// 학습 도우미 응답 타입
export interface LearningAssistantResponse {
  content: string;
  suggestions?: string[];
  resources?: string[];
}

/**
 * 학습 도우미에게 질문하기
 * @param question 사용자 질문
 * @param context 학습 컨텍스트 (선택사항)
 * @returns 도우미의 응답
 */
export const askLearningAssistant = async (
  question: string,
  context?: string
): Promise<LearningAssistantResponse> => {
  try {
    supabaseLogger.log('학습 도우미 질문 시작', { question, context });

    const messages = [
      {
        role: 'system' as const,
        content: `당신은 LEARNING CREW.AI의 AI 학습 도우미입니다. 
        사용자의 학습을 돕고, 질문에 답변하며, 학습 방향을 제시합니다.
        항상 친절하고 전문적으로 답변해주세요.
        ${context ? `현재 학습 컨텍스트: ${context}` : ''}`
      },
      {
        role: 'user' as const,
        content: question
      }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    const response = completion.choices[0].message.content;
    
    supabaseLogger.log('학습 도우미 응답 완료', { response });
    
    return {
      content: response || '죄송합니다. 응답을 생성할 수 없습니다.',
      suggestions: extractSuggestions(response),
      resources: extractResources(response)
    };
  } catch (error) {
    supabaseLogger.error('학습 도우미 응답 생성 중 오류 발생', error);
    throw error;
  }
};

/**
 * 학습 진도 분석 및 추천
 * @param learningHistory 학습 이력
 * @returns 학습 추천사항
 */
export const analyzeLearningProgress = async (learningHistory: {
  completedTopics: string[];
  currentTopic: string;
  timeSpent: number;
  quizScores: number[];
}): Promise<LearningAssistantResponse> => {
  try {
    supabaseLogger.log('학습 진도 분석 시작', { learningHistory });

    const prompt = `
      다음 학습 이력을 바탕으로 학습 진도를 분석하고 추천사항을 제시해주세요:
      
      완료한 주제: ${learningHistory.completedTopics.join(', ')}
      현재 학습 중인 주제: ${learningHistory.currentTopic}
      학습 시간: ${learningHistory.timeSpent}시간
      퀴즈 점수: ${learningHistory.quizScores.join(', ')}
      
      다음을 포함해주세요:
      1. 현재 학습 진도 평가
      2. 개선이 필요한 부분
      3. 다음 학습 추천 주제
      4. 학습 방법 제안
    `;

    const messages = [
      {
        role: 'system' as const,
        content: '당신은 학습 진도를 분석하고 맞춤형 추천을 제공하는 AI 학습 도우미입니다.'
      },
      {
        role: 'user' as const,
        content: prompt
      }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    const response = completion.choices[0].message.content;
    
    supabaseLogger.log('학습 진도 분석 완료', { response });
    
    return {
      content: response || '죄송합니다. 분석을 완료할 수 없습니다.',
      suggestions: extractSuggestions(response),
      resources: extractResources(response)
    };
  } catch (error) {
    supabaseLogger.error('학습 진도 분석 중 오류 발생', error);
    throw error;
  }
};

/**
 * 학습 자료 요약
 * @param content 학습 자료 내용
 * @returns 요약된 내용
 */
export const summarizeLearningContent = async (content: string): Promise<LearningAssistantResponse> => {
  try {
    supabaseLogger.log('학습 자료 요약 시작', { contentLength: content.length });

    const messages = [
      {
        role: 'system' as const,
        content: '당신은 학습 자료를 효과적으로 요약하는 AI 학습 도우미입니다.'
      },
      {
        role: 'user' as const,
        content: `다음 학습 자료를 요약해주세요:\n\n${content}`
      }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    const response = completion.choices[0].message.content;
    
    supabaseLogger.log('학습 자료 요약 완료', { response });
    
    return {
      content: response || '죄송합니다. 요약을 생성할 수 없습니다.',
      suggestions: extractSuggestions(response),
      resources: extractResources(response)
    };
  } catch (error) {
    supabaseLogger.error('학습 자료 요약 중 오류 발생', error);
    throw error;
  }
};

// 응답에서 추천사항 추출
const extractSuggestions = (response: string | null): string[] => {
  if (!response) return [];
  
  const suggestions: string[] = [];
  const suggestionRegex = /(?:추천|제안|권장|제안사항):\s*([^.!?]+)/g;
  let match;
  
  while ((match = suggestionRegex.exec(response)) !== null) {
    suggestions.push(match[1].trim());
  }
  
  return suggestions;
};

// 응답에서 학습 자료 추출
const extractResources = (response: string | null): string[] => {
  if (!response) return [];
  
  const resources: string[] = [];
  const resourceRegex = /(?:자료|리소스|참고|추천 자료):\s*([^.!?]+)/g;
  let match;
  
  while ((match = resourceRegex.exec(response)) !== null) {
    resources.push(match[1].trim());
  }
  
  return resources;
};

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export const generateResponse = async (messages: Message[]) => {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      temperature: 0.7,
      max_tokens: 1000
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Error generating response:', error);
    throw error;
  }
};

export const saveConversation = async (userId: string, messages: Message[]) => {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .insert([
        {
          user_id: userId,
          messages: messages,
          created_at: new Date().toISOString()
        }
      ]);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error saving conversation:', error);
    throw error;
  }
};

export const getConversations = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting conversations:', error);
    throw error;
  }
}; 