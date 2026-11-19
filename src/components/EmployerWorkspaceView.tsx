import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  Edit3,
  FolderPlus,
  MessageSquare,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { OrganizationSummary } from '../types';

type SubTab =
  | 'overview'
  | 'jobs'
  | 'applications'
  | 'talent'
  | 'interviews'
  | 'analytics'
  | 'company';

interface EmployerWorkspaceProps {
  onOpenConversation?: (recipientId: number) => void;
  onViewProfile?: (userId: number) => void;
}

interface OrgJob {
  id: number;
  title: string;
  department: string;
  description: string;
  requirements: string;
  location: string;
  country: string;
  workArrangement: 'remote' | 'hybrid' | 'onsite';
  employmentType: 'full-time' | 'part-time' | 'contract' | 'internship';
  experienceLevel: 'entry' | 'mid' | 'senior' | 'executive';
  salaryRange: string;
  status: 'draft' | 'published' | 'paused' | 'closed' | 'archived';
  expiresAt: string | null;
  applicantCount: number;
  createdAt: string;
}

interface OrgMember {
  id: number;
  userId: number;
  role: 'owner' | 'admin' | 'recruiter' | 'hiring_manager' | 'interviewer' | 'viewer';
  status: 'active' | 'suspended';
  fullName: string;
  email: string;
  headline: string;
}

interface ApplicationHistoryEntry {
  id: number;
  fromStage: string;
  toStage: string;
  note: string;
  createdAt: string;
}

interface OrgApplication {
  id: number;
  jobId: number;
  jobTitle: string;
  stage: string;
  coverLetter: string;
  employerNotes: string;
  createdAt: string;
  applicant: { id: number; fullName: string; email: string };
  profile: {
    headline: string;
    location: string;
    country: string;
    skills: string[];
    avatarUrl?: string;
  };
  cvDocument: { id: number; title: string; fileName: string; extractedText: string } | null;
  history: ApplicationHistoryEntry[];
}

interface TalentCandidate {
  userId: number;
  fullName: string;
  headline: string;
  about: string;
  location: string;
  country: string;
  avatarUrl: string;
  skills: string[];
  openToWork: boolean;
}

interface TalentPool {
  id: number;
  name: string;
  description: string;
  members: Array<{
    id: number;
    userId: number;
    fullName: string;
    headline: string;
    location: string;
    skills: string[];
    notes: string;
  }>;
}

interface OrgInterview {
  id: number;
  applicationId: number;
  jobTitle: string;
  candidateName: string;
  candidateId: number;
  interviewType: 'video' | 'in_person' | 'phone';
  scheduledAt: string;
  locationOrLink: string;
  notes: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  feedback: string;
  outcome: 'pending' | 'pass' | 'hold' | 'reject';
}

interface AnalyticsSummary {
  totalJobs: number;
  publishedJobs: number;
  totalApplications: number;
  upcomingInterviews: number;
  completedInterviews: number;
  byStage: Record<string, number>;
  byDepartment: Array<{ department: string; jobs: number; applicants: number }>;
  byJob: Array<{
    id: number;
    title: string;
    department: string;
    status: string;
    totalApplicants: number;
    shortlistedCount: number;
    hiredCount: number;
  }>;
  conversionRates: {
    shortlistRate: number;
    interviewRate: number;
    hireRate: number;
  };
  suggestedCandidates: Array<{
    userId: number;
    fullName: string;
    headline: string;
    location: string;
    country: string;
    skills: string[];
    openToWork: boolean;
  }>;
  recentActivity: Array<{
    id: number;
    action: string;
    targetType: string;
    createdAt: string;
  }>;
}

interface AiMatchResult {
  matchSummary: string;
  matchedSkills: string[];
  missingEvidence: string[];
  interviewFocusAreas: string[];
}

interface AiQuestionItem {
  id: string;
  category: string;
  question: string;
}

const ATS_STAGES = [
  'submitted',
  'screening',
  'shortlisted',
  'interview',
  'offer',
  'hired',
  'rejected',
] as const;

export const EmployerWorkspaceView: React.FC<EmployerWorkspaceProps> = ({
  onOpenConversation,
  onViewProfile,
}) => {
  const { organizations, apiFetch, refreshSession } = useAuth();
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(organizations[0]?.id ?? null);
  const [subTab, setSubTab] = useState<SubTab>('overview');
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);

  const [orgJobs, setOrgJobs] = useState<OrgJob[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [applications, setApplications] = useState<OrgApplication[]>([]);
  const [interviews, setInterviews] = useState<OrgInterview[]>([]);
  const [talentPools, setTalentPools] = useState<TalentPool[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);

  // Dashboard & Analytics filters
  const [analyticsRange, setAnalyticsRange] = useState<'all' | '7d' | '30d' | '90d'>('all');
  const [analyticsJobId, setAnalyticsJobId] = useState('');
  const [analyticsDept, setAnalyticsDept] = useState('');

  // Create org form
  const [showNewOrg, setShowNewOrg] = useState(organizations.length === 0);
  const [orgName, setOrgName] = useState('');
  const [orgIndustry, setOrgIndustry] = useState('Technology');
  const [orgLocation, setOrgLocation] = useState('Mbabane');
  const [orgCountry, setOrgCountry] = useState('Eswatini');
  const [orgWebsite, setOrgWebsite] = useState('');
  const [orgSize, setOrgSize] = useState('11-50 employees');
  const [orgDesc, setOrgDesc] = useState('');

  // Edit active org form
  const [editOrgName, setEditOrgName] = useState('');
  const [editOrgIndustry, setEditOrgIndustry] = useState('');
  const [editOrgLocation, setEditOrgLocation] = useState('');
  const [editOrgCountry, setEditOrgCountry] = useState('');
  const [editOrgWebsite, setEditOrgWebsite] = useState('');
  const [editOrgSize, setEditOrgSize] = useState('');
  const [editOrgDesc, setEditOrgDesc] = useState('');

  // Create / Edit job form
  const [editingJobId, setEditingJobId] = useState<number | null>(null);
  const [jobTitle, setJobTitle] = useState('');
  const [jobDepartment, setJobDepartment] = useState('Engineering');
  const [jobDesc, setJobDesc] = useState('');
  const [jobReqs, setJobReqs] = useState('');
  const [jobLoc, setJobLoc] = useState('Mbabane');
  const [jobCountry, setJobCountry] = useState('Eswatini');
  const [jobArr, setJobArr] = useState<'remote' | 'hybrid' | 'onsite'>('hybrid');
  const [jobType, setJobType] = useState<'full-time' | 'part-time' | 'contract' | 'internship'>(
    'full-time'
  );
  const [jobLevel, setJobLevel] = useState<'entry' | 'mid' | 'senior' | 'executive'>('mid');
  const [jobSalary, setJobSalary] = useState('');
  const [jobClosingDate, setJobClosingDate] = useState('');
  const [jobInitialStatus, setJobInitialStatus] = useState<'published' | 'draft'>('published');
  const [draftingAiJob, setDraftingAiJob] = useState(false);

  // Jobs filter
  const [jobFilterText, setJobFilterText] = useState('');
  const [jobFilterStatus, setJobFilterStatus] = useState('');
  const [jobFilterDept, setJobFilterDept] = useState('');
  const [jobFilterType, setJobFilterType] = useState('');

  // Applications view, filters & detail modal
  const [appViewMode, setAppViewMode] = useState<'list' | 'pipeline'>('list');
  const [appSearchText, setAppSearchText] = useState('');
  const [appFilterStage, setAppFilterStage] = useState('');
  const [appFilterJobId, setAppFilterJobId] = useState('');
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [stageNoteDraft, setStageNoteDraft] = useState('');
  const [pendingRejectAppId, setPendingRejectAppId] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});
  const [matchResults, setMatchResults] = useState<Record<number, AiMatchResult>>({});
  const [matchingAppId, setMatchingAppId] = useState<number | null>(null);
  const [aiQuestionsMap, setAiQuestionsMap] = useState<Record<number, AiQuestionItem[]>>({});
  const [generatingQuestionsAppId, setGeneratingQuestionsAppId] = useState<number | null>(null);

  // Talent search & pools
  const [talentQ, setTalentQ] = useState('');
  const [talentSkill, setTalentSkill] = useState('');
  const [talentLocation, setTalentLocation] = useState('');
  const [talentOpenToWork, setTalentOpenToWork] = useState(false);
  const [talentPage, setTalentPage] = useState(1);
  const [talentTotalPages, setTalentTotalPages] = useState(1);
  const [talentTotal, setTalentTotal] = useState(0);
  const [talentResults, setTalentResults] = useState<TalentCandidate[]>([]);
  const [searchingTalent, setSearchingTalent] = useState(false);
  const [newPoolName, setNewPoolName] = useState('');
  const [newPoolDesc, setNewPoolDesc] = useState('');
  const [selectedPoolId, setSelectedPoolId] = useState<number | ''>('');
  const [inviteJobId, setInviteJobId] = useState<number | ''>('');

  // Interviews form & view mode
  const [interviewViewMode, setInterviewViewMode] = useState<'list' | 'calendar'>('list');
  const [interviewAppId, setInterviewAppId] = useState<number | ''>('');
  const [interviewType, setInterviewType] = useState<'video' | 'in_person' | 'phone'>('video');
  const [interviewDateTime, setInterviewDateTime] = useState('');
  const [interviewLocationOrLink, setInterviewLocationOrLink] = useState('');
  const [interviewNotes, setInterviewNotes] = useState('');
  const [rescheduleId, setRescheduleId] = useState<number | null>(null);
  const [rescheduleDateTime, setRescheduleDateTime] = useState('');
  const [rescheduleLink, setRescheduleLink] = useState('');

  // Team management form & confirm removal
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<
    'admin' | 'recruiter' | 'hiring_manager' | 'interviewer' | 'viewer'
  >('recruiter');
  const [confirmRemoveMemberId, setConfirmRemoveMemberId] = useState<number | null>(null);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedOrg: OrganizationSummary | null =
    organizations.find((o) => o.id === selectedOrgId) || organizations[0] || null;

  const memberRoleKey = selectedOrg?.memberRole || 'viewer';
  const canManageCompany = memberRoleKey === 'owner' || memberRoleKey === 'admin';
  const canRecruit = canManageCompany || memberRoleKey === 'recruiter';
  const canMoveStages = canRecruit || memberRoleKey === 'hiring_manager';
  const canViewAnalytics = canMoveStages;

  useEffect(() => {
    if (!selectedOrgId && organizations[0]) {
      setSelectedOrgId(organizations[0].id);
      setShowNewOrg(false);
    }
  }, [organizations, selectedOrgId]);

  useEffect(() => {
    if (selectedOrg) {
      setEditOrgName(selectedOrg.name);
      setEditOrgIndustry(selectedOrg.industry);
      setEditOrgLocation(selectedOrg.location);
      setEditOrgCountry(selectedOrg.country);
      setEditOrgWebsite(selectedOrg.website || '');
      setEditOrgSize(selectedOrg.size || '11-50 employees');
      setEditOrgDesc(selectedOrg.description || '');
    }
  }, [selectedOrg]);

  const loadAnalytics = useCallback(async () => {
    if (!selectedOrg || !canViewAnalytics) {
      setAnalytics(null);
      return;
    }
    try {
      const qs = new URLSearchParams();
      if (analyticsRange !== 'all') qs.set('range', analyticsRange);
      if (analyticsJobId) qs.set('jobId', analyticsJobId);
      if (analyticsDept) qs.set('department', analyticsDept);
      const statsRes = await apiFetch<AnalyticsSummary>(
        `/api/organizations/${selectedOrg.id}/analytics?${qs.toString()}`
      );
      setAnalytics(statsRes);
    } catch {
      // ignore if viewer/interviewer
    }
  }, [analyticsDept, analyticsJobId, analyticsRange, apiFetch, canViewAnalytics, selectedOrg]);

  const loadWorkspace = useCallback(async () => {
    if (!selectedOrg) return;
    setLoadingWorkspace(true);
    try {
      const [jobsRes, appsRes, membersRes, interviewsRes, poolsRes] = await Promise.all([
        apiFetch<{ jobs: OrgJob[] }>(`/api/organizations/${selectedOrg.id}/jobs`),
        apiFetch<{ applications: OrgApplication[] }>(
          `/api/organizations/${selectedOrg.id}/applications`
        ),
        apiFetch<{ members: OrgMember[] }>(`/api/organizations/${selectedOrg.id}/members`),
        apiFetch<{ interviews: OrgInterview[] }>(`/api/organizations/${selectedOrg.id}/interviews`),
        apiFetch<{ pools: TalentPool[] }>(`/api/organizations/${selectedOrg.id}/talent-pools`),
      ]);
      const loadedJobs = jobsRes.jobs || [];
      setOrgJobs(loadedJobs);
      const firstPublished = loadedJobs.find((j) => j.status === 'published');
      if (firstPublished && !inviteJobId) {
        setInviteJobId(firstPublished.id);
      }

      const apps = appsRes.applications || [];
      setApplications(apps);
      setNotesDraft((prev) => {
        const next = { ...prev };
        for (const a of apps) {
          if (next[a.id] === undefined) next[a.id] = a.employerNotes || '';
        }
        return next;
      });
      setMembers(membersRes.members || []);
      setInterviews(interviewsRes.interviews || []);
      const loadedPools = poolsRes.pools || [];
      setTalentPools(loadedPools);
      if (loadedPools[0] && !selectedPoolId) {
        setSelectedPoolId(loadedPools[0].id);
      }
      await loadAnalytics();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load recruiter workspace');
    } finally {
      setLoadingWorkspace(false);
    }
  }, [apiFetch, inviteJobId, loadAnalytics, selectedOrg, selectedPoolId]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const resetJobForm = () => {
    setEditingJobId(null);
    setJobTitle('');
    setJobDepartment('Engineering');
    setJobDesc('');
    setJobReqs('');
    setJobLoc('Mbabane');
    setJobCountry('Eswatini');
    setJobArr('hybrid');
    setJobType('full-time');
    setJobLevel('mid');
    setJobSalary('');
    setJobClosingDate('');
  };

  const handleStartEditJob = (job: OrgJob) => {
    setEditingJobId(job.id);
    setJobTitle(job.title);
    setJobDepartment(job.department || 'General');
    setJobDesc(job.description);
    setJobReqs(job.requirements);
    setJobLoc(job.location);
    setJobCountry(job.country);
    setJobArr(job.workArrangement);
    setJobType(job.employmentType);
    setJobLevel(job.experienceLevel);
    setJobSalary(job.salaryRange || '');
    setJobClosingDate(job.expiresAt ? job.expiresAt.slice(0, 10) : '');
    setSubTab('jobs');
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await apiFetch<{ organization: OrganizationSummary }>('/api/organizations', {
        method: 'POST',
        body: JSON.stringify({
          name: orgName,
          industry: orgIndustry,
          location: orgLocation,
          country: orgCountry,
          website: orgWebsite,
          size: orgSize,
          description: orgDesc,
        }),
      });
      await refreshSession();
      setSelectedOrgId(res.organization.id);
      setShowNewOrg(false);
      setOrgName('');
      setOrgWebsite('');
      setOrgDesc('');
      setMessage('Company workspace created.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    }
  };

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    setError('');
    setMessage('');
    try {
      await apiFetch(`/api/organizations/${selectedOrg.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editOrgName,
          industry: editOrgIndustry,
          location: editOrgLocation,
          country: editOrgCountry,
          website: editOrgWebsite,
          size: editOrgSize,
          description: editOrgDesc,
        }),
      });
      await refreshSession();
      setMessage('Company details updated.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update company details');
    }
  };

  const handleDraftJobWithAi = async () => {
    if (!selectedOrg || !jobTitle.trim()) {
      setError('Enter a job title first to generate an AI draft.');
      return;
    }
    setDraftingAiJob(true);
    setError('');
    try {
      const draft = await apiFetch<{ description: string; requirements: string }>(
        `/api/organizations/${selectedOrg.id}/ai/job-draft`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: jobTitle,
            department: jobDepartment,
            location: jobLoc,
            country: jobCountry,
            employmentType: jobType,
            experienceLevel: jobLevel,
            notes: jobDesc,
          }),
        }
      );
      if (draft.description) setJobDesc(draft.description);
      if (draft.requirements) setJobReqs(draft.requirements);
      setMessage('AI drafted job description and requirements for your review.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'AI job draft unavailable');
    } finally {
      setDraftingAiJob(false);
    }
  };

  const handleSaveJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    setError('');
    setMessage('');
    try {
      if (editingJobId) {
        await apiFetch(`/api/organizations/${selectedOrg.id}/jobs/${editingJobId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: jobTitle,
            department: jobDepartment,
            description: jobDesc,
            requirements: jobReqs,
            location: jobLoc,
            country: jobCountry,
            workArrangement: jobArr,
            employmentType: jobType,
            experienceLevel: jobLevel,
            salaryRange: jobSalary,
            expiresAt: jobClosingDate || null,
          }),
        });
        setMessage('Vacancy details updated.');
      } else {
        await apiFetch(`/api/organizations/${selectedOrg.id}/jobs`, {
          method: 'POST',
          body: JSON.stringify({
            title: jobTitle,
            department: jobDepartment,
            description: jobDesc,
            requirements: jobReqs,
            location: jobLoc,
            country: jobCountry,
            workArrangement: jobArr,
            employmentType: jobType,
            experienceLevel: jobLevel,
            salaryRange: jobSalary,
            status: jobInitialStatus,
            expiresAt: jobClosingDate || null,
          }),
        });
        setMessage(
          jobInitialStatus === 'draft' ? 'Job saved as draft.' : 'Job vacancy published.'
        );
      }
      resetJobForm();
      await loadWorkspace();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save job vacancy');
    }
  };

  const handleUpdateJobStatus = async (
    jobId: number,
    status: 'draft' | 'published' | 'paused' | 'closed' | 'archived'
  ) => {
    if (!selectedOrg) return;
    setError('');
    try {
      await apiFetch(`/api/organizations/${selectedOrg.id}/jobs/${jobId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setMessage(`Vacancy status updated to ${status}.`);
      await loadWorkspace();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update job status');
    }
  };

  const handleUpdateStage = async (appId: number, stage: string, note = '') => {
    if (!selectedOrg) return;
    if (stage === 'rejected' && pendingRejectAppId !== appId) {
      setPendingRejectAppId(appId);
      return;
    }
    setError('');
    try {
      await apiFetch(`/api/organizations/${selectedOrg.id}/applications/${appId}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ stage, note: note.trim() || undefined }),
      });
      setPendingRejectAppId(null);
      setStageNoteDraft('');
      setMessage(`Candidate stage updated to ${stage}.`);
      await loadWorkspace();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update application stage');
    }
  };

  const handleSaveAppNotes = async (appId: number) => {
    if (!selectedOrg) return;
    setError('');
    try {
      await apiFetch(`/api/organizations/${selectedOrg.id}/applications/${appId}/notes`, {
        method: 'PATCH',
        body: JSON.stringify({ employerNotes: notesDraft[appId] ?? '' }),
      });
      setMessage('Private recruiter notes saved.');
      await loadWorkspace();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save notes');
    }
  };

  const handleRunAiMatch = async (appId: number) => {
    if (!selectedOrg) return;
    setMatchingAppId(appId);
    setError('');
    try {
      const res = await apiFetch<AiMatchResult>(
        `/api/organizations/${selectedOrg.id}/ai/match-candidate`,
        {
          method: 'POST',
          body: JSON.stringify({ applicationId: appId }),
        }
      );
      setMatchResults((prev) => ({ ...prev, [appId]: res }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Advisory AI match failed');
    } finally {
      setMatchingAppId(null);
    }
  };

  const handleGenerateInterviewQuestions = async (appId: number) => {
    if (!selectedOrg) return;
    setGeneratingQuestionsAppId(appId);
    setError('');
    try {
      const res = await apiFetch<{ questions: AiQuestionItem[] }>(
        `/api/organizations/${selectedOrg.id}/ai/interview-questions`,
        {
          method: 'POST',
          body: JSON.stringify({ applicationId: appId }),
        }
      );
      setAiQuestionsMap((prev) => ({ ...prev, [appId]: res.questions || [] }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'AI interview question generator failed');
    } finally {
      setGeneratingQuestionsAppId(null);
    }
  };

  const handleSearchTalent = async (targetPage = 1) => {
    if (!selectedOrg || !canRecruit) return;
    setSearchingTalent(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (talentQ.trim()) qs.set('q', talentQ.trim());
      if (talentSkill.trim()) qs.set('skill', talentSkill.trim());
      if (talentLocation.trim()) qs.set('location', talentLocation.trim());
      if (talentOpenToWork) qs.set('openToWork', 'true');
      qs.set('page', String(targetPage));
      qs.set('limit', '8');
      const res = await apiFetch<{
        candidates: TalentCandidate[];
        total: number;
        page: number;
        totalPages: number;
      }>(`/api/organizations/${selectedOrg.id}/talent?${qs.toString()}`);
      setTalentResults(res.candidates || []);
      setTalentPage(res.page || 1);
      setTalentTotalPages(res.totalPages || 1);
      setTalentTotal(res.total || 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Talent search unavailable');
    } finally {
      setSearchingTalent(false);
    }
  };

  const handleInviteCandidate = async (candidateId: number) => {
    if (!selectedOrg || !inviteJobId) {
      setError('Select a published vacancy first to invite a candidate.');
      return;
    }
    setError('');
    try {
      await apiFetch(`/api/organizations/${selectedOrg.id}/talent/${candidateId}/invite`, {
        method: 'POST',
        body: JSON.stringify({ jobId: Number(inviteJobId) }),
      });
      setMessage('Invitation sent to candidate notifications.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
    }
  };

  const handleCreatePool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    setError('');
    try {
      const res = await apiFetch<{ pool: TalentPool }>(
        `/api/organizations/${selectedOrg.id}/talent-pools`,
        {
          method: 'POST',
          body: JSON.stringify({ name: newPoolName, description: newPoolDesc }),
        }
      );
      setNewPoolName('');
      setNewPoolDesc('');
      setSelectedPoolId(res.pool.id);
      setMessage('Talent pool created.');
      await loadWorkspace();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create talent pool');
    }
  };

  const handleSaveToPool = async (candidateId: number) => {
    if (!selectedOrg || !selectedPoolId) {
      setError('Create or select a talent pool first.');
      return;
    }
    setError('');
    try {
      await apiFetch(`/api/organizations/${selectedOrg.id}/talent-pools/${selectedPoolId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId: candidateId }),
      });
      setMessage('Candidate saved to talent pool.');
      await loadWorkspace();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save candidate to pool');
    }
  };

  const handleRemoveFromPool = async (poolId: number, memberId: number) => {
    if (!selectedOrg) return;
    await apiFetch(
      `/api/organizations/${selectedOrg.id}/talent-pools/${poolId}/members/${memberId}`,
      { method: 'DELETE' }
    );
    await loadWorkspace();
  };

  const handleScheduleInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg || !interviewAppId) return;
    setError('');
    try {
      await apiFetch(`/api/organizations/${selectedOrg.id}/interviews`, {
        method: 'POST',
        body: JSON.stringify({
          applicationId: Number(interviewAppId),
          interviewType,
          scheduledAt: interviewDateTime,
          locationOrLink: interviewLocationOrLink,
          notes: interviewNotes,
        }),
      });
      setInterviewAppId('');
      setInterviewDateTime('');
      setInterviewLocationOrLink('');
      setInterviewNotes('');
      setMessage('Interview scheduled and candidate notified.');
      await loadWorkspace();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to schedule interview');
    }
  };

  const handleUpdateInterview = async (
    interviewId: number,
    payload: Partial<{
      status: string;
      feedback: string;
      outcome: string;
      scheduledAt: string;
      locationOrLink: string;
    }>
  ) => {
    if (!selectedOrg) return;
    setError('');
    try {
      await apiFetch(`/api/organizations/${selectedOrg.id}/interviews/${interviewId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setRescheduleId(null);
      setMessage('Interview record updated.');
      await loadWorkspace();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update interview');
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    setError('');
    try {
      await apiFetch(`/api/organizations/${selectedOrg.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: memberEmail, role: memberRole }),
      });
      setMemberEmail('');
      setMessage('Team member added and notified.');
      await loadWorkspace();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add team member');
    }
  };

  const handleUpdateMember = async (
    memberId: number,
    payload: { role?: string; status?: 'active' | 'suspended' }
  ) => {
    if (!selectedOrg) return;
    setError('');
    try {
      await apiFetch(`/api/organizations/${selectedOrg.id}/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setMessage('Team member access updated.');
      await loadWorkspace();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update member access');
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (!selectedOrg) return;
    setError('');
    try {
      await apiFetch(`/api/organizations/${selectedOrg.id}/members/${memberId}`, {
        method: 'DELETE',
      });
      setConfirmRemoveMemberId(null);
      setMessage('Team member removed.');
      await loadWorkspace();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const departments = Array.from(new Set(orgJobs.map((j) => j.department || 'General')));
  const publishedJobs = orgJobs.filter((j) => j.status === 'published');

  const filteredJobs = orgJobs.filter((j) => {
    if (jobFilterStatus && j.status !== jobFilterStatus) return false;
    if (jobFilterDept && (j.department || 'General') !== jobFilterDept) return false;
    if (jobFilterType && j.employmentType !== jobFilterType) return false;
    if (jobFilterText.trim()) {
      const q = jobFilterText.trim().toLowerCase();
      if (!`${j.title} ${j.department} ${j.location}`.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const filteredApps = applications.filter((a) => {
    if (appFilterStage && a.stage !== appFilterStage) return false;
    if (appFilterJobId && a.jobId !== Number(appFilterJobId)) return false;
    if (appSearchText.trim()) {
      const q = appSearchText.trim().toLowerCase();
      const hay = `${a.applicant.fullName} ${a.profile.headline} ${a.jobTitle} ${(a.profile.skills || []).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const selectedApp = applications.find((a) => a.id === selectedAppId) || null;

  const groupedInterviewsByDate = interviews.reduce<Record<string, OrgInterview[]>>((acc, iv) => {
    const day = new Date(iv.scheduledAt).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    if (!acc[day]) acc[day] = [];
    acc[day].push(iv);
    return acc;
  }, {});

  const navItems: Array<{
    id: SubTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    visible: boolean;
  }> = [
    { id: 'overview', label: 'Overview', icon: BarChart3, visible: true },
    { id: 'jobs', label: 'Jobs', icon: Briefcase, visible: true },
    { id: 'applications', label: 'Applications', icon: Users, visible: true },
    { id: 'talent', label: 'Talent Search', icon: Search, visible: canRecruit },
    { id: 'interviews', label: 'Interviews', icon: Calendar, visible: true },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, visible: canViewAnalytics },
    { id: 'company', label: 'Company & Team', icon: Building2, visible: true },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      {/* Top Recruiter Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            ResuMind Recruiter Workspace
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Integrated company recruitment workspace connected to ResuMind profiles, messaging, and
            hiring workflows.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {organizations.length > 0 && (
            <select
              value={selectedOrg?.id || ''}
              onChange={(e) => {
                setSelectedOrgId(Number(e.target.value));
                setSelectedAppId(null);
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.memberRole?.replace('_', ' ')})
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setShowNewOrg((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5C4D] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#0c4a3e]"
          >
            <Plus className="h-3.5 w-3.5" />
            New Company
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {message && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage('')}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {showNewOrg && (
        <form
          onSubmit={handleCreateOrg}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Company Onboarding
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="text"
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Registered or trading company name"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              type="text"
              value={orgIndustry}
              onChange={(e) => setOrgIndustry(e.target.value)}
              placeholder="Industry"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              type="text"
              value={orgLocation}
              onChange={(e) => setOrgLocation(e.target.value)}
              placeholder="City"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              type="text"
              value={orgCountry}
              onChange={(e) => setOrgCountry(e.target.value)}
              placeholder="Country"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              type="text"
              value={orgWebsite}
              onChange={(e) => setOrgWebsite(e.target.value)}
              placeholder="Company website (optional)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <select
              value={orgSize}
              onChange={(e) => setOrgSize(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="1-10 employees">1-10 employees</option>
              <option value="11-50 employees">11-50 employees</option>
              <option value="51-200 employees">51-200 employees</option>
              <option value="201-500 employees">201-500 employees</option>
              <option value="500+ employees">500+ employees</option>
            </select>
            <textarea
              rows={3}
              value={orgDesc}
              onChange={(e) => setOrgDesc(e.target.value)}
              placeholder="Company overview and recruitment focus..."
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2 dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div className="flex justify-end gap-2">
            {organizations.length > 0 && (
              <button
                type="button"
                onClick={() => setShowNewOrg(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium dark:border-slate-700"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="rounded-lg bg-[#0F5C4D] px-4 py-2 text-xs font-medium text-white"
            >
              Create Company Workspace
            </button>
          </div>
        </form>
      )}

      {selectedOrg ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Recruiter Sidebar */}
          <aside className="space-y-4 lg:col-span-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[#0F5C4D] dark:bg-slate-800 dark:text-emerald-400">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                      {selectedOrg.name}
                    </p>
                    {selectedOrg.verified && (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#0F5C4D] dark:text-emerald-400" />
                    )}
                  </div>
                  <p className="truncate text-[11px] text-slate-500">
                    {selectedOrg.industry} ·{' '}
                    <span className="capitalize">{selectedOrg.verificationStatus}</span>
                  </p>
                </div>
              </div>

              <nav className="mt-4 space-y-1">
                {navItems
                  .filter((i) => i.visible)
                  .map((item) => {
                    const Icon = item.icon;
                    const active = subTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSubTab(item.id);
                          if (item.id === 'talent' && talentResults.length === 0) {
                            handleSearchTalent(1);
                          }
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                          active
                            ? 'bg-[#0F5C4D] text-white'
                            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
              </nav>
            </div>
          </aside>

          {/* Workspace Content Area */}
          <div className="space-y-6 lg:col-span-9">
            {loadingWorkspace && !analytics && orgJobs.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                Loading workspace data...
              </div>
            )}

            {/* OVERVIEW DASHBOARD */}
            {subTab === 'overview' && (
              <div className="space-y-6">
                {canViewAnalytics && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                    <span className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Filters
                    </span>
                    <select
                      value={analyticsRange}
                      onChange={(e) =>
                        setAnalyticsRange(e.target.value as 'all' | '7d' | '30d' | '90d')
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                    >
                      <option value="all">All Time</option>
                      <option value="7d">Last 7 Days</option>
                      <option value="30d">Last 30 Days</option>
                      <option value="90d">Last 90 Days</option>
                    </select>
                    <select
                      value={analyticsJobId}
                      onChange={(e) => setAnalyticsJobId(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                    >
                      <option value="">All Vacancies</option>
                      {orgJobs.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.title}
                        </option>
                      ))}
                    </select>
                    <select
                      value={analyticsDept}
                      onChange={(e) => setAnalyticsDept(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                    >
                      <option value="">All Departments</option>
                      {departments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {analytics ? (
                  <>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-[11px] text-slate-500">Active Vacancies</p>
                        <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                          {analytics.publishedJobs}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-[11px] text-slate-500">Applications</p>
                        <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                          {analytics.totalApplications}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-[11px] text-slate-500">Shortlisted</p>
                        <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                          {analytics.byStage.shortlisted || 0}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-[11px] text-slate-500">Upcoming Interviews</p>
                        <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#0F5C4D] dark:text-emerald-400">
                          {analytics.upcomingInterviews}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-[11px] text-slate-500">Hired</p>
                        <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                          {analytics.byStage.hired || 0}
                        </p>
                      </div>
                    </div>

                    {/* Funnel Performance Bars */}
                    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                          Recruitment Pipeline Breakdown
                        </h2>
                        <button
                          type="button"
                          onClick={() => setSubTab('analytics')}
                          className="text-xs font-medium text-[#0F5C4D] hover:underline dark:text-emerald-400"
                        >
                          Full Analytics
                        </button>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                        {ATS_STAGES.map((stage) => {
                          const countVal = analytics.byStage[stage] || 0;
                          const pct =
                            analytics.totalApplications > 0
                              ? Math.round((countVal / analytics.totalApplications) * 100)
                              : 0;
                          return (
                            <div
                              key={stage}
                              className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"
                            >
                              <p className="text-[11px] font-medium capitalize text-slate-500">
                                {stage}
                              </p>
                              <p className="mt-1 font-mono text-lg font-bold text-slate-900 dark:text-white">
                                {countVal}
                              </p>
                              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                                <div
                                  className="h-full bg-[#0F5C4D] dark:bg-emerald-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white p-5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    Signed in as <strong className="capitalize">{memberRoleKey.replace('_', ' ')}</strong>.
                    Use the sidebar tabs to view assigned interviews, applications, or team info.
                  </div>
                )}

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Recent Applications
                      </h2>
                      <button
                        type="button"
                        onClick={() => setSubTab('applications')}
                        className="text-xs font-medium text-[#0F5C4D] hover:underline dark:text-emerald-400"
                      >
                        View all
                      </button>
                    </div>
                    {applications.length === 0 ? (
                      <p className="py-6 text-xs text-slate-500">No applications received yet.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {applications.slice(0, 5).map((app) => (
                          <div key={app.id} className="flex items-center justify-between gap-3 py-3">
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedAppId(app.id);
                                  setSubTab('applications');
                                }}
                                className="truncate text-left text-xs font-semibold text-slate-900 hover:underline dark:text-white"
                              >
                                {app.applicant.fullName}
                              </button>
                              <p className="truncate text-[11px] text-slate-500">
                                {app.jobTitle} · {app.profile.location}
                              </p>
                            </div>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              {app.stage}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Upcoming & Recent Interviews
                      </h2>
                      <button
                        type="button"
                        onClick={() => setSubTab('interviews')}
                        className="text-xs font-medium text-[#0F5C4D] hover:underline dark:text-emerald-400"
                      >
                        Manage
                      </button>
                    </div>
                    {interviews.length === 0 ? (
                      <p className="py-6 text-xs text-slate-500">No interviews scheduled yet.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {interviews.slice(0, 5).map((iv) => (
                          <div key={iv.id} className="flex items-center justify-between gap-3 py-3">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                                {iv.candidateName}
                              </p>
                              <p className="truncate text-[11px] text-slate-500">
                                {iv.jobTitle} · {new Date(iv.scheduledAt).toLocaleString()}
                              </p>
                            </div>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              {iv.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {analytics && analytics.suggestedCandidates.length > 0 && canRecruit && (
                  <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Suggested Public Professionals (Open to Work)
                      </h2>
                      <button
                        type="button"
                        onClick={() => {
                          setSubTab('talent');
                          handleSearchTalent(1);
                        }}
                        className="text-xs font-medium text-[#0F5C4D] hover:underline dark:text-emerald-400"
                      >
                        Explore Talent Search
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {analytics.suggestedCandidates.map((cand) => (
                        <div
                          key={cand.userId}
                          className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                        >
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {cand.fullName}
                          </p>
                          <p className="truncate text-[11px] text-slate-500">{cand.headline}</p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {cand.location}, {cand.country}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analytics && analytics.recentActivity.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="border-b border-slate-200 pb-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-white">
                      Recruitment Activity Timeline
                    </h2>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {analytics.recentActivity.slice(0, 6).map((ev) => (
                        <div key={ev.id} className="flex items-center justify-between py-2.5 text-xs">
                          <span className="text-slate-700 dark:text-slate-300">{ev.action}</span>
                          <span className="font-mono text-[11px] text-slate-400">
                            {new Date(ev.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* JOB MANAGEMENT */}
            {subTab === 'jobs' && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {canRecruit && (
                  <form
                    onSubmit={handleSaveJob}
                    className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {editingJobId ? 'Edit Job Vacancy' : 'Create Job Vacancy'}
                      </h3>
                      <div className="flex items-center gap-1.5">
                        {editingJobId && (
                          <button
                            type="button"
                            onClick={resetJobForm}
                            className="rounded-md border border-slate-300 px-2 py-1 text-[11px] dark:border-slate-700"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleDraftJobWithAi}
                          disabled={draftingAiJob}
                          className="inline-flex items-center gap-1 rounded-md border border-[#0F5C4D] px-2.5 py-1 text-[11px] font-medium text-[#0F5C4D] hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-400 dark:text-emerald-400 dark:hover:bg-slate-800"
                        >
                          <Sparkles className="h-3 w-3" />
                          {draftingAiJob ? 'Drafting...' : 'AI Draft'}
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      1. Basic Information
                    </p>
                    <input
                      type="text"
                      required
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="Job Title"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={jobDepartment}
                        onChange={(e) => setJobDepartment(e.target.value)}
                        placeholder="Department"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                      />
                      <input
                        type="text"
                        value={jobSalary}
                        onChange={(e) => setJobSalary(e.target.value)}
                        placeholder="Compensation (optional)"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                      />
                      <input
                        type="text"
                        required
                        value={jobLoc}
                        onChange={(e) => setJobLoc(e.target.value)}
                        placeholder="City"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                      />
                      <input
                        type="text"
                        required
                        value={jobCountry}
                        onChange={(e) => setJobCountry(e.target.value)}
                        placeholder="Country"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                      />
                      <select
                        value={jobArr}
                        onChange={(e) =>
                          setJobArr(e.target.value as 'remote' | 'hybrid' | 'onsite')
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="hybrid">Hybrid</option>
                        <option value="remote">Remote</option>
                        <option value="onsite">Onsite</option>
                      </select>
                      <select
                        value={jobType}
                        onChange={(e) =>
                          setJobType(
                            e.target.value as 'full-time' | 'part-time' | 'contract' | 'internship'
                          )
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="full-time">Full-time</option>
                        <option value="part-time">Part-time</option>
                        <option value="contract">Contract</option>
                        <option value="internship">Internship</option>
                      </select>
                      <select
                        value={jobLevel}
                        onChange={(e) =>
                          setJobLevel(e.target.value as 'entry' | 'mid' | 'senior' | 'executive')
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="entry">Entry</option>
                        <option value="mid">Mid</option>
                        <option value="senior">Senior</option>
                        <option value="executive">Executive</option>
                      </select>
                      <input
                        type="date"
                        value={jobClosingDate}
                        onChange={(e) => setJobClosingDate(e.target.value)}
                        title="Application closing date (optional)"
                        className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                      />
                    </div>

                    <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      2. Role & Requirements
                    </p>
                    <textarea
                      rows={4}
                      required
                      value={jobDesc}
                      onChange={(e) => setJobDesc(e.target.value)}
                      placeholder="Role summary and key responsibilities..."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                    <textarea
                      rows={3}
                      value={jobReqs}
                      onChange={(e) => setJobReqs(e.target.value)}
                      placeholder="Skills, qualifications, and experience requirements..."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                    <div className="flex gap-2">
                      {editingJobId ? (
                        <button
                          type="submit"
                          className="flex-1 rounded-lg bg-[#0F5C4D] py-2 text-xs font-medium text-white hover:bg-[#0c4a3e]"
                        >
                          Save Changes
                        </button>
                      ) : (
                        <>
                          <button
                            type="submit"
                            onClick={() => setJobInitialStatus('draft')}
                            className="flex-1 rounded-lg border border-slate-300 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            Save Draft
                          </button>
                          <button
                            type="submit"
                            onClick={() => setJobInitialStatus('published')}
                            className="flex-1 rounded-lg bg-[#0F5C4D] py-2 text-xs font-medium text-white hover:bg-[#0c4a3e]"
                          >
                            Publish Role
                          </button>
                        </>
                      )}
                    </div>
                  </form>
                )}

                <div className={`space-y-3 ${canRecruit ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <input
                      type="text"
                      value={jobFilterText}
                      onChange={(e) => setJobFilterText(e.target.value)}
                      placeholder="Search title, city..."
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                    />
                    <select
                      value={jobFilterStatus}
                      onChange={(e) => setJobFilterStatus(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="">All statuses</option>
                      <option value="published">Published</option>
                      <option value="draft">Draft</option>
                      <option value="paused">Paused</option>
                      <option value="closed">Closed</option>
                      <option value="archived">Archived</option>
                    </select>
                    <select
                      value={jobFilterDept}
                      onChange={(e) => setJobFilterDept(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="">All departments</option>
                      {departments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <select
                      value={jobFilterType}
                      onChange={(e) => setJobFilterType(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="">All types</option>
                      <option value="full-time">Full-time</option>
                      <option value="part-time">Part-time</option>
                      <option value="contract">Contract</option>
                      <option value="internship">Internship</option>
                    </select>
                  </div>

                  <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                    {filteredJobs.length === 0 ? (
                      <p className="p-6 text-xs text-slate-500">No matching vacancies found.</p>
                    ) : (
                      filteredJobs.map((j) => (
                        <div key={j.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {j.title}
                            </p>
                            <p className="text-xs text-slate-500">
                              {j.department} · {j.location}, {j.country} ·{' '}
                              <span className="capitalize">{j.employmentType}</span> ·{' '}
                              <span className="font-mono">{j.applicantCount} applicants</span>
                              {j.expiresAt
                                ? ` · Closes ${new Date(j.expiresAt).toLocaleDateString()}`
                                : ''}
                            </p>
                          </div>
                          {canRecruit && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleStartEditJob(j)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                Edit
                              </button>
                              <select
                                value={j.status}
                                onChange={(e) =>
                                  handleUpdateJobStatus(
                                    j.id,
                                    e.target.value as
                                      | 'draft'
                                      | 'published'
                                      | 'paused'
                                      | 'closed'
                                      | 'archived'
                                  )
                                }
                                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium capitalize dark:border-slate-700 dark:bg-slate-950"
                              >
                                <option value="draft">Draft</option>
                                <option value="published">Published</option>
                                <option value="paused">Paused</option>
                                <option value="closed">Closed</option>
                                <option value="archived">Archived</option>
                              </select>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* APPLICATIONS MANAGEMENT (ATS LIST + PIPELINE + CANDIDATE DETAILS) */}
            {subTab === 'applications' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={appSearchText}
                      onChange={(e) => setAppSearchText(e.target.value)}
                      placeholder="Search applicant, skill..."
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                    <select
                      value={appFilterJobId}
                      onChange={(e) => setAppFilterJobId(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                    >
                      <option value="">All Vacancies</option>
                      {orgJobs.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.title}
                        </option>
                      ))}
                    </select>
                    <select
                      value={appFilterStage}
                      onChange={(e) => setAppFilterStage(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs capitalize dark:border-slate-700 dark:bg-slate-950"
                    >
                      <option value="">All Stages</option>
                      {ATS_STAGES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => setAppViewMode('list')}
                      className={`rounded-md px-3 py-1 text-xs font-medium ${
                        appViewMode === 'list'
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      List View
                    </button>
                    <button
                      type="button"
                      onClick={() => setAppViewMode('pipeline')}
                      className={`rounded-md px-3 py-1 text-xs font-medium ${
                        appViewMode === 'pipeline'
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Pipeline View
                    </button>
                  </div>
                </div>

                {appViewMode === 'pipeline' ? (
                  <div className="grid grid-cols-1 gap-3 overflow-x-auto md:grid-cols-4 xl:grid-cols-7">
                    {ATS_STAGES.map((stage) => {
                      const stageApps = filteredApps.filter((a) => a.stage === stage);
                      return (
                        <div
                          key={stage}
                          className="min-w-[190px] rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                        >
                          <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
                            <span className="text-xs font-semibold capitalize text-slate-900 dark:text-white">
                              {stage}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500">
                              {stageApps.length}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {stageApps.length === 0 ? (
                              <p className="py-3 text-[11px] text-slate-400">Empty</p>
                            ) : (
                              stageApps.map((app) => (
                                <div
                                  key={app.id}
                                  className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-950"
                                >
                                  <button
                                    type="button"
                                    onClick={() => setSelectedAppId(app.id)}
                                    className="text-left font-semibold text-slate-900 hover:underline dark:text-white"
                                  >
                                    {app.applicant.fullName}
                                  </button>
                                  <p className="truncate text-[11px] text-slate-500">
                                    {app.jobTitle}
                                  </p>
                                  {canMoveStages && (
                                    <select
                                      value={app.stage}
                                      onChange={(e) => handleUpdateStage(app.id, e.target.value)}
                                      className="mt-2 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[11px] capitalize dark:border-slate-700 dark:bg-slate-900"
                                    >
                                      {ATS_STAGES.map((s) => (
                                        <option key={s} value={s}>
                                          Move: {s}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                    {filteredApps.length === 0 ? (
                      <p className="p-6 text-sm text-slate-500">No matching applications yet.</p>
                    ) : (
                      filteredApps.map((app) => {
                        const match = matchResults[app.id];
                        return (
                          <div key={app.id} className="space-y-3 p-5">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div>
                                <button
                                  type="button"
                                  onClick={() => setSelectedAppId(app.id)}
                                  className="text-left text-sm font-semibold text-slate-900 hover:text-[#0F5C4D] hover:underline dark:text-white"
                                >
                                  {app.applicant.fullName} — Applied for {app.jobTitle}
                                </button>
                                <p className="text-xs text-slate-500">
                                  {app.profile.headline} · {app.profile.location},{' '}
                                  {app.profile.country}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedAppId(app.id)}
                                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                  Inspect Candidate
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRunAiMatch(app.id)}
                                  disabled={matchingAppId === app.id}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                  <Sparkles className="h-3.5 w-3.5 text-[#0F5C4D] dark:text-emerald-400" />
                                  {matchingAppId === app.id ? 'Analysing...' : 'AI Skills Match'}
                                </button>
                                {onOpenConversation && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenConversation(app.applicant.id)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                  >
                                    <MessageSquare className="h-3.5 w-3.5" />
                                    Message
                                  </button>
                                )}
                                {canMoveStages && (
                                  <select
                                    value={app.stage}
                                    onChange={(e) => handleUpdateStage(app.id, e.target.value)}
                                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium capitalize dark:border-slate-700 dark:bg-slate-950"
                                  >
                                    {ATS_STAGES.map((st) => (
                                      <option key={st} value={st}>
                                        {st}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </div>

                            {pendingRejectAppId === app.id && (
                              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs dark:border-red-900 dark:bg-red-950/60">
                                <span className="font-medium text-red-800 dark:text-red-200">
                                  Confirm moving {app.applicant.fullName} to Rejected? This will
                                  notify the applicant and log an audit entry.
                                </span>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={stageNoteDraft}
                                    onChange={(e) => setStageNoteDraft(e.target.value)}
                                    placeholder="Optional internal audit note..."
                                    className="rounded border border-red-300 bg-white px-2.5 py-1 text-xs dark:border-red-800 dark:bg-slate-900"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setPendingRejectAppId(null)}
                                    className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateStage(app.id, 'rejected', stageNoteDraft)
                                    }
                                    className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white"
                                  >
                                    Confirm Reject
                                  </button>
                                </div>
                              </div>
                            )}

                            {match && (
                              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs dark:border-emerald-900 dark:bg-emerald-950/40">
                                <p className="font-semibold text-slate-900 dark:text-white">
                                  Advisory Skills Assessment
                                </p>
                                <p className="mt-1 text-slate-700 dark:text-slate-300">
                                  {match.matchSummary}
                                </p>
                                {match.matchedSkills.length > 0 && (
                                  <p className="mt-1.5 text-slate-700 dark:text-slate-300">
                                    <strong>Matched:</strong> {match.matchedSkills.join(', ')}
                                  </p>
                                )}
                                {match.missingEvidence.length > 0 && (
                                  <p className="mt-1 text-slate-700 dark:text-slate-300">
                                    <strong>Missing evidence:</strong>{' '}
                                    {match.missingEvidence.join(', ')}
                                  </p>
                                )}
                              </div>
                            )}

                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="text"
                                value={notesDraft[app.id] ?? ''}
                                onChange={(e) =>
                                  setNotesDraft((prev) => ({ ...prev, [app.id]: e.target.value }))
                                }
                                placeholder="Private internal recruiter notes (never shown to candidate)..."
                                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveAppNotes(app.id)}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                              >
                                Save Note
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* CANDIDATE DETAILS MODAL (SCREEN F TWO-COLUMN LAYOUT) */}
                {selectedApp && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
                    <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
                        <div>
                          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                            {selectedApp.applicant.fullName}
                          </h2>
                          <p className="text-xs text-slate-500">
                            {selectedApp.profile.headline} · {selectedApp.profile.location},{' '}
                            {selectedApp.profile.country} · Applied for{' '}
                            <strong>{selectedApp.jobTitle}</strong>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedAppId(null)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
                        {/* Main Column */}
                        <div className="space-y-4 lg:col-span-7">
                          <div>
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Listed Skills
                            </h3>
                            <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">
                              {(selectedApp.profile.skills || []).join(' · ') || 'No skills listed'}
                            </p>
                          </div>

                          {selectedApp.coverLetter && (
                            <div>
                              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Cover Note
                              </h3>
                              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                                {selectedApp.coverLetter}
                              </p>
                            </div>
                          )}

                          {selectedApp.cvDocument && (
                            <div>
                              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Submitted CV ({selectedApp.cvDocument.title})
                              </h3>
                              <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 p-3 text-[11px] text-slate-700 dark:border-slate-800 dark:text-slate-300">
                                {selectedApp.cvDocument.extractedText}
                              </pre>
                            </div>
                          )}

                          {aiQuestionsMap[selectedApp.id] && (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-950">
                              <h3 className="font-semibold text-slate-900 dark:text-white">
                                Suggested Interview Questions (Advisory)
                              </h3>
                              <ul className="mt-2 space-y-2">
                                {aiQuestionsMap[selectedApp.id].map((q) => (
                                  <li key={q.id}>
                                    <span className="font-medium text-[#0F5C4D] dark:text-emerald-400">
                                      [{q.category}]
                                    </span>{' '}
                                    {q.question}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div>
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Stage Transition History
                            </h3>
                            {selectedApp.history.length === 0 ? (
                              <p className="mt-1 text-xs text-slate-400">No stage transitions yet.</p>
                            ) : (
                              <div className="mt-1.5 space-y-1.5">
                                {selectedApp.history.map((h) => (
                                  <div
                                    key={h.id}
                                    className="flex items-center justify-between rounded bg-slate-50 px-3 py-1.5 text-[11px] dark:bg-slate-950"
                                  >
                                    <span>
                                      {h.fromStage ? `${h.fromStage} → ` : ''}
                                      <strong className="capitalize">{h.toStage}</strong>
                                      {h.note ? ` (${h.note})` : ''}
                                    </span>
                                    <span className="font-mono text-slate-400">
                                      {new Date(h.createdAt).toLocaleString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Side Panel */}
                        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:col-span-5 dark:border-slate-800 dark:bg-slate-950">
                          <div>
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                              Application Stage
                            </label>
                            <div className="mt-1.5 flex gap-2">
                              {canMoveStages ? (
                                <select
                                  value={selectedApp.stage}
                                  onChange={(e) =>
                                    handleUpdateStage(selectedApp.id, e.target.value)
                                  }
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium capitalize dark:border-slate-700 dark:bg-slate-900"
                                >
                                  {ATS_STAGES.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="rounded bg-white px-2.5 py-1 text-xs font-medium capitalize dark:bg-slate-900">
                                  {selectedApp.stage}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col gap-2">
                            {onViewProfile && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedAppId(null);
                                  onViewProfile(selectedApp.applicant.id);
                                }}
                                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900"
                              >
                                <UserCheck className="h-3.5 w-3.5" />
                                View Full Public Profile
                              </button>
                            )}
                            {onOpenConversation && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedAppId(null);
                                  onOpenConversation(selectedApp.applicant.id);
                                }}
                                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900"
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                                Message Candidate
                              </button>
                            )}
                            {canMoveStages && (
                              <button
                                type="button"
                                onClick={() => {
                                  setInterviewAppId(selectedApp.id);
                                  setSelectedAppId(null);
                                  setSubTab('interviews');
                                }}
                                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0F5C4D] px-3 py-2 text-xs font-medium text-white"
                              >
                                <Calendar className="h-3.5 w-3.5" />
                                Schedule Interview
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleGenerateInterviewQuestions(selectedApp.id)}
                              disabled={generatingQuestionsAppId === selectedApp.id}
                              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#0F5C4D] bg-white px-3 py-2 text-xs font-medium text-[#0F5C4D] dark:border-emerald-400 dark:bg-slate-900 dark:text-emerald-400"
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              {generatingQuestionsAppId === selectedApp.id
                                ? 'Generating Questions...'
                                : 'Generate Interview Questions'}
                            </button>
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                              Private Internal Notes
                            </label>
                            <textarea
                              rows={4}
                              value={notesDraft[selectedApp.id] ?? ''}
                              onChange={(e) =>
                                setNotesDraft((prev) => ({
                                  ...prev,
                                  [selectedApp.id]: e.target.value,
                                }))
                              }
                              placeholder="Internal evaluation notes (invisible to candidate)..."
                              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveAppNotes(selectedApp.id)}
                              className="mt-2 w-full rounded-lg border border-slate-300 bg-white py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900"
                            >
                              Save Internal Notes
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TALENT SEARCH & POOLS */}
            {subTab === 'talent' && canRecruit && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <div className="space-y-4 lg:col-span-8">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSearchTalent(1);
                    }}
                    className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                      <input
                        type="text"
                        value={talentQ}
                        onChange={(e) => setTalentQ(e.target.value)}
                        placeholder="Title, education, keyword..."
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                      />
                      <input
                        type="text"
                        value={talentSkill}
                        onChange={(e) => setTalentSkill(e.target.value)}
                        placeholder="Required skill..."
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                      />
                      <input
                        type="text"
                        value={talentLocation}
                        onChange={(e) => setTalentLocation(e.target.value)}
                        placeholder="City or country..."
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                      />
                      <button
                        type="submit"
                        disabled={searchingTalent}
                        className="rounded-lg bg-[#0F5C4D] px-4 py-2 text-xs font-medium text-white hover:bg-[#0c4a3e]"
                      >
                        {searchingTalent ? 'Searching...' : 'Search Talent'}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                      <label className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={talentOpenToWork}
                          onChange={(e) => setTalentOpenToWork(e.target.checked)}
                        />
                        Open to work candidates only
                      </label>
                      {publishedJobs.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-500">Invite role:</span>
                          <select
                            value={inviteJobId}
                            onChange={(e) => setInviteJobId(Number(e.target.value))}
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-950"
                          >
                            {publishedJobs.map((j) => (
                              <option key={j.id} value={j.id}>
                                {j.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </form>

                  <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                    {talentResults.length === 0 ? (
                      <p className="p-6 text-xs text-slate-500">
                        No public profiles matched your search filters.
                      </p>
                    ) : (
                      talentResults.map((c) => (
                        <div key={c.userId} className="flex flex-wrap items-start justify-between gap-4 p-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                {c.fullName}
                              </p>
                              {c.openToWork && (
                                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-[#0F5C4D] dark:bg-emerald-950 dark:text-emerald-300">
                                  Open to work
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              {c.headline}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {c.location}, {c.country}
                            </p>
                            {c.skills.length > 0 && (
                              <p className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                                Skills: {c.skills.slice(0, 8).join(', ')}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {onViewProfile && (
                              <button
                                type="button"
                                onClick={() => onViewProfile(c.userId)}
                                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                              >
                                Profile
                              </button>
                            )}
                            {onOpenConversation && (
                              <button
                                type="button"
                                onClick={() => onOpenConversation(c.userId)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                                Message
                              </button>
                            )}
                            {publishedJobs.length > 0 && (
                              <button
                                type="button"
                                onClick={() => handleInviteCandidate(c.userId)}
                                className="inline-flex items-center gap-1 rounded-lg border border-[#0F5C4D] px-2.5 py-1.5 text-xs font-medium text-[#0F5C4D] hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-400 dark:hover:bg-slate-800"
                              >
                                <Send className="h-3.5 w-3.5" />
                                Invite
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleSaveToPool(c.userId)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                            >
                              <FolderPlus className="h-3.5 w-3.5" />
                              Pool
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {talentTotalPages > 1 && (
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>
                        Showing page {talentPage} of {talentTotalPages} ({talentTotal} candidates)
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={talentPage <= 1}
                          onClick={() => handleSearchTalent(talentPage - 1)}
                          className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50 dark:border-slate-700"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          disabled={talentPage >= talentTotalPages}
                          onClick={() => handleSearchTalent(talentPage + 1)}
                          className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50 dark:border-slate-700"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Talent Pools Sidebar */}
                <div className="space-y-4 lg:col-span-4">
                  <form
                    onSubmit={handleCreatePool}
                    className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      Create Talent Pool
                    </h3>
                    <input
                      type="text"
                      required
                      value={newPoolName}
                      onChange={(e) => setNewPoolName(e.target.value)}
                      placeholder="Pool name (e.g., Backend Engineers)"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                    <input
                      type="text"
                      value={newPoolDesc}
                      onChange={(e) => setNewPoolDesc(e.target.value)}
                      placeholder="Description (optional)"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                    <button
                      type="submit"
                      className="w-full rounded-lg bg-[#0F5C4D] py-2 text-xs font-medium text-white"
                    >
                      Create Pool
                    </button>
                  </form>

                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        Active Pool
                      </h3>
                      {talentPools.length > 0 && (
                        <select
                          value={selectedPoolId}
                          onChange={(e) => setSelectedPoolId(Number(e.target.value))}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
                        >
                          {talentPools.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.members.length})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {talentPools.length === 0 ? (
                      <p className="text-xs text-slate-500">No talent pools created yet.</p>
                    ) : (
                      (() => {
                        const activePool =
                          talentPools.find((p) => p.id === selectedPoolId) || talentPools[0];
                        return activePool.members.length === 0 ? (
                          <p className="text-xs text-slate-500">
                            No candidates saved to "{activePool.name}" yet.
                          </p>
                        ) : (
                          <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {activePool.members.map((m) => (
                              <div key={m.id} className="flex items-center justify-between gap-2 py-2.5 text-xs">
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-slate-900 dark:text-white">
                                    {m.fullName}
                                  </p>
                                  <p className="truncate text-[11px] text-slate-500">{m.headline}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFromPool(activePool.id, m.id)}
                                  className="text-slate-400 hover:text-red-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* INTERVIEW MANAGEMENT */}
            {subTab === 'interviews' && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {canMoveStages && (
                  <form
                    onSubmit={handleScheduleInterview}
                    className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Schedule Candidate Interview
                    </h3>
                    <select
                      required
                      value={interviewAppId}
                      onChange={(e) => setInterviewAppId(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                    >
                      <option value="">Select applicant...</option>
                      {applications.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.applicant.fullName} — {a.jobTitle} ({a.stage})
                        </option>
                      ))}
                    </select>
                    <select
                      value={interviewType}
                      onChange={(e) =>
                        setInterviewType(e.target.value as 'video' | 'in_person' | 'phone')
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                    >
                      <option value="video">Video Interview</option>
                      <option value="in_person">In-Person Interview</option>
                      <option value="phone">Phone Screening</option>
                    </select>
                    <input
                      type="datetime-local"
                      required
                      value={interviewDateTime}
                      onChange={(e) => setInterviewDateTime(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                    <input
                      type="text"
                      value={interviewLocationOrLink}
                      onChange={(e) => setInterviewLocationOrLink(e.target.value)}
                      placeholder="Meeting link or office address"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                    <textarea
                      rows={3}
                      value={interviewNotes}
                      onChange={(e) => setInterviewNotes(e.target.value)}
                      placeholder="Instructions or interview focus notes..."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                    />
                    <button
                      type="submit"
                      className="w-full rounded-lg bg-[#0F5C4D] py-2 text-xs font-medium text-white hover:bg-[#0c4a3e]"
                    >
                      Schedule & Notify Candidate
                    </button>
                  </form>
                )}

                <div className={`space-y-3 ${canMoveStages ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                      Scheduled Interviews ({interviews.length})
                    </span>
                    <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                      <button
                        type="button"
                        onClick={() => setInterviewViewMode('list')}
                        className={`rounded px-2.5 py-1 text-[11px] font-medium ${
                          interviewViewMode === 'list'
                            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        List
                      </button>
                      <button
                        type="button"
                        onClick={() => setInterviewViewMode('calendar')}
                        className={`rounded px-2.5 py-1 text-[11px] font-medium ${
                          interviewViewMode === 'calendar'
                            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Agenda Calendar
                      </button>
                    </div>
                  </div>

                  {interviewViewMode === 'calendar' ? (
                    <div className="space-y-3">
                      {Object.keys(groupedInterviewsByDate).length === 0 ? (
                        <div className="rounded-xl border border-slate-200 bg-white p-6 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                          No interviews scheduled yet.
                        </div>
                      ) : (
                        Object.entries(groupedInterviewsByDate).map(([dayLabel, dayItems]) => (
                          <div
                            key={dayLabel}
                            className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                          >
                            <h4 className="border-b border-slate-100 pb-2 text-xs font-semibold text-[#0F5C4D] dark:border-slate-800 dark:text-emerald-400">
                              {dayLabel}
                            </h4>
                            <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
                              {dayItems.map((iv) => (
                                <div key={iv.id} className="flex items-center justify-between py-2 text-xs">
                                  <div>
                                    <p className="font-semibold text-slate-900 dark:text-white">
                                      {new Date(iv.scheduledAt).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}{' '}
                                      — {iv.candidateName} ({iv.jobTitle})
                                    </p>
                                    <p className="text-[11px] text-slate-500">
                                      <span className="capitalize">
                                        {iv.interviewType.replace('_', ' ')}
                                      </span>
                                      {iv.locationOrLink ? ` · ${iv.locationOrLink}` : ''}
                                    </p>
                                  </div>
                                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] capitalize dark:bg-slate-800">
                                    {iv.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                      {interviews.length === 0 ? (
                        <p className="p-6 text-xs text-slate-500">No interviews scheduled yet.</p>
                      ) : (
                        interviews.map((iv) => (
                          <div key={iv.id} className="space-y-2.5 p-4 text-xs">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                  {iv.candidateName} — {iv.jobTitle}
                                </p>
                                <p className="text-slate-500">
                                  {new Date(iv.scheduledAt).toLocaleString()} ·{' '}
                                  <span className="capitalize">
                                    {iv.interviewType.replace('_', ' ')}
                                  </span>
                                  {iv.locationOrLink ? ` · ${iv.locationOrLink}` : ''}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {canMoveStages && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRescheduleId(rescheduleId === iv.id ? null : iv.id);
                                      setRescheduleDateTime(iv.scheduledAt.slice(0, 16));
                                      setRescheduleLink(iv.locationOrLink || '');
                                    }}
                                    className="rounded border border-slate-300 px-2 py-1 text-[11px] hover:bg-slate-50 dark:border-slate-700"
                                  >
                                    Reschedule
                                  </button>
                                )}
                                <select
                                  value={iv.status}
                                  onChange={(e) =>
                                    handleUpdateInterview(iv.id, { status: e.target.value })
                                  }
                                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] capitalize dark:border-slate-700 dark:bg-slate-950"
                                >
                                  <option value="scheduled">Scheduled</option>
                                  <option value="completed">Completed</option>
                                  <option value="cancelled">Cancelled</option>
                                </select>
                                <select
                                  value={iv.outcome}
                                  onChange={(e) =>
                                    handleUpdateInterview(iv.id, { outcome: e.target.value })
                                  }
                                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] capitalize dark:border-slate-700 dark:bg-slate-950"
                                >
                                  <option value="pending">Outcome: Pending</option>
                                  <option value="pass">Pass</option>
                                  <option value="hold">Hold</option>
                                  <option value="reject">Reject</option>
                                </select>
                              </div>
                            </div>

                            {rescheduleId === iv.id && (
                              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-950">
                                <input
                                  type="datetime-local"
                                  value={rescheduleDateTime}
                                  onChange={(e) => setRescheduleDateTime(e.target.value)}
                                  className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                                />
                                <input
                                  type="text"
                                  value={rescheduleLink}
                                  onChange={(e) => setRescheduleLink(e.target.value)}
                                  placeholder="Updated link or address"
                                  className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateInterview(iv.id, {
                                      scheduledAt: rescheduleDateTime,
                                      locationOrLink: rescheduleLink,
                                    })
                                  }
                                  className="rounded bg-[#0F5C4D] px-3 py-1 text-xs font-medium text-white"
                                >
                                  Save New Time
                                </button>
                              </div>
                            )}

                            <input
                              type="text"
                              defaultValue={iv.feedback}
                              onBlur={(e) => {
                                if (e.target.value !== iv.feedback) {
                                  handleUpdateInterview(iv.id, { feedback: e.target.value });
                                }
                              }}
                              placeholder="Add interview evaluation feedback (auto-saves on blur)..."
                              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-950"
                            />
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ANALYTICS REPORTS */}
            {subTab === 'analytics' && analytics && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-xs text-slate-500">Shortlist Conversion Rate</p>
                    <p className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-white">
                      {analytics.conversionRates.shortlistRate}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-xs text-slate-500">Interview Conversion Rate</p>
                    <p className="mt-1 font-mono text-2xl font-bold text-slate-900 dark:text-white">
                      {analytics.conversionRates.interviewRate}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-xs text-slate-500">Hire Conversion Rate</p>
                    <p className="mt-1 font-mono text-2xl font-bold text-[#0F5C4D] dark:text-emerald-400">
                      {analytics.conversionRates.hireRate}%
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="border-b border-slate-200 pb-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-white">
                    Vacancy Performance Report
                  </h3>
                  {analytics.byJob.length === 0 ? (
                    <p className="py-4 text-xs text-slate-500">No job metrics recorded yet.</p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                          <tr>
                            <th className="py-2 pr-4 font-medium">Vacancy</th>
                            <th className="py-2 pr-4 font-medium">Department</th>
                            <th className="py-2 pr-4 font-medium">Status</th>
                            <th className="py-2 pr-4 font-medium">Applicants</th>
                            <th className="py-2 pr-4 font-medium">Shortlisted+</th>
                            <th className="py-2 font-medium">Hired</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {analytics.byJob.map((row) => (
                            <tr key={row.id}>
                              <td className="py-2.5 pr-4 font-medium text-slate-900 dark:text-white">
                                {row.title}
                              </td>
                              <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">
                                {row.department}
                              </td>
                              <td className="py-2.5 pr-4 capitalize text-slate-600 dark:text-slate-300">
                                {row.status}
                              </td>
                              <td className="py-2.5 pr-4 font-mono">{row.totalApplicants}</td>
                              <td className="py-2.5 pr-4 font-mono">{row.shortlistedCount}</td>
                              <td className="py-2.5 font-mono">{row.hiredCount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {analytics.byDepartment.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <h3 className="border-b border-slate-200 pb-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-white">
                      Department Activity Summary
                    </h3>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {analytics.byDepartment.map((dept) => (
                        <div
                          key={dept.department}
                          className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                        >
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {dept.department}
                          </p>
                          <p className="mt-1 text-slate-500">
                            {dept.jobs} roles · {dept.applicants} applications
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* COMPANY PROFILE & HR TEAM MANAGEMENT */}
            {subTab === 'company' && (
              <div className="space-y-6">
                <form
                  onSubmit={handleUpdateCompany}
                  className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Company Information & Verification
                      </h3>
                      <p className="text-xs text-slate-500">
                        Verification status:{' '}
                        <span className="font-medium capitalize">
                          {selectedOrg.verificationStatus}
                        </span>
                      </p>
                    </div>
                    {!selectedOrg.verified && canManageCompany && (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/organizations/${selectedOrg.id}/verify-request`, {
                            method: 'POST',
                          });
                          setMessage('Verification request submitted.');
                          await refreshSession();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium dark:border-slate-700"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Request Verification
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      required
                      disabled={!canManageCompany}
                      value={editOrgName}
                      onChange={(e) => setEditOrgName(e.target.value)}
                      placeholder="Company Name"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs disabled:opacity-70 dark:border-slate-700 dark:bg-slate-950"
                    />
                    <input
                      type="text"
                      disabled={!canManageCompany}
                      value={editOrgIndustry}
                      onChange={(e) => setEditOrgIndustry(e.target.value)}
                      placeholder="Industry"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs disabled:opacity-70 dark:border-slate-700 dark:bg-slate-950"
                    />
                    <input
                      type="text"
                      disabled={!canManageCompany}
                      value={editOrgLocation}
                      onChange={(e) => setEditOrgLocation(e.target.value)}
                      placeholder="City"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs disabled:opacity-70 dark:border-slate-700 dark:bg-slate-950"
                    />
                    <input
                      type="text"
                      disabled={!canManageCompany}
                      value={editOrgCountry}
                      onChange={(e) => setEditOrgCountry(e.target.value)}
                      placeholder="Country"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs disabled:opacity-70 dark:border-slate-700 dark:bg-slate-950"
                    />
                    <input
                      type="text"
                      disabled={!canManageCompany}
                      value={editOrgWebsite}
                      onChange={(e) => setEditOrgWebsite(e.target.value)}
                      placeholder="Website"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs disabled:opacity-70 dark:border-slate-700 dark:bg-slate-950"
                    />
                    <input
                      type="text"
                      disabled={!canManageCompany}
                      value={editOrgSize}
                      onChange={(e) => setEditOrgSize(e.target.value)}
                      placeholder="Company Size"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs disabled:opacity-70 dark:border-slate-700 dark:bg-slate-950"
                    />
                    <textarea
                      rows={3}
                      disabled={!canManageCompany}
                      value={editOrgDesc}
                      onChange={(e) => setEditOrgDesc(e.target.value)}
                      placeholder="Company description"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs disabled:opacity-70 sm:col-span-2 dark:border-slate-700 dark:bg-slate-950"
                    />
                  </div>
                  {canManageCompany && (
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="rounded-lg bg-[#0F5C4D] px-4 py-2 text-xs font-medium text-white"
                      >
                        Save Company Profile
                      </button>
                    </div>
                  )}
                </form>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  {canManageCompany && (
                    <form
                      onSubmit={handleAddMember}
                      className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900"
                    >
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Invite HR Team Member
                      </h3>
                      <input
                        type="email"
                        required
                        value={memberEmail}
                        onChange={(e) => setMemberEmail(e.target.value)}
                        placeholder="Colleague's registered ResuMind email"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                      />
                      <select
                        value={memberRole}
                        onChange={(e) =>
                          setMemberRole(
                            e.target.value as
                              | 'admin'
                              | 'recruiter'
                              | 'hiring_manager'
                              | 'interviewer'
                              | 'viewer'
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="recruiter">Recruiter (Vacancies, pools & applicants)</option>
                        <option value="admin">HR Administrator (Company & team management)</option>
                        <option value="hiring_manager">
                          Hiring Manager (Review candidates & interviews)
                        </option>
                        <option value="interviewer">
                          Interviewer (View candidates & interview feedback)
                        </option>
                        <option value="viewer">Viewer (Read-only)</option>
                      </select>
                      <button
                        type="submit"
                        className="w-full rounded-lg bg-[#0F5C4D] py-2 text-xs font-medium text-white"
                      >
                        Add Team Member
                      </button>
                    </form>
                  )}

                  <div
                    className={`divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900 ${
                      canManageCompany ? 'lg:col-span-7' : 'lg:col-span-12'
                    }`}
                  >
                    {members.map((m) => (
                      <div key={m.id} className="space-y-2 p-4 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {m.fullName}
                            </p>
                            <p className="text-slate-500">
                              {m.email} ·{' '}
                              <span className="capitalize">{m.role.replace('_', ' ')}</span>
                              {m.status === 'suspended' ? ' · Suspended' : ''}
                            </p>
                          </div>
                          {canManageCompany && m.role !== 'owner' && (
                            <div className="flex items-center gap-2">
                              <select
                                value={m.role}
                                onChange={(e) =>
                                  handleUpdateMember(m.id, { role: e.target.value })
                                }
                                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-950"
                              >
                                <option value="admin">HR Admin</option>
                                <option value="recruiter">Recruiter</option>
                                <option value="hiring_manager">Hiring Manager</option>
                                <option value="interviewer">Interviewer</option>
                                <option value="viewer">Viewer</option>
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateMember(m.id, {
                                    status: m.status === 'suspended' ? 'active' : 'suspended',
                                  })
                                }
                                className="rounded border border-slate-300 px-2 py-1 text-[11px] hover:bg-slate-50 dark:border-slate-700"
                              >
                                {m.status === 'suspended' ? 'Activate' : 'Suspend'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmRemoveMemberId(m.id)}
                                className="text-slate-400 hover:text-red-600"
                                title="Remove member"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                        {confirmRemoveMemberId === m.id && (
                          <div className="flex items-center justify-between rounded bg-red-50 px-3 py-2 text-[11px] text-red-800 dark:bg-red-950 dark:text-red-200">
                            <span>Remove {m.fullName} from this company workspace?</span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setConfirmRemoveMemberId(null)}
                                className="rounded border border-slate-300 bg-white px-2 py-0.5 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(m.id)}
                                className="rounded bg-red-600 px-2 py-0.5 font-medium text-white"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        !showNewOrg && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Create an organization workspace to publish jobs and manage recruitment pipelines.
            </p>
          </div>
        )
      )}
    </div>
  );
};
