import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Play } from 'lucide-react';
import { PATTERNS } from '../lib/patterns';
import { analyzeGraph } from '../lib/analyzer';
import { simulate } from '../lib/simulator';
import { GraphCanvas } from '../components/GraphCanvas';
import { Card, Chip } from '../components/ui';

export function Book() {
  const [openId, setOpenId] = useState<string>(PATTERNS[0].id);
  const active = PATTERNS.find(p => p.id === openId)!;
  const report = analyzeGraph(active.graph);
  const sim = simulate(active.graph, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-5 lg:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight">Pattern Book</h1>
        <p className="text-sm text-chalk-dim mt-1">
          Named agent architectures with the moves that usually follow and the traps that follow them. Load any of them
          straight into the Lab.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <nav className="space-y-1.5 lg:max-h-[70vh] lg:overflow-y-auto">
          {PATTERNS.map(p => (
            <button
              key={p.id}
              onClick={() => setOpenId(p.id)}
              className={`w-full text-left p-3 rounded-xl border transition ${
                p.id === openId ? 'bg-brand/10 border-brand/50' : 'bg-ink-800 border-ink-700 hover:border-ink-500'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-extrabold text-brand">{p.code}</span>
                <span className="text-[13.5px] font-bold truncate">{p.name}</span>
              </div>
              <div className="text-[11px] text-chalk-faint mt-0.5">{p.family}</div>
            </button>
          ))}
        </nav>

        <div className="space-y-3">
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-ink-700 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[12px] font-extrabold text-brand">{active.code}</span>
              <h2 className="text-[16px] font-bold">{active.name}</h2>
              <Chip tone={report.score >= 0 ? 'up' : 'down'}>
                {report.score >= 0 ? '+' : ''}
                {report.score.toFixed(1)} AAS
              </Chip>
              <Chip tone={sim.status === 'terminated' ? 'up' : 'warn'}>{sim.status.replace('_', ' ')}</Chip>
              <Link to={`/lab/${active.id}`} className="btn-primary !text-xs ml-auto">
                <Play size={13} /> Open in Lab
              </Link>
            </div>
            <GraphCanvas graph={active.graph} selection={null} onSelect={() => {}} readOnly height="300px" />
          </Card>

          <Card className="p-4">
            <p className="text-[13.5px] leading-relaxed text-chalk">{active.summary}</p>

            <div className="grid gap-4 sm:grid-cols-2 mt-4">
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <CheckCircle2 size={14} className="text-eval-up" />
                  <span className="label">Reach for it when</span>
                </div>
                <ul className="space-y-1.5">
                  {active.useWhen.map(u => (
                    <li key={u} className="text-[12.5px] leading-snug text-chalk-dim">
                      {u}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle size={14} className="text-eval-warn" />
                  <span className="label">Known traps</span>
                </div>
                <ul className="space-y-1.5">
                  {active.pitfalls.map(u => (
                    <li key={u} className="text-[12.5px] leading-snug text-chalk-dim">
                      {u}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
