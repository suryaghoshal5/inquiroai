// Shared QA types for InquiroAI test framework

export type Severity = 'P0' | 'P1' | 'P2' | 'P3';
export type QAPhase = 'static' | 'api' | 'browser';

// P0: app crashes or data loss
// P1: feature broken
// P2: feature works but poorly / security concern
// P3: cosmetic or minor UX issue

export interface QAIssue {
  title: string;
  severity: Severity;
  phase: QAPhase;
  category: string;
  file?: string;
  line?: number;
  reproSteps: string[];
  expected: string;
  actual: string;
  timestamp: string;
}

export interface TestResult {
  auditor: string;
  phase: QAPhase;
  issues: QAIssue[];
  passCount: number;
  failCount: number;
  durationMs: number;
}

export interface StaticAuditReport {
  runAt: string;
  results: TestResult[];
  totalIssues: number;
  bySeverity: Record<Severity, number>;
}
