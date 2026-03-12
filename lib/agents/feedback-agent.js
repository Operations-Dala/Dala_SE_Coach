import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Feedback Intelligence Agent
 *
 * Analyses an SE's feedback activity report submissions to extract:
 * - Specific products/SKUs mentioned (stock-outs, quality issues, demand signals)
 * - Store-level observations and patterns
 * - Recurring issues flagged against 14-day team-wide history
 * - Actionable coaching hooks for the Coach Agent
 *
 * @returns Structured JSON intelligence object
 */
export async function runFeedbackAgent(apiKey, { seName, feedbackRows, historicalTrends }) {
  if (!feedbackRows || feedbackRows.length === 0) {
    return {
      product_mentions: [], store_observations: [], recurring_patterns: [],
      key_findings: [], coaching_hooks: [], has_data: false,
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const todayFeedback = feedbackRows.map(r =>
    `[${r.store_name} / ${r.brand_name}] Q: ${r.question} | A: ${r.answer}`
  ).join('\n');

  const trendContext = (historicalTrends || []).length
    ? historicalTrends
        .sort((a, b) => b.days_seen - a.days_seen)
        .slice(0, 15)
        .map(t => `${t.brand_name} — flagged ${t.days_seen} day(s) by ${t.se_count} SE(s): ${t.summary}`)
        .join('\n')
    : 'No prior trend data available yet.';

  const prompt = `You are a field intelligence analyst for Speckless, an FMCG distribution company in Nigeria. Analyse this SE's feedback submissions from today and extract structured product and market intelligence. Return JSON ONLY — no markdown, no explanation.

SE: ${seName}

TODAY'S FEEDBACK SUBMISSIONS (${feedbackRows.length} entries):
${todayFeedback}

TEAM-WIDE PRODUCT/BRAND TRENDS (last 14 days, for pattern matching):
${trendContext}

Extract and return this exact JSON structure:
{
  "product_mentions": [
    {
      "product": "specific product name, SKU, or pack size if mentioned (e.g. 'Indomie 70g', 'Peak 400g tin')",
      "brand": "brand name",
      "store": "store name",
      "issue": "specific issue described in one sentence",
      "type": "stock_out" | "quality" | "pricing" | "competitor_activity" | "high_demand" | "low_demand" | "positive_reception" | "retailer_complaint" | "other",
      "severity": "high" | "medium" | "low",
      "fault_attribution": "se" | "supply" | "market" | "shared"
    }
  ],
  "store_observations": [
    {
      "store": "store name",
      "observation": "key intelligence about this store's situation",
      "brands_affected": ["brand1", "brand2"],
      "action_needed": true | false
    }
  ],
  "recurring_patterns": [
    {
      "subject": "the product, brand, or issue type",
      "pattern": "description of what is repeating and across how many days/SEs",
      "alert": true | false,
      "recommended_escalation": "what should be done about this pattern"
    }
  ],
  "key_findings": [
    "3 to 5 most important intelligence points from this SE's feedback today — be specific with names and numbers"
  ],
  "coaching_hooks": [
    "specific, quotable observations the coach should reference when speaking to this SE (e.g. 'You noted that Kellogg's was out of stock at 3 stores — this is worth escalating')"
  ],
  "accountability_split": {
    "se_pct": 0,
    "supply_pct": 0,
    "market_pct": 0,
    "summary": "one sentence: are today's issues mostly supply-side or SE-controllable?"
  }
}

fault_attribution rules (CRITICAL — determines if issues are SE's fault or Dala/company fault):
- "supply" = stock unavailability, out-of-stock products, delayed delivery, product not sent by depot/Dala, quality issues from factory — these are DALA's responsibility, NOT the SE's fault
- "se" = SE didn't push the product, didn't visit the store, poor retailer relationship, missed opportunity to sell despite availability, inadequate pitch
- "market" = consumer preference change, competitor pricing the company cannot match, economic factors, seasonal demand shift
- "shared" = SE could have done better AND there's a supply/structural issue (e.g., SE didn't escalate a known persistent stock-out)

accountability_split: add up all fault_attribution values across product_mentions and express as percentages (must sum to ~100)

Other rules:
- Extract actual product/SKU names where visible in answers — do not generalise
- severity=high if: stock-out, competitor threat, retailer about to switch brands, or pattern repeating 3+ days
- alert=true in recurring_patterns only if the same brand/product/issue appears in BOTH today's data AND the historical trend context
- coaching_hooks must be specific enough to quote directly in a coaching message
- If an answer is vague or non-informative, set type="other" and severity="low" and fault_attribution="se"
- Maximum 8 items in product_mentions, 5 in store_observations, 4 in recurring_patterns`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim().replace(/^```json?\n?/, '').replace(/```$/, '').trim();

  try {
    return { ...JSON.parse(raw), has_data: true };
  } catch {
    // Fallback: surface raw feedback as minimal coaching hooks
    return {
      product_mentions: [],
      store_observations: [],
      recurring_patterns: [],
      key_findings: feedbackRows.slice(0, 4).map(r =>
        `${r.brand_name} at ${r.store_name}: ${r.answer.slice(0, 100)}`
      ),
      coaching_hooks: feedbackRows.slice(0, 2).map(r =>
        `You noted at ${r.store_name}: "${r.answer.slice(0, 80)}"`
      ),
      has_data: true,
    };
  }
}
