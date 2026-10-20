import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getPlans, type Plan } from '../api/billing';
import { useLocale, useT } from '../i18n/LocaleContext';
import { cn } from '../lib/cn';

const LIME = '#d6ff3c';

const MAPS = [
  { name: 'Mirage', a: '#1c3a4a', b: '#c4a15a', tag: 'A default' },
  { name: 'Dust II', a: '#3a2a18', b: '#e0b56a', tag: 'Long' },
  { name: 'Inferno', a: '#3a1814', b: '#ff7a3c', tag: 'Banana' },
  { name: 'Nuke', a: '#10241c', b: '#3dff9a', tag: 'Outside' },
  { name: 'Ancient', a: '#102820', b: '#7dffb2', tag: 'Donut' },
  { name: 'Anubis', a: '#2a2410', b: '#e6c15a', tag: 'Mid' },
  { name: 'Vertigo', a: '#1a1e28', b: '#9ab0ff', tag: 'A ramp' },
  { name: 'Overpass', a: '#142018', b: '#8fd18a', tag: 'Monster' },
] as const;

export function LandingPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const { locale } = useLocale();
  const ru = locale === 'ru';
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [yearly, setYearly] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = useMemo(
    () => [
      { q: t('faq.q1'), a: t('faq.a1') },
      { q: t('faq.q2'), a: t('faq.a2') },
      { q: t('faq.q3'), a: t('faq.a3') },
      { q: t('faq.q4'), a: t('faq.a4') },
      { q: t('faq.q5'), a: t('faq.a5') },
    ],
    [t],
  );

  useEffect(() => {
    getPlans()
      .then(setPlans)
      .finally(() => setPlansLoading(false));
  }, []);

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  const paidPlans = plans.filter((p) => p.id !== 'FREE');

  return (
    <div className="bg-[#050505] text-zinc-100">
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-8 pt-10 md:grid-cols-[1.05fr_0.95fr] md:px-8 md:pt-16">
        <div className="min-w-0">
          <h1 className="font-display text-[clamp(2.4rem,6vw,4.6rem)] font-black uppercase leading-[0.92] text-white">
            {ru ? 'Разбери катку' : 'Read the demo'}
            <br />
            <span style={{ color: LIME }}>{ru ? 'по раундам' : 'round by round'}</span>
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-zinc-400 md:text-base">
            {ru
              ? 'Загрузи .dem. ИИ отмечает пик без инфы, стрельбу в движении и что тренить первым. 2D-реплей уже стоит на этом тике.'
              : 'Upload a .dem. The review marks the dry peek, the moving shot, and what to train first. The 2D replay is already on that tick.'}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              to="/register"
              className="rounded-full px-6 py-3 text-sm font-extrabold text-black"
              style={{ background: LIME }}
            >
              {ru ? 'Загрузить демку' : 'Upload a demo'}
            </Link>
            <a href="#inside" className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white">
              {ru ? 'Что внутри' : "What's inside"}
            </a>
          </div>
          <div className="mt-8 flex flex-wrap gap-6 border-t border-white/10 pt-5">
            {[
              ['12', ru ? 'типов ошибок' : 'mistake types'],
              ['8', ru ? 'карт с радаром' : 'radar maps'],
              ['<90с', ru ? 'разбор демки' : 'demo review'],
            ].map(([n, label]) => (
              <div key={label}>
                <p className="font-display text-3xl font-black text-white">{n}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-zinc-500">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <MatchFrame ru={ru} />
      </section>

      <section id="maps" className="mx-auto max-w-6xl px-4 py-14 md:px-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 className="font-display text-3xl font-black uppercase md:text-4xl">{ru ? 'Выбери карту' : 'Pick a map'}</h2>
          <p className="hidden text-sm text-zinc-500 sm:block">{ru ? 'Радар, раскидки и ошибки по каждой' : 'Radar, lineups and mistakes on each'}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {MAPS.map((map) => (
            <Link
              key={map.name}
              to="/register"
              className="group relative aspect-[16/10] overflow-hidden rounded-2xl border border-white/10"
              style={{ background: `linear-gradient(145deg, ${map.a}, #070707 70%)` }}
            >
              <MapArt accent={map.b} />
              <span className="absolute left-3 top-3 rounded-full bg-black/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-300">
                {map.tag}
              </span>
              <span className="absolute bottom-3 left-3 font-display text-lg font-black uppercase text-white">
                {map.name}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section id="protocol" className="border-y border-white/10 bg-[#080808]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-3 md:px-8">
          <h2 className="font-display text-3xl font-black uppercase md:col-span-3 md:text-4xl">
            {ru ? 'Как это работает' : 'How it works'}
          </h2>
          {[
            [t('landing.step1Title'), t('landing.step1Desc')],
            [t('landing.step2Title'), t('landing.step2Desc')],
            [t('landing.step3Title'), t('landing.step3Desc')],
          ].map(([title, desc], i) => (
            <article key={title} className="rounded-2xl border border-white/10 bg-black p-5">
              <p className="font-display text-4xl font-black" style={{ color: LIME }}>
                0{i + 1}
              </p>
              <h3 className="mt-4 font-display text-xl font-bold uppercase">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="inside" className="mx-auto max-w-6xl px-4 py-14 md:px-8">
        <h2 className="font-display text-3xl font-black uppercase md:text-4xl">{ru ? 'Что внутри' : "What's inside"}</h2>
        <div className="mt-6 grid gap-3 md:grid-cols-5">
          <article className="rounded-2xl border border-white/10 bg-[#0c0c0e] p-4 md:col-span-3">
            <p className="font-display text-lg font-bold uppercase">{ru ? '2D-реплей на тике ошибки' : '2D replay on the mistake'}</p>
            <p className="mt-1 text-sm text-zinc-400">
              {ru ? 'Раунды слева, радар в центре, решение справа.' : 'Rounds on the left, radar in the center, the fix on the right.'}
            </p>
            <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
              <Radar />
            </div>
          </article>
          <div className="grid gap-3 md:col-span-2">
            <article className="rounded-2xl border border-white/10 bg-[#0c0c0e] p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: LIME }}>
                {ru ? 'Ошибка' : 'Mistake'}
              </p>
              <p className="mt-2 font-display text-xl font-bold uppercase">{ru ? 'Пик без инфы' : 'Peek without info'}</p>
              <p className="mt-2 text-sm text-zinc-400">
                {ru ? 'Тик 18420. Сначала смок, потом угол. Эту раскидку — дважды.' : 'Tick 18420. Smoke first, then the angle. Drill the lineup twice.'}
              </p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-[#0c0c0e] p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-300">{ru ? 'Чат тренера' : 'Coach chat'}</p>
              <p className="mt-3 rounded-xl bg-black px-3 py-2 text-sm text-zinc-300">
                {ru ? 'Почему умер на 16-м?' : 'Why did I die on round 16?'}
              </p>
              <p className="mt-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-400">
                {ru
                  ? 'Вышел на коннектор без смока. Доказательство — тик 18420.'
                  : 'Pushed connector with no smoke. Evidence is tick 18420.'}
              </p>
            </article>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [ru ? 'Раскидки' : 'Lineups', ru ? 'Видео, точка, твой бросок против эталона' : 'Video, spot, your throw vs the reference'],
            [ru ? 'Доска' : 'Board', ru ? 'Рисуешь раунд вместе с командой' : 'Draw the round with the team'],
            [ru ? 'ДЗ' : 'Homework', ru ? 'Тренер назначает, через неделю видно повтор' : 'Coach assigns it, a week later you see the repeat'],
            [ru ? 'Аналитик' : 'Analyst', ru ? 'ИИ делает черновик, человек закрывает отчёт' : 'AI drafts it, a person closes the report'],
          ].map(([title, desc]) => (
            <article key={title} className="rounded-2xl border border-white/10 bg-[#0c0c0e] p-4">
              <span className="mb-3 block h-2 w-8 rounded-full" style={{ background: LIME }} />
              <h3 className="font-display text-lg font-bold uppercase">{title}</h3>
              <p className="mt-2 text-sm text-zinc-400">{desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#080808]">
        <div className="mx-auto grid max-w-6xl gap-3 px-4 py-14 md:grid-cols-3 md:px-8">
          <h2 className="font-display text-3xl font-black uppercase md:col-span-3 md:text-4xl">
            {ru ? 'Для кого' : 'Who it is for'}
          </h2>
          {[
            [ru ? 'Игрок' : 'Player', ru ? 'Свои матчи, повтор ошибок и список на неделю.' : 'Your matches, repeating mistakes, a weekly list.'],
            [ru ? 'Тренер' : 'Coach', ru ? 'Заметка на тике и ДЗ в один клик.' : 'A note on the tick and homework in one click.'],
            [ru ? 'Академия' : 'Academy', ru ? 'Общие демки, роли и живой аналитик поверх черновика.' : 'Shared demos, roles, and a human on top of the draft.'],
          ].map(([title, desc], i) => (
            <article key={title} className="rounded-2xl border border-white/10 p-5">
              <p className="font-mono text-xs" style={{ color: LIME }}>0{i + 1}</p>
              <h3 className="mt-3 font-display text-2xl font-black uppercase">{title}</h3>
              <p className="mt-2 text-sm text-zinc-400">{desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-4 py-14 md:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-3xl font-black uppercase md:text-4xl">{t('landing.pricingTitle')}</h2>
          <button
            type="button"
            onClick={() => setYearly((v) => !v)}
            className="rounded-full border border-white/15 px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-300"
            aria-pressed={yearly}
          >
            {yearly ? t('landing.yearly') : t('landing.monthly')}
          </button>
        </div>
        {plansLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin" style={{ color: LIME }} aria-label={t('landing.loadingPlans')} />
          </div>
        ) : paidPlans.length === 0 ? (
          <p className="text-sm text-zinc-500">{t('landing.plansUnavailable')}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {paidPlans.map((plan) => {
              const highlight = plan.id === 'PRO';
              const price = yearly ? plan.yearly_price / 12 : plan.monthly_price;
              return (
                <article
                  key={plan.id}
                  className={cn('flex flex-col rounded-2xl border p-5', highlight ? 'border-[#d6ff3c]' : 'border-white/10 bg-[#0c0c0e]')}
                >
                  <h3 className="font-display text-xl font-bold uppercase">{plan.name}</h3>
                  <p className="mt-3 font-display text-4xl font-black">
                    ${price.toFixed(0)}
                    <span className="text-sm font-medium text-zinc-500"> {t('landing.perMonth')}</span>
                  </p>
                  <ul className="mt-5 flex-1 space-y-2">
                    {plan.features.slice(0, 6).map((feature) => (
                      <li key={feature} className="flex gap-2 text-sm text-zinc-400">
                        <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: LIME }} aria-hidden />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/register"
                    className={cn(
                      'mt-6 block rounded-full py-3 text-center text-sm font-extrabold',
                      highlight ? 'text-black' : 'border border-white/15 text-white',
                    )}
                    style={highlight ? { background: LIME } : undefined}
                  >
                    {highlight ? t('landing.startTrial') : t('landing.choosePlan')}
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-16 md:px-8">
        <h2 className="mb-4 font-display text-3xl font-black uppercase">{t('landing.faqTitle')}</h2>
        {faqs.map((faq, index) => {
          const open = openFaq === index;
          return (
            <button
              key={faq.q}
              type="button"
              onClick={() => setOpenFaq(open ? null : index)}
              className="w-full border-b border-white/10 py-4 text-left"
              aria-expanded={open}
            >
              <span className="flex items-center justify-between gap-4">
                <span className="font-semibold text-white">{faq.q}</span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden />
              </span>
              {open && <p className="mt-2 text-sm leading-relaxed text-zinc-400">{faq.a}</p>}
            </button>
          );
        })}
        <div className="mt-10 rounded-3xl border border-white/10 bg-[#0c0c0e] px-6 py-8 text-center">
          <h2 className="font-display text-3xl font-black uppercase">{t('landing.ctaTitle')}</h2>
          <Link
            to="/register"
            className="mt-6 inline-block rounded-full px-7 py-3 text-sm font-extrabold text-black"
            style={{ background: LIME }}
          >
            {ru ? 'Загрузить демку' : 'Upload a demo'}
          </Link>
        </div>
      </section>
    </div>
  );
}

function MatchFrame({ ru }: { ru: boolean }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0b0d10] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">de_mirage · scrim</span>
        <span className="font-display text-sm font-black" style={{ color: LIME }}>
          13 — 8
        </span>
      </div>
      <div className="grid grid-cols-[92px_1fr] gap-2 p-3">
        <div className="space-y-1">
          {['16', '15', '14', '13', '12'].map((round, i) => (
            <div
              key={round}
              className={cn(
                'rounded-lg px-2 py-1.5 font-mono text-[11px]',
                i === 0 ? 'bg-[#d6ff3c] text-black' : 'bg-white/5 text-zinc-400',
              )}
            >
              R{round} {i === 0 ? 'CT' : i % 2 ? 'T' : 'CT'}
            </div>
          ))}
        </div>
        <Radar />
      </div>
      <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
        <span className="text-xs text-zinc-300">{ru ? 'Пик без инфы · тик 18420' : 'Dry peek · tick 18420'}</span>
        <span className="rounded-full px-2 py-1 text-[10px] font-bold uppercase text-black" style={{ background: LIME }}>
          {ru ? 'смотреть' : 'open'}
        </span>
      </div>
    </div>
  );
}

function Radar() {
  return (
    <svg viewBox="0 0 280 180" className="h-full w-full rounded-xl bg-[#12160c]">
      <rect x="18" y="18" width="150" height="70" rx="8" fill="#1c2414" stroke="#3c4a28" />
      <text x="28" y="40" fill="#d6ff3c" fontSize="11" fontFamily="Unbounded, sans-serif">A</text>
      <rect x="150" y="96" width="110" height="64" rx="8" fill="#1a2218" stroke="#3c4a28" />
      <text x="188" y="132" fill="#7dffb2" fontSize="11" fontFamily="Unbounded, sans-serif">B</text>
      <path d="M90 88 C 120 100, 150 70, 200 78" fill="none" stroke="#6b7a48" strokeWidth="10" strokeLinecap="round" />
      <circle cx="70" cy="48" r="5" fill="#5b8cff" />
      <circle cx="108" cy="58" r="5" fill="#5b8cff" />
      <circle cx="196" cy="124" r="5" fill="#ffb020" />
      <circle cx="228" cy="140" r="5" fill="#ffb020" />
      <circle cx="132" cy="70" r="6" fill="none" stroke="#ff5a5a" strokeWidth="2" />
      <circle cx="150" cy="96" r="16" fill="#c8c8c8" opacity="0.35" />
    </svg>
  );
}

function MapArt({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 160 100" className="absolute inset-0 h-full w-full opacity-80" aria-hidden>
      <path d="M10 70 C 40 40, 70 80, 110 36 S 150 20, 160 48" fill="none" stroke={accent} strokeWidth="3" />
      <path d="M0 78 H160" stroke="white" strokeOpacity="0.15" />
      <rect x="18" y="22" width="36" height="22" rx="4" fill={accent} opacity="0.35" />
      <rect x="96" y="48" width="40" height="18" rx="4" fill="white" opacity="0.12" />
    </svg>
  );
}
