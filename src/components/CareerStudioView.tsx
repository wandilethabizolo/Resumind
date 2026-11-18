import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Layers, MessageCircle, PenTool, Printer, Save, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type StudioTab = 'analyser' | 'builder' | 'writing' | 'interview';
type WritingMode = 'cover_letter' | 'guidance' | 'bio' | 'document';

interface CvDocument {
  id: number;
  title: string;
  fileName: string;
  extractedText: string;
  createdAt: string;
}

interface CvAnalysis {
  id: number;
  targetJobTitle: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  tailoredBullets: string[];
  matchNotes: string;
  createdAt: string;
}

interface CvVersion {
  id: number;
  title: string;
  template: 'executive' | 'modern' | 'civic';
  data: {
    fullName: string;
    headline: string;
    email: string;
    phone: string;
    location: string;
    summary: string;
    experiences: Array<{ title: string; company: string; startDate: string; endDate: string; description: string }>;
    education: Array<{ institution: string; degree: string; endYear: string }>;
    skills: string[];
    certifications: string[];
    languages: string[];
  };
  updatedAt: string;
}

interface AiDoc {
  id: number;
  docType: string;
  title: string;
  targetRole: string;
  content: string;
  updatedAt: string;
}

interface InterviewSession {
  id: number;
  targetRole: string;
  experienceLevel: string;
  status: string;
  questions: Array<{
    id: string;
    category: string;
    question: string;
    answer?: string;
    evaluation?: string;
    improvements?: string[];
  }>;
}

export const CareerStudioView: React.FC = () => {
  const { user, profile, apiFetch } = useAuth();
  const [tab, setTab] = useState<StudioTab>('analyser');
  const [cvDocuments, setCvDocuments] = useState<CvDocument[]>([]);
  const [cvAnalyses, setCvAnalyses] = useState<CvAnalysis[]>([]);
  const [cvVersions, setCvVersions] = useState<CvVersion[]>([]);
  const [aiDocuments, setAiDocuments] = useState<AiDoc[]>([]);
  const [interviews, setInterviews] = useState<InterviewSession[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Analyser state
  const [selectedDocId, setSelectedDocId] = useState<number | ''>('');
  const [pastedCv, setPastedCv] = useState('');
  const [targetJobTitle, setTargetJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [activeAnalysis, setActiveAnalysis] = useState<CvAnalysis | null>(null);

  // Builder state
  const [builderTitle, setBuilderTitle] = useState('Primary CV');
  const [builderTemplate, setBuilderTemplate] = useState<'executive' | 'modern' | 'civic'>('executive');
  const [builderName, setBuilderName] = useState(user?.fullName || '');
  const [builderHeadline, setBuilderHeadline] = useState(profile?.headline || '');
  const [builderEmail, setBuilderEmail] = useState(user?.email || '');
  const [builderPhone, setBuilderPhone] = useState('');
  const [builderLocation, setBuilderLocation] = useState(
    `${profile?.location || 'Mbabane'}, ${profile?.country || 'Eswatini'}`
  );
  const [builderSummary, setBuilderSummary] = useState(profile?.about || '');
  const [builderSkills, setBuilderSkills] = useState((profile?.skills || []).join(', '));
  const [builderExpText, setBuilderExpText] = useState(
    (profile?.experiences || [])
      .map((e) => `${e.title} | ${e.company} | ${e.startDate}-${e.endDate || 'Present'} | ${e.description}`)
      .join('\n')
  );
  const [builderEduText, setBuilderEduText] = useState(
    (profile?.education || [])
      .map((ed) => `${ed.institution} | ${ed.degree} ${ed.field} | ${ed.endYear}`)
      .join('\n')
  );

  // Unified Writing & Career Docs state
  const [writingMode, setWritingMode] = useState<WritingMode>('cover_letter');
  const [clRole, setClRole] = useState('');
  const [clCompany, setClCompany] = useState('');
  const [clTone, setClTone] = useState('Professional and concise');
  const [docTitle, setDocTitle] = useState('');
  const [writingContext, setWritingContext] = useState('');
  const [activeDoc, setActiveDoc] = useState<AiDoc | null>(null);

  // Interview state
  const [intRole, setIntRole] = useState('');
  const [intLevel, setIntLevel] = useState<'entry' | 'mid' | 'senior' | 'executive'>('mid');
  const [activeInterview, setActiveInterview] = useState<InterviewSession | null>(null);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});

  const loadOverview = useCallback(async () => {
    const data = await apiFetch<{
      cvDocuments: CvDocument[];
      cvAnalyses: CvAnalysis[];
      cvVersions: CvVersion[];
      aiDocuments: AiDoc[];
      interviewSessions: InterviewSession[];
    }>('/api/career/overview');
    setCvDocuments(data.cvDocuments || []);
    setCvAnalyses(data.cvAnalyses || []);
    setCvVersions(data.cvVersions || []);
    setAiDocuments(data.aiDocuments || []);
    setInterviews(data.interviewSessions || []);
    if (!activeAnalysis && data.cvAnalyses?.[0]) setActiveAnalysis(data.cvAnalyses[0]);
    if (!activeInterview && data.interviewSessions?.[0]) setActiveInterview(data.interviewSessions[0]);
  }, [activeAnalysis, activeInterview, apiFetch]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleUploadCv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('title', file.name);
      const res = await apiFetch<{ cvDocument: CvDocument }>('/api/career/cv-documents', {
        method: 'POST',
        body: form,
      });
      setSelectedDocId(res.cvDocument.id);
      await loadOverview();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const handleAnalyzeCv = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch<{ analysis: CvAnalysis }>('/api/career/analyze-cv', {
        method: 'POST',
        body: JSON.stringify({
          cvDocumentId: selectedDocId ? Number(selectedDocId) : null,
          cvText: pastedCv.trim() || undefined,
          targetJobTitle,
          jobDescription,
        }),
      });
      setActiveAnalysis(res.analysis);
      await loadOverview();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCvVersion = async () => {
    setBusy(true);
    setError('');
    try {
      const parsedExps = builderExpText
        .split('\n')
        .filter((l) => l.trim())
        .map((line) => {
          const [title = '', company = '', dates = '', description = ''] = line
            .split('|')
            .map((s) => s.trim());
          const [startDate = '', endDate = ''] = dates.split('-').map((s) => s.trim());
          return { title, company, startDate, endDate, description };
        });
      const parsedEdu = builderEduText
        .split('\n')
        .filter((l) => l.trim())
        .map((line) => {
          const [institution = '', degree = '', endYear = ''] = line
            .split('|')
            .map((s) => s.trim());
          return { institution, degree, endYear };
        });

      await apiFetch('/api/career/cv-versions', {
        method: 'POST',
        body: JSON.stringify({
          title: builderTitle,
          template: builderTemplate,
          data: {
            fullName: builderName,
            headline: builderHeadline,
            email: builderEmail,
            phone: builderPhone,
            location: builderLocation,
            summary: builderSummary,
            experiences: parsedExps,
            education: parsedEdu,
            skills: builderSkills
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
            certifications: [],
            languages: profile?.languages || [],
          },
        }),
      });
      await loadOverview();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save CV version');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateWriting = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      let res: { document: AiDoc };
      if (writingMode === 'cover_letter') {
        res = await apiFetch<{ document: AiDoc }>('/api/career/cover-letter', {
          method: 'POST',
          body: JSON.stringify({
            targetRole: clRole,
            companyName: clCompany,
            jobDescription: writingContext,
            tone: clTone,
          }),
        });
      } else if (writingMode === 'guidance') {
        res = await apiFetch<{ document: AiDoc }>('/api/career/guidance', {
          method: 'POST',
          body: JSON.stringify({ goals: writingContext }),
        });
      } else {
        res = await apiFetch<{ document: AiDoc }>('/api/career/documents', {
          method: 'POST',
          body: JSON.stringify({
            docType: writingMode,
            title: docTitle,
            context: writingContext,
            useAi: true,
          }),
        });
      }
      setActiveDoc(res.document);
      await loadOverview();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Drafting failed');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateDoc = async () => {
    if (!activeDoc) return;
    await apiFetch(`/api/career/documents/${activeDoc.id}`, {
      method: 'PUT',
      body: JSON.stringify({ title: activeDoc.title, content: activeDoc.content }),
    });
    await loadOverview();
  };

  const handleStartInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch<{ session: InterviewSession }>('/api/career/interview/start', {
        method: 'POST',
        body: JSON.stringify({
          targetRole: intRole,
          experienceLevel: intLevel,
          background: profile?.about || '',
        }),
      });
      setActiveInterview(res.session);
      await loadOverview();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to start interview session');
    } finally {
      setBusy(false);
    }
  };

  const handleAnswerQuestion = async (questionId: string) => {
    if (!activeInterview) return;
    const answer = (answerDrafts[questionId] || '').trim();
    if (answer.length < 5) return;
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch<{ session: InterviewSession }>(
        `/api/career/interview/${activeInterview.id}/answer`,
        {
          method: 'POST',
          body: JSON.stringify({ questionId, answer }),
        }
      );
      setActiveInterview(res.session);
      await loadOverview();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Answer evaluation failed');
    } finally {
      setBusy(false);
    }
  };

  const downloadTextFile = (filename: string, text: string) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Career Studio</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Assistive Gemini tools for CV feedback, tailored drafting, and interview practice.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {[
            { id: 'analyser', label: 'CV Analyser', icon: FileText },
            { id: 'builder', label: 'CV Builder', icon: Layers },
            { id: 'writing', label: 'Documents & Letters', icon: PenTool },
            { id: 'interview', label: 'Interview Coach', icon: MessageCircle },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id as StudioTab)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  tab === item.id
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="no-print rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {/* 1. CV ANALYSER */}
      {tab === 'analyser' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Upload or Paste CV
              </h2>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700">
                <Upload className="h-3.5 w-3.5" />
                Upload PDF/DOCX/TXT
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  onChange={handleUploadCv}
                  className="hidden"
                />
              </label>
            </div>

            {cvDocuments.length > 0 && (
              <select
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">Select saved CV or paste below...</option>
                {cvDocuments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} ({d.fileName})
                  </option>
                ))}
              </select>
            )}

            <form onSubmit={handleAnalyzeCv} className="space-y-3">
              <textarea
                rows={6}
                value={pastedCv}
                onChange={(e) => setPastedCv(e.target.value)}
                placeholder="Paste your CV text here (optional if a saved file is selected)..."
                className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
              <input
                type="text"
                value={targetJobTitle}
                onChange={(e) => setTargetJobTitle(e.target.value)}
                placeholder="Target Role (e.g. Senior Backend Engineer)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
              <textarea
                rows={3}
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Optional Job Description for role-specific tailoring..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-[#0F5C4D] py-2.5 text-xs font-medium text-white hover:bg-[#0c4a3e] disabled:opacity-50"
              >
                {busy ? 'Analyzing...' : 'Analyze & Tailor CV'}
              </button>
            </form>
          </div>

          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
            {activeAnalysis ? (
              <div className="space-y-4 text-sm">
                <div className="border-b border-slate-200 pb-3 dark:border-slate-800">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    CV Feedback {activeAnalysis.targetJobTitle ? `— ${activeAnalysis.targetJobTitle}` : ''}
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {activeAnalysis.summary}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                      Strengths
                    </h3>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700 dark:text-slate-300">
                      {activeAnalysis.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                      Gaps to Address
                    </h3>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700 dark:text-slate-300">
                      {activeAnalysis.weaknesses.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Recommendations
                  </h3>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700 dark:text-slate-300">
                    {activeAnalysis.recommendations.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>

                {activeAnalysis.tailoredBullets.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Suggested Rewritten Bullets
                    </h3>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700 dark:text-slate-300">
                      {activeAnalysis.tailoredBullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {activeAnalysis.matchNotes && (
                  <p className="border-t border-slate-200 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
                    <strong>Role Alignment:</strong> {activeAnalysis.matchNotes}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Upload or paste your CV on the left for structured feedback and bullet rewrites.
              </p>
            )}

            {cvAnalyses.length > 1 && (
              <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
                <h3 className="text-xs font-semibold text-slate-500">Saved Analyses</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {cvAnalyses.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setActiveAnalysis(a)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs hover:bg-slate-50 dark:border-slate-700"
                    >
                      {a.targetJobTitle || 'General CV'} · {new Date(a.createdAt).toLocaleDateString()}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. CV BUILDER */}
      {tab === 'builder' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="no-print space-y-3 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">CV Editor</h2>
              <select
                value={builderTemplate}
                onChange={(e) =>
                  setBuilderTemplate(e.target.value as 'executive' | 'modern' | 'civic')
                }
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="executive">Executive</option>
                <option value="modern">Modern Technical</option>
                <option value="civic">Civic & Academic</option>
              </select>
            </div>
            <input
              type="text"
              value={builderTitle}
              onChange={(e) => setBuilderTitle(e.target.value)}
              placeholder="CV Title"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={builderName}
                onChange={(e) => setBuilderName(e.target.value)}
                placeholder="Full Name"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
              <input
                type="text"
                value={builderHeadline}
                onChange={(e) => setBuilderHeadline(e.target.value)}
                placeholder="Headline"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
              <input
                type="email"
                value={builderEmail}
                onChange={(e) => setBuilderEmail(e.target.value)}
                placeholder="Email"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
              <input
                type="text"
                value={builderPhone}
                onChange={(e) => setBuilderPhone(e.target.value)}
                placeholder="Phone (+268...)"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <input
              type="text"
              value={builderLocation}
              onChange={(e) => setBuilderLocation(e.target.value)}
              placeholder="Location"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
            />
            <textarea
              rows={3}
              value={builderSummary}
              onChange={(e) => setBuilderSummary(e.target.value)}
              placeholder="Executive summary..."
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
            />
            <textarea
              rows={4}
              value={builderExpText}
              onChange={(e) => setBuilderExpText(e.target.value)}
              placeholder="Experience (Role | Company | 2022-Present | Impact)"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
            />
            <textarea
              rows={2}
              value={builderEduText}
              onChange={(e) => setBuilderEduText(e.target.value)}
              placeholder="Education (Institution | Degree | Year)"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              type="text"
              value={builderSkills}
              onChange={(e) => setBuilderSkills(e.target.value)}
              placeholder="Skills (comma separated)"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveCvVersion}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#0F5C4D] py-2 text-xs font-medium text-white"
              >
                <Save className="h-3.5 w-3.5" />
                Save Version
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium dark:border-slate-700"
              >
                <Printer className="h-3.5 w-3.5" />
                Export PDF
              </button>
            </div>

            {cvVersions.length > 0 && (
              <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Saved Versions ({cvVersions.length})
                </p>
                <div className="mt-2 space-y-1.5">
                  {cvVersions.map((v) => (
                    <div key={v.id} className="flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setBuilderTitle(v.title);
                          setBuilderTemplate(v.template);
                          setBuilderName(v.data.fullName);
                          setBuilderHeadline(v.data.headline);
                          setBuilderEmail(v.data.email);
                          setBuilderPhone(v.data.phone);
                          setBuilderLocation(v.data.location);
                          setBuilderSummary(v.data.summary);
                          setBuilderSkills((v.data.skills || []).join(', '));
                        }}
                        className="font-medium text-[#0F5C4D] hover:underline dark:text-emerald-400"
                      >
                        {v.title} ({v.template})
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/career/cv-versions/${v.id}`, { method: 'DELETE' });
                          await loadOverview();
                        }}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-8 text-slate-900 lg:col-span-7 dark:border-slate-800">
            <div
              className={`border-b pb-4 ${
                builderTemplate === 'modern'
                  ? 'border-[#0F5C4D]'
                  : builderTemplate === 'civic'
                  ? 'border-slate-900'
                  : 'border-slate-300'
              }`}
            >
              <h2 className="font-display text-2xl font-bold text-slate-900">
                {builderName || 'Your Full Name'}
              </h2>
              <p className="mt-0.5 text-sm font-medium text-[#0F5C4D]">
                {builderHeadline || 'Professional Headline'}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {[builderLocation, builderEmail, builderPhone].filter(Boolean).join(' · ')}
              </p>
            </div>

            {builderSummary && (
              <div className="mt-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Summary</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-700">{builderSummary}</p>
              </div>
            )}

            {builderExpText.trim() && (
              <div className="mt-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Experience
                </h3>
                <div className="mt-2 space-y-3">
                  {builderExpText
                    .split('\n')
                    .filter((l) => l.trim())
                    .map((line, i) => {
                      const [title, company, dates, desc] = line.split('|').map((s) => s.trim());
                      return (
                        <div key={i} className="text-xs">
                          <div className="flex justify-between font-semibold text-slate-900">
                            <span>
                              {title} {company ? `— ${company}` : ''}
                            </span>
                            <span className="font-mono text-slate-500">{dates}</span>
                          </div>
                          {desc && <p className="mt-0.5 text-slate-700">{desc}</p>}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {builderEduText.trim() && (
              <div className="mt-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Education
                </h3>
                <div className="mt-2 space-y-1.5 text-xs">
                  {builderEduText
                    .split('\n')
                    .filter((l) => l.trim())
                    .map((line, i) => {
                      const [inst, deg, yr] = line.split('|').map((s) => s.trim());
                      return (
                        <div key={i} className="flex justify-between">
                          <span>
                            <strong>{inst}</strong> {deg ? `· ${deg}` : ''}
                          </span>
                          <span className="font-mono text-slate-500">{yr}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {builderSkills.trim() && (
              <div className="mt-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Core Competencies
                </h3>
                <p className="mt-1 text-xs text-slate-700">
                  {builderSkills
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. UNIFIED DOCUMENTS, COVER LETTERS & CAREER PATHWAY */}
      {tab === 'writing' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
            <form onSubmit={handleGenerateWriting} className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                AI Writing Workspace
              </h2>
              <select
                value={writingMode}
                onChange={(e) => setWritingMode(e.target.value as WritingMode)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="cover_letter">Tailored Cover Letter</option>
                <option value="guidance">12-Month Career Pathway</option>
                <option value="bio">Executive Bio / Profile Summary</option>
                <option value="document">Capability Statement / Brief</option>
              </select>

              {writingMode === 'cover_letter' && (
                <>
                  <input
                    type="text"
                    required
                    value={clRole}
                    onChange={(e) => setClRole(e.target.value)}
                    placeholder="Target Role"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                  />
                  <input
                    type="text"
                    required
                    value={clCompany}
                    onChange={(e) => setClCompany(e.target.value)}
                    placeholder="Organization Name"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                  />
                  <select
                    value={clTone}
                    onChange={(e) => setClTone(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option>Professional and concise</option>
                    <option>Executive and strategic</option>
                    <option>Warm and mission-driven</option>
                  </select>
                </>
              )}

              {(writingMode === 'bio' || writingMode === 'document') && (
                <input
                  type="text"
                  required
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="Document Title"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
              )}

              <textarea
                rows={5}
                required={writingMode === 'guidance'}
                value={writingContext}
                onChange={(e) => setWritingContext(e.target.value)}
                placeholder={
                  writingMode === 'cover_letter'
                    ? 'Paste key job description points...'
                    : writingMode === 'guidance'
                    ? 'Describe your target role or 12-month career objectives...'
                    : 'Key facts, outcomes, or context to include...'
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              />

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-[#0F5C4D] py-2 text-xs font-medium text-white hover:bg-[#0c4a3e] disabled:opacity-50"
              >
                {busy ? 'Drafting...' : 'Generate Draft'}
              </button>
            </form>

            {aiDocuments.length > 0 && (
              <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                <h3 className="text-xs font-semibold text-slate-500">
                  Saved Drafts ({aiDocuments.length})
                </h3>
                <div className="mt-2 divide-y divide-slate-200 dark:divide-slate-800">
                  {aiDocuments.map((d) => (
                    <div key={d.id} className="flex items-center justify-between py-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setActiveDoc(d)}
                        className="truncate font-medium text-slate-900 hover:text-[#0F5C4D] dark:text-slate-100"
                      >
                        {d.title}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/career/documents/${d.id}`, { method: 'DELETE' });
                          if (activeDoc?.id === d.id) setActiveDoc(null);
                          await loadOverview();
                        }}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
            {activeDoc ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={activeDoc.title}
                    onChange={(e) => setActiveDoc({ ...activeDoc, title: e.target.value })}
                    className="flex-1 text-sm font-semibold text-slate-900 focus:outline-none dark:bg-transparent dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleUpdateDoc}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium dark:border-slate-700"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadTextFile(`${activeDoc.title}.txt`, activeDoc.content)}
                    className="rounded-lg bg-[#0F5C4D] px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Export .TXT
                  </button>
                </div>
                <textarea
                  rows={16}
                  value={activeDoc.content}
                  onChange={(e) => setActiveDoc({ ...activeDoc, content: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed dark:border-slate-700 dark:bg-slate-950"
                />
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Choose a document type on the left to generate, edit, and export a draft.
              </p>
            )}
          </div>
        </div>
      )}

      {/* 4. INTERVIEW COACH */}
      {tab === 'interview' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Practice Session
            </h2>
            <form onSubmit={handleStartInterview} className="space-y-3">
              <input
                type="text"
                required
                value={intRole}
                onChange={(e) => setIntRole(e.target.value)}
                placeholder="Target Role (e.g. Full-Stack Engineer)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
              <select
                value={intLevel}
                onChange={(e) =>
                  setIntLevel(e.target.value as 'entry' | 'mid' | 'senior' | 'executive')
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="entry">Entry Level</option>
                <option value="mid">Mid Level</option>
                <option value="senior">Senior Level</option>
                <option value="executive">Executive</option>
              </select>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-[#0F5C4D] py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                {busy ? 'Generating Questions...' : 'Start Practice'}
              </button>
            </form>

            {interviews.length > 0 && (
              <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                <h3 className="text-xs font-semibold text-slate-500">Past Sessions</h3>
                <div className="mt-2 space-y-1.5">
                  {interviews.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActiveInterview(s)}
                      className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-xs hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                    >
                      <span className="font-medium text-slate-900 dark:text-white">
                        {s.targetRole}
                      </span>{' '}
                      · <span className="capitalize text-slate-500">{s.experienceLevel}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-8 dark:border-slate-800 dark:bg-slate-900">
            {activeInterview ? (
              <div className="space-y-5">
                <div className="border-b border-slate-200 pb-3 dark:border-slate-800">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {activeInterview.targetRole} ({activeInterview.experienceLevel})
                  </h2>
                </div>
                {activeInterview.questions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="space-y-2 border-b border-slate-200 pb-4 last:border-b-0 dark:border-slate-800"
                  >
                    <p className="text-xs font-medium text-[#0F5C4D] dark:text-emerald-400">
                      Question {idx + 1} · {q.category}
                    </p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {q.question}
                    </p>
                    {q.answer ? (
                      <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-950">
                        <p>
                          <strong>Your Answer:</strong> {q.answer}
                        </p>
                        <p className="text-slate-700 dark:text-slate-300">
                          <strong>Evaluation:</strong> {q.evaluation}
                        </p>
                        {q.improvements && q.improvements.length > 0 && (
                          <ul className="list-disc pl-4 text-slate-600 dark:text-slate-400">
                            {q.improvements.map((imp, k) => (
                              <li key={k}>{imp}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <textarea
                          rows={3}
                          value={answerDrafts[q.id] || ''}
                          onChange={(e) =>
                            setAnswerDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))
                          }
                          placeholder="Draft your response using concrete examples..."
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                        />
                        <button
                          type="button"
                          onClick={() => handleAnswerQuestion(q.id)}
                          disabled={busy}
                          className="rounded-lg bg-[#0F5C4D] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        >
                          Evaluate Answer
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Start a session on the left to practice role-specific interview questions.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
