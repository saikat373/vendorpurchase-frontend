"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  VENDOR_DEFAULT_INVENTORY_PERMISSIONS,
  VENDOR_DEFAULT_MENU_KEYS,
  VENDOR_DEFAULT_MODULE_KEYS,
  VENDOR_DEFAULT_USER_PERMISSIONS,
  ensureSeededCredentialUsers,
  hashPassword,
  readUsers,
  saveSession,
  saveUsers,
  type AdminUser,
  type UserAccountType,
} from "@/lib/auth-storage";
import { apiFetch, setAuthToken } from "@/lib/api-client";
import { APP_ROUTES, MENU_KEY_TO_PATH } from "@/lib/routes";

type AuthPageProps = {
  mode: "login" | "signup";
};

const DEMO_EMAIL = "demo@vendor.test";
const DEMO_PASSWORD = "VendorDemo26!";

const ROLE_OPTIONS = [
  "Procurement Lead",
  "Finance Reviewer",
  "Vendor Manager",
  "Operations Admin",
  "Compliance Officer",
] as const;

type Captcha = {
  prompt: string;
  answer: number;
};

type SubmittedRequest = {
  name: string;
  email: string;
  company: string;
  role: string;
  approved: boolean;
};

function makeCaptcha(): Captcha {
  const left = Math.floor(Math.random() * 8) + 2;
  const right = Math.floor(Math.random() * 8) + 2;
  return { prompt: `${left} + ${right}`, answer: left + right };
}

function Brand() {
  return (
    <Link to={APP_ROUTES.LOGIN} className="brand-lockup" aria-label="Vendor Purchase home">
      <span className="brand-mark" aria-hidden="true">V</span>
      <span>Vendor<span className="brand-accent">Purchase</span></span>
    </Link>
  );
}

function SecurityArtwork() {
  return (
    <div className="security-art" aria-hidden="true">
      <div className="security-orbit security-orbit-outer" />
      <div className="security-orbit security-orbit-inner" />
      <div className="security-tile">
        <svg viewBox="0 0 48 48" fill="none">
          <path d="M24 5 38 10v11c0 9-5.8 16.4-14 21-8.2-4.6-14-12-14-21V10L24 5Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="m18.5 23 4 4 7.5-8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <span className="security-spark security-spark-one" />
      <span className="security-spark security-spark-two" />
      <span className="security-spark security-spark-three" />
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M2.2 10S5 4.5 10 4.5 17.8 10 17.8 10 15 15.5 10 15.5 2.2 10 2.2 10Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M3 3 17 17M8.2 8.3a2.5 2.5 0 0 0 3.5 3.5M5.4 5.6C3.5 6.9 2.2 10 2.2 10a15.3 15.3 0 0 0 4.6 4.7c1 .5 2.1.8 3.2.8 1.8 0 3.4-.6 4.7-1.5M9.2 4.6c.3-.1.5-.1.8-.1 5 0 7.8 5.5 7.8 5.5a14.4 14.4 0 0 1-2.5 3.3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AuthPage({ mode }: AuthPageProps) {
  const navigate = useNavigate();
  const isSignup = mode === "signup";
  const [accountType, setAccountType] = useState<UserAccountType>("Admin");
  const [values, setValues] = useState({
    name: "",
    email: "",
    company: "",
    role: ROLE_OPTIONS[0] as string,
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [captcha, setCaptcha] = useState<Captcha>({ prompt: "4 + 5", answer: 9 });
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState<SubmittedRequest | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setCaptcha(makeCaptcha());
    });
  }, []);

  function update(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (isError) {
      setIsError(false);
      setStatus("");
    }
  }

  const passwordChecks = useMemo(() => {
    const pwd = values.password;
    const minLength = pwd.length >= 8;
    const hasMixedCase = /[a-z]/.test(pwd) && /[A-Z]/.test(pwd);
    const hasNumber = /\d/.test(pwd);
    const hasSymbol = /[^A-Za-z0-9]/.test(pwd);
    const score = [minLength, hasMixedCase, hasNumber, hasSymbol].filter(Boolean).length;
    const label =
      pwd.length === 0
        ? "Enter a password"
        : score <= 1
          ? "Weak"
          : score === 2
            ? "Fair"
            : score === 3
              ? "Good"
              : "Strong";
    return { minLength, hasMixedCase, hasNumber, hasSymbol, score, label };
  }, [values.password]);

  const passwordsMatch =
    values.confirmPassword.length > 0 && values.password === values.confirmPassword;
  const passwordsMismatch =
    values.confirmPassword.length > 0 && values.password !== values.confirmPassword;

  function refreshRequestStatus() {
    if (!submittedRequest) return;
    try {
      const users = readUsers();
      const matched = users.find(
        (item) => item.email.toLowerCase() === submittedRequest.email.toLowerCase(),
      );
      if (matched) {
        setSubmittedRequest((prev) =>
          prev ? { ...prev, approved: matched.approved } : null,
        );
        setIsError(false);
        setStatus(
          matched.approved
            ? "Your account has been approved! You can now log in."
            : "Still awaiting administrator approval in the workspace queue.",
        );
      }
    } catch {
      setIsError(true);
      setStatus("Could not check request status right now.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setIsError(false);

    if (isSignup) {
      if (!values.name.trim() || !values.company.trim()) {
        setIsError(true);
        setStatus("Please provide your full name and company.");
        return;
      }
      if (values.password.length < 8) {
        setIsError(true);
        setStatus("Use at least 8 characters for your password.");
        return;
      }
      if (values.password !== values.confirmPassword) {
        setIsError(true);
        setStatus("Your passwords do not match.");
        return;
      }
    } else if (Number(captchaAnswer) !== captcha.answer) {
      setIsError(true);
      setStatus("That verification answer is incorrect. Please try again.");
      setCaptcha(makeCaptcha());
      setCaptchaAnswer("");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSignup) {
        const users = await ensureSeededCredentialUsers();
        const existing = users.find(
          (user) => user.email.toLowerCase() === values.email.trim().toLowerCase(),
        );
        if (existing) {
          setIsError(true);
          setStatus(
            existing.approved
              ? "An approved account with this email already exists. Please log in."
              : "An access request for this email is already pending administrator approval.",
          );
          return;
        }

        const isNewVendor = accountType === "Vendor";
        const newUser: AdminUser = {
          id: crypto.randomUUID(),
          accountType,
          name: values.name.trim(),
          email: values.email.trim(),
          company: values.company.trim(),
          role: isNewVendor ? `Vendor (${values.role})` : values.role,
          passwordHash: await hashPassword(values.password),
          approved: false,
          createdAt: new Date().toISOString(),
          ...(isNewVendor
            ? {
                allowedVerticals: ["Grocery"],
                allowedLocations: ["Main Store — Ground Floor"],
                userPermissions: { ...VENDOR_DEFAULT_USER_PERMISSIONS },
                inventoryPermissions: { ...VENDOR_DEFAULT_INVENTORY_PERMISSIONS },
                menuPermissions: [...VENDOR_DEFAULT_MENU_KEYS],
                modulePermissions: [...VENDOR_DEFAULT_MODULE_KEYS],
              }
            : {}),
        };
        saveUsers([...users, newUser]);
        setSubmittedRequest({
          name: newUser.name,
          email: newUser.email,
          company: newUser.company,
          role: newUser.role || ROLE_OPTIONS[0],
          approved: false,
        });
        setStatus(
          isNewVendor
            ? "Vendor request received. An Admin must approve your account and assign permissions before you can sign in."
            : "Request received. An administrator must approve your account before you can sign in.",
        );
        setValues({
          name: "",
          email: "",
          company: "",
          role: ROLE_OPTIONS[0],
          password: "",
          confirmPassword: "",
        });
        return;
      }

      const loginRes = await apiFetch("/api/auth/login", {
        method: "POST",
        skipAuthRedirect: true,
        body: JSON.stringify({
          email: values.email.trim(),
          password: values.password,
          accountType,
        }),
      });
      const loginData = (await loginRes.json()) as {
        token?: string;
        user?: AdminUser;
        error?: string;
      };

      if (!loginRes.ok || !loginData.token || !loginData.user) {
        setIsError(true);
        setStatus(loginData.error || "The email or password you entered is incorrect.");
        setCaptcha(makeCaptcha());
        setCaptchaAnswer("");
        return;
      }

      setAuthToken(loginData.token);
      const loggedInUser: AdminUser = {
        ...loginData.user,
        passwordHash: "",
      };
      saveSession(loggedInUser);
      setValues({
        name: "",
        email: "",
        company: "",
        role: ROLE_OPTIONS[0],
        password: "",
        confirmPassword: "",
      });
      setCaptchaAnswer("");
      setCaptcha(makeCaptcha());

      const permittedMenus = Array.isArray(loggedInUser.menuPermissions)
        ? loggedInUser.menuPermissions
        : [];
      const firstValidMenu = permittedMenus.find((key) => key in MENU_KEY_TO_PATH);
      if (permittedMenus.includes("inventory")) {
        navigate(APP_ROUTES.INVENTORY_DASHBOARD);
      } else if (firstValidMenu) {
        navigate(MENU_KEY_TO_PATH[firstValidMenu]);
      } else {
        navigate(APP_ROUTES.OVERVIEW);
      }
    } catch (err) {
      console.error("Auth error:", err);
      setIsError(true);
      setStatus(
        err instanceof Error && err.message
          ? `Request failed: ${err.message}`
          : "We couldn’t complete that request. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={isSignup ? "auth-page signup-page" : "auth-page login-page"}>
      <div className={isSignup ? "auth-frame signup-frame" : "auth-frame login-frame"}>
        <section className="auth-panel" aria-labelledby="auth-title">
          <Brand />
          <div className="auth-content">
            <p className="auth-eyebrow">
              {isSignup
                ? `GET STARTED · ${accountType.toUpperCase()} ACCOUNT`
                : `${accountType.toUpperCase()} LOGIN PORTAL`}
            </p>
            <h1 id="auth-title">
              {isSignup
                ? submittedRequest
                  ? "Access request submitted"
                  : `Create ${accountType} account`
                : `${accountType} Login`}
            </h1>
            <p className="auth-subtitle">
              {isSignup
                ? submittedRequest
                  ? "Your credentials are encrypted and queued for administrator review."
                  : accountType === "Vendor"
                    ? "Register as a Vendor. Admin will approve & assign your permissions."
                    : "Request Administrator access to manage vendors & permissions."
                : accountType === "Admin"
                  ? "Admins have full permissions and manage Vendor access."
                  : "Vendors access only modules & verticals granted by Admin."}
            </p>

            <div className="auth-user-type-switch" role="group" aria-label="Select user type">
              <button
                type="button"
                className={accountType === "Admin" ? "active" : ""}
                onClick={() => {
                  setAccountType("Admin");
                  setIsError(false);
                  setStatus("");
                }}
              >
                🛡 Admin Login
              </button>
              <button
                type="button"
                className={accountType === "Vendor" ? "active" : ""}
                onClick={() => {
                  setAccountType("Vendor");
                  setIsError(false);
                  setStatus("");
                }}
              >
                🏪 Vendor Login
              </button>
            </div>

            {isSignup && submittedRequest ? (
              <div className="signup-confirmation" role="region" aria-label="Approval status">
                <div className="confirmation-header">
                  <span className={`confirmation-badge${submittedRequest.approved ? " approved" : ""}`}>
                    <span className="confirmation-dot" />
                    {submittedRequest.approved ? "Approved & Ready" : "Pending Admin Approval"}
                  </span>
                  <span className="confirmation-role">{submittedRequest.role}</span>
                </div>

                <div className="confirmation-summary">
                  <strong>{submittedRequest.name}</strong>
                  <span>{submittedRequest.company} · {submittedRequest.email}</span>
                </div>

                <ol className="approval-steps" aria-label="Onboarding progress">
                  <li className="done">
                    <span className="step-marker" aria-hidden="true">✓</span>
                    <div>
                      <strong>Credentials encrypted</strong>
                      <small>Hashed locally with SHA-256 protection</small>
                    </div>
                  </li>
                  <li className={submittedRequest.approved ? "done" : "current"}>
                    <span className="step-marker" aria-hidden="true">
                      {submittedRequest.approved ? "✓" : "2"}
                    </span>
                    <div>
                      <strong>Administrator review</strong>
                      <small>
                        {submittedRequest.approved
                          ? "Approved by workspace administrator"
                          : "Queued in the admin dashboard approval panel"}
                      </small>
                    </div>
                  </li>
                  <li className={submittedRequest.approved ? "done" : ""}>
                    <span className="step-marker" aria-hidden="true">
                      {submittedRequest.approved ? "✓" : "3"}
                    </span>
                    <div>
                      <strong>Workspace sign-in enabled</strong>
                      <small>Sign in once your request is approved</small>
                    </div>
                  </li>
                </ol>

                <div className="confirmation-actions">
                  <Link to={APP_ROUTES.LOGIN} className="primary-button confirmation-primary-link">
                    Proceed to login
                  </Link>
                  <div className="confirmation-secondary-row">
                    <button
                      type="button"
                      className="subtle-action-button"
                      onClick={refreshRequestStatus}
                    >
                      Check status
                    </button>
                    <button
                      type="button"
                      className="subtle-action-button"
                      onClick={() => {
                        setSubmittedRequest(null);
                        setStatus("");
                        setIsError(false);
                      }}
                    >
                      Submit another request
                    </button>
                  </div>
                </div>

                <p className={`auth-status${isError ? " error" : ""}`} role="status" aria-live="polite">
                  {status}
                </p>

                <p className="auth-privacy">
                  Demo tip: Sign in as <strong>{DEMO_EMAIL}</strong> / <strong>{DEMO_PASSWORD}</strong> to approve this request in the dashboard.
                </p>
              </div>
            ) : (
              <>
                <form className="auth-form" onSubmit={submit}>
                  {isSignup && (
                    <>
                      <label className="field">
                        <span>Full name</span>
                        <input
                          autoComplete="name"
                          required
                          value={values.name}
                          onChange={(event) => update("name", event.target.value)}
                          placeholder="Alex Morgan"
                        />
                      </label>
                      <div className="field-row">
                        <label className="field">
                          <span>Company</span>
                          <input
                            autoComplete="organization"
                            required
                            value={values.company}
                            onChange={(event) => update("company", event.target.value)}
                            placeholder="Acme Industries"
                          />
                        </label>
                        <label className="field">
                          <span>Role</span>
                          <select
                            value={values.role}
                            onChange={(event) => update("role", event.target.value)}
                            aria-label="Workspace role"
                          >
                            {ROLE_OPTIONS.map((roleOption) => (
                              <option key={roleOption} value={roleOption}>
                                {roleOption}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </>
                  )}
                  <label className="field">
                    <span>{isSignup ? "Work email" : "Email address"}</span>
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      value={values.email}
                      onChange={(event) => update("email", event.target.value)}
                      placeholder="you@company.com"
                    />
                  </label>
                  <div className="field">
                    <div className="field-label-row">
                      <label htmlFor="auth-password">Password</label>
                      {isSignup && values.password.length > 0 && (
                        <span className={`strength-badge strength-${passwordChecks.score}`}>
                          {passwordChecks.label}
                        </span>
                      )}
                    </div>
                    <div className="password-input-wrap">
                      <input
                        id="auth-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={isSignup ? "new-password" : "current-password"}
                        minLength={isSignup ? 8 : undefined}
                        required
                        value={values.password}
                        onChange={(event) => update("password", event.target.value)}
                        placeholder={isSignup ? "At least 8 characters" : "Enter your password"}
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        <EyeIcon open={showPassword} />
                      </button>
                    </div>
                    {isSignup && (
                      <div className="password-meter" aria-live="polite">
                        <div className="strength-bars" aria-hidden="true">
                          {[1, 2, 3, 4].map((segment) => (
                            <span
                              key={segment}
                              className={
                                passwordChecks.score >= segment
                                  ? `bar active score-${passwordChecks.score}`
                                  : "bar"
                              }
                            />
                          ))}
                        </div>
                        <div className="password-Criteria">
                          <span className={passwordChecks.minLength ? "met" : ""}>8+ chars</span>
                          <span className={passwordChecks.hasMixedCase ? "met" : ""}>Upper & lower</span>
                          <span className={passwordChecks.hasNumber ? "met" : ""}>Number</span>
                          <span className={passwordChecks.hasSymbol ? "met" : ""}>Symbol</span>
                        </div>
                      </div>
                    )}
                  </div>
                  {isSignup ? (
                    <div className="field">
                      <div className="field-label-row">
                        <label htmlFor="auth-confirm-password">Confirm password</label>
                        {passwordsMatch && (
                          <span className="match-indicator matched">Matches</span>
                        )}
                        {passwordsMismatch && (
                          <span className="match-indicator mismatch">Does not match</span>
                        )}
                      </div>
                      <div className="password-input-wrap">
                        <input
                          id="auth-confirm-password"
                          type={showConfirmPassword ? "text" : "password"}
                          autoComplete="new-password"
                          minLength={8}
                          required
                          value={values.confirmPassword}
                          onChange={(event) => update("confirmPassword", event.target.value)}
                          placeholder="Re-enter your password"
                        />
                        <button
                          type="button"
                          className="password-toggle"
                          onClick={() => setShowConfirmPassword((prev) => !prev)}
                          aria-label={
                            showConfirmPassword
                              ? "Hide confirm password"
                              : "Show confirm password"
                          }
                        >
                          <EyeIcon open={showConfirmPassword} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="captcha-box">
                      <div className="captcha-heading">
                        <span>Quick verification</span>
                        <button type="button" onClick={() => { setCaptcha(makeCaptcha()); setCaptchaAnswer(""); }}>New question</button>
                      </div>
                      <label className="captcha-question">
                        <span className="captcha-prompt">What is {captcha.prompt}?</span>
                        <input
                          inputMode="numeric"
                          pattern="[0-9]*"
                          aria-label="Verification answer"
                          required
                          value={captchaAnswer}
                          onChange={(event) => setCaptchaAnswer(event.target.value.replace(/\D/g, ""))}
                          placeholder="Answer"
                        />
                      </label>
                    </div>
                  )}

                  <button className="primary-button" type="submit" disabled={isSubmitting}>
                    {isSubmitting
                      ? (isSignup ? "Sending request…" : "Signing in…")
                      : (isSignup ? "Request admin approval" : "Sign in to dashboard")}
                  </button>
                </form>

                <p className={`auth-status${isError ? " error" : ""}`} role="status" aria-live="polite">
                  {status}
                </p>
                <p className="auth-privacy">
                  {accountType === "Vendor"
                    ? "Vendor accounts are created & activated by an Administrator."
                    : "Sign in with your administrator credentials."}
                </p>
              </>
            )}
          </div>
        </section>

        <aside className="auth-promo">
          <div className="promo-glow" />
          <div className="promo-content">
            <SecurityArtwork />
            <p className="promo-kicker">
              {isSignup ? "VERIFIED ADMIN ONBOARDING" : "VENDOR OPERATIONS, IN CONTROL"}
            </p>
            <h2>
              {isSignup ? (
                <>Controlled access.<br />Trusted teams.</>
              ) : (
                <>Every approval.<br />One clear view.</>
              )}
            </h2>
            <p className="promo-description">
              {isSignup
                ? "New workspace accounts are verified by an administrator before activation to keep vendor purchasing secure."
                : "Bring purchasing, vendor onboarding, and approvals together in one workspace built for your team."}
            </p>
            <div className="promo-points">
              {isSignup ? (
                <>
                  <span><i /> Admin-gated account activation</span>
                  <span><i /> Role-scoped procurement access</span>
                  <span><i /> Encrypted password credentials</span>
                </>
              ) : (
                <>
                  <span><i /> Clear approval workflows</span>
                  <span><i /> Vendor activity at a glance</span>
                  <span><i /> Built for confident decisions</span>
                </>
              )}
            </div>
          </div>
          <span className="promo-caption">VENDOR PURCHASE ADMIN</span>
        </aside>
      </div>
    </main>
  );
}
