"use client";

import Link from "next/link";
import { useState } from "react";
import { BadgeCheck, GitBranch, KeyRound, LogIn } from "lucide-react";
import { signIn } from "next-auth/react";
import { signIn as signInWithPasskey } from "next-auth/webauthn";

type AuthPageMode = "landing" | "login" | "signup";

const COPY: Record<
  AuthPageMode,
  {
    kicker: string;
    title: string;
    subtitle: string;
    primaryLabel: string;
  }
> = {
  landing: {
    kicker: "Private finance workspace",
    title: "finhance",
    subtitle:
      "Track money, budgets, imports, and brokerage activity in one hosted workspace.",
    primaryLabel: "Create account",
  },
  login: {
    kicker: "Welcome back",
    title: "Log in",
    subtitle: "Continue to your hosted workspace.",
    primaryLabel: "Log in with Google",
  },
  signup: {
    kicker: "Get started",
    title: "Create account",
    subtitle: "Start a private workspace with a verified provider account.",
    primaryLabel: "Create with Google",
  },
};

export default function AuthPageClient({
  mode,
  callbackUrl,
}: {
  mode: AuthPageMode;
  callbackUrl: string;
}) {
  const copy = COPY[mode];
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleOAuth(provider: "google" | "github") {
    setError(null);
    setBusyProvider(provider);

    try {
      await signIn(provider, { redirectTo: callbackUrl });
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : "Unable to start sign in.",
      );
      setBusyProvider(null);
    }
  }

  async function handlePasskey() {
    setError(null);
    setBusyProvider("passkey");

    try {
      await signInWithPasskey("passkey", { redirectTo: callbackUrl });
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : "Unable to start passkey sign in.",
      );
      setBusyProvider(null);
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-hero">
        <p className="page-kicker">{copy.kicker}</p>
        <h1 className="page-title">{copy.title}</h1>
        <p className="page-subtitle">{copy.subtitle}</p>
      </div>

      <div className="auth-panel glass-card">
        <div className="auth-actions">
          <button
            type="button"
            className="btn-primary auth-provider-button"
            disabled={busyProvider !== null}
            onClick={() => handleOAuth("google")}
          >
            <BadgeCheck size={18} aria-hidden="true" />
            <span>
              {busyProvider === "google"
                ? "Opening Google..."
                : copy.primaryLabel}
            </span>
          </button>
          <button
            type="button"
            className="btn-secondary auth-provider-button"
            disabled={busyProvider !== null}
            onClick={() => handleOAuth("github")}
          >
            <GitBranch size={18} aria-hidden="true" />
            <span>
              {busyProvider === "github"
                ? "Opening GitHub..."
                : mode === "signup"
                  ? "Create with GitHub"
                  : "Log in with GitHub"}
            </span>
          </button>
          <button
            type="button"
            className="btn-secondary auth-provider-button"
            disabled={busyProvider !== null}
            onClick={handlePasskey}
          >
            <KeyRound size={18} aria-hidden="true" />
            <span>
              {busyProvider === "passkey"
                ? "Checking passkey..."
                : "Log in with passkey"}
            </span>
          </button>
        </div>

        {error ? (
          <p role="alert" className="app-form-error">
            {error}
          </p>
        ) : null}

        <div className="auth-panel-footer">
          {mode === "login" ? (
            <Link href="/signup" className="auth-inline-link">
              <LogIn size={16} aria-hidden="true" />
              <span>Create account</span>
            </Link>
          ) : (
            <Link href="/login" className="auth-inline-link">
              <LogIn size={16} aria-hidden="true" />
              <span>Log in</span>
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
