import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ============================================================================
// 1. IDENTITY, SESSIONS & RBAC
// ============================================================================

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    email: text('email').notNull().unique(),
    fullName: text('full_name').notNull(),
    role: text('role').notNull().default('user'), // 'user' | 'moderator' | 'admin' | 'superadmin'
    status: text('status').notNull().default('active'), // 'active' | 'suspended'
    mfaEnabled: boolean('mfa_enabled').notNull().default(false),
    mfaSecret: text('mfa_secret'),
    emailVerified: boolean('email_verified').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('users_role_idx').on(table.role),
    index('users_status_idx').on(table.status),
  ]
);

export const sessions = pgTable(
  'sessions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    sessionKey: text('session_key').notNull().unique(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    mfaVerified: boolean('mfa_verified').notNull().default(false),
    revoked: boolean('revoked').notNull().default(false),
    lastActiveAt: timestamp('last_active_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('sessions_user_idx').on(table.userId)]
);

// ============================================================================
// 2. PROFESSIONAL PROFILES
// ============================================================================

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

export const profiles = pgTable(
  'profiles',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    headline: text('headline').notNull().default('Professional on ResuMind'),
    about: text('about').notNull().default(''),
    location: text('location').notNull().default('Mbabane'),
    country: text('country').notNull().default('Eswatini'),
    currentPosition: text('current_position').notNull().default(''),
    avatarUrl: text('avatar_url').notNull().default(''),
    coverUrl: text('cover_url').notNull().default(''),
    website: text('website').notNull().default(''),
    linkedinUrl: text('linkedin_url').notNull().default(''),
    githubUrl: text('github_url').notNull().default(''),
    visibility: text('visibility').notNull().default('public'), // 'public' | 'connections' | 'private'
    showEmail: boolean('show_email').notNull().default(false),
    openToWork: boolean('open_to_work').notNull().default(true),
    experiences: jsonb('experiences').$type<ExperienceItem[]>().notNull().default([]),
    education: jsonb('education').$type<EducationItem[]>().notNull().default([]),
    skills: jsonb('skills').$type<string[]>().notNull().default([]),
    certificates: jsonb('certificates').$type<CertificateItem[]>().notNull().default([]),
    projects: jsonb('projects').$type<ProjectItem[]>().notNull().default([]),
    achievements: jsonb('achievements').$type<string[]>().notNull().default([]),
    languages: jsonb('languages').$type<string[]>().notNull().default([]),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('profiles_country_idx').on(table.country),
    index('profiles_visibility_idx').on(table.visibility),
  ]
);

// ============================================================================
// 3. ORGANIZATIONS & MEMBERSHIP
// ============================================================================

export const organizations = pgTable(
  'organizations',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    industry: text('industry').notNull().default('Technology'),
    location: text('location').notNull().default('Mbabane'),
    country: text('country').notNull().default('Eswatini'),
    website: text('website').notNull().default(''),
    description: text('description').notNull().default(''),
    logoUrl: text('logo_url').notNull().default(''),
    coverUrl: text('cover_url').notNull().default(''),
    size: text('size').notNull().default('11-50 employees'),
    verified: boolean('verified').notNull().default(false),
    verificationStatus: text('verification_status').notNull().default('pending'), // 'pending' | 'verified' | 'rejected'
    status: text('status').notNull().default('active'), // 'active' | 'suspended'
    createdById: integer('created_by_id')
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('orgs_country_idx').on(table.country)]
);

export const organizationMembers = pgTable(
  'organization_members',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role').notNull().default('recruiter'), // 'owner' | 'admin' | 'recruiter' | 'viewer'
    status: text('status').notNull().default('active'), // 'active' | 'invited' | 'removed'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('org_member_unique_idx').on(table.organizationId, table.userId),
    index('org_member_user_idx').on(table.userId),
  ]
);

// ============================================================================
// 4. PROFESSIONAL NETWORKING & FEED
// ============================================================================

export const posts = pgTable(
  'posts',
  {
    id: serial('id').primaryKey(),
    authorId: integer('author_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    organizationId: integer('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    content: text('content').notNull(),
    imageUrl: text('image_url'),
    videoUrl: text('video_url'),
    videoDurationSeconds: integer('video_duration_seconds'),
    topic: text('topic').notNull().default('Career Growth'),
    postType: text('post_type').notNull().default('update'), // 'update' | 'achievement' | 'article' | 'repost'
    repostOfId: integer('repost_of_id'),
    visibility: text('visibility').notNull().default('public'), // 'public' | 'connections'
    moderationStatus: text('moderation_status').notNull().default('approved'), // 'approved' | 'flagged' | 'removed'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('posts_author_idx').on(table.authorId),
    index('posts_created_idx').on(table.createdAt),
    index('posts_moderation_idx').on(table.moderationStatus),
  ]
);

export const postReactions = pgTable(
  'post_reactions',
  {
    id: serial('id').primaryKey(),
    postId: integer('post_id')
      .references(() => posts.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    type: text('type').notNull().default('like'), // 'like' | 'celebrate' | 'insightful'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('post_reaction_unique_idx').on(table.postId, table.userId)]
);

export const savedPosts = pgTable(
  'saved_posts',
  {
    id: serial('id').primaryKey(),
    postId: integer('post_id')
      .references(() => posts.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('saved_post_unique_idx').on(table.postId, table.userId)]
);

export const comments = pgTable(
  'comments',
  {
    id: serial('id').primaryKey(),
    postId: integer('post_id')
      .references(() => posts.id, { onDelete: 'cascade' })
      .notNull(),
    authorId: integer('author_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    parentId: integer('parent_id'),
    content: text('content').notNull(),
    moderationStatus: text('moderation_status').notNull().default('approved'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('comments_post_idx').on(table.postId)]
);

export const commentReactions = pgTable(
  'comment_reactions',
  {
    id: serial('id').primaryKey(),
    commentId: integer('comment_id')
      .references(() => comments.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('comment_reaction_unique_idx').on(table.commentId, table.userId)]
);

export const connections = pgTable(
  'connections',
  {
    id: serial('id').primaryKey(),
    requesterId: integer('requester_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    recipientId: integer('recipient_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'rejected'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('connections_pair_unique_idx').on(table.requesterId, table.recipientId),
    index('connections_recipient_idx').on(table.recipientId),
  ]
);

export const follows = pgTable(
  'follows',
  {
    id: serial('id').primaryKey(),
    followerId: integer('follower_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    followingId: integer('following_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('follows_pair_unique_idx').on(table.followerId, table.followingId)]
);

export const blocks = pgTable(
  'blocks',
  {
    id: serial('id').primaryKey(),
    blockerId: integer('blocker_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    blockedId: integer('blocked_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('blocks_pair_unique_idx').on(table.blockerId, table.blockedId)]
);

// ============================================================================
// 5. JOBS & RECRUITMENT
// ============================================================================

export const jobs = pgTable(
  'jobs',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    postedById: integer('posted_by_id')
      .references(() => users.id)
      .notNull(),
    title: text('title').notNull(),
    department: text('department').notNull().default('General'),
    description: text('description').notNull(),
    requirements: text('requirements').notNull().default(''),
    location: text('location').notNull(),
    country: text('country').notNull().default('Eswatini'),
    workArrangement: text('work_arrangement').notNull().default('hybrid'), // 'remote' | 'hybrid' | 'onsite'
    employmentType: text('employment_type').notNull().default('full-time'), // 'full-time' | 'part-time' | 'contract' | 'internship'
    experienceLevel: text('experience_level').notNull().default('mid'), // 'entry' | 'mid' | 'senior' | 'executive'
    salaryRange: text('salary_range').notNull().default(''),
    status: text('status').notNull().default('published'), // 'draft' | 'published' | 'paused' | 'closed' | 'archived' | 'moderated'
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('jobs_org_idx').on(table.organizationId),
    index('jobs_status_idx').on(table.status),
    index('jobs_country_idx').on(table.country),
  ]
);

export const savedJobs = pgTable(
  'saved_jobs',
  {
    id: serial('id').primaryKey(),
    jobId: integer('job_id')
      .references(() => jobs.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('saved_job_unique_idx').on(table.jobId, table.userId)]
);

// ============================================================================
// 6. AI CAREER STUDIO & CV DOCUMENTS
// ============================================================================

export const cvDocuments = pgTable(
  'cv_documents',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    extractedText: text('extracted_text').notNull().default(''),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('cv_docs_user_idx').on(table.userId)]
);

export interface CvBuilderData {
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  experiences: ExperienceItem[];
  education: EducationItem[];
  skills: string[];
  certifications: string[];
  languages: string[];
}

export const cvVersions = pgTable(
  'cv_versions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    template: text('template').notNull().default('executive'), // 'executive' | 'modern' | 'civic'
    data: jsonb('data').$type<CvBuilderData>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('cv_versions_user_idx').on(table.userId)]
);

export const cvAnalyses = pgTable(
  'cv_analyses',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    cvDocumentId: integer('cv_document_id').references(() => cvDocuments.id, {
      onDelete: 'set null',
    }),
    targetJobTitle: text('target_job_title').notNull().default(''),
    jobDescription: text('job_description').notNull().default(''),
    summary: text('summary').notNull(),
    strengths: jsonb('strengths').$type<string[]>().notNull().default([]),
    weaknesses: jsonb('weaknesses').$type<string[]>().notNull().default([]),
    recommendations: jsonb('recommendations').$type<string[]>().notNull().default([]),
    tailoredBullets: jsonb('tailored_bullets').$type<string[]>().notNull().default([]),
    matchNotes: text('match_notes').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('cv_analyses_user_idx').on(table.userId)]
);

export const aiDocuments = pgTable(
  'ai_documents',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    docType: text('doc_type').notNull().default('cover_letter'), // 'cover_letter' | 'career_guidance' | 'bio' | 'document'
    title: text('title').notNull(),
    targetRole: text('target_role').notNull().default(''),
    content: text('content').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('ai_docs_user_idx').on(table.userId)]
);

export interface InterviewQuestionItem {
  id: string;
  question: string;
  category: string;
  answer?: string;
  evaluation?: string;
  improvements?: string[];
}

export const aiInterviewSessions = pgTable(
  'ai_interview_sessions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    targetRole: text('target_role').notNull(),
    experienceLevel: text('experience_level').notNull().default('mid'),
    questions: jsonb('questions').$type<InterviewQuestionItem[]>().notNull().default([]),
    overallFeedback: text('overall_feedback').notNull().default(''),
    status: text('status').notNull().default('active'), // 'active' | 'completed'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('ai_interview_user_idx').on(table.userId)]
);

export const aiUsageEvents = pgTable(
  'ai_usage_events',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    feature: text('feature').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('ai_usage_user_created_idx').on(table.userId, table.createdAt)]
);

export const jobApplications = pgTable(
  'job_applications',
  {
    id: serial('id').primaryKey(),
    jobId: integer('job_id')
      .references(() => jobs.id, { onDelete: 'cascade' })
      .notNull(),
    applicantId: integer('applicant_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    cvDocumentId: integer('cv_document_id').references(() => cvDocuments.id, {
      onDelete: 'set null',
    }),
    coverLetter: text('cover_letter').notNull().default(''),
    stage: text('stage').notNull().default('submitted'), // 'submitted' | 'screening' | 'shortlisted' | 'interview' | 'offer' | 'hired' | 'rejected' | 'withdrawn'
    employerNotes: text('employer_notes').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('job_application_unique_idx').on(table.jobId, table.applicantId),
    index('job_applications_applicant_idx').on(table.applicantId),
  ]
);

export const applicationHistory = pgTable(
  'application_history',
  {
    id: serial('id').primaryKey(),
    applicationId: integer('application_id')
      .references(() => jobApplications.id, { onDelete: 'cascade' })
      .notNull(),
    fromStage: text('from_stage').notNull().default(''),
    toStage: text('to_stage').notNull(),
    changedById: integer('changed_by_id').references(() => users.id, { onDelete: 'set null' }),
    note: text('note').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('app_history_app_idx').on(table.applicationId)]
);

export const interviews = pgTable(
  'interviews',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    applicationId: integer('application_id')
      .references(() => jobApplications.id, { onDelete: 'cascade' })
      .notNull(),
    scheduledById: integer('scheduled_by_id').references(() => users.id, { onDelete: 'set null' }),
    interviewType: text('interview_type').notNull().default('video'), // 'video' | 'in_person' | 'phone'
    scheduledAt: timestamp('scheduled_at').notNull(),
    locationOrLink: text('location_or_link').notNull().default(''),
    notes: text('notes').notNull().default(''),
    status: text('status').notNull().default('scheduled'), // 'scheduled' | 'completed' | 'cancelled'
    feedback: text('feedback').notNull().default(''),
    outcome: text('outcome').notNull().default('pending'), // 'pending' | 'pass' | 'hold' | 'reject'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('interviews_org_idx').on(table.organizationId),
    index('interviews_app_idx').on(table.applicationId),
  ]
);

export const talentPools = pgTable(
  'talent_pools',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    createdById: integer('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('talent_pools_org_idx').on(table.organizationId)]
);

export const talentPoolMembers = pgTable(
  'talent_pool_members',
  {
    id: serial('id').primaryKey(),
    poolId: integer('pool_id')
      .references(() => talentPools.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    addedById: integer('added_by_id').references(() => users.id, { onDelete: 'set null' }),
    notes: text('notes').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('talent_pool_member_unique_idx').on(table.poolId, table.userId)]
);

// ============================================================================
// 7. MESSAGING & NOTIFICATIONS
// ============================================================================

export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  isRequest: boolean('is_request').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const conversationMembers = pgTable(
  'conversation_members',
  {
    id: serial('id').primaryKey(),
    conversationId: integer('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    accepted: boolean('accepted').notNull().default(true),
    lastReadAt: timestamp('last_read_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('conv_member_unique_idx').on(table.conversationId, table.userId),
    index('conv_member_user_idx').on(table.userId),
  ]
);

export const messages = pgTable(
  'messages',
  {
    id: serial('id').primaryKey(),
    conversationId: integer('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    senderId: integer('sender_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('messages_conv_created_idx').on(table.conversationId, table.createdAt)]
);

export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    linkTab: text('link_tab').notNull().default('home'),
    entityId: integer('entity_id'),
    read: boolean('read').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('notifications_user_read_idx').on(table.userId, table.read)]
);

// ============================================================================
// 8. TRUST, MODERATION & AUDIT LOGS
// ============================================================================

export const reports = pgTable(
  'reports',
  {
    id: serial('id').primaryKey(),
    reporterId: integer('reporter_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    targetType: text('target_type').notNull(), // 'post' | 'comment' | 'user' | 'job' | 'organization' | 'message'
    targetId: integer('target_id').notNull(),
    reason: text('reason').notNull(),
    details: text('details').notNull().default(''),
    status: text('status').notNull().default('open'), // 'open' | 'resolved' | 'dismissed'
    reviewedById: integer('reviewed_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolutionNotes: text('resolution_notes').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('reports_status_idx').on(table.status)]
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: serial('id').primaryKey(),
    actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull().default('system'),
    targetId: integer('target_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: text('ip_address').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('audit_created_idx').on(table.createdAt)]
);

// ============================================================================
// RELATIONS
// ============================================================================

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
  sessions: many(sessions),
  posts: many(posts),
  organizationMemberships: many(organizationMembers),
  notifications: many(notifications),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, { fields: [profiles.userId], references: [users.id] }),
}));

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  creator: one(users, { fields: [organizations.createdById], references: [users.id] }),
  members: many(organizationMembers),
  jobs: many(jobs),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [organizationMembers.userId], references: [users.id] }),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
  organization: one(organizations, {
    fields: [posts.organizationId],
    references: [organizations.id],
  }),
  reactions: many(postReactions),
  comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
  reactions: many(commentReactions),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [jobs.organizationId],
    references: [organizations.id],
  }),
  postedBy: one(users, { fields: [jobs.postedById], references: [users.id] }),
  applications: many(jobApplications),
}));
