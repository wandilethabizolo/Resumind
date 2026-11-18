import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import multer from 'multer';
import { z } from 'zod';
import { db, runQuery } from '../../db/index.ts';
import {
  aiDocuments,
  aiInterviewSessions,
  cvAnalyses,
  cvDocuments,
  cvVersions,
  profiles,
} from '../../db/schema.ts';
import { AuthRequest, requireAuth } from '../middleware/auth.ts';
import {
  analyzeCvWithGemini,
  enforceAiFairUse,
  evaluateInterviewAnswerWithGemini,
  generateCareerGuidanceWithGemini,
  generateCoverLetterWithGemini,
  generateDocumentWithGemini,
  generateInterviewQuestionsWithGemini,
} from '../services/gemini.ts';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB strict limit
});

function extractTextFromBuffer(buf: Buffer, mimeType: string, fileName: string): string {
  const lower = fileName.toLowerCase();
  // Magic byte checks for PDF (%PDF-) and ZIP/DOCX (PK)
  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) {
    if (buf.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('Invalid PDF file signature');
    }
    // Extract readable ASCII/UTF-8 text strings from PDF streams safely
    const raw = buf.toString('latin1');
    const chunks = raw.match(/\(([^()\\]{3,200})\)/g) || [];
    const text = chunks
      .map((c) => c.slice(1, -1).replace(/[^\x20-\x7E\n]/g, ' '))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 30000) || `Uploaded PDF CV: ${fileName}`;
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) {
    if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
      throw new Error('Invalid DOCX archive signature');
    }
    const raw = buf.toString('utf8');
    const stripped = raw
      .replace(/<[^>]+>/g, ' ')
      .replace(/[^\x20-\x7E\n]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return stripped.slice(0, 30000) || `Uploaded DOCX CV: ${fileName}`;
  }

  if (mimeType.startsWith('text/') || lower.endsWith('.txt') || lower.endsWith('.md')) {
    return buf.toString('utf8').slice(0, 30000);
  }

  throw new Error('Unsupported document type. Upload PDF, DOCX, or TXT files.');
}

router.get('/overview', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    const [docs, versions, analyses, generatedDocs, interviews] = await Promise.all([
      runQuery('career.docs', () =>
        db.select().from(cvDocuments).where(eq(cvDocuments.userId, userId)).orderBy(desc(cvDocuments.createdAt))
      ),
      runQuery('career.versions', () =>
        db.select().from(cvVersions).where(eq(cvVersions.userId, userId)).orderBy(desc(cvVersions.updatedAt))
      ),
      runQuery('career.analyses', () =>
        db.select().from(cvAnalyses).where(eq(cvAnalyses.userId, userId)).orderBy(desc(cvAnalyses.createdAt))
      ),
      runQuery('career.aiDocs', () =>
        db.select().from(aiDocuments).where(eq(aiDocuments.userId, userId)).orderBy(desc(aiDocuments.updatedAt))
      ),
      runQuery('career.interviews', () =>
        db
          .select()
          .from(aiInterviewSessions)
          .where(eq(aiInterviewSessions.userId, userId))
          .orderBy(desc(aiInterviewSessions.updatedAt))
      ),
    ]);

    res.json({
      cvDocuments: docs,
      cvVersions: versions,
      cvAnalyses: analyses,
      aiDocuments: generatedDocs,
      interviewSessions: interviews,
    });
  } catch {
    res.status(500).json({ error: 'Failed to load Career Studio workspace' });
  }
});

router.post('/cv-documents', requireAuth, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    let title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    let fileName = 'pasted-cv.txt';
    let mimeType = 'text/plain';
    let fileSize = 0;
    let extractedText = '';

    if (req.file) {
      fileName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
      mimeType = req.file.mimetype;
      fileSize = req.file.size;
      extractedText = extractTextFromBuffer(req.file.buffer, mimeType, fileName);
      if (!title) title = fileName;
    } else if (typeof req.body?.text === 'string' && req.body.text.trim().length >= 20) {
      extractedText = req.body.text.trim().slice(0, 30000);
      fileSize = Buffer.byteLength(extractedText, 'utf8');
      if (!title) title = 'Saved CV Text';
    } else {
      return res.status(400).json({ error: 'Upload a PDF/DOCX/TXT file or provide CV text' });
    }

    const inserted = await runQuery('career.insertCvDoc', () =>
      db
        .insert(cvDocuments)
        .values({
          userId,
          title: title.slice(0, 140),
          fileName,
          mimeType,
          fileSize,
          extractedText,
          isPrimary: Boolean(req.body?.isPrimary),
        })
        .returning()
    );
    res.status(201).json({ cvDocument: inserted[0] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to process CV document';
    res.status(400).json({ error: message });
  }
});

router.delete('/cv-documents/:id', requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  await runQuery('career.deleteCvDoc', () =>
    db
      .delete(cvDocuments)
      .where(and(eq(cvDocuments.id, id), eq(cvDocuments.userId, req.dbUser!.id)))
  );
  res.json({ deleted: true });
});

router.post('/analyze-cv', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      cvDocumentId: z.number().int().positive().optional().nullable(),
      cvText: z.string().max(30000).optional(),
      targetJobTitle: z.string().max(160).optional(),
      jobDescription: z.string().max(8000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid CV analysis request' });
    }

    const userId = req.dbUser!.id;
    let cvText = parsed.data.cvText?.trim() || '';

    if (parsed.data.cvDocumentId) {
      const docRows = await runQuery('career.findCvForAnalysis', () =>
        db
          .select()
          .from(cvDocuments)
          .where(and(eq(cvDocuments.id, parsed.data.cvDocumentId!), eq(cvDocuments.userId, userId)))
          .limit(1)
      );
      if (!docRows[0]) {
        return res.status(404).json({ error: 'CV document not found' });
      }
      cvText = docRows[0].extractedText;
    }

    if (cvText.length < 30) {
      return res.status(400).json({ error: 'Provide at least 30 characters of CV content to analyze' });
    }

    await enforceAiFairUse(userId, 'cv_analysis');
    const analysis = await analyzeCvWithGemini({
      cvText,
      targetJobTitle: parsed.data.targetJobTitle,
      jobDescription: parsed.data.jobDescription,
    });

    const [saved] = await runQuery('career.saveAnalysis', () =>
      db
        .insert(cvAnalyses)
        .values({
          userId,
          cvDocumentId: parsed.data.cvDocumentId ?? null,
          targetJobTitle: parsed.data.targetJobTitle ?? '',
          jobDescription: parsed.data.jobDescription ?? '',
          ...analysis,
        })
        .returning()
    );

    res.status(201).json({ analysis: saved });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    res.status(e.status || 500).json({ error: e.message || 'CV analysis failed' });
  }
});

router.post('/cv-versions', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    title: z.string().min(1).max(140),
    template: z.enum(['executive', 'modern', 'civic']).default('executive'),
    data: z.object({
      fullName: z.string().max(120),
      headline: z.string().max(220),
      email: z.string().max(160),
      phone: z.string().max(60).default(''),
      location: z.string().max(120),
      summary: z.string().max(4000),
      experiences: z.array(z.any()).default([]),
      education: z.array(z.any()).default([]),
      skills: z.array(z.string()).default([]),
      certifications: z.array(z.string()).default([]),
      languages: z.array(z.string()).default([]),
    }),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid CV builder data' });
  }

  const [saved] = await runQuery('career.createCvVersion', () =>
    db
      .insert(cvVersions)
      .values({
        userId: req.dbUser!.id,
        title: parsed.data.title,
        template: parsed.data.template,
        data: parsed.data.data,
      })
      .returning()
  );
  res.status(201).json({ cvVersion: saved });
});

router.put('/cv-versions/:id', requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const { title, template, data } = req.body || {};
  const updated = await runQuery('career.updateCvVersion', () =>
    db
      .update(cvVersions)
      .set({ title, template, data, updatedAt: new Date() })
      .where(and(eq(cvVersions.id, id), eq(cvVersions.userId, req.dbUser!.id)))
      .returning()
  );
  if (!updated[0]) return res.status(404).json({ error: 'CV version not found' });
  res.json({ cvVersion: updated[0] });
});

router.delete('/cv-versions/:id', requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  await runQuery('career.delCvVersion', () =>
    db.delete(cvVersions).where(and(eq(cvVersions.id, id), eq(cvVersions.userId, req.dbUser!.id)))
  );
  res.json({ deleted: true });
});

router.post('/cover-letter', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      targetRole: z.string().min(2).max(160),
      companyName: z.string().min(1).max(160),
      jobDescription: z.string().max(8000).optional(),
      tone: z.string().max(80).optional(),
      cvSummary: z.string().max(8000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Target role and company name are required' });
    }

    const userId = req.dbUser!.id;
    const [prof] = await runQuery('career.profileForCL', () =>
      db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1)
    );

    await enforceAiFairUse(userId, 'cover_letter');
    const content = await generateCoverLetterWithGemini({
      candidateName: req.dbUser!.fullName,
      headline: prof?.headline || 'Professional',
      cvSummary:
        parsed.data.cvSummary ||
        `${prof?.about || ''}\nSkills: ${(prof?.skills || []).join(', ')}`,
      targetRole: parsed.data.targetRole,
      companyName: parsed.data.companyName,
      jobDescription: parsed.data.jobDescription,
      tone: parsed.data.tone,
    });

    const [saved] = await runQuery('career.saveCL', () =>
      db
        .insert(aiDocuments)
        .values({
          userId,
          docType: 'cover_letter',
          title: `Cover Letter — ${parsed.data.targetRole} at ${parsed.data.companyName}`,
          targetRole: parsed.data.targetRole,
          content,
        })
        .returning()
    );

    res.status(201).json({ document: saved });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    res.status(e.status || 500).json({ error: e.message || 'Cover letter generation failed' });
  }
});

router.post('/interview/start', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      targetRole: z.string().min(2).max(160),
      experienceLevel: z.enum(['entry', 'mid', 'senior', 'executive']).default('mid'),
      background: z.string().max(4000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Target role is required' });
    }

    const userId = req.dbUser!.id;
    await enforceAiFairUse(userId, 'interview_start');
    const questions = await generateInterviewQuestionsWithGemini(parsed.data);

    const [session] = await runQuery('career.createInterview', () =>
      db
        .insert(aiInterviewSessions)
        .values({
          userId,
          targetRole: parsed.data.targetRole,
          experienceLevel: parsed.data.experienceLevel,
          questions,
          status: 'active',
        })
        .returning()
    );

    res.status(201).json({ session });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    res.status(e.status || 500).json({ error: e.message || 'Interview session creation failed' });
  }
});

router.post('/interview/:id/answer', requireAuth, async (req: AuthRequest, res) => {
  try {
    const sessionId = Number(req.params.id);
    const schema = z.object({
      questionId: z.string().min(1),
      answer: z.string().min(5).max(5000),
    });
    const parsed = schema.safeParse(req.body);
    if (!Number.isInteger(sessionId) || sessionId <= 0 || !parsed.success) {
      return res.status(400).json({ error: 'Valid questionId and answer required' });
    }

    const userId = req.dbUser!.id;
    const rows = await runQuery('career.findInterview', () =>
      db
        .select()
        .from(aiInterviewSessions)
        .where(and(eq(aiInterviewSessions.id, sessionId), eq(aiInterviewSessions.userId, userId)))
        .limit(1)
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Interview session not found' });
    }

    const targetQ = rows[0].questions.find((q) => q.id === parsed.data.questionId);
    if (!targetQ) {
      return res.status(404).json({ error: 'Question not found in session' });
    }

    await enforceAiFairUse(userId, 'interview_evaluate');
    const feedback = await evaluateInterviewAnswerWithGemini({
      targetRole: rows[0].targetRole,
      question: targetQ.question,
      answer: parsed.data.answer,
    });

    const updatedQuestions = rows[0].questions.map((q) =>
      q.id === targetQ.id
        ? {
            ...q,
            answer: parsed.data.answer,
            evaluation: feedback.evaluation,
            improvements: feedback.improvements,
          }
        : q
    );

    const allAnswered = updatedQuestions.every((q) => Boolean(q.answer));
    const [updated] = await runQuery('career.updateInterview', () =>
      db
        .update(aiInterviewSessions)
        .set({
          questions: updatedQuestions,
          status: allAnswered ? 'completed' : 'active',
          updatedAt: new Date(),
        })
        .where(eq(aiInterviewSessions.id, sessionId))
        .returning()
    );

    res.json({ session: updated });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    res.status(e.status || 500).json({ error: e.message || 'Answer evaluation failed' });
  }
});

router.post('/guidance', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      goals: z.string().min(5).max(3000),
      currentRole: z.string().max(180).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Career goals description is required' });
    }

    const userId = req.dbUser!.id;
    const [prof] = await runQuery('career.profileGuidance', () =>
      db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1)
    );

    await enforceAiFairUse(userId, 'career_guidance');
    const content = await generateCareerGuidanceWithGemini({
      currentRole: parsed.data.currentRole || prof?.currentPosition || prof?.headline || 'Professional',
      skills: prof?.skills || [],
      goals: parsed.data.goals,
      location: `${prof?.location || 'Mbabane'}, ${prof?.country || 'Eswatini'}`,
    });

    const [saved] = await runQuery('career.saveGuidance', () =>
      db
        .insert(aiDocuments)
        .values({
          userId,
          docType: 'career_guidance',
          title: `Career Roadmap — ${parsed.data.goals.slice(0, 60)}`,
          targetRole: parsed.data.currentRole || '',
          content,
        })
        .returning()
    );

    res.status(201).json({ document: saved });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    res.status(e.status || 500).json({ error: e.message || 'Career guidance failed' });
  }
});

router.post('/documents', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      docType: z.enum(['cover_letter', 'career_guidance', 'bio', 'document']).default('document'),
      title: z.string().min(2).max(160),
      context: z.string().max(4000).optional(),
      content: z.string().max(20000).optional(),
      useAi: z.boolean().default(false),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid document payload' });
    }

    const userId = req.dbUser!.id;
    let finalContent = parsed.data.content?.trim() || '';

    if (parsed.data.useAi) {
      await enforceAiFairUse(userId, 'document_studio');
      finalContent = await generateDocumentWithGemini({
        docType: parsed.data.docType,
        title: parsed.data.title,
        context: parsed.data.context || parsed.data.content || parsed.data.title,
      });
    }

    const [saved] = await runQuery('career.createDoc', () =>
      db
        .insert(aiDocuments)
        .values({
          userId,
          docType: parsed.data.docType,
          title: parsed.data.title,
          content: finalContent || 'Draft document',
        })
        .returning()
    );
    res.status(201).json({ document: saved });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    res.status(e.status || 500).json({ error: e.message || 'Document creation failed' });
  }
});

router.put('/documents/:id', requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const schema = z.object({
    title: z.string().min(1).max(160).optional(),
    content: z.string().min(1).max(20000),
  });
  const parsed = schema.safeParse(req.body);
  if (!Number.isInteger(id) || id <= 0 || !parsed.success) {
    return res.status(400).json({ error: 'Invalid document update' });
  }
  const updated = await runQuery('career.updateDoc', () =>
    db
      .update(aiDocuments)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(aiDocuments.id, id), eq(aiDocuments.userId, req.dbUser!.id)))
      .returning()
  );
  if (!updated[0]) return res.status(404).json({ error: 'Document not found' });
  res.json({ document: updated[0] });
});

router.delete('/documents/:id', requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  await runQuery('career.deleteDoc', () =>
    db.delete(aiDocuments).where(and(eq(aiDocuments.id, id), eq(aiDocuments.userId, req.dbUser!.id)))
  );
  res.json({ deleted: true });
});

export default router;
