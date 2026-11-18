export type AppTab =
  | 'home'
  | 'network'
  | 'jobs'
  | 'messages'
  | 'notifications'
  | 'profile'
  | 'career'
  | 'employers';

export interface ExperienceItem {
  id: string;
  title: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
}

export interface EducationItem {
  id: string;
  institution: string;
  degree: string;
  field: string;
  startYear: string;
  endYear: string;
  description: string;
}

export interface CertificateItem {
  id: string;
  name: string;
  issuer: string;
  issueDate: string;
  credentialUrl?: string;
}

export interface ProjectItem {
  id: string;
  name: string;
  role: string;
  summary: string;
  url?: string;
}

export interface UserAccount {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  role: 'user' | 'moderator' | 'admin' | 'superadmin';
  status: 'active' | 'suspended';
  mfaEnabled: boolean;
  emailVerified: boolean;
}

export interface UserProfile {
  id: number;
  userId: number;
  headline: string;
  about: string;
  location: string;
  country: string;
  currentPosition: string;
  avatarUrl: string;
  coverUrl: string;
  website: string;
  linkedinUrl: string;
  githubUrl: string;
  visibility: 'public' | 'connections' | 'private';
  showEmail: boolean;
  openToWork: boolean;
  experiences: ExperienceItem[];
  education: EducationItem[];
  skills: string[];
  certificates: CertificateItem[];
  projects: ProjectItem[];
  achievements: string[];
  languages: string[];
}

export interface OrganizationSummary {
  id: number;
  name: string;
  slug: string;
  industry: string;
  location: string;
  country: string;
  website: string;
  description: string;
  logoUrl: string;
  coverUrl: string;
  size: string;
  verified: boolean;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  status: 'active' | 'suspended';
  memberRole?: 'owner' | 'admin' | 'recruiter' | 'viewer' | null;
}

export interface FeedPost {
  id: number;
  authorId: number;
  authorName: string;
  authorHeadline: string;
  authorAvatar: string;
  authorLocation: string;
  organizationId: number | null;
  organization: { id: number; name: string; verified: boolean } | null;
  content: string;
  imageUrl: string | null;
  topic: string;
  postType: 'update' | 'achievement' | 'article' | 'repost';
  visibility: 'public' | 'connections';
  reactionCount: number;
  commentCount: number;
  userReaction: string | null;
  isSaved: boolean;
  createdAt: string;
}

export interface JobListing {
  id: number;
  organizationId: number;
  title: string;
  description: string;
  requirements: string;
  location: string;
  country: string;
  workArrangement: 'remote' | 'hybrid' | 'onsite';
  employmentType: 'full-time' | 'part-time' | 'contract' | 'internship';
  experienceLevel: 'entry' | 'mid' | 'senior' | 'executive';
  salaryRange: string;
  status: 'draft' | 'published' | 'closed' | 'moderated';
  createdAt: string;
  organization: {
    id: number;
    name: string;
    slug: string;
    industry: string;
    verified: boolean;
    location: string;
    country: string;
  };
  isSaved?: boolean;
  applicationStage?: string | null;
}
