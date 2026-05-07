// In-memory data store (matches web mock-data.ts structure)

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: string;
  orgId: string;
  createdAt: string;
}

export interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone?: string;
  currentTitle?: string;
  currentCompany?: string;
  location?: { city?: string; state?: string; country?: string };
  status: string;
  source?: string;
  tags: any[];
  skills: any[];
  createdAt: string;
  updatedAt: string;
  ownerId?: string;
}

export interface Job {
  id: string;
  title: string;
  clientId: string;
  location?: string;
  type: string;
  status: string;
  priority: string;
  salaryMin?: number;
  salaryMax?: number;
  estimatedFee?: number;
  feeProbability?: number;
  ownerId?: string;
  createdAt: string;
  updatedAt: string;
  applicationCount?: number;
}

export interface Client {
  id: string;
  name: string;
  industry?: string;
  portalSlug?: string;
  healthScore?: number;
  createdAt: string;
  activeJobCount?: number;
  placementsYtd?: number;
}

export interface Application {
  id: string;
  candidateId: string;
  jobId: string;
  stageId: string;
  status: string;
  score?: number;
  recruiterNote?: string;
  daysInStage: number;
  appliedAt: string;
  lastActivityAt: string;
  submittedToClientAt?: string;
}

export const SEED_USERS: User[] = [
  {
    id: "u1",
    email: "alex@agency.com",
    firstName: "Alex",
    lastName: "Rivera",
    fullName: "Alex Rivera",
    role: "senior_recruiter",
    orgId: "org1",
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "u2",
    email: "morgan@agency.com",
    firstName: "Morgan",
    lastName: "Chen",
    fullName: "Morgan Chen",
    role: "owner",
    orgId: "org1",
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "u3",
    email: "jordan@agency.com",
    firstName: "Jordan",
    lastName: "Kim",
    fullName: "Jordan Kim",
    role: "recruiter",
    orgId: "org1",
    createdAt: "2024-02-01T00:00:00Z",
  },
];

export const SEED_CLIENTS: Client[] = [
  {
    id: "c1",
    name: "Apex Ventures",
    industry: "Venture Capital",
    portalSlug: "apex",
    healthScore: 92,
    createdAt: "2024-03-01T00:00:00Z",
    activeJobCount: 3,
    placementsYtd: 7,
  },
  {
    id: "c2",
    name: "NovaTech Systems",
    industry: "Enterprise Software",
    portalSlug: "novatech",
    healthScore: 78,
    createdAt: "2024-04-01T00:00:00Z",
    activeJobCount: 5,
    placementsYtd: 4,
  },
];

export const SEED_CANDIDATES: Candidate[] = [
  {
    id: "cand1",
    firstName: "Sarah",
    lastName: "Mitchell",
    fullName: "Sarah Mitchell",
    email: "sarah.m@gmail.com",
    phone: "+1 415 555 0101",
    currentTitle: "VP of Engineering",
    currentCompany: "DataStream Inc.",
    location: { city: "San Francisco", state: "CA", country: "US" },
    status: "active",
    source: "LinkedIn",
    tags: [],
    skills: [],
    createdAt: "2026-01-15T00:00:00Z",
    updatedAt: "2026-03-28T14:30:00Z",
    ownerId: "u1",
  },
];

export const SEED_JOBS: Job[] = [
  {
    id: "j1",
    title: "VP of Engineering",
    clientId: "c2",
    location: "New York, NY",
    type: "permanent",
    status: "active",
    priority: "urgent",
    salaryMin: 280000,
    salaryMax: 340000,
    estimatedFee: 68000,
    feeProbability: 70,
    ownerId: "u1",
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-28T00:00:00Z",
    applicationCount: 12,
  },
];

export const SEED_APPLICATIONS: Application[] = [
  {
    id: "app1",
    candidateId: "cand1",
    jobId: "j1",
    stageId: "st5",
    status: "client_review",
    daysInStage: 2,
    appliedAt: "2026-03-10T00:00:00Z",
    lastActivityAt: "2026-03-30T00:00:00Z",
    submittedToClientAt: "2026-03-28T00:00:00Z",
    score: 92,
    recruiterNote: "Strong systems background",
  },
];

// In-memory data store
export const dataStore = {
  users: [...SEED_USERS],
  candidates: [...SEED_CANDIDATES],
  jobs: [...SEED_JOBS],
  clients: [...SEED_CLIENTS],
  applications: [...SEED_APPLICATIONS],
};
