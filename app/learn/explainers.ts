/**
 * @module app/learn/explainers
 * @description Curated, evergreen SEC-filing explainer content for the /learn library.
 *
 * This is hand-authored educational content (NOT per-ticker templated pages), designed
 * to answer real questions people type into search engines and AI assistants about
 * reading SEC filings. Each explainer leads with a crisp direct answer (the block AI
 * answer engines extract) followed by genuine depth. Content is site-authored and
 * penalty-safe under scaled-content-abuse policies because it is curated, not generated
 * at scale per entity.
 */

export interface ExplainerSection {
  /** Rendered as an <h2> on the explainer page. */
  heading: string;
  /** One or more paragraphs of body text. Blank-line-separated paragraphs render separately. */
  body: string;
}

export interface Explainer {
  /** URL slug: /learn/{slug}. Kebab-case, stable, never reused. */
  slug: string;
  /** The H1, phrased as a real search query. */
  question: string;
  /** A direct, self-contained 40-60 word answer shown first (the direct-answer block). */
  shortAnswer: string;
  /** 2-4 sections of genuine depth. */
  sections: ExplainerSection[];
  /** Slugs of related explainers. */
  related: string[];
  /** ISO date the content was last reviewed/updated. */
  updated: string;
}

const UPDATED = '2026-08-14';

export const explainers: Explainer[] = [
  {
    slug: 'what-is-an-8-k-filing',
    question: 'What is an SEC 8-K filing?',
    shortAnswer:
      'An 8-K is a "current report" that public companies file with the SEC to disclose major events between their regular quarterly and annual reports. Examples include earnings releases, executive changes, acquisitions, and bankruptcies. Most 8-Ks must be filed within four business days of the triggering event.',
    sections: [
      {
        heading: 'What an 8-K is for',
        body: 'The 8-K exists to keep investors informed of material events on a timely basis, rather than waiting for the next scheduled 10-Q or 10-K. Because markets can move sharply on news, the SEC requires companies to disclose specific categories of events quickly and in a standardized format, so all investors learn about them at roughly the same time.\n\nAn 8-K is organized into numbered "Items," each corresponding to a type of event. The item number tells you at a glance what the filing is about — for example, Item 2.02 covers results of operations (earnings), Item 5.02 covers departures of directors or officers, and Item 1.01 covers entry into a material agreement.',
      },
      {
        heading: 'Common 8-K items and timing',
        body: 'Frequently seen items include: Item 1.01 (material definitive agreement), Item 2.01 (completion of an acquisition or disposition), Item 2.02 (results of operations and financial condition), Item 5.02 (departure or appointment of directors and officers), Item 7.01 (Regulation FD disclosure), and Item 8.01 (other events, a catch-all).\n\nThe general deadline is four business days after the triggering event, though some items (such as certain Regulation FD disclosures) have different rules. Earnings-related 8-Ks often "furnish" rather than "file" the press release, a technical distinction that affects liability but not the information you can read.',
      },
      {
        heading: 'How to read one quickly',
        body: 'Start with the item number and heading to understand the topic, then read the short narrative. Many 8-Ks attach exhibits — a press release (Exhibit 99.1), a material contract, or a separation agreement — where the substantive detail lives. For earnings, the attached press release usually contains the income statement and management commentary that move the stock.',
      },
    ],
    related: ['8-k-item-2-02', '8-k-item-5-02', '8-k-item-1-01', '10-k-vs-10-q'],
    updated: UPDATED,
  },
  {
    slug: '8-k-item-5-02',
    question: 'What does 8-K Item 5.02 mean?',
    shortAnswer:
      'Item 5.02 of an 8-K discloses the departure, election, or appointment of a company\'s directors or principal officers — including the CEO, CFO, and board members. It covers resignations, terminations, retirements, and new hires, and often includes the terms of severance or new compensation arrangements.',
    sections: [
      {
        heading: 'What triggers an Item 5.02 filing',
        body: 'Item 5.02 is triggered by leadership changes at the top of a company. Specifically, it covers: the departure of a director or a principal officer (CEO, CFO, COO, principal accounting officer, or anyone performing similar functions), whether by resignation, retirement, removal, or refusal to stand for re-election; the election or appointment of a new principal officer; and material changes to a named executive officer\'s compensation.\n\nBecause the people running a company materially affect its prospects, these events are considered important enough to warrant prompt, standardized disclosure.',
      },
      {
        heading: 'How to read the signal',
        body: 'Not all Item 5.02 filings carry the same weight. A planned CEO succession announced well in advance reads very differently from an abrupt CFO resignation "effective immediately" with no successor named. Pay attention to the language: phrases like "to pursue other interests" are boilerplate, while any mention of disagreements with the company, or a departure tied to a restatement or investigation, is a red flag.\n\nAlso note whether the filing discloses a disagreement. If a director resigns because of a disagreement with the company on any matter relating to operations, policies, or practices, the rules require the company to describe it — a detail worth reading closely.',
      },
      {
        heading: 'Where the details are',
        body: 'The narrative in the body is usually brief. The substance — severance terms, sign-on grants, employment agreements, or a departing executive\'s letter — is frequently attached as an exhibit. If a new executive is appointed, the filing typically summarizes their background and the terms of their offer, which can hint at how much the board is paying to secure the hire.',
      },
    ],
    related: ['what-is-an-8-k-filing', '8-k-item-1-01', 'going-concern-qualification'],
    updated: UPDATED,
  },
  {
    slug: 'going-concern-qualification',
    question: 'What is a going-concern qualification?',
    shortAnswer:
      'A going-concern qualification is a warning — from a company\'s management or its auditor — that there is substantial doubt about the company\'s ability to continue operating for at least the next twelve months. It signals serious financial distress and appears in the notes to the financial statements or the auditor\'s report.',
    sections: [
      {
        heading: 'What "going concern" means',
        body: 'Financial statements are normally prepared on the assumption that a business will keep operating indefinitely — the "going concern" assumption. When that assumption is in doubt, accounting standards require disclosure. If conditions raise substantial doubt about the company surviving the next year (measured from the date the financials are issued), management must say so, and the auditor may add an explanatory paragraph to their report.\n\nCommon triggers include recurring operating losses, negative working capital, defaults on loan covenants, an inability to refinance maturing debt, or the loss of a major customer or source of financing.',
      },
      {
        heading: 'Where to find it and why it matters',
        body: 'Look in two places: the notes to the financial statements (often a note titled "Going Concern" or "Liquidity") in a 10-K or 10-Q, and the independent auditor\'s report, where the auditor may state there is substantial doubt. In an annual report, the auditor\'s opinion is one of the most important pages to check.\n\nA going-concern warning is one of the strongest distress signals in a filing. It does not mean bankruptcy is certain, and companies sometimes recover through financing or restructuring. But it tells you the company itself acknowledges a real risk of not surviving the year, which affects everything from creditworthiness to the value of equity.',
      },
      {
        heading: 'What management usually says next',
        body: 'A going-concern disclosure is typically paired with management\'s plan to address the doubt — for example, raising capital, cutting costs, selling assets, or renegotiating debt. Read this plan critically: assess whether it is concrete and already underway, or aspirational. The credibility of the mitigation plan is often more informative than the warning itself.',
      },
    ],
    related: ['how-to-read-risk-factors', 'what-does-mda-tell-you', '10-k-vs-10-q'],
    updated: UPDATED,
  },
  {
    slug: '10-k-vs-10-q',
    question: "10-K vs 10-Q: what's the difference?",
    shortAnswer:
      'A 10-K is a company\'s comprehensive annual report; a 10-Q is a shorter quarterly report filed for the first three quarters of the year. The 10-K is audited and far more detailed; the 10-Q is unaudited (reviewed) and updates investors on recent quarterly performance. There is no fourth 10-Q because the 10-K covers the final quarter.',
    sections: [
      {
        heading: 'Scope and depth',
        body: 'The 10-K is the definitive annual disclosure. It includes a full description of the business, comprehensive risk factors, management\'s discussion and analysis (MD&A) of the full year, and complete, audited financial statements with extensive footnotes. It is the single best document for understanding a company in depth.\n\nThe 10-Q is a lighter-weight quarterly update. It focuses on the most recent quarter and year-to-date results, with condensed financial statements and a shorter MD&A. It highlights what changed since the last annual report rather than restating everything.',
      },
      {
        heading: 'Audited vs reviewed',
        body: 'A key distinction is assurance level. The financial statements in a 10-K are audited by an independent accounting firm, which provides an opinion on whether they are fairly stated. The financial statements in a 10-Q are unaudited; the auditor performs a lighter "review" rather than a full audit. This is one reason the 10-K carries more weight for detailed analysis.',
      },
      {
        heading: 'Timing and frequency',
        body: 'Companies file one 10-K per fiscal year and three 10-Qs (for the first, second, and third fiscal quarters). The fourth quarter is not reported on a separate 10-Q because the annual 10-K already covers the full year, including Q4. Filing deadlines depend on company size, with large "accelerated filers" facing tighter deadlines than smaller companies.',
      },
    ],
    related: ['how-soon-must-a-company-file-a-10-q', 'what-does-mda-tell-you', 'how-to-read-risk-factors', 'what-is-an-8-k-filing'],
    updated: UPDATED,
  },
  {
    slug: 'what-is-an-eps-surprise',
    question: 'What is an EPS surprise and why does it matter?',
    shortAnswer:
      'An EPS surprise is the gap between a company\'s actual reported earnings per share and the consensus estimate analysts expected, usually stated as a percentage. A positive surprise (a "beat") means results exceeded expectations; a negative surprise (a "miss") means they fell short. Surprises often drive sharp short-term stock moves.',
    sections: [
      {
        heading: 'How it is calculated',
        body: 'EPS surprise compares actual earnings per share to the analyst consensus estimate. The surprise percentage is roughly (actual EPS − estimated EPS) divided by the absolute value of the estimated EPS, times 100. For example, if analysts expected $1.00 and the company reported $1.10, that is a +10% surprise.\n\nConsensus estimates are an average of individual analyst forecasts collected before the report. Because the consensus already reflects what the market broadly expects, prices tend to react to the difference between reality and expectation — not to the absolute level of earnings.',
      },
      {
        heading: 'Why the market reacts to it',
        body: 'Stock prices are forward-looking and largely "price in" expected results ahead of time. When actual results differ from expectations, investors update their view of the company\'s trajectory, and the price adjusts. This is why a company can report record profits and still fall if it missed estimates, or post a loss and rally if the loss was smaller than feared.\n\nContext matters too. Beating on EPS while missing on revenue, or beating headline EPS through one-time items or share buybacks rather than operating strength, can blunt or reverse the initial reaction. Forward guidance released alongside earnings often moves the stock more than the surprise itself.',
      },
      {
        heading: 'Where to find it',
        body: 'Earnings are typically released in an 8-K under Item 2.02, with the detailed press release attached as an exhibit. The consensus estimate itself is not in the SEC filing — it comes from analyst-tracking data providers. To evaluate a surprise, compare the reported EPS in the filing against the pre-announcement consensus, and read management\'s commentary for the reasons behind the beat or miss.',
      },
    ],
    related: ['8-k-item-2-02', 'what-does-mda-tell-you', '10-k-vs-10-q'],
    updated: UPDATED,
  },
  {
    slug: 'how-to-read-risk-factors',
    question: 'How do I read the Risk Factors section of a 10-K?',
    shortAnswer:
      'Read a 10-K\'s Risk Factors (Item 1A) to find what management believes could hurt the business. Focus on company-specific risks over generic boilerplate, note the order (most material tends to come first), and compare against the prior year to spot newly added risks — those additions are often the most telling.',
    sections: [
      {
        heading: 'What the section is',
        body: 'Risk Factors, found in Item 1A of a 10-K (and updated in 10-Qs when material changes occur), is where a company discloses the significant risks that could cause actual results to differ from expectations. The SEC now asks companies to keep this section focused and, for longer sets of risks, to include a summary. Companies write it defensively, so it tends to be comprehensive — the challenge is separating meaningful signal from legal boilerplate.',
      },
      {
        heading: 'How to separate signal from boilerplate',
        body: 'Generic risks — "economic conditions may affect demand," "we face competition," "cybersecurity incidents could harm us" — appear in almost every filing and carry little information. The valuable content is company-specific and concrete: dependence on a single large customer, a pending lawsuit with a named counterparty, reliance on one supplier or manufacturing site, exposure to a specific regulation, or heavy debt maturing on a specific date.\n\nOrder can be meaningful. Many companies list risks roughly by importance, so the risks near the top often reflect what management worries about most.',
      },
      {
        heading: 'The most powerful technique: year-over-year comparison',
        body: 'The single most useful way to read Risk Factors is to compare this year\'s section to last year\'s. A newly added risk factor signals something changed — a new competitor, a regulatory threat, a customer concentration that just emerged, or litigation that just arose. Conversely, a risk that was removed may indicate a resolved concern. Because companies rarely add risk language casually (it can invite scrutiny), new additions deserve close attention.',
      },
    ],
    related: ['going-concern-qualification', 'what-does-mda-tell-you', '10-k-vs-10-q'],
    updated: UPDATED,
  },
  {
    slug: '8-k-item-2-02',
    question: 'What is an 8-K Item 2.02?',
    shortAnswer:
      'Item 2.02 of an 8-K is the "Results of Operations and Financial Condition" item — how public companies disclose quarterly and annual earnings. It is the filing that accompanies an earnings press release, typically attached as Exhibit 99.1, and is usually "furnished" to the SEC rather than formally "filed."',
    sections: [
      {
        heading: 'What Item 2.02 covers',
        body: 'Companies use Item 2.02 to publicly release financial results for a completed period — most often a quarter or fiscal year. When a company issues an earnings press release or holds an earnings call, it generally submits an 8-K under Item 2.02 so the information reaches the SEC\'s public database at the same time it reaches investors.\n\nThe body of the 8-K is usually short; the real content is the attached press release, which contains the income statement highlights, revenue and EPS figures, segment detail, and management commentary.',
      },
      {
        heading: '"Furnished" versus "filed"',
        body: 'A technical but useful nuance: earnings 8-Ks under Item 2.02 are typically "furnished" rather than "filed." Furnished information is not automatically subject to the same liability provisions as filed information and is not incorporated by reference into other filings unless the company chooses to. For a reader, the practical effect is minimal — you can still rely on the numbers — but it explains the "furnished" language you will see.',
      },
      {
        heading: 'How to use it',
        body: 'Item 2.02 is where you find the earnings that drive short-term stock moves. Compare the reported revenue and EPS to analyst consensus to gauge the surprise, then read management\'s commentary and any forward guidance. Note whether results were boosted by one-time items. The press release is preliminary; the full audited or reviewed statements arrive later in the 10-K or 10-Q.',
      },
    ],
    related: ['what-is-an-eps-surprise', 'what-is-an-8-k-filing', 'what-does-mda-tell-you'],
    updated: UPDATED,
  },
  {
    slug: 'what-does-mda-tell-you',
    question: 'What does a 10-K MD&A section tell you?',
    shortAnswer:
      "MD&A — Management's Discussion and Analysis — is the section of a 10-K (and 10-Q) where management explains the numbers in plain language: why revenue and profit changed, the drivers behind them, liquidity and cash flow, and known trends or uncertainties. It is the narrative bridge between the raw financial statements and what they mean.",
    sections: [
      {
        heading: 'What MD&A is for',
        body: 'The financial statements tell you what happened; MD&A tells you why, in management\'s own words. Required by the SEC, it is meant to give investors the company\'s perspective on its results and prospects. It typically covers results of operations (revenue, margins, expenses and the reasons they moved), liquidity and capital resources (cash on hand, debt, and how the company funds itself), and critical accounting estimates.',
      },
      {
        heading: 'What to look for',
        body: 'Focus on the "why." A revenue increase is more meaningful once you know whether it came from higher prices, more volume, acquisitions, or currency effects — MD&A should explain this. Pay attention to the liquidity discussion for any strain on cash, upcoming debt maturities, or reliance on financing. Read the "known trends and uncertainties" language carefully; this is where management is required to flag forward-looking concerns that could materially affect future results.\n\nAlso watch for tone and consistency. Compare the current MD&A to prior periods: has confident language turned cautious? Have previously highlighted growth drivers stopped being mentioned? Shifts in emphasis often precede shifts in performance.',
      },
      {
        heading: 'Watch for non-GAAP measures',
        body: 'MD&A and the accompanying materials often present non-GAAP metrics like "adjusted EBITDA" or "adjusted earnings," which exclude certain items. These can be useful but are chosen by management and can flatter results. When you see them, find the reconciliation to the comparable GAAP figure and understand exactly what is being excluded and why.',
      },
    ],
    related: ['how-to-read-risk-factors', 'what-is-an-eps-surprise', 'going-concern-qualification', '10-k-vs-10-q'],
    updated: UPDATED,
  },
  {
    slug: 'what-is-xbrl',
    question: 'What is XBRL in SEC filings?',
    shortAnswer:
      'XBRL (eXtensible Business Reporting Language) is a machine-readable data format the SEC requires in financial filings. It tags each figure — like revenue or net income — with a standardized label, so computers can extract and compare financial data across companies automatically instead of parsing human-readable documents.',
    sections: [
      {
        heading: 'The problem XBRL solves',
        body: 'A traditional filing is written for humans: numbers sit inside tables and paragraphs with no consistent structure a computer can rely on. Comparing "net income" across hundreds of companies used to require manually reading each document. XBRL fixes this by attaching a standardized, machine-readable tag to every reported number, so software can identify that a given figure is, say, "Revenues" or "NetIncomeLoss" regardless of how the company labels it on the page.',
      },
      {
        heading: 'How it works',
        body: 'XBRL tags map each value to a concept in a standardized taxonomy (largely based on US GAAP). Each tagged fact carries context — the period it covers, the reporting entity, and the units. Modern filings use "Inline XBRL," which embeds the tags directly inside the human-readable HTML document, so a single file serves both readers and machines.\n\nBecause tagging is done by the filer, errors happen: a figure can be tagged with the wrong concept, sign, or scale. Analysts who rely on XBRL data generally sanity-check it against the human-readable statements.',
      },
      {
        heading: 'Why it matters to investors',
        body: 'XBRL is the backbone of automated financial analysis. It powers screeners, databases, and tools (including AI systems) that pull structured fundamentals like revenue, EPS, and margins directly from filings. For most investors the benefit is indirect but significant: it makes fast, large-scale, apples-to-apples comparison of company financials possible.',
      },
    ],
    related: ['10-k-vs-10-q', 'what-does-mda-tell-you', 'what-is-an-eps-surprise'],
    updated: UPDATED,
  },
  {
    slug: '8-k-item-1-01',
    question: 'What is an 8-K Item 1.01?',
    shortAnswer:
      'Item 1.01 of an 8-K discloses that a company has entered into a "material definitive agreement" outside the ordinary course of business. Examples include major supply contracts, credit agreements, merger or acquisition agreements, and significant partnerships. It signals the company has committed to a consequential deal.',
    sections: [
      {
        heading: 'What counts as a material definitive agreement',
        body: 'Item 1.01 is triggered when a company enters into an agreement that is both "material" (important enough to affect an investor\'s decisions) and "definitive" (a binding commitment, not a preliminary discussion), and that falls outside its ordinary day-to-day business. Common examples include credit facilities and loan agreements, merger and acquisition agreements, large customer or supplier contracts, licensing deals, joint ventures, and settlement agreements.\n\nRoutine agreements a company makes constantly in its normal operations generally do not require an Item 1.01 filing; the threshold is reserved for deals that stand out.',
      },
      {
        heading: 'How to read it',
        body: 'The 8-K body will summarize the agreement — the counterparty, the purpose, key terms, and dollar amounts if disclosed. The full contract is frequently attached as an exhibit, where the detailed terms live. When evaluating an Item 1.01, consider the size of the deal relative to the company, whether the terms are favorable, and what the agreement implies strategically (a new financing suggests a capital need; a major customer contract suggests growth; a settlement resolves a liability).',
      },
      {
        heading: 'Related items to watch',
        body: 'Item 1.01 has companions worth knowing. If a material agreement is later terminated, that is disclosed under Item 1.02. If entering the agreement also creates a direct financial obligation, such as new debt, Item 2.03 may be triggered as well. A single transaction can therefore span multiple 8-K items, so read the full filing rather than the first heading alone.',
      },
    ],
    related: ['what-is-an-8-k-filing', '8-k-item-5-02', '8-k-item-2-02'],
    updated: UPDATED,
  },
  {
    slug: 'how-soon-must-a-company-file-a-10-q',
    question: 'How soon after quarter-end must a company file a 10-Q?',
    shortAnswer:
      'A company must file its 10-Q within 40 days of the end of the fiscal quarter if it is a "large accelerated" or "accelerated" filer, and within 45 days if it is a smaller (non-accelerated) filer. The deadline depends on the company\'s public float and filing status, not on when it announces earnings.',
    sections: [
      {
        heading: 'The deadlines by filer category',
        body: 'The SEC sets 10-Q deadlines based on a company\'s "filer status," which is driven largely by its public float (the market value of shares held by non-affiliates). Large accelerated filers (generally $700 million or more in public float) and accelerated filers ($75 million to $700 million) must file within 40 days after the quarter ends. Non-accelerated filers and smaller reporting companies (below the accelerated threshold) get 45 days.\n\nAnnual 10-K deadlines follow a similar tiered structure but are longer: 60, 75, or 90 days respectively.',
      },
      {
        heading: 'Filing versus announcing earnings',
        body: 'Note the difference between an earnings announcement and the 10-Q. Many companies issue an earnings press release (via an 8-K under Item 2.02) within a few weeks of quarter-end, well before the formal 10-Q. The press release contains preliminary numbers; the 10-Q that follows contains the complete, reviewed financial statements and footnotes. So a stock can move on the earnings release days or weeks before the official 10-Q lands.',
      },
      {
        heading: 'When deadlines slip',
        body: 'If a company cannot meet its deadline, it can file a Form 12b-25 (Notification of Late Filing), which grants a short automatic extension (five calendar days for a 10-Q). A late filing — or repeated late filings — can itself be a warning sign, sometimes indicating accounting problems, an unresolved audit issue, or internal control weaknesses worth investigating.',
      },
    ],
    related: ['10-k-vs-10-q', '8-k-item-2-02', 'what-is-an-eps-surprise'],
    updated: UPDATED,
  },
  {
    slug: 'what-is-a-form-4',
    question: 'What is a Form 4 and what does insider buying signal?',
    shortAnswer:
      'A Form 4 is a filing that corporate insiders — officers, directors, and holders of more than 10% of a company\'s stock — must submit to the SEC to report changes in their ownership, such as buying or selling shares. It is due within two business days of the transaction. Insider buying is often read as a bullish signal.',
    sections: [
      {
        heading: 'Who files a Form 4 and when',
        body: 'Corporate insiders — a company\'s directors, executive officers, and any beneficial owner of more than 10% of a class of its stock — are required to report their trades in the company\'s securities. A Form 4 discloses the transaction type (purchase, sale, option exercise, grant), the number of shares, the price, and the insider\'s resulting ownership. It must be filed within two business days of the transaction, making it one of the timeliest windows into insider behavior.',
      },
      {
        heading: 'Why insider buying can be a signal',
        body: 'The common interpretation is that insiders sell for many reasons — diversification, taxes, buying a house, exercising expiring options — but they buy shares with their own money for essentially one reason: they believe the stock is undervalued. This asymmetry is why open-market insider purchases, especially large ones by a CEO or CFO, draw attention as a potentially bullish sign.\n\nNot all buying is equal. An open-market purchase at market price is more meaningful than shares acquired through an option exercise, an automatic compensation grant, or a pre-scheduled plan. Cluster buying (several insiders purchasing around the same time) is generally viewed as a stronger signal than a single transaction.',
      },
      {
        heading: 'Reading insider selling carefully',
        body: 'Insider selling is noisier and harder to interpret. Many sales occur under Rule 10b5-1 trading plans, which are set up in advance to sell shares automatically on a schedule, removing any timing signal — a Form 4 will often indicate when a sale was made under such a plan. Treat routine, plan-based, or diversification-driven selling as low signal, and reserve concern for unusually large or out-of-pattern sales.',
      },
    ],
    related: ['what-is-an-8-k-filing', '8-k-item-5-02', '10-k-vs-10-q'],
    updated: UPDATED,
  },
  {
    slug: 'what-is-a-proxy-statement-def-14a',
    question: 'What is a proxy statement (DEF 14A)?',
    shortAnswer:
      'A proxy statement, filed as a DEF 14A, is the document a public company sends shareholders ahead of its annual meeting so they can vote by proxy. It discloses the matters up for a vote — director elections, auditor ratification, executive pay ("say-on-pay"), and shareholder proposals — along with detailed executive compensation tables.',
    sections: [
      {
        heading: 'What a proxy statement covers',
        body: 'When a company holds a shareholder meeting, most investors do not attend in person; they vote in advance "by proxy." The proxy statement is the SEC-mandated disclosure that tells them what they are voting on. The definitive version is filed as a DEF 14A (a preliminary version, PRE 14A, may come first).\n\nTypical agenda items include the election of directors, ratification of the independent auditor, an advisory vote on executive compensation (say-on-pay), approval of equity-compensation plans, and any shareholder proposals that qualified for the ballot. Each item comes with the board\'s recommendation on how to vote.',
      },
      {
        heading: 'Why it is one of the richest filings to read',
        body: 'The proxy is where executive compensation is laid bare. The Summary Compensation Table shows what the CEO and other named executives were paid — salary, bonus, stock and option awards, and other compensation — often over three years. The Compensation Discussion & Analysis (CD&A) explains the philosophy and the performance targets behind the numbers.\n\nBeyond pay, the proxy discloses director independence, board committee membership, related-party transactions, beneficial ownership (who owns large stakes), and potential conflicts of interest. For anyone assessing governance quality, it is more revealing than the 10-K.',
      },
      {
        heading: 'Signals worth watching',
        body: 'Watch the say-on-pay result: a low approval percentage signals shareholder discontent with how executives are paid relative to performance. Contested director elections, activist shareholder proposals, or a large gap between "pay" and company results can all flag governance friction. Related-party transactions — business the company does with insiders or their affiliates — are disclosed here and deserve scrutiny.',
      },
    ],
    related: ['what-does-mda-tell-you', 'what-is-a-form-4', '10-k-vs-10-q'],
    updated: '2026-09-28',
  },
  {
    slug: 'what-is-a-form-13f',
    question: 'What is a Form 13F and what does it reveal about hedge funds?',
    shortAnswer:
      'A Form 13F is a quarterly report that large institutional investors — hedge funds, mutual funds, and other managers with over $100 million in qualifying US equities — must file with the SEC listing their holdings. It reveals which stocks big money owns, but it is filed up to 45 days after quarter-end, so it shows a lagged snapshot.',
    sections: [
      {
        heading: 'Who files a 13F and what it shows',
        body: 'Any "institutional investment manager" that exercises discretion over more than $100 million in Section 13(f) securities (mostly US-listed stocks and certain options) must file a Form 13F within 45 days after the end of each calendar quarter. The filing lists each position: the issuer, the class of security, the number of shares, and the market value at quarter-end.\n\nBecause famous investors and large hedge funds cross this threshold, 13Fs are how the public learns what they held — the basis for the widely reported "so-and-so bought/sold X" headlines each quarter.',
      },
      {
        heading: 'The limitations that trip people up',
        body: 'A 13F is a lagged, incomplete picture, and reading it as a live portfolio is the most common mistake. Three caveats matter most. First, the 45-day delay means a manager may have already exited a position by the time you see it. Second, 13Fs disclose only long US equity and some options — they exclude short positions, cash, bonds, commodities, and non-US holdings, so they can badly misrepresent a fund\'s actual net exposure. Third, managers can request confidential treatment to delay disclosing certain positions.',
      },
      {
        heading: 'How to use them well',
        body: 'Used carefully, 13Fs are still useful. Comparing a manager\'s holdings across consecutive quarters reveals the direction of conviction — new positions, additions, trims, and full exits. Aggregating many funds can show where institutional interest is concentrating or rotating. Treat a single quarter\'s snapshot as a starting point for research, not a trade signal, and always pair it with the fund\'s strategy: a quant fund\'s 13F means something very different from a concentrated value manager\'s.',
      },
    ],
    related: ['what-is-a-form-4', 'what-is-a-proxy-statement-def-14a', 'what-is-an-eps-surprise'],
    updated: '2026-09-28',
  },
  {
    slug: 'what-is-a-material-weakness',
    question: 'What is a material weakness in internal controls?',
    shortAnswer:
      "A material weakness is a deficiency in a company's internal control over financial reporting serious enough that there is a reasonable possibility a material misstatement in the financial statements would not be prevented or caught in time. It is disclosed in the 10-K and is a meaningful red flag about financial-reporting reliability.",
    sections: [
      {
        heading: 'What it means and why it matters',
        body: 'Public companies must maintain internal control over financial reporting (ICFR) — the processes that give reasonable assurance the financials are accurate. Deficiencies are graded by severity: a "deficiency," a more serious "significant deficiency," and the most serious, a "material weakness." A material weakness means there is a reasonable possibility that a material misstatement could occur and go undetected.\n\nIt does not necessarily mean the reported numbers are wrong today, but it tells you the guardrails that would catch an error are not working. That raises the risk of future restatements and is a signal to read the financials with extra care.',
      },
      {
        heading: 'Where to find it',
        body: "Look in the 10-K under \"Controls and Procedures\" (Item 9A), where management assesses the effectiveness of ICFR and disclosure controls. For larger companies, the independent auditor also issues an opinion on ICFR — an \"adverse\" opinion there means the auditor identified a material weakness. Newly public and smaller reporting companies sometimes disclose weaknesses while they build out their finance function.\n\nManagement will typically describe the nature of the weakness (for example, insufficient segregation of duties, or inadequate controls over revenue recognition) and a remediation plan.",
      },
      {
        heading: 'How to read the signal',
        body: 'Assess three things: what the weakness touches (a weakness over a core area like revenue is more serious than one over a peripheral process), whether it has led to an actual restatement, and how credible and advanced the remediation plan is. A single, narrowly scoped weakness with an active fix reads very differently from repeated or pervasive weaknesses across multiple reporting periods, which suggest deeper problems in the finance organization.',
      },
    ],
    related: ['going-concern-qualification', 'how-to-read-risk-factors', 'what-does-mda-tell-you'],
    updated: '2026-09-28',
  },
  {
    slug: 'what-is-a-form-s-1',
    question: 'What is a Form S-1 (IPO registration statement)?',
    shortAnswer:
      "A Form S-1 is the registration statement a company files with the SEC to go public. It is the core disclosure document for an IPO, containing the business description, risk factors, audited financials, how the proceeds will be used, and ownership details. The prospectus that investors read is part of the S-1.",
    sections: [
      {
        heading: 'What an S-1 is for',
        body: "Before a company can sell shares to the public, it must register those securities with the SEC. The Form S-1 is that registration statement, and its prospectus is the document prospective investors use to evaluate the offering. It is a company's most comprehensive public introduction of itself — often the first time detailed financials and strategy are disclosed.\n\nCompanies frequently file amendments (S-1/A) as they respond to SEC comments and update terms; the price range and share count often appear in later amendments as the IPO date approaches.",
      },
      {
        heading: "What's inside",
        body: 'Key sections include: a prospectus summary; risk factors (often the longest and most candid part); use of proceeds (what the company will do with the money raised); a description of the business and its market; management\'s discussion and analysis (MD&A) of the financial results; audited financial statements; a capitalization table and dilution analysis; and information on management, executive compensation, and principal shareholders.\n\nFor loss-making growth companies, the risk factors and the path-to-profitability discussion in MD&A are especially important.',
      },
      {
        heading: 'S-1 vs the final prospectus (424B)',
        body: 'The S-1 registers the offering; once it is declared effective and the deal prices, the company files the final prospectus as a Form 424B, which locks in the actual offering price and share count. If you are researching an IPO after it has priced, the 424B is the definitive version. Emerging-growth companies may also file confidentially first and only reveal the S-1 publicly closer to the roadshow.',
      },
    ],
    related: ['how-to-read-risk-factors', '10-k-vs-10-q', 'what-is-a-proxy-statement-def-14a'],
    updated: '2026-09-28',
  },
  {
    slug: 'schedule-13d-vs-13g',
    question: "Schedule 13D vs 13G: what's the difference?",
    shortAnswer:
      'Schedule 13D and 13G are filed when an investor crosses 5% ownership of a public company. A 13D signals an active investor who may seek to influence or control the company — the classic activist filing. A 13G is for passive investors with no intent to influence control, and carries lighter, less frequent disclosure.',
    sections: [
      {
        heading: 'The 5% trigger',
        body: 'When any person or group acquires beneficial ownership of more than 5% of a class of a company\'s voting shares, they must report it to the SEC. Which form they file depends on their intent. An investor who might push for change — board seats, a sale, a strategy shift — files the longer Schedule 13D. An investor holding purely for investment, with no plan to influence control, can file the shorter Schedule 13G.\n\nRecent SEC amendments shortened the deadlines: an initial 13D is now generally due within five business days of crossing the threshold, and amendments must follow material changes promptly.',
      },
      {
        heading: 'Why a 13D is the one to watch',
        body: 'The 13D is the activist\'s calling card. Its Item 4, "Purpose of Transaction," is where the filer must state what they intend — and language there about seeking board representation, strategic alternatives, a sale, or governance changes can move the stock, because it flags potential pressure on management.\n\nHedge funds and activist investors use 13Ds (and their amendments) to build and disclose campaigns. A new 13D on a company, especially from a known activist, often draws immediate market attention.',
      },
      {
        heading: 'How to read a 13G',
        body: 'A 13G is typically filed by passive institutional holders — index funds, asset managers, and the like — who cross 5% simply through the scale of their holdings. It is shorter and updated less often. A holder can be required to switch from 13G to 13D if their intent changes to an active one. When scanning ownership, treat a 13G as "big passive holder" and a 13D as "someone who may want to shake things up."',
      },
    ],
    related: ['what-is-a-form-4', 'what-is-a-proxy-statement-def-14a', 'what-is-a-form-13f'],
    updated: '2026-09-29',
  },
  {
    slug: 'what-is-regulation-fd',
    question: 'What is Regulation FD (Fair Disclosure)?',
    shortAnswer:
      'Regulation FD (Fair Disclosure) is an SEC rule that bars public companies from selectively sharing material non-public information with analysts or select investors before the public. If material information is disclosed selectively — even by accident — the company must promptly make it broadly public, often by furnishing an 8-K under Item 7.01.',
    sections: [
      {
        heading: 'What the rule requires',
        body: 'Regulation FD, adopted in 2000, targets selective disclosure. If a company (or someone acting on its behalf) discloses material non-public information to certain people — typically analysts, institutional investors, or shareholders who might trade on it — it must disclose that same information to the public. For an intentional selective disclosure, the public disclosure must be simultaneous; for an unintentional one, promptly (generally within 24 hours).\n\nThe usual mechanism for the public disclosure is a Form 8-K under Item 7.01 (Regulation FD Disclosure), or a widely accessible press release or webcast.',
      },
      {
        heading: 'Why it exists',
        body: 'Before Reg FD, companies sometimes gave analysts and big investors a heads-up on earnings or guidance ahead of everyone else, creating an uneven playing field. The rule was designed to ensure all investors get access to material information at the same time, improving fairness and market integrity. It is a big reason earnings guidance and material updates are released through broadly accessible channels.',
      },
      {
        heading: 'How you see it in filings',
        body: 'When you see an 8-K with Item 7.01, the company is making a Regulation FD disclosure — putting information on the public record so no one has an informational edge. These are often "furnished" rather than "filed," a technical distinction affecting liability but not your ability to read the content. Investor-day slides, updated guidance, and similar materials frequently appear this way.',
      },
    ],
    related: ['what-is-an-8-k-filing', '8-k-item-2-02', 'what-is-an-eps-surprise'],
    updated: '2026-09-29',
  },
  {
    slug: 'what-is-a-424b-prospectus',
    question: 'What is a 424B prospectus?',
    shortAnswer:
      'A 424B is the final prospectus a company files with the SEC after its registration statement (such as an S-1 or S-3) is declared effective. It contains the completed terms of a securities offering — the actual price, number of shares, and use of proceeds. The number suffix (424B1 through 424B5) indicates what was finalized after the earlier filing.',
    sections: [
      {
        heading: 'Where a 424B fits',
        body: 'A registration statement like an S-1 (for an IPO) or S-3 (for follow-on offerings by established companies) registers securities, but it often leaves final pricing blank while the SEC reviews it. Once the registration is effective and the deal prices, the company files the definitive prospectus as a Form 424B. This is the document with the real, locked-in terms — so for any priced offering, the 424B is the authoritative version to read.',
      },
      {
        heading: 'The B-number variants',
        body: 'The suffix tells you what was completed relative to the effective registration statement. The most common are 424B1 and 424B2 (prospectuses that include pricing or other information omitted earlier), 424B3 (a prospectus filed under Rule 424(b)(3), often for updates), 424B4 (the classic final IPO prospectus reflecting the priced deal), and 424B5 (typically a prospectus supplement for a takedown off an existing shelf registration). You do not need to memorize the differences — the key point is that a 424B carries final offering terms.',
      },
      {
        heading: 'How to use it',
        body: 'If you are researching an IPO or a secondary offering after it has priced, go straight to the 424B for the offering price, share count, underwriters, and use of proceeds. Pair it with the underlying S-1 or S-3, which carries the fuller business description, risk factors, and financial statements. A wave of 424B5 filings by a company can also signal it is repeatedly tapping the market for capital — worth noting for dilution.',
      },
    ],
    related: ['what-is-a-form-s-1', '10-k-vs-10-q', 'how-to-read-risk-factors'],
    updated: '2026-09-29',
  },
  {
    slug: 'what-is-a-form-s-4',
    question: 'What is a Form S-4 (mergers and acquisitions)?',
    shortAnswer:
      'A Form S-4 is the registration statement a company files when it issues new shares to fund a merger or acquisition — for example, in a stock-for-stock deal. It doubles as the combined proxy statement and prospectus sent to shareholders voting on the transaction, and it lays out the deal terms, background, financials, and risk factors.',
    sections: [
      {
        heading: 'When an S-4 is used',
        body: 'When an acquirer pays for a target partly or wholly in its own stock, those new shares must be registered with the SEC. The Form S-4 is that registration statement. Because target shareholders usually have to vote on the deal, the S-4 typically serves double duty as a "proxy statement/prospectus" — the disclosure document shareholders read before voting and before receiving the acquirer\'s shares.',
      },
      {
        heading: "What's inside",
        body: 'An S-4 is one of the richest deal documents available publicly. It usually includes: the terms of the merger (including the exchange ratio — how many acquirer shares each target share converts into); the "Background of the Merger," a narrative timeline of negotiations; the board\'s reasons for recommending the deal; a fairness opinion from a financial advisor; pro forma financial statements showing the combined company; and risk factors specific to the transaction and integration.',
      },
      {
        heading: 'How to read it',
        body: 'Focus on the exchange ratio and implied deal value, the background section (which can reveal whether the process was competitive or negotiated with a single bidder), and the risk factors around closing conditions, regulatory approval, and integration. The pro forma financials show what the combined balance sheet and earnings could look like. For merger arbitrage and event-driven analysis, the S-4 is the primary source document.',
      },
    ],
    related: ['what-is-an-8-k-filing', 'what-is-a-proxy-statement-def-14a', 'how-to-read-risk-factors'],
    updated: '2026-09-29',
  },
];

/** Look up a single explainer by slug. */
export function getExplainer(slug: string): Explainer | undefined {
  return explainers.find((e) => e.slug === slug);
}

/** All slugs, useful for generateStaticParams and sitemap generation. */
export const explainerSlugs: string[] = explainers.map((e) => e.slug);
