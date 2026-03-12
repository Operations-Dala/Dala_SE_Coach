export default function HowItWorksPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-bold text-slate-900">How It Works</h1>
        <p className="text-slate-500 text-xs mt-0.5">
          Understanding the SE Coach scoring system and daily workflow.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6 mb-5">
        <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-4">Daily Workflow</p>
        <ol className="space-y-4">
          {[
            {
              num: '1',
              title: 'Export PepUp Reports',
              desc: 'Export the 3 PepUp reports for the day from Tally: Check-in / Check-out Report, Product Report, and Feedback Detail Report.',
            },
            {
              num: '2',
              title: 'Upload Files',
              desc: 'Go to Import Data, select the report date, and upload all three files at once.',
            },
            {
              num: '3',
              title: 'Upload Weekly Debt',
              desc: "Upload the weekly debt sheet. Debt score is calculated automatically from each zone's share of team debt.",
            },
            {
              num: '4',
              title: 'Generate Reports',
              desc: 'Click Generate All Reports. Scores, rankings, tier assignments, and coaching insights are computed automatically.',
            },
            {
              num: '5',
              title: 'Review Results',
              desc: 'Go to Home to see the leaderboard and individual SE scores. Use SE Analytics for trends over time.',
            },
          ].map(({ num, title, desc }) => (
            <li key={num} className="flex gap-4">
              <span className="w-7 h-7 rounded-full bg-red-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                {num}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900 mb-0.5">{title}</p>
                <p className="text-xs text-slate-500">{desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6 mb-5">
        <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-4">Scoring Breakdown - 100 Points Total</p>
        <div className="space-y-4">
          {[
            {
              label: 'Resumption Time',
              pts: '5 pts',
              color: 'bg-blue-100 text-blue-700',
              rules: [
                'Checked in by 8:50 AM -> 5 pts (full marks)',
                '8:51-9:00 AM -> 3 pts',
                'After 9:00 AM -> 0 pts',
              ],
            },
            {
              label: 'Store Visits',
              pts: '10 pts',
              color: 'bg-purple-100 text-purple-700',
              rules: [
                '8+ stores visited -> 10 pts (full marks)',
                'Scales proportionally below 8',
                'Based on check-in / check-out count',
              ],
            },
            {
              label: 'Brand Coverage',
              pts: '40 pts',
              color: 'bg-green-100 text-green-700',
              rules: [
                'Score = (brands covered / active brands) * 40',
                'Only counts active brands configured in Settings',
                'Highest-weighted component',
              ],
            },
            {
              label: 'Efficiency',
              pts: '15 pts',
              color: 'bg-orange-100 text-orange-700',
              rules: [
                'Score = (feedback reports submitted / 15) * 15',
                'Capped at 15 pts maximum',
                'Rewards thorough store reporting',
              ],
            },
            {
              label: 'Debt Score',
              pts: '30 pts',
              color: 'bg-red-100 text-red-700',
              rules: [
                'Calculated automatically from weekly debt upload',
                'Zone debt at or below 10% of total team debt = 30 pts',
                'Zone debt at or above 25% of total team debt = 0 pts',
              ],
            },
          ].map(({ label, pts, color, rules }) => (
            <div key={label} className="flex gap-4 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <p className="text-sm font-semibold text-slate-900">{label}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${color}`}>{pts}</span>
                </div>
                <ul className="space-y-0.5">
                  {rules.map(rule => (
                    <li key={rule} className="flex items-start gap-1.5 text-xs text-slate-500">
                      <span className="text-slate-300 mt-0.5">&gt;</span>
                      {rule}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6 mb-5">
        <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-4">Tier System</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { tier: 'Elite', range: '85-100', color: 'bg-yellow-50 border-yellow-200', badge: 'bg-yellow-100 text-yellow-700', desc: 'Top performers. Consistent high scores across all metrics.' },
            { tier: 'Core', range: '65-84', color: 'bg-blue-50 border-blue-200', badge: 'bg-blue-100 text-blue-700', desc: 'Solid performers with room to push into Elite.' },
            { tier: 'Developing', range: '0-64', color: 'bg-slate-50 border-slate-200', badge: 'bg-slate-200 text-slate-600', desc: 'Needs coaching intervention and focused improvement.' },
          ].map(({ tier, range, color, badge, desc }) => (
            <div key={tier} className={`border rounded-lg p-4 ${color}`}>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge}`}>{tier}</span>
              <p className="text-sm font-semibold text-slate-900 mt-2">{range} pts</p>
              <p className="text-xs text-slate-500 mt-1">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-4">Data Sources</p>
        <div className="grid grid-cols-4 gap-3 text-xs">
          {[
            { file: 'Check-in / Check-out', source: 'Tally PepUp', fields: 'Resumption time, store visit count' },
            { file: 'Product Report', source: 'Tally PepUp', fields: 'Brand names covered per store' },
            { file: 'Feedback Detail', source: 'Tally PepUp', fields: 'Number of feedback submissions' },
            { file: 'Weekly Debt Sheet', source: 'Debt Upload', fields: 'Zone debt totals used to compute debt score' },
          ].map(({ file, source, fields }) => (
            <div key={file} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p className="font-semibold text-slate-900 mb-0.5">{file}</p>
              <p className="text-slate-400 text-[10px] mb-1">{source}</p>
              <p className="text-slate-500">{fields}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
