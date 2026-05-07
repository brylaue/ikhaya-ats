import { useState, useEffect } from "react";
import { Check, ArrowRight, Menu, X, ChevronDown, Zap, Users, Building2, BarChart3, Mail, Shield, Search, Kanban, Globe, Clock, FileText, Target, Layers, BellRing, Star } from "lucide-react";

// ─── ROUTING ───────────────────────────────────────────────────────
// Set this to your checkout page URL when deployed (e.g., "/checkout", "https://app.yourproduct.com/signup")
const CHECKOUT_URL = "/checkout";

// ─── CONFIG ────────────────────────────────────────────────────────
const PRODUCT_NAME = "[ProductName]";
const TAGLINE = "The modern ATS built for staffing & executive search agencies";
const SUBTITLE = "Stop duct-taping spreadsheets and legacy software. Get a purpose-built platform that manages your candidates, clients, pipelines, and revenue — all in one place.";

const PRICES = {
  solo:    { monthly: 109, label: "Solo",      seats: "1 user",          perUser: true },
  startup: { monthly: 79,  label: "Startup",   seats: "Up to 5 users",   perUser: true },
  pro:     { monthly: 219, label: "Professional", seats: "Unlimited users", perUser: true },
};
const ANNUAL_DISCOUNT = 0.15;
const TRIAL_DAYS = 7;

// ─── FEATURE DATA ──────────────────────────────────────────────────
const FEATURES = [
  {
    icon: <Kanban className="w-6 h-6" />,
    title: "Pipeline Kanban Board",
    desc: "Drag-and-drop candidates across customizable pipeline stages. See every search at a glance with color-coded health indicators.",
    tiers: ["solo", "startup", "pro"],
  },
  {
    icon: <Search className="w-6 h-6" />,
    title: "Smart Candidate Search",
    desc: "Full-text search with saved filters, boolean queries, and tag-based filtering. Find the right candidate in seconds, not minutes.",
    tiers: ["solo", "startup", "pro"],
  },
  {
    icon: <Building2 className="w-6 h-6" />,
    title: "Client & Contact Management",
    desc: "Track client relationships, health scores, pending feedback, and every touchpoint. Know where each engagement stands.",
    tiers: ["solo", "startup", "pro"],
  },
  {
    icon: <BarChart3 className="w-6 h-6" />,
    title: "Analytics & Reporting",
    desc: "Revenue forecasting, recruiter performance, client metrics, and pipeline conversion — all in real-time dashboards.",
    tiers: ["solo", "startup", "pro"],
  },
  {
    icon: <FileText className="w-6 h-6" />,
    title: "Candidate Submissions",
    desc: "Formal submission workflow with cover notes, highlight templates, and tracked client feedback (advance / hold / pass).",
    tiers: ["solo", "startup", "pro"],
  },
  {
    icon: <Mail className="w-6 h-6" />,
    title: "Email Integration",
    desc: "Gmail and Outlook sync with automatic candidate matching. Every email appears in the right activity timeline.",
    tiers: ["solo", "startup", "pro"],
  },
  {
    icon: <Target className="w-6 h-6" />,
    title: "Fee & Revenue Tracking",
    desc: "Per-search fee structures, probability-weighted forecasting, placement closure tracking, and commission calculations.",
    tiers: ["solo", "startup", "pro"],
  },
  {
    icon: <Users className="w-6 h-6" />,
    title: "Team Collaboration",
    desc: "Shared pipelines, task assignments, @mentions, and recruiter workload views. Everyone stays aligned.",
    tiers: ["startup", "pro"],
  },
  {
    icon: <Zap className="w-6 h-6" />,
    title: "Email Sequencing",
    desc: "Multi-step outreach campaigns with personalization tokens, scheduling, and automatic follow-ups. Nurture candidates and clients at scale.",
    tiers: ["pro"],
  },
  {
    icon: <Globe className="w-6 h-6" />,
    title: "Client Portal",
    desc: "Branded portal where clients review submitted candidates, leave feedback, and track interview progress — no login to your ATS required.",
    tiers: ["pro"],
  },
  {
    icon: <Shield className="w-6 h-6" />,
    title: "Advanced Permissions & SSO",
    desc: "Role-based access controls, client-scoped visibility, SAML/SSO, and audit logging for enterprise-grade security.",
    tiers: ["pro"],
  },
  {
    icon: <Layers className="w-6 h-6" />,
    title: "API & Integrations",
    desc: "REST API, webhooks, and pre-built integrations with job boards, LinkedIn, and HRIS systems. Build the stack you need.",
    tiers: ["pro"],
  },
];

const TIER_FEATURES = {
  solo: [
    "Pipeline Kanban Board",
    "Smart Candidate Search",
    "Client & Contact Management",
    "Analytics & Reporting",
    "Candidate Submissions",
    "Email Integration (Gmail + Outlook)",
    "Fee & Revenue Tracking",
    "CSV Import / Export",
    "Keyboard Shortcuts & Global Search",
    "Help Center & Priority Support",
  ],
  startup: [
    "Everything in Solo, plus:",
    "Up to 5 team members",
    "Team Collaboration & Task Assignment",
    "Shared Pipelines & Workload Views",
    "Recruiter Performance Analytics",
    "Custom Pipeline Stages",
    "Onboarding & Training Sessions",
  ],
  pro: [
    "Everything in Startup, plus:",
    "Unlimited team members",
    "Email Sequencing & Campaigns",
    "Client Portal (branded)",
    "Advanced Permissions & SSO",
    "API Access & Webhooks",
    "Custom Integrations",
    "Invoicing / ACH Payment Options",
    "Dedicated Account Manager",
    "SLA & Uptime Guarantee",
  ],
};

// ─── HELPERS ───────────────────────────────────────────────────────
const annual = (monthly) => Math.round(monthly * (1 - ANNUAL_DISCOUNT));
const fmt = (n) => `$${n}`;

// ─── COMPONENTS ────────────────────────────────────────────────────

function Nav({ scrolled }) {
  const [open, setOpen] = useState(false);
  const links = [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "FAQ", href: "#faq" },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-white/95 backdrop-blur-md shadow-sm" : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="#" className="text-xl font-bold" style={{ color: "#1a1a2e" }}>
          {PRODUCT_NAME}
        </a>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium transition-colors"
              style={{ color: scrolled ? "#374151" : "#4b5563" }}
            >
              {l.label}
            </a>
          ))}
          <a
            href={CHECKOUT_URL}
            className="text-sm font-semibold px-5 py-2 rounded-lg transition-all"
            style={{
              background: "linear-gradient(135deg, #6366f1, #4f46e5)",
              color: "#fff",
            }}
          >
            Start Free Trial
          </a>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-white shadow-lg border-t px-6 py-4 space-y-3">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="block text-sm font-medium text-gray-700"
              onClick={() => setOpen(false)}
            >
              {l.label}
            </a>
          ))}
          <a
            href={CHECKOUT_URL}
            className="block text-center text-sm font-semibold px-5 py-2 rounded-lg text-white"
            style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}
            onClick={() => setOpen(false)}
          >
            Start Free Trial
          </a>
        </div>
      )}
    </nav>
  );
}

function Hero() {
  return (
    <section
      className="relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-28"
      style={{
        background: "linear-gradient(135deg, #f8f7ff 0%, #eef2ff 40%, #e0e7ff 100%)",
      }}
    >
      {/* Decorative blobs */}
      <div
        className="absolute top-10 right-10 w-72 h-72 rounded-full opacity-20 blur-3xl"
        style={{ background: "#6366f1" }}
      />
      <div
        className="absolute bottom-10 left-10 w-96 h-96 rounded-full opacity-10 blur-3xl"
        style={{ background: "#a78bfa" }}
      />

      <div className="relative max-w-4xl mx-auto px-6 text-center">
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-6"
          style={{ background: "#ede9fe", color: "#5b21b6" }}
        >
          <Zap className="w-4 h-4" />
          {TRIAL_DAYS}-day free trial — no credit card required
        </div>

        <h1
          className="text-4xl md:text-6xl font-extrabold leading-tight mb-6"
          style={{ color: "#1a1a2e" }}
        >
          {TAGLINE}
        </h1>

        <p className="text-lg md:text-xl max-w-2xl mx-auto mb-10" style={{ color: "#4b5563" }}>
          {SUBTITLE}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href={CHECKOUT_URL}
            className="px-8 py-3.5 rounded-lg text-base font-semibold shadow-lg transition-transform hover:scale-105"
            style={{
              background: "linear-gradient(135deg, #6366f1, #4f46e5)",
              color: "#fff",
            }}
          >
            Start Your Free Trial <ArrowRight className="inline w-4 h-4 ml-1" />
          </a>
          <a
            href="#features"
            className="px-8 py-3.5 rounded-lg text-base font-semibold border transition-colors"
            style={{ borderColor: "#d1d5db", color: "#374151" }}
          >
            See All Features
          </a>
        </div>

        {/* Social proof strip */}
        <div className="mt-14 flex flex-wrap items-center justify-center gap-6 text-sm" style={{ color: "#6b7280" }}>
          <span className="flex items-center gap-1">
            <Shield className="w-4 h-4" /> SOC 2 Compliant
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" /> 99.9% Uptime
          </span>
          <span className="flex items-center gap-1">
            <Star className="w-4 h-4" /> Built for Agencies
          </span>
          <span className="flex items-center gap-1">
            <BellRing className="w-4 h-4" /> Priority Support
          </span>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature }) {
  const tierColors = {
    solo: { bg: "#f0fdf4", text: "#166534", label: "Solo+" },
    startup: { bg: "#eff6ff", text: "#1e40af", label: "Startup+" },
    pro: { bg: "#faf5ff", text: "#6b21a8", label: "Pro" },
  };
  const lowestTier = feature.tiers[0];
  const badge = tierColors[lowestTier];

  return (
    <div
      className="rounded-xl p-6 transition-all hover:shadow-md"
      style={{ background: "#fff", border: "1px solid #e5e7eb" }}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className="p-2.5 rounded-lg"
          style={{ background: "#eef2ff", color: "#4f46e5" }}
        >
          {feature.icon}
        </div>
        <span
          className="text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{ background: badge.bg, color: badge.text }}
        >
          {badge.label}
        </span>
      </div>
      <h3 className="text-lg font-semibold mb-2" style={{ color: "#1a1a2e" }}>
        {feature.title}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: "#6b7280" }}>
        {feature.desc}
      </p>
    </div>
  );
}

function Features() {
  return (
    <section id="features" className="py-20 md:py-28" style={{ background: "#fafafa" }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: "#1a1a2e" }}>
            Everything your agency needs. Nothing it doesn't.
          </h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: "#6b7280" }}>
            From sourcing to placement, {PRODUCT_NAME} covers the entire recruiting lifecycle with tools designed specifically for staffing and search firms.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} feature={f} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingCard({ tier, price, isAnnual, popular }) {
  const monthlyPrice = isAnnual ? annual(price.monthly) : price.monthly;

  return (
    <div
      className="relative rounded-2xl p-8 flex flex-col transition-all"
      style={{
        background: popular ? "linear-gradient(135deg, #4f46e5, #6366f1)" : "#fff",
        border: popular ? "none" : "1px solid #e5e7eb",
        color: popular ? "#fff" : "#1a1a2e",
        boxShadow: popular ? "0 20px 60px rgba(79, 70, 229, 0.3)" : "none",
        transform: popular ? "scale(1.05)" : "scale(1)",
      }}
    >
      {popular && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-4 py-1 rounded-full"
          style={{ background: "#fbbf24", color: "#78350f" }}
        >
          MOST POPULAR
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-xl font-bold mb-1">{price.label}</h3>
        <p className="text-sm opacity-80">{price.seats}</p>
      </div>

      <div className="mb-6">
        <span className="text-4xl font-extrabold">{fmt(monthlyPrice)}</span>
        <span className="text-sm opacity-70">
          /{price.perUser ? "user/" : ""}mo
        </span>
        {isAnnual && (
          <div className="text-xs mt-1 opacity-70">
            Billed annually ({fmt(monthlyPrice * 12)}{price.perUser ? "/user" : ""}/yr)
          </div>
        )}
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {TIER_FEATURES[tier].map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            {i === 0 && f.startsWith("Everything") ? (
              <ArrowRight className="w-4 h-4 mt-0.5 flex-shrink-0 opacity-70" />
            ) : (
              <Check
                className="w-4 h-4 mt-0.5 flex-shrink-0"
                style={{ color: popular ? "#a5f3fc" : "#22c55e" }}
              />
            )}
            <span className={i === 0 && f.startsWith("Everything") ? "font-semibold" : ""}>
              {f}
            </span>
          </li>
        ))}
      </ul>

      <a
        href={`${CHECKOUT_URL}?plan=${tier}`}
        className="block text-center py-3 rounded-lg font-semibold text-sm transition-all hover:opacity-90"
        style={{
          background: popular ? "#fff" : "linear-gradient(135deg, #6366f1, #4f46e5)",
          color: popular ? "#4f46e5" : "#fff",
        }}
      >
        Start {TRIAL_DAYS}-Day Free Trial
      </a>
    </div>
  );
}

function Pricing() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <section id="pricing" className="py-20 md:py-28" style={{ background: "#fff" }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: "#1a1a2e" }}>
            Simple, transparent pricing
          </h2>
          <p className="text-lg mb-8" style={{ color: "#6b7280" }}>
            {TRIAL_DAYS}-day free trial on every plan. No credit card required.
          </p>

          {/* Toggle */}
          <div className="inline-flex items-center gap-3 p-1 rounded-full" style={{ background: "#f3f4f6" }}>
            <button
              className="px-5 py-2 rounded-full text-sm font-medium transition-all"
              style={{
                background: !isAnnual ? "#fff" : "transparent",
                color: !isAnnual ? "#1a1a2e" : "#6b7280",
                boxShadow: !isAnnual ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}
              onClick={() => setIsAnnual(false)}
            >
              Monthly
            </button>
            <button
              className="px-5 py-2 rounded-full text-sm font-medium transition-all"
              style={{
                background: isAnnual ? "#fff" : "transparent",
                color: isAnnual ? "#1a1a2e" : "#6b7280",
                boxShadow: isAnnual ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}
              onClick={() => setIsAnnual(true)}
            >
              Annual
              <span
                className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: "#dcfce7", color: "#166534" }}
              >
                Save 15%
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          <PricingCard tier="solo" price={PRICES.solo} isAnnual={isAnnual} popular={false} />
          <PricingCard tier="startup" price={PRICES.startup} isAnnual={isAnnual} popular={true} />
          <PricingCard tier="pro" price={PRICES.pro} isAnnual={isAnnual} popular={false} />
        </div>

        {/* Comparison note */}
        <p className="text-center text-sm mt-10" style={{ color: "#9ca3af" }}>
          All plans include SSL encryption, daily backups, and 99.9% uptime SLA.
          Need a custom plan for 50+ users? <a href="#" style={{ color: "#4f46e5" }}>Contact us</a>.
        </p>
      </div>
    </section>
  );
}

function FAQ() {
  const faqs = [
    {
      q: "How does the free trial work?",
      a: `You get full access to your chosen plan for ${TRIAL_DAYS} days — no credit card required. At the end of the trial, you can subscribe or your account pauses (your data is kept for 30 days).`,
    },
    {
      q: "Can I switch plans later?",
      a: "Absolutely. Upgrade or downgrade at any time. When upgrading, the price difference is prorated. When downgrading, the credit applies to your next billing cycle.",
    },
    {
      q: "What counts as a 'user' on the Startup plan?",
      a: "Any team member who logs in to the platform counts as a user. Client portal viewers are never counted — they're free and unlimited on the Pro plan.",
    },
    {
      q: "Is my data secure?",
      a: "Yes. All data is encrypted at rest and in transit. We use SOC 2 compliant infrastructure, and your data is backed up daily with point-in-time recovery.",
    },
    {
      q: "Can I import data from my current ATS?",
      a: "Yes. We support CSV imports for candidates, clients, and contacts. For migrations from Bullhorn, PCRecruiter, Loxo, or Crelate, our team can assist with a guided import.",
    },
    {
      q: "What payment methods do you accept?",
      a: "Solo and Startup plans accept all major credit and debit cards. Professional plans also support ACH bank transfers and Net 30 invoicing — great for agencies that need to run payments through procurement.",
    },
    {
      q: "Do you offer a discount for annual billing?",
      a: "Yes — annual plans are 15% less than monthly. The discount is applied automatically when you toggle to annual billing.",
    },
  ];

  const [openIdx, setOpenIdx] = useState(null);

  return (
    <section id="faq" className="py-20 md:py-28" style={{ background: "#fafafa" }}>
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12" style={{ color: "#1a1a2e" }}>
          Frequently asked questions
        </h2>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="rounded-xl overflow-hidden transition-all"
              style={{ background: "#fff", border: "1px solid #e5e7eb" }}
            >
              <button
                className="w-full flex items-center justify-between px-6 py-4 text-left"
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
              >
                <span className="text-sm font-semibold" style={{ color: "#1a1a2e" }}>
                  {faq.q}
                </span>
                <ChevronDown
                  className="w-4 h-4 flex-shrink-0 transition-transform"
                  style={{
                    color: "#9ca3af",
                    transform: openIdx === i ? "rotate(180deg)" : "rotate(0)",
                  }}
                />
              </button>
              {openIdx === i && (
                <div className="px-6 pb-4 text-sm leading-relaxed" style={{ color: "#6b7280" }}>
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="py-20 md:py-28" style={{ background: "linear-gradient(135deg, #4f46e5, #6366f1)" }}>
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">
          Ready to modernize your agency?
        </h2>
        <p className="text-lg mb-8" style={{ color: "#c7d2fe" }}>
          Join agencies that have replaced spreadsheets and legacy tools with {PRODUCT_NAME}. Start your {TRIAL_DAYS}-day free trial today.
        </p>
        <a
          href={CHECKOUT_URL}
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg text-base font-semibold transition-transform hover:scale-105"
          style={{ background: "#fff", color: "#4f46e5" }}
        >
          Get Started Free <ArrowRight className="w-4 h-4" />
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="py-12" style={{ background: "#1a1a2e" }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div>
            <h4 className="text-sm font-bold mb-4 text-white">{PRODUCT_NAME}</h4>
            <p className="text-sm leading-relaxed" style={{ color: "#9ca3af" }}>
              The modern ATS built for staffing & executive search agencies.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-bold mb-4 text-white">Product</h4>
            <div className="space-y-2">
              {["Features", "Pricing", "Security", "Integrations", "Changelog"].map((l) => (
                <a key={l} href="#" className="block text-sm" style={{ color: "#9ca3af" }}>
                  {l}
                </a>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-bold mb-4 text-white">Company</h4>
            <div className="space-y-2">
              {["About", "Blog", "Careers", "Contact"].map((l) => (
                <a key={l} href="#" className="block text-sm" style={{ color: "#9ca3af" }}>
                  {l}
                </a>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-bold mb-4 text-white">Legal</h4>
            <div className="space-y-2">
              {["Privacy Policy", "Terms of Service", "DPA", "GDPR"].map((l) => (
                <a key={l} href="#" className="block text-sm" style={{ color: "#9ca3af" }}>
                  {l}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div
          className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm"
          style={{ borderTop: "1px solid #374151", color: "#6b7280" }}
        >
          <span>&copy; {new Date().getFullYear()} {PRODUCT_NAME}. All rights reserved.</span>
          <span>Built by <a href="https://ikhaya.io" style={{ color: "#818cf8" }}>Ikhaya</a></span>
        </div>
      </div>
    </footer>
  );
}

// ─── MAIN APP ──────────────────────────────────────────────────────
export default function MarketingSite() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <Nav scrolled={scrolled} />
      <Hero />
      <Features />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}
