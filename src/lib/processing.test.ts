import { describe, it, expect } from 'vitest';

describe('processing.ts - basic exports', () => {
  it('should export transcribeMeeting function', async () => {
    const { transcribeMeeting } = await import('@/lib/processing');
    expect(typeof transcribeMeeting).toBe('function');
  }, 15000);

  it('should export analyzeMeeting function', async () => {
    const { analyzeMeeting } = await import('@/lib/processing');
    expect(typeof analyzeMeeting).toBe('function');
  });

  it('should export sendMeetingEmails function', async () => {
    const { sendMeetingEmails } = await import('@/lib/processing');
    expect(typeof sendMeetingEmails).toBe('function');
  });

  it('should export markMeetingCompleted function', async () => {
    const { markMeetingCompleted } = await import('@/lib/processing');
    expect(typeof markMeetingCompleted).toBe('function');
  });

  it('should export markMeetingFailed function', async () => {
    const { markMeetingFailed } = await import('@/lib/processing');
    expect(typeof markMeetingFailed).toBe('function');
  });

  // Types are TypeScript interfaces, not runtime values
  // Just verify the module loads without error
  it('should load processing module without error', async () => {
    const mod = await import('@/lib/processing');
    expect(mod).toBeDefined();
  });
});

// Test the types are properly defined (TypeScript compile-time check)
describe('TypeScript types', () => {
  it('should compile with TranscribeResult interface', () => {
    // This is a compile-time test - if it compiles, the type exists
    const result: import('@/lib/processing').TranscribeResult = {
      success: true,
      transcript: 'test',
      segmentsProcessed: 1,
      segmentsTotal: 1,
    };
    expect(result.success).toBe(true);
  });

  it('should compile with AnalyzeResult interface', () => {
    const result: import('@/lib/processing').AnalyzeResult = {
      success: true,
      minuteId: 'test-id',
      actionItemsCount: 2,
    };
    expect(result.success).toBe(true);
  });

  it('should compile with EmailResult interface', () => {
    const result: import('@/lib/processing').EmailResult = {
      success: true,
      sent: 5,
      failed: 0,
    };
    expect(result.success).toBe(true);
  });
});