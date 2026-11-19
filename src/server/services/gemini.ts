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

export const FAIR_USE_LIMIT_PER_HOUR = 40;

export interface FairUseStats {
  used: number;
  limit: number;
  remaining: number;
}

export async function getAiFairUseStats(userId: number): Promise<FairUseStats> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const rows = await runQuery('ai.fairUseCount', () =>
    db
      .select({ total: count() })
      .from(aiUsageEvents)
      .where(and(eq(aiUsageEvents.userId, userId), gte(aiUsageEvents.createdAt, oneHourAgo)))
  );
  const used = Number(rows[0]?.total ?? 0);
  return {
    used,
    limit: FAIR_USE_LIMIT_PER_HOUR,
    remaining: Math.max(0, FAIR_USE_LIMIT_PER_HOUR - used),
  };
}

export async function enforceAiFairUse(userId: number, feature: string): Promise<FairUseStats> {
  const stats = await getAiFairUseStats(userId);
  if (stats.used >= FAIR_USE_LIMIT_PER_HOUR) {
    const err = new Error(
      'Fair-use hourly rate limit reached for AI tools. Please try again shortly.'
    ) as Error & { status?: number };
    err.status = 429;
    throw err;
  }

  await runQuery('ai.fairUseLog', () =>
    db.insert(aiUsageEvents).values({ userId, feature })
  );

  return {
    used: stats.used + 1,
    limit: FAIR_USE_LIMIT_PER_HOUR,
    remaining: Math.max(0, FAIR_USE_LIMIT_PER_HOUR - (stats.used + 1)),
  };
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


export async function draftJobDescriptionWithGemini(params: {
  title: string;
  department: string;
  location: string;
  country: string;
  employmentType: string;
  experienceLevel: string;
  notes?: string;
}) {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Draft an inclusive, structured job vacancy for a company hiring in ${params.location}, ${params.country}.
Role Title: ${params.title}
Department: ${params.department}
Employment Type: ${params.employmentType}
Experience Level: ${params.experienceLevel}
Additional Hiring Context: ${params.notes || 'Standard role scope'}

Return clear, non-discriminatory role responsibilities and objective skill/experience requirements ready for recruiter review.`,
    config: {
      systemInstruction:
        'You are an HR recruitment specialist. Write clear, objective job descriptions and requirements without biased or exclusionary language.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING, description: 'Role overview and key responsibilities.' },
          requirements: {
            type: Type.STRING,
            description: 'Objective qualifications, technical skills, and experience criteria.',
          },
        },
        required: ['description', 'requirements'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim());
  return {
    description: String(parsed.description ?? ''),
    requirements: String(parsed.requirements ?? ''),
  };
}

export async function explainCandidateMatchWithGemini(params: {
  jobTitle: string;
  jobDescription: string;
  jobRequirements: string;
  candidateHeadline: string;
  candidateSkills: string[];
  cvText: string;
}) {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Provide an advisory, explainable skills and experience comparison between this role and candidate profile/CV.
Do NOT make hiring decisions, reject candidates, or reference protected characteristics.

Role Title: ${params.jobTitle}
Role Description: ${params.jobDescription}
Role Requirements: ${params.jobRequirements || 'Not specified'}

Candidate Headline: ${params.candidateHeadline}
Listed Skills: ${params.candidateSkills.join(', ') || 'None listed'}
Submitted CV Extract:
${params.cvText.slice(0, 6000) || 'No CV text attached'}`,
    config: {
      systemInstruction:
        'You provide transparent, advisory skill-gap explanations for human recruiters. Focus strictly on job-relevant skills, experience evidence, and interview follow-up topics.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          matchSummary: { type: Type.STRING },
          matchedSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
          missingEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
          interviewFocusAreas: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['matchSummary', 'matchedSkills', 'missingEvidence', 'interviewFocusAreas'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim());
  return {
    matchSummary: String(parsed.matchSummary ?? ''),
    matchedSkills: Array.isArray(parsed.matchedSkills) ? parsed.matchedSkills.map(String) : [],
    missingEvidence: Array.isArray(parsed.missingEvidence)
      ? parsed.missingEvidence.map(String)
      : [],
    interviewFocusAreas: Array.isArray(parsed.interviewFocusAreas)
      ? parsed.interviewFocusAreas.map(String)
      : [],
  };
}
