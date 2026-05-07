import { useState, useMemo, useEffect } from "react";
import { Check, ArrowLeft, CreditCard, Building2, FileText, Lock, ChevronDown, AlertCircle, ArrowRight } from "lucide-react";

// ─── SHARED CONFIG (must match marketing-site.jsx) ─────────────────
const PRODUCT_NAME = "[ProductName]";
const MARKETING_URL = "/"; // Set to your marketing site URL when deployed
const PRICES = {
  solo:    { monthly: 109, label: "Solo",         seats: "1 user",          perUser: true, minSeats: 1, maxSeats: 1 },
  startup: { monthly: 79,  label: "Startup",      seats: "Up to 5 users",   perUser: true, minSeats: 2, maxSeats: 5 },
  pro:     { monthly: 219, label: "Professional",  seats: "Unlimited users", perUser: true, minSeats: 1, maxSeats: 999 },
};
const ANNUAL_DISCOUNT = 0.15;
const TRIAL_DAYS = 7;

const annual = (monthly) => Math.round(monthly * (1 - ANNUAL_DISCOUNT));

// ─── PAYMENT METHOD CONFIG ─────────────────────────────────────────
// Pro tier supports ACH/Invoice in addition to credit card.
// Solo & Startup: credit card only.
const PAYMENT_METHODS = {
  card:    { label: "Credit / Debit Card", icon: <CreditCard className="w-5 h-5" />, tiers: ["solo", "startup", "pro"] },
  ach:     { label: "ACH Bank Transfer",   icon: <Building2 className="w-5 h-5" />,  tiers: ["pro"] },
  invoice: { label: "Invoice (Net 30)",    icon: <FileText className="w-5 h-5" />,   tiers: ["pro"] },
};

// ─── TIER SUMMARIES ────────────────────────────────────────────────
const TIER_HIGHLIGHTS = {
  solo: [
    "Full ATS platform for 1 recruiter",
    "Pipeline, Search, Analytics, Email Sync",
    "Fee & Revenue Tracking",
  ],
  startup: [
    "Everything in Solo",
    "Team Collaboration (2–5 users)",
    "Shared Pipelines & Performance Analytics",
  ],
  pro: [
    "Everything in Startup",
    "Email Sequencing & Client Portal",
    "SSO, API, ACH/Invoice billing",
  ],
};

// ─── COMPONENTS ────────────────────────────────────────────────────

function StepIndicator({ step }) {
  const steps = ["Plan", "Account", "Payment"];
  return (
    <div className="flex items-center justify-center gap-2 mb-10">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold transition-all"
            style={{
              background: i <= step ? "#4f46e5" : "#e5e7eb",
              color: i <= step ? "#fff" : "#9ca3af",
            }}
          >
            {i < step ? <Check className="w-4 h-4" /> : i + 1}
          </div>
          <span
            className="text-sm font-medium hidden sm:inline"
            style={{ color: i <= step ? "#1a1a2e" : "#9ca3af" }}
          >
            {s}
          </span>
          {i < steps.length - 1 && (
            <div className="w-8 h-px mx-1" style={{ background: i < step ? "#4f46e5" : "#e5e7eb" }} />
          )}
        </div>
      ))}
    </div>
  );
}

function PlanSelector({ selected, onSelect, isAnnual, setIsAnnual }) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-1" style={{ color: "#1a1a2e" }}>Choose your plan</h2>
      <p className="text-sm mb-6" style={{ color: "#6b7280" }}>
        {TRIAL_DAYS}-day free trial on every plan. No credit card required to start.
      </p>

      {/* Billing toggle */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-sm font-medium" style={{ color: !isAnnual ? "#1a1a2e" : "#9ca3af" }}>Monthly</span>
        <button
          onClick={() => setIsAnnual(!isAnnual)}
          className="relative w-12 h-6 rounded-full transition-colors"
          style={{ background: isAnnual ? "#4f46e5" : "#d1d5db" }}
          aria-label="Toggle annual billing"
        >
          <div
            className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
            style={{ transform: isAnnual ? "translateX(26px)" : "translateX(2px)" }}
          />
        </button>
        <span className="text-sm font-medium" style={{ color: isAnnual ? "#1a1a2e" : "#9ca3af" }}>
          Annual
          <span className="ml-1 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#dcfce7", color: "#166534" }}>
            Save 15%
          </span>
        </span>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(PRICES).map(([key, plan]) => {
          const price = isAnnual ? annual(plan.monthly) : plan.monthly;
          const isSelected = selected === key;
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className="text-left rounded-xl p-5 transition-all"
              style={{
                border: `2px solid ${isSelected ? "#4f46e5" : "#e5e7eb"}`,
                background: isSelected ? "#eef2ff" : "#fff",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-base font-bold" style={{ color: "#1a1a2e" }}>{plan.label}</span>
                <div
                  className="w-5 h-5 rounded-full border-2 flex items-center justify-center"
                  style={{ borderColor: isSelected ? "#4f46e5" : "#d1d5db" }}
                >
                  {isSelected && <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#4f46e5" }} />}
                </div>
              </div>
              <div className="mb-3">
                <span className="text-2xl font-extrabold" style={{ color: "#1a1a2e" }}>${price}</span>
                <span className="text-sm" style={{ color: "#6b7280" }}>/user/mo</span>
              </div>
              <p className="text-xs mb-3" style={{ color: "#6b7280" }}>{plan.seats}</p>
              <ul className="space-y-1.5">
                {TIER_HIGHLIGHTS[key].map((h, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: "#4b5563" }}>
                    <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#22c55e" }} />
                    {h}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SeatSelector({ plan, seats, setSeats }) {
  const config = PRICES[plan];
  if (config.minSeats === config.maxSeats) return null; // Solo = 1 seat, no selector

  return (
    <div className="mt-6 p-4 rounded-xl" style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}>
      <label className="block text-sm font-semibold mb-2" style={{ color: "#1a1a2e" }}>
        Number of users
      </label>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSeats(Math.max(config.minSeats, seats - 1))}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold"
          style={{ background: "#e5e7eb", color: "#374151" }}
          disabled={seats <= config.minSeats}
        >
          −
        </button>
        <input
          type="number"
          value={seats}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) setSeats(Math.min(config.maxSeats, Math.max(config.minSeats, v)));
          }}
          className="w-16 text-center text-lg font-bold rounded-lg border py-1.5"
          style={{ borderColor: "#d1d5db", color: "#1a1a2e" }}
          min={config.minSeats}
          max={config.maxSeats}
        />
        <button
          onClick={() => setSeats(Math.min(config.maxSeats, seats + 1))}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold"
          style={{ background: "#e5e7eb", color: "#374151" }}
          disabled={seats >= config.maxSeats}
        >
          +
        </button>
        <span className="text-sm" style={{ color: "#6b7280" }}>
          {config.maxSeats === 999 ? `${config.minSeats}+ users` : `${config.minSeats}–${config.maxSeats} users`}
        </span>
      </div>
    </div>
  );
}

function AccountForm({ form, setForm }) {
  const field = (label, name, type = "text", placeholder = "") => (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>{label}</label>
      <input
        type={type}
        value={form[name] || ""}
        onChange={(e) => setForm({ ...form, [name]: e.target.value })}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-lg text-sm"
        style={{ border: "1px solid #d1d5db", color: "#1a1a2e" }}
      />
    </div>
  );

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1" style={{ color: "#1a1a2e" }}>Create your account</h2>
      <p className="text-sm mb-6" style={{ color: "#6b7280" }}>
        Your {TRIAL_DAYS}-day free trial starts immediately. No payment due today.
      </p>

      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field("First name", "firstName", "text", "Jane")}
          {field("Last name", "lastName", "text", "Smith")}
        </div>
        {field("Work email", "email", "email", "jane@agency.com")}
        {field("Company name", "company", "text", "Acme Recruiting")}
        {field("Password", "password", "password", "Min. 8 characters")}

        <div className="flex items-start gap-2 pt-2">
          <input type="checkbox" className="mt-1" id="terms" />
          <label htmlFor="terms" className="text-xs leading-relaxed" style={{ color: "#6b7280" }}>
            I agree to the <a href="#" style={{ color: "#4f46e5" }}>Terms of Service</a> and{" "}
            <a href="#" style={{ color: "#4f46e5" }}>Privacy Policy</a>. I understand my {TRIAL_DAYS}-day
            free trial will begin immediately.
          </label>
        </div>
      </div>
    </div>
  );
}

function PaymentForm({ plan, method, setMethod, isAnnual, seats }) {
  const availableMethods = Object.entries(PAYMENT_METHODS).filter(([_, m]) => m.tiers.includes(plan));
  const price = PRICES[plan];
  const unitPrice = isAnnual ? annual(price.monthly) : price.monthly;
  const total = unitPrice * seats;
  const annualTotal = isAnnual ? total * 12 : null;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1" style={{ color: "#1a1a2e" }}>Payment method</h2>
      <p className="text-sm mb-6" style={{ color: "#6b7280" }}>
        No charge today — payment begins after your {TRIAL_DAYS}-day trial ends.
      </p>

      {/* Payment method selector */}
      <div className="space-y-3 mb-8">
        {availableMethods.map(([key, m]) => (
          <button
            key={key}
            onClick={() => setMethod(key)}
            className="w-full flex items-center gap-3 p-4 rounded-xl text-left transition-all"
            style={{
              border: `2px solid ${method === key ? "#4f46e5" : "#e5e7eb"}`,
              background: method === key ? "#eef2ff" : "#fff",
            }}
          >
            <div
              className="p-2 rounded-lg"
              style={{ background: method === key ? "#c7d2fe" : "#f3f4f6", color: method === key ? "#4f46e5" : "#6b7280" }}
            >
              {m.icon}
            </div>
            <div className="flex-1">
              <span className="text-sm font-semibold" style={{ color: "#1a1a2e" }}>{m.label}</span>
              {key === "ach" && (
                <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>Lower processing fees — savings passed to you</p>
              )}
              {key === "invoice" && (
                <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>We'll send a monthly invoice. Net 30 terms.</p>
              )}
            </div>
            <div
              className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
              style={{ borderColor: method === key ? "#4f46e5" : "#d1d5db" }}
            >
              {method === key && <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#4f46e5" }} />}
            </div>
          </button>
        ))}
      </div>

      {/* ── CARD FORM (shell) ── */}
      {method === "card" && (
        <div className="space-y-4 p-5 rounded-xl" style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}>
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4" style={{ color: "#22c55e" }} />
            <span className="text-xs font-medium" style={{ color: "#22c55e" }}>Encrypted & secure</span>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Card number</label>
            <div className="relative">
              <input
                type="text"
                placeholder="4242 4242 4242 4242"
                className="w-full px-4 py-2.5 rounded-lg text-sm"
                style={{ border: "1px solid #d1d5db", color: "#1a1a2e" }}
                disabled
              />
              <CreditCard className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: "#9ca3af" }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Expiry</label>
              <input
                type="text"
                placeholder="MM / YY"
                className="w-full px-4 py-2.5 rounded-lg text-sm"
                style={{ border: "1px solid #d1d5db", color: "#1a1a2e" }}
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>CVC</label>
              <input
                type="text"
                placeholder="123"
                className="w-full px-4 py-2.5 rounded-lg text-sm"
                style={{ border: "1px solid #d1d5db", color: "#1a1a2e" }}
                disabled
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Billing address (ZIP)</label>
            <input
              type="text"
              placeholder="10001"
              className="w-full px-4 py-2.5 rounded-lg text-sm"
              style={{ border: "1px solid #d1d5db", color: "#1a1a2e" }}
              disabled
            />
          </div>

          {/* Shell notice */}
          <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: "#fef3c7", border: "1px solid #fde68a" }}>
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#d97706" }} />
            <p className="text-xs" style={{ color: "#92400e" }}>
              Payment processing is not yet connected. Card fields will be powered by Stripe (or your chosen processor) once bank details and API keys are configured.
            </p>
          </div>
        </div>
      )}

      {/* ── ACH FORM (shell) ── */}
      {method === "ach" && (
        <div className="space-y-4 p-5 rounded-xl" style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}>
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4" style={{ color: "#22c55e" }} />
            <span className="text-xs font-medium" style={{ color: "#22c55e" }}>Bank-level encryption</span>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Account holder name</label>
            <input
              type="text"
              placeholder="Acme Recruiting LLC"
              className="w-full px-4 py-2.5 rounded-lg text-sm"
              style={{ border: "1px solid #d1d5db", color: "#1a1a2e" }}
              disabled
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Routing number</label>
              <input
                type="text"
                placeholder="110000000"
                className="w-full px-4 py-2.5 rounded-lg text-sm"
                style={{ border: "1px solid #d1d5db", color: "#1a1a2e" }}
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Account number</label>
              <input
                type="text"
                placeholder="000123456789"
                className="w-full px-4 py-2.5 rounded-lg text-sm"
                style={{ border: "1px solid #d1d5db", color: "#1a1a2e" }}
                disabled
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Account type</label>
            <select
              className="w-full px-4 py-2.5 rounded-lg text-sm"
              style={{ border: "1px solid #d1d5db", color: "#1a1a2e" }}
              disabled
            >
              <option>Checking</option>
              <option>Savings</option>
            </select>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: "#fef3c7", border: "1px solid #fde68a" }}>
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#d97706" }} />
            <p className="text-xs" style={{ color: "#92400e" }}>
              ACH processing is not yet connected. This will use Stripe ACH or Plaid for bank verification once configured.
            </p>
          </div>
        </div>
      )}

      {/* ── INVOICE REQUEST (shell) ── */}
      {method === "invoice" && (
        <div className="space-y-4 p-5 rounded-xl" style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}>
          <p className="text-sm" style={{ color: "#4b5563" }}>
            We'll generate a monthly invoice and send it to your billing contact. Payment is due within 30 days of issue.
          </p>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Billing email</label>
            <input
              type="email"
              placeholder="billing@agency.com"
              className="w-full px-4 py-2.5 rounded-lg text-sm"
              style={{ border: "1px solid #d1d5db", color: "#1a1a2e" }}
              disabled
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Billing address</label>
            <textarea
              placeholder="123 Agency St&#10;Suite 400&#10;New York, NY 10001"
              rows={3}
              className="w-full px-4 py-2.5 rounded-lg text-sm resize-none"
              style={{ border: "1px solid #d1d5db", color: "#1a1a2e" }}
              disabled
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>PO number (optional)</label>
            <input
              type="text"
              placeholder="PO-2026-001"
              className="w-full px-4 py-2.5 rounded-lg text-sm"
              style={{ border: "1px solid #d1d5db", color: "#1a1a2e" }}
              disabled
            />
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
            <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#2563eb" }} />
            <p className="text-xs" style={{ color: "#1e40af" }}>
              Invoice payment is available for Professional plans. Invoices will be generated and sent once billing backend is configured.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderSummary({ plan, isAnnual, seats, method }) {
  const price = PRICES[plan];
  const unitPrice = isAnnual ? annual(price.monthly) : price.monthly;
  const subtotal = unitPrice * seats;

  return (
    <div className="rounded-xl p-6" style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}>
      <h3 className="text-base font-bold mb-4" style={{ color: "#1a1a2e" }}>Order summary</h3>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span style={{ color: "#6b7280" }}>Plan</span>
          <span className="font-semibold" style={{ color: "#1a1a2e" }}>{price.label}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "#6b7280" }}>Billing</span>
          <span className="font-semibold" style={{ color: "#1a1a2e" }}>{isAnnual ? "Annual" : "Monthly"}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "#6b7280" }}>Users</span>
          <span className="font-semibold" style={{ color: "#1a1a2e" }}>{seats}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "#6b7280" }}>Price per user</span>
          <span className="font-semibold" style={{ color: "#1a1a2e" }}>${unitPrice}/mo</span>
        </div>
        {isAnnual && (
          <div className="flex justify-between">
            <span style={{ color: "#6b7280" }}>Annual discount</span>
            <span className="font-semibold" style={{ color: "#16a34a" }}>−15%</span>
          </div>
        )}
        <div className="flex justify-between">
          <span style={{ color: "#6b7280" }}>Payment method</span>
          <span className="font-semibold" style={{ color: "#1a1a2e" }}>
            {PAYMENT_METHODS[method]?.label || "—"}
          </span>
        </div>

        <div className="pt-3 mt-3" style={{ borderTop: "1px solid #e5e7eb" }}>
          <div className="flex justify-between">
            <span className="font-bold" style={{ color: "#1a1a2e" }}>
              {isAnnual ? "Monthly equivalent" : "Monthly total"}
            </span>
            <span className="font-bold text-lg" style={{ color: "#1a1a2e" }}>${subtotal}/mo</span>
          </div>
          {isAnnual && (
            <div className="flex justify-between mt-1">
              <span className="text-xs" style={{ color: "#6b7280" }}>Billed annually</span>
              <span className="text-sm font-semibold" style={{ color: "#4f46e5" }}>${subtotal * 12}/yr</span>
            </div>
          )}
        </div>

        <div className="pt-3 mt-1 text-center">
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: "#dcfce7", color: "#166534" }}
          >
            <Check className="w-3.5 h-3.5" />
            {TRIAL_DAYS}-day free trial — no charge today
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN CHECKOUT PAGE ────────────────────────────────────────────
export default function CheckoutPage() {
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState("startup");
  const [isAnnual, setIsAnnual] = useState(false);
  const [seats, setSeats] = useState(2);
  const [method, setMethod] = useState("card");
  const [form, setForm] = useState({});

  // Read ?plan= param from URL on mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlPlan = params.get("plan");
      if (urlPlan && PRICES[urlPlan]) {
        setPlan(urlPlan);
        setSeats(PRICES[urlPlan].minSeats);
      }
    } catch (_) { /* SSR or no window */ }
  }, []);

  // Reset seats when plan changes
  const handlePlanChange = (p) => {
    setPlan(p);
    const config = PRICES[p];
    setSeats(config.minSeats);
    // Reset payment method if current isn't available on new plan
    if (!PAYMENT_METHODS[method]?.tiers.includes(p)) setMethod("card");
  };

  const canProceed = useMemo(() => {
    if (step === 0) return !!plan;
    if (step === 1) return form.firstName && form.lastName && form.email && form.company && form.password;
    return true;
  }, [step, plan, form]);

  const handleSubmit = () => {
    // ── SHELL: Replace with actual signup + payment API call ──
    alert(
      `🚧 Shell mode — no payment processed.\n\n` +
      `Plan: ${PRICES[plan].label}\n` +
      `Billing: ${isAnnual ? "Annual" : "Monthly"}\n` +
      `Users: ${seats}\n` +
      `Method: ${PAYMENT_METHODS[method].label}\n` +
      `Email: ${form.email}\n\n` +
      `Connect Stripe (or your processor) + configure bank details to go live.`
    );
  };

  return (
    <div
      className="min-h-screen py-10 px-4"
      style={{
        background: "linear-gradient(135deg, #f8f7ff 0%, #eef2ff 40%, #e0e7ff 100%)",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Header */}
      <div className="max-w-3xl mx-auto mb-6">
        <a href={MARKETING_URL} className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: "#6b7280" }}>
          <ArrowLeft className="w-4 h-4" /> Back to {PRODUCT_NAME}
        </a>
      </div>

      <div className="max-w-3xl mx-auto">
        <StepIndicator step={step} />

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Main form area */}
          <div className="lg:col-span-3 bg-white rounded-2xl p-6 sm:p-8 shadow-sm" style={{ border: "1px solid #e5e7eb" }}>
            {step === 0 && (
              <>
                <PlanSelector selected={plan} onSelect={handlePlanChange} isAnnual={isAnnual} setIsAnnual={setIsAnnual} />
                <SeatSelector plan={plan} seats={seats} setSeats={setSeats} />
              </>
            )}
            {step === 1 && <AccountForm form={form} setForm={setForm} />}
            {step === 2 && <PaymentForm plan={plan} method={method} setMethod={setMethod} isAnnual={isAnnual} seats={seats} />}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-6" style={{ borderTop: "1px solid #e5e7eb" }}>
              {step > 0 ? (
                <button
                  onClick={() => setStep(step - 1)}
                  className="text-sm font-medium flex items-center gap-1"
                  style={{ color: "#6b7280" }}
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
              ) : (
                <div />
              )}

              {step < 2 ? (
                <button
                  onClick={() => canProceed && setStep(step + 1)}
                  className="px-6 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-all"
                  style={{
                    background: canProceed ? "linear-gradient(135deg, #6366f1, #4f46e5)" : "#d1d5db",
                    color: "#fff",
                    cursor: canProceed ? "pointer" : "not-allowed",
                  }}
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  className="px-6 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-all hover:scale-105"
                  style={{
                    background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                    color: "#fff",
                  }}
                >
                  Start {TRIAL_DAYS}-Day Free Trial <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Sidebar: Order summary */}
          <div className="lg:col-span-2">
            <OrderSummary plan={plan} isAnnual={isAnnual} seats={seats} method={method} />

            <div className="mt-4 text-center">
              <div className="flex items-center justify-center gap-1.5 text-xs" style={{ color: "#9ca3af" }}>
                <Lock className="w-3.5 h-3.5" />
                256-bit SSL encryption
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
