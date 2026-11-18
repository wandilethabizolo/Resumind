import { GoogleGenAI, Type } from '@google/genai';
import { and, count, eq, gte } from 'drizzle-orm';
import { db, runQuery } from '../../db/index.ts';
import { aiUsageEvents } from '../../db/schema.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const FAIR_USE_LIMIT_PER_HOUR = 40;

export async function enforceAiFairUse(userId: number, feature: string): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const rows = await runQuery('ai.fairUseCount', () =>
    db
      .select({ total: count() })
      .from(aiUsageEvents)
      .where(and(eq(aiUsageEvents.userId, userId), gte(aiUsageEvents.createdAt, oneHourAgo)))
  );
  const used = Number(rows[0]?.total ?? 0);
  if (used >= FAIR_USE_LIMIT_PER_HOUR) {
    const err = new Error(
      'Fair-use hourly rate limit reached for Career Studio AI tools. Please try again shortly.'
    ) as Error & { status?: number };
    err.status = 429;
    throw err;
  }

  await runQuery('ai.fairUseLog', () =>
    db.insert(aiUsageEvents).values({ userId, feature })
  );
}

export async function analyzeCvWithGemini(params: {
  cvText: string;
  targetJobTitle?: string;
  jobDescription?: string;
}) {
  const ai = getAiClient();
  const prompt = [
    'Analyze the following CV/resume for clarity, measurable impact, structure, and role fit.',
    params.targetJobTitle ? `Target Role: ${params.targetJobTitle}` : '',
    params.jobDescription ? `Job Description:\n${params.jobDescription}` : '',
    `CV Content:\n${params.cvText}`,
    'Return structured, honest, constructive career feedback. Frame recommendations as practical assistance rather than guaranteed job outcomes.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'You are a senior career strategist advising professionals in Eswatini, Southern Africa, and global markets. Be specific, constructive, and practical.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING, description: 'Concise executive assessment of the CV.' },
          strengths: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Key strengths observed in the CV.',
          },
          weaknesses: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Gaps, missing metrics, or clarity issues.',
          },
          recommendations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Actionable steps to improve the CV.',
          },
          tailoredBullets: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Suggested rewritten accomplishment bullet points.',
          },
          matchNotes: {
            type: Type.STRING,
            description: 'Notes on alignment with the target role or job description.',
          },
        },
        required: [
          'summary',
          'strengths',
          'weaknesses',
          'recommendations',
          'tailoredBullets',
          'matchNotes',
        ],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim());
  return {
    summary: String(parsed.summary ?? ''),
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
    weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map(String) : [],
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.map(String)
      : [],
    tailoredBullets: Array.isArray(parsed.tailoredBullets)
      ? parsed.tailoredBullets.map(String)
      : [],
    matchNotes: String(parsed.matchNotes ?? ''),
  };
}

export async function generateCoverLetterWithGemini(params: {
  candidateName: string;
  headline: string;
  cvSummary: string;
  targetRole: string;
  companyName: string;
  jobDescription?: string;
  tone?: string;
}) {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Write a tailored, authentic cover letter for ${params.candidateName} (${params.headline}) applying for "${params.targetRole}" at "${params.companyName}".
Tone: ${params.tone || 'Professional and concise'}.
Candidate background:\n${params.cvSummary}
${params.jobDescription ? `Job details:\n${params.jobDescription}` : ''}
Avoid clichés and unsupported claims. Keep it 3–4 focused paragraphs ready for editing.`,
    config: {
      systemInstruction:
        'You are an expert career writer. Produce clear, human-sounding cover letters tailored to the candidate and organization.',
    },
  });

  return (response.text ?? '').trim();
}

export async function generateInterviewQuestionsWithGemini(params: {
  targetRole: string;
  experienceLevel: string;
  background?: string;
}) {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Generate 5 realistic interview questions for a ${params.experienceLevel} level "${params.targetRole}" candidate.
${params.background ? `Candidate background:\n${params.background}` : ''}
Mix behavioral, technical/domain, and problem-solving questions.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            category: { type: Type.STRING },
            question: { type: Type.STRING },
          },
          required: ['id', 'category', 'question'],
        },
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '[]').trim());
  return Array.isArray(parsed)
    ? parsed.map((q, idx) => ({
        id: String(q.id || `q-${idx + 1}`),
        category: String(q.category || 'General'),
        question: String(q.question || ''),
      }))
    : [];
}

export async function evaluateInterviewAnswerWithGemini(params: {
  targetRole: string;
  question: string;
  answer: string;
}) {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Role: ${params.targetRole}
Interview Question: ${params.question}
Candidate Answer: ${params.answer}

Evaluate clarity, structure (such as STAR), specificity, and relevance. Provide constructive feedback and 2-3 specific improvement suggestions.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          evaluation: { type: Type.STRING },
          improvements: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ['evaluation', 'improvements'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim());
  return {
    evaluation: String(parsed.evaluation ?? ''),
    improvements: Array.isArray(parsed.improvements)
      ? parsed.improvements.map(String)
      : [],
  };
}

export async function generateCareerGuidanceWithGemini(params: {
  currentRole: string;
  skills: string[];
  goals: string;
  location: string;
}) {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Provide practical career development guidance for a professional based in ${params.location}.
Current position/focus: ${params.currentRole}
Current skills: ${params.skills.join(', ') || 'Not specified'}
Career goal: ${params.goals}

Include:
1. High-value adjacent skills to develop
2. Recommended learning pathways & certifications
3. Practical networking & portfolio actions tailored to Eswatini, SADC, and remote international markets.`,
    config: {
      systemInstruction:
        'You are a pragmatic career advisor. Provide realistic, actionable guidance as assistance for user review.',
    },
  });

  return (response.text ?? '').trim();
}

export async function generateDocumentWithGemini(params: {
  docType: string;
  title: string;
  context: string;
}) {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Draft a polished professional ${params.docType} titled "${params.title}".
Context and key points:
${params.context}
Return clean, well-structured prose ready for editing and export.`,
  });

  return (response.text ?? '').trim();
}
