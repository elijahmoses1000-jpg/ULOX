import { Link } from 'react-router-dom';
import { ArrowRight, Award, BookOpen, Map, Search, Sparkles, Swords, Timer, Wrench } from 'lucide-react';
import { PUZZLES } from '../lib/puzzles';
import { ROADMAPS } from '../lib/curriculum';
import { useProfile } from '../lib/profile';
import { Card } from '../components/ui';

/**
 * Everything that is optional lives behind one door. The journey is the spine;
 * this is the library you wander into when you want something specific.
 */
export function Explore() {
  const profile = useProfile(s => s.profile);
  const solved = Object.keys(profile.solved).length;

  const places = [
    {
      to: '/paths',
      icon: Map,
      title: 'Learning paths',
      body: 'Every official roadmap.sh path — AI agents, Python, backend, security, ninety-plus in all. Read a topic, watch a video, tick it off.',
      meta: '90+ roadmaps',
      tone: '#4EA8FF',
    },
    {
      to: '/certificates',
      icon: Award,
      title: 'Certificates',
      body: 'Finish a discipline and earn a certificate with a code anyone can verify. All six earns the capstone.',
      meta: '7 available',
      tone: '#F5A524',
    },
    {
      to: '/glossary',
      icon: Search,
      title: 'Jargon desk',
      body: 'Every term this field throws at you, in plain words — what it means, why it matters, and what people mistake it for.',
      meta: '250 terms',
      tone: '#F5A524',
    },
    {
      to: '/toolkit',
      icon: Wrench,
      title: 'Toolkit',
      body: 'Field notes, real APIs you can drop into a diagram, graded build challenges, career routes, books and curated lists.',
      meta: '8 libraries',
      tone: '#3FD07A',
    },
    {
      to: '/train',
      icon: Swords,
      title: 'All puzzles',
      body: 'Every broken system in one list, sorted by how well it matches your level. Practise any discipline out of order.',
      meta: `${solved}/${PUZZLES.length} fixed`,
      tone: '#EE1B24',
    },
    {
      to: '/book',
      icon: BookOpen,
      title: 'Recipes',
      body: 'Named architectures that already work — ReAct, guarded loops, routers, supervisors — with the traps each one sets.',
      meta: '6 patterns',
      tone: '#B57BFF',
    },
    {
      to: '/learn',
      icon: Sparkles,
      title: 'UloX Core',
      body: 'The hand-written curriculum behind the journey, if you would rather read it all at once.',
      meta: `${ROADMAPS.length} tracks`,
      tone: '#F5A524',
    },
    {
      to: '/rush',
      icon: Timer,
      title: 'Speed round',
      body: 'Three minutes, three lives. Spot the best move as fast as you can.',
      meta: `best ${profile.rushBest}`,
      tone: '#38C4C4',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-5 lg:py-8">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight">Explore</h1>
        <p className="text-sm text-chalk-dim mt-1 max-w-2xl">
          Optional. The journey on the home screen already knows what you should do next — this is for when you want
          something specific instead.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {places.map(place => (
          <Link key={place.to} to={place.to}>
            <Card className="p-4 h-full hover:border-ink-500 transition group flex flex-col">
              <span
                className="w-10 h-10 rounded-xl grid place-items-center mb-3"
                style={{ background: `${place.tone}1F`, color: place.tone }}
              >
                <place.icon size={19} />
              </span>
              <h2 className="font-display text-[16px] font-bold group-hover:text-chalk transition">{place.title}</h2>
              <p className="text-[12.5px] text-chalk-dim mt-1.5 leading-snug grow">{place.body}</p>
              <span className="mt-3 flex items-center justify-between">
                <span className="text-[11px] font-mono text-chalk-faint">{place.meta}</span>
                <ArrowRight size={15} className="text-chalk-faint group-hover:text-chalk group-hover:translate-x-0.5 transition" />
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
