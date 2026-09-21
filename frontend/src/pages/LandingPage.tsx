import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  BarChart3,
  Bomb,
  Brain,
  Check,
  ChevronDown,
  Crosshair,
  Loader2,
  Map as MapIcon,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getPlans, type Plan } from '../api/billing';
import { BrandMark } from '../components/BrandLogo';
import { useT } from '../i18n/LocaleContext';
import { cn } from '../lib/cn';

const TESTIMONIALS = [
  {
    quote:
      'We stopped guessing where they play defaults. Roundcraft shows the smoke timings our opponents repeat every match.',
    name: 'Viktor "vekt0r" M.',
    role: 'IGL · semi-pro',
  },
  {
    quote:
      'Anti-strat alone is worth it. I prep a lobby in 15 minutes instead of scrubbing demos for three hours.',
    name: 'Daria "dxsha" K.',
    role: 'Team analyst',
  },
  {
    quote:
      'Turns out I peek the same pistol angle every time. Fixed it. Ranked up.',
    name: 'Tomasz "flickzy" W.',
    role: 'FACEIT 10',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="group w-full border-b border-white/[0.08] px-1 py-5 text-left transition-colors"
    >
      <span className="flex items-center justify-between gap-4">
        <span className="font-display text-lg tracking-tight text-[var(--color-bone)] md:text-xl">
          {q}
        </span>
        <ChevronDown
          className={cn(
            'h-5 w-5 shrink-0 text-[var(--color-signal)] transition-transform duration-300',
            open && 'rotate-180',
          )}
        />
      </span>
      <div
        className={cn(
          'grid transition-all duration-300',
          open ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <p className="overflow-hidden text-sm leading-relaxed text-[var(--color-steel)]">{a}</p>
      </div>
    </button>
  );
}

function HeroRadar() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_40%,rgba(255,90,31,0.08),transparent_50%)]" />
      <div className="absolute -right-[12%] top-[8%] h-[min(90vw,720px)] w-[min(90vw,720px)] opacity-40">
        <div className="absolute inset-0 rounded-full border border-[var(--color-bone)]/10" />
        <div className="absolute inset-[12%] rounded-full border border-[var(--color-bone)]/10" />
        <div className="absolute inset-[28%] rounded-full border border-[var(--color-signal)]/25" />
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[var(--color-bone)]/10" />
        <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-[var(--color-bone)]/10" />
        <div className="absolute inset-[28%] overflow-hidden rounded-full">
          <div className="animate-scan absolute left-0 right-0 h-24 bg-gradient-to-b from-transparent via-[var(--color-signal)]/20 to-transparent" />
        </div>
        {[
          ['32%', '38%', 'bg-[var(--color-t)]'],
          ['48%', '52%', 'bg-[var(--color-ct)]'],
          ['62%', '34%', 'bg-[var(--color-bone)]'],
          ['55%', '68%', 'bg-[var(--color-signal)]'],
        ].map(([l, t, c]) => (
          <span
            key={`${l}-${t}`}
            className={cn('absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full', c)}
            style={{ left: l, top: t }}
          />
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#070708] to-transparent" />
    </div>
  );
}

export function LandingPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [yearly, setYearly] = useState(false);

  const features = useMemo(
    () => [
      { icon: MapIcon, title: t('landing.featureReplay'), description: t('landing.featureReplayDesc'), span: 'md:col-span-2' },
      { icon: Crosshair, title: t('landing.featureHeatmap'), description: t('landing.featureHeatmapDesc'), span: '' },
      { icon: Bomb, title: t('landing.featureGrenades'), description: t('landing.featureGrenadesDesc'), span: '' },
      { icon: Brain, title: t('landing.featureHabits'), description: t('landing.featureHabitsDesc'), span: 'md:col-span-2' },
      { icon: BarChart3, title: t('landing.featureAnalytics'), description: t('landing.featureAnalyticsDesc'), span: '' },
      { icon: Users, title: t('landing.featureCompare'), description: t('landing.featureCompareDesc'), span: '' },
    ],
    [t],
  );

  const steps = useMemo(
    () => [
      { num: '01', title: t('landing.step1Title'), description: t('landing.step1Desc') },
      { num: '02', title: t('landing.step2Title'), description: t('landing.step2Desc') },
      { num: '03', title: t('landing.step3Title'), description: t('landing.step3Desc') },
    ],
    [t],
  );

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
    <div className="premium-page">
      {/* HERO — one composition */}
      <section className="relative min-h-[92vh] overflow-hidden border-b border-white/[0.06]">
        <HeroRadar />
        <div className="relative z-10 mx-auto flex min-h-[92vh] max-w-6xl flex-col justify-end px-4 pb-16 pt-28 md:px-8 md:pb-24 md:pt-32">
          <p className="eyebrow animate-fade-up mb-6">{t('landing.badge')}</p>
          <h1 className="animate-fade-up-delay max-w-4xl font-display text-[clamp(2.6rem,7vw,5.5rem)] font-extrabold uppercase leading-[0.92] tracking-[-0.05em] text-[var(--color-bone)]">
            {t('landing.heroLine1')}{' '}
            <span className="text-[var(--color-signal)]">{t('landing.heroHighlight')}</span>
            {t('landing.heroLine2') ? <> {t('landing.heroLine2')}</> : null}
          </h1>
          <p className="animate-fade-up-delay-2 mt-6 max-w-xl text-base leading-relaxed text-[var(--color-steel)] md:text-lg">
            {t('landing.heroSubtitle')}
          </p>
          <div className="animate-fade-up-delay-2 mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link to="/register" className="btn-primary">
              {t('landing.startTrial')}
            </Link>
            <a href="#protocol" className="btn-secondary">
              {t('landing.seeHow')}
            </a>
          </div>
          <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-steel)]">
            {t('landing.trialNote')}
          </p>
        </div>
      </section>

      {/* STAT STRIP — after fold */}
      <section className="border-b border-white/[0.06]">
        <div className="mx-auto grid max-w-6xl grid-cols-2 md:grid-cols-4">
          {[
            { v: '~1 min', k: 'landing.statParse' },
            { v: '8 maps', k: 'landing.statMaps' },
            { v: '100%', k: 'landing.statAuto' },
            { v: 'PRO', k: 'landing.statPriority' },
          ].map(({ v, k }, i) => (
            <div
              key={k}
              className={cn(
                'px-6 py-10 md:px-8',
                i < 3 && 'border-r border-white/[0.06]',
                i < 2 && 'border-b border-white/[0.06] md:border-b-0',
              )}
            >
              <p className="font-display text-3xl font-bold uppercase tracking-tight text-[var(--color-bone)] md:text-4xl">
                {v}
              </p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--color-steel)]">
                {t(k)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* PROBLEM — brutalist */}
      <section className="border-b border-white/[0.06] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <p className="eyebrow mb-4">{t('landing.problemEyebrow')}</p>
          <h2 className="max-w-3xl font-display text-3xl font-extrabold uppercase leading-[1.05] tracking-tight text-[var(--color-bone)] md:text-5xl">
            {t('landing.problemTitle')}
          </h2>
          <p className="mt-5 max-w-2xl text-[var(--color-steel)]">{t('landing.problemSubtitle')}</p>
          <div className="mt-14 grid gap-px bg-white/[0.08] md:grid-cols-3">
            {[
              { title: t('landing.problem1Title'), desc: t('landing.problem1Desc') },
              { title: t('landing.problem2Title'), desc: t('landing.problem2Desc') },
              { title: t('landing.problem3Title'), desc: t('landing.problem3Desc') },
            ].map((item, i) => (
              <div key={item.title} className="bg-[#070708] p-7 transition-colors hover:bg-[#0c0c0e]">
                <span className="font-mono text-xs text-[var(--color-signal)]">0{i + 1}</span>
                <h3 className="mt-4 font-display text-xl uppercase tracking-tight text-[var(--color-bone)]">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--color-steel)]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SHIFT */}
      <section className="border-b border-white/[0.06] py-20 md:py-28">
        <div className="mx-auto max-w-3xl px-4 text-center md:px-8">
          <p className="eyebrow mb-4">{t('landing.shiftEyebrow')}</p>
          <h2 className="font-display text-3xl font-extrabold uppercase tracking-tight text-[var(--color-bone)] md:text-5xl">
            {t('landing.shiftTitle')}{' '}
            <span className="text-[var(--color-signal)]">{t('landing.shiftHighlight')}</span>
          </h2>
          <p className="mt-6 text-base leading-relaxed text-[var(--color-steel)] md:text-lg">
            {t('landing.shiftDesc')}
          </p>
        </div>
      </section>

      {/* PROTOCOL */}
      <section id="protocol" className="border-b border-white/[0.06] bg-[#0a0a0c] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="mb-14 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="eyebrow mb-3">{t('landing.stepsEyebrow')}</p>
              <h2 className="font-display text-3xl font-extrabold uppercase tracking-tight md:text-4xl">
                {t('landing.stepsTitle')}
              </h2>
            </div>
            <p className="max-w-sm text-sm text-[var(--color-steel)]">{t('landing.stepsSubtitle')}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {steps.map(({ num, title, description }) => (
              <div key={num} className="bento-cell group">
                <span className="font-display text-5xl font-extrabold text-white/[0.06] transition-colors group-hover:text-[var(--color-signal)]/25">
                  {num}
                </span>
                <h3 className="mt-4 font-display text-xl uppercase tracking-tight">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--color-steel)]">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BENTO FEATURES */}
      <section className="border-b border-white/[0.06] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <p className="eyebrow mb-3">{t('landing.featuresEyebrow')}</p>
          <h2 className="mb-12 max-w-2xl font-display text-3xl font-extrabold uppercase tracking-tight md:text-4xl">
            {t('landing.featuresTitle')}
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {features.map(({ icon: Icon, title, description, span }, i) => (
              <div
                key={title}
                className={cn('bento-cell', span, i === 0 && 'bento-cell-signal min-h-[220px]')}
              >
                <div className="mb-5 flex h-10 w-10 items-center justify-center border border-white/10 bg-black/30">
                  <Icon className="h-5 w-5 text-[var(--color-signal)]" />
                </div>
                <h3 className="font-display text-xl uppercase tracking-tight">{title}</h3>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--color-steel)]">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BEFORE / AFTER */}
      <section className="border-b border-white/[0.06] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <h2 className="mb-12 text-center font-display text-3xl font-extrabold uppercase tracking-tight md:text-4xl">
            {t('landing.beforeAfterTitle')}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="card-brutal">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-red-400">
                {t('landing.beforeLabel')}
              </p>
              <ul className="mt-6 space-y-4">
                {(['before1', 'before2', 'before3', 'before4'] as const).map((k) => (
                  <li key={k} className="flex gap-3 text-sm text-[var(--color-steel)]">
                    <span className="text-red-400">—</span>
                    {t(`landing.${k}`)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="border border-[var(--color-signal)]/40 bg-[var(--color-signal)]/[0.06] p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--color-signal)]">
                {t('landing.afterLabel')}
              </p>
              <ul className="mt-6 space-y-4">
                {(['after1', 'after2', 'after3', 'after4'] as const).map((k) => (
                  <li key={k} className="flex gap-3 text-sm text-[var(--color-bone)]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-signal)]" />
                    {t(`landing.${k}`)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="border-b border-white/[0.06] bg-[#0a0a0c] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="mb-10 text-center">
            <h2 className="font-display text-3xl font-extrabold uppercase tracking-tight md:text-4xl">
              {t('landing.pricingTitle')}
            </h2>
            <p className="mt-3 text-sm text-[var(--color-steel)]">{t('landing.pricingSubtitle')}</p>
          </div>

          <div className="mb-10 flex items-center justify-center gap-4 font-mono text-xs uppercase tracking-[0.2em]">
            <span className={cn(!yearly ? 'text-[var(--color-bone)]' : 'text-[var(--color-steel)]')}>
              {t('landing.monthly')}
            </span>
            <button
              type="button"
              onClick={() => setYearly((v) => !v)}
              className="relative h-7 w-14 border border-white/15 bg-black/40"
              aria-label="Toggle yearly pricing"
            >
              <span
                className={cn(
                  'absolute top-0.5 h-6 w-6 bg-[var(--color-signal)] transition-all',
                  yearly ? 'left-7' : 'left-0.5',
                )}
              />
            </button>
            <span className={cn(yearly ? 'text-[var(--color-bone)]' : 'text-[var(--color-steel)]')}>
              {t('landing.yearly')}{' '}
              <span className="text-[var(--color-signal)]">{t('landing.yearlySave')}</span>
            </span>
          </div>

          {plansLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--color-signal)]" />
            </div>
          ) : paidPlans.length === 0 ? (
            <p className="text-center text-sm text-[var(--color-steel)]">{t('landing.plansUnavailable')}</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {paidPlans.map((plan) => {
                const highlight = plan.id === 'PRO';
                const price = yearly ? plan.yearly_price / 12 : plan.monthly_price;
                return (
                  <div
                    key={plan.id}
                    className={cn(
                      'relative flex flex-col p-6',
                      highlight
                        ? 'border border-[var(--color-signal)] bg-[var(--color-signal)]/[0.07]'
                        : 'bento-cell',
                    )}
                  >
                    {highlight && (
                      <span className="absolute -top-3 left-6 bg-[var(--color-signal)] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-black">
                        {t('landing.mostPopular')}
                      </span>
                    )}
                    <h3 className="font-display text-2xl uppercase tracking-tight">{plan.name}</h3>
                    <p className="mt-4">
                      <span className="font-display text-4xl font-bold tracking-tight">
                        ${price.toFixed(2)}
                      </span>
                      <span className="text-sm text-[var(--color-steel)]"> {t('landing.perMonth')}</span>
                    </p>
                    <ul className="mt-6 flex-1 space-y-2.5">
                      {plan.features.slice(0, 6).map((feature) => (
                        <li key={feature} className="flex gap-2 text-sm text-[var(--color-steel)]">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-signal)]" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <Link
                      to="/register"
                      className={cn(
                        'mt-8 block text-center',
                        highlight ? 'btn-primary w-full' : 'btn-secondary w-full',
                      )}
                    >
                      {highlight ? t('landing.startTrial') : t('landing.choosePlan')}
                    </Link>
                    {highlight && (
                      <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-steel)]">
                        {t('landing.trialNote')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="border-b border-white/[0.06] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <h2 className="mb-3 font-display text-3xl font-extrabold uppercase tracking-tight md:text-4xl">
            {t('landing.testimonialsTitle')}
          </h2>
          <p className="mb-12 text-sm text-[var(--color-steel)]">{t('landing.testimonialsSubtitle')}</p>
          <div className="grid gap-4 md:grid-cols-3">
            {TESTIMONIALS.map(({ quote, name, role }) => (
              <figure key={name} className="bento-cell flex flex-col">
                <blockquote className="flex-1 text-sm leading-relaxed text-[var(--color-bone)]/90">
                  “{quote}”
                </blockquote>
                <figcaption className="mt-8 border-t border-white/[0.08] pt-4">
                  <p className="font-display text-sm uppercase tracking-tight">{name}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-steel)]">
                    {role}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-white/[0.06] py-20 md:py-28">
        <div className="mx-auto max-w-3xl px-4 md:px-8">
          <h2 className="mb-10 font-display text-3xl font-extrabold uppercase tracking-tight md:text-4xl">
            {t('landing.faqTitle')}
          </h2>
          <div>
            {faqs.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden py-24 md:py-32">
        <div className="premium-orb left-1/2 top-0 h-72 w-72 -translate-x-1/2 bg-[var(--color-signal)]/15" />
        <div className="relative z-10 mx-auto max-w-3xl px-4 text-center md:px-8">
          <BrandMark className="mx-auto mb-8 h-16 w-16" />
          <h2 className="font-display text-3xl font-extrabold uppercase tracking-tight md:text-5xl">
            {t('landing.ctaTitle')}
          </h2>
          <p className="mx-auto mt-5 max-w-md text-[var(--color-steel)]">{t('landing.ctaSubtitle')}</p>
          <Link to="/register" className="btn-primary mt-10 inline-flex gap-2">
            {t('landing.startTrial')}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-steel)]">
            {t('landing.trialNote')}
          </p>
        </div>
      </section>
    </div>
  );
}
