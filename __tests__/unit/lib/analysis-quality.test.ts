import { describe, it, expect } from 'vitest';
import { isRefusal, safeSummary, REFUSAL_MARKERS } from '@/lib/analysis-quality';

describe('isRefusal', () => {
  it('flags first-person refusal preambles', () => {
    expect(isRefusal('I apologize, but I cannot generate an executive summary because the Risk Analysis section is marked as [Risk analysis failed].')).toBe(true);
    expect(isRefusal("I'm sorry, but the filing text is missing.")).toBe(true);
    expect(isRefusal('I am unable to analyze this filing without the source text.')).toBe(true);
    expect(isRefusal('As an AI, I cannot provide this analysis.')).toBe(true);
  });

  it('flags internal pipeline placeholders', () => {
    expect(isRefusal('Risk analysis failed')).toBe(true);
    expect(isRefusal('topChanges: ["Risk analysis failed"]')).toBe(true);
    expect(isRefusal('Unable to parse risk analysis')).toBe(true);
  });

  it('does NOT flag legitimate analysis of a sparse filing', () => {
    // Real analysis of an empty 8-K — accurate, differentiated, publishable.
    const sparse8k =
      '• Incomplete Filing: 8-K contains only cover page and header information. ' +
      '• No Disclosable Events: Item 8.01 listed but no actual content was provided, suggesting a filing error. ' +
      '• Neutral Investment Impact: absence of material disclosures.';
    expect(isRefusal(sparse8k)).toBe(false);
  });

  it('does NOT flag normal analytical prose', () => {
    expect(isRefusal('The filing does not contain material changes to risk factors.')).toBe(false);
    expect(isRefusal('Revenue grew 12% YoY; management guidance is cautiously optimistic.')).toBe(false);
    expect(isRefusal('Without stronger margins, the company cannot sustain its dividend.')).toBe(false);
  });

  it('handles null/empty input', () => {
    expect(isRefusal(null)).toBe(false);
    expect(isRefusal(undefined)).toBe(false);
    expect(isRefusal('')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isRefusal('I APOLOGIZE, BUT I CANNOT PROVIDE THIS.')).toBe(true);
  });
});

describe('safeSummary', () => {
  it('returns the summary when publishable', () => {
    expect(safeSummary('Revenue grew 12% YoY.')).toBe('Revenue grew 12% YoY.');
  });
  it('returns null for refusals', () => {
    expect(safeSummary('I apologize, but I cannot generate this.')).toBeNull();
  });
  it('returns null for null/undefined', () => {
    expect(safeSummary(null)).toBeNull();
    expect(safeSummary(undefined)).toBeNull();
  });
});

describe('REFUSAL_MARKERS', () => {
  it('contains only lowercase entries (isRefusal lowercases input)', () => {
    for (const m of REFUSAL_MARKERS) expect(m).toBe(m.toLowerCase());
  });
});
