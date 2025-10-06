/**
 * SEC Filing HTML Parser
 *
 * Extracts specific sections from SEC filings (10-K, 10-Q, 8-K)
 * Handles both HTML and XBRL formatted filings
 */

interface ParsedFiling {
  riskFactors: string;
  mdaText: string;
  itemsFound: string[];
}

export class FilingParser {
  /**
   * Parse SEC filing HTML and extract key sections
   */
  parseFiling(html: string, filingType: string): ParsedFiling {
    // Remove HTML tags but preserve structure
    const cleanText = this.cleanHtml(html);

    // Extract sections based on filing type
    if (filingType === '10-K') {
      return this.parse10K(cleanText);
    } else if (filingType === '10-Q') {
      return this.parse10Q(cleanText);
    } else if (filingType === '8-K') {
      return this.parse8K(cleanText);
    }

    // Fallback: try to find any risk/MDA sections
    return this.parseGeneric(cleanText);
  }

  /**
   * Clean HTML while preserving document structure
   */
  cleanHtml(html: string): string {
    let text = html;

    // Remove script and style tags with their content
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Convert common HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");

    // Replace line breaks and paragraphs with newlines
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<\/div>/gi, '\n');

    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Clean up whitespace
    text = text.replace(/\t/g, ' ');
    text = text.replace(/ {2,}/g, ' ');
    text = text.replace(/\n{3,}/g, '\n\n');

    return text.trim();
  }

  /**
   * Parse 10-K filing (Annual Report)
   * Item 1A: Risk Factors
   * Item 7: Management's Discussion and Analysis
   */
  private parse10K(text: string): ParsedFiling {
    const riskFactors = this.extractSection(text, [
      /Item\s+1A\s*[.:\-]\s*Risk\s+Factors/i,
      /ITEM\s+1A\s*[.:\-]\s*RISK\s+FACTORS/i,
    ], [
      /Item\s+1B/i,
      /ITEM\s+1B/i,
      /Item\s+2\s*[.:\-]/i,
    ]);

    const mdaText = this.extractSection(text, [
      /Item\s+7\s*[.:\-]\s*Management'?s\s+Discussion/i,
      /ITEM\s+7\s*[.:\-]\s*MANAGEMENT'?S\s+DISCUSSION/i,
    ], [
      /Item\s+7A/i,
      /ITEM\s+7A/i,
      /Item\s+8\s*[.:\-]/i,
    ]);

    return {
      riskFactors: riskFactors || 'Risk factors section not found',
      mdaText: mdaText || 'MD&A section not found',
      itemsFound: [
        riskFactors ? 'Item 1A' : null,
        mdaText ? 'Item 7' : null,
      ].filter(Boolean) as string[],
    };
  }

  /**
   * Parse 10-Q filing (Quarterly Report)
   * Part I, Item 2: Management's Discussion and Analysis
   * Part II, Item 1A: Risk Factors (if updated)
   */
  private parse10Q(text: string): ParsedFiling {
    // Try multiple patterns for risk factors
    // 10-Q may have updated risk factors in Part II
    let riskFactors = this.extractSection(text, [
      /Part\s+II.*?Item\s+1A\s*[.:\-]\s*Risk\s+Factors/is,
      /PART\s+II.*?ITEM\s+1A\s*[.:\-]\s*RISK\s+FACTORS/is,
      /Item\s+1A\s*[.:\-]\s*Risk\s+Factors/i,
      /Risk\s+Factors/i,
    ], [
      /Item\s+1B/i,
      /Item\s+2\s*[.:\-]/i,
      /Item\s+3\s*[.:\-]/i,
      /Part\s+II\s*[.:\-]\s*Item\s+[23]/i,
    ]);

    // If no risk factors found, look for reference to 10-K
    if (!riskFactors || riskFactors.length < 100) {
      const referenceMatch = text.match(/refer.*?(?:to|see).*?(?:Part I, )?Item 1A.*?(?:of|in).*?(?:Annual Report|Form 10-K)/i);
      if (referenceMatch) {
        riskFactors = 'Risk factors are unchanged from the most recent Annual Report on Form 10-K. Please refer to Part I, Item 1A of the Annual Report for complete risk factor disclosures.';
      }
    }

    // MD&A in Part I, Item 2 - try multiple patterns
    const mdaText = this.extractSection(text, [
      /Part\s+I.*?Item\s+2\s*[.:\-]\s*Management'?s\s+Discussion/is,
      /PART\s+I.*?ITEM\s+2\s*[.:\-]\s*MANAGEMENT'?S\s+DISCUSSION/is,
      /Item\s+2\s*[.:\-]\s*Management'?s\s+Discussion/i,
      /Management'?s\s+Discussion\s+and\s+Analysis/i,
    ], [
      /Item\s+3\s*[.:\-]/i,
      /Item\s+4\s*[.:\-]/i,
      /Part\s+II/i,
      /Quantitative\s+and\s+Qualitative\s+Disclosures/i,
    ]);

    return {
      riskFactors: riskFactors || 'No material changes to risk factors disclosed in this quarterly report',
      mdaText: mdaText || 'MD&A section not found',
      itemsFound: [
        riskFactors && riskFactors.length > 100 ? 'Risk Factors' : null,
        mdaText ? 'Item 2 MD&A' : null,
      ].filter(Boolean) as string[],
    };
  }

  /**
   * Parse 8-K filing (Current Report)
   * Extract disclosed items
   */
  private parse8K(text: string): ParsedFiling {
    // 8-K doesn't have standard risk factors/MDA
    // Extract the main disclosure items (Item 2.02, Item 7.01, Item 9.01, etc.)

    // Look for Item 2.02 (Results of Operations and Financial Condition)
    const item202 = this.extractSection(text, [
      /Item\s+2\.02\s+Results\s+of\s+Operations/i,
      /ITEM\s+2\.02\s+RESULTS\s+OF\s+OPERATIONS/i,
    ], [
      /Item\s+\d/i,
      /ITEM\s+\d/i,
      /SIGNATURE/i,
    ]);

    // Look for Item 7.01 (Regulation FD Disclosure)
    const item701 = this.extractSection(text, [
      /Item\s+7\.01\s+Regulation\s+FD/i,
      /ITEM\s+7\.01\s+REGULATION\s+FD/i,
    ], [
      /Item\s+\d/i,
      /ITEM\s+\d/i,
      /SIGNATURE/i,
    ]);

    // Look for Item 9.01 (Financial Statements and Exhibits)
    const item901 = this.extractSection(text, [
      /Item\s+9\.01\s+Financial\s+Statements/i,
      /ITEM\s+9\.01\s+FINANCIAL\s+STATEMENTS/i,
    ], [
      /SIGNATURE/i,
      /Pursuant\s+to\s+the\s+requirements/i,
    ]);

    // Combine all found items
    const items = [item202, item701, item901].filter(Boolean).join('\n\n---\n\n');

    return {
      riskFactors: '',
      mdaText: items || 'Unable to extract 8-K content',
      itemsFound: ['8-K Items'],
    };
  }

  /**
   * Generic parser for unknown filing types
   */
  private parseGeneric(text: string): ParsedFiling {
    // Try to find anything that looks like risk factors
    const riskFactors = this.extractSection(text, [
      /Risk\s+Factors/i,
      /RISK\s+FACTORS/i,
    ], [
      /Management'?s\s+Discussion/i,
      /Financial\s+Statements/i,
    ]);

    // Try to find MD&A
    const mdaText = this.extractSection(text, [
      /Management'?s\s+Discussion/i,
      /MANAGEMENT'?S\s+DISCUSSION/i,
    ], [
      /Financial\s+Statements/i,
      /Notes\s+to\s+Financial/i,
    ]);

    return {
      riskFactors: riskFactors || '',
      mdaText: mdaText || '',
      itemsFound: [
        riskFactors ? 'Risk Factors' : null,
        mdaText ? 'MD&A' : null,
      ].filter(Boolean) as string[],
    };
  }

  /**
   * Extract a section of text between start and end patterns
   */
  private extractSection(
    text: string,
    startPatterns: RegExp[],
    endPatterns: RegExp[]
  ): string | null {
    // Find start position
    let startPos = -1;
    let startMatch = null;

    for (const pattern of startPatterns) {
      const match = text.match(pattern);
      if (match && match.index !== undefined) {
        startPos = match.index;
        startMatch = match;
        break;
      }
    }

    if (startPos === -1) {
      return null;
    }

    // Find end position
    let endPos = text.length;

    for (const pattern of endPatterns) {
      const match = text.slice(startPos + (startMatch![0]?.length || 0)).match(pattern);
      if (match && match.index !== undefined) {
        endPos = startPos + (startMatch![0]?.length || 0) + match.index;
        break;
      }
    }

    // Extract and clean the section
    let section = text.slice(startPos, endPos);

    // Remove the header line
    section = section.replace(startMatch![0], '');

    // Limit to reasonable size (Claude has token limits)
    const maxChars = 30000; // ~7500 tokens
    if (section.length > maxChars) {
      section = section.slice(0, maxChars) + '\n\n[Content truncated due to length]';
    }

    return section.trim();
  }

  /**
   * Get a summary of what was extracted
   */
  getSummary(parsed: ParsedFiling): string {
    const parts = [];

    if (parsed.riskFactors && parsed.riskFactors.length > 50) {
      parts.push(`Risk Factors (${parsed.riskFactors.length} chars)`);
    }

    if (parsed.mdaText && parsed.mdaText.length > 50) {
      parts.push(`MD&A (${parsed.mdaText.length} chars)`);
    }

    if (parts.length === 0) {
      return 'No sections extracted';
    }

    return `Extracted: ${parts.join(', ')}`;
  }
}

// Export singleton
export const filingParser = new FilingParser();
