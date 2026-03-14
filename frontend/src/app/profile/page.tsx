"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import type { SectionData, InterestSectionId } from "@/types/database";
import { SearchSection } from "@/components/profile/SearchSection";
import type { InterestSection } from "@/components/profile/SearchSection";

const INTEREST_SECTIONS: InterestSection[] = [
  { id: "music", label: "Music", placeholder: "search artists, albums, genres…" },
  { id: "tv", label: "TV & Film", placeholder: "search shows, movies, directors…" },
  { id: "games", label: "Video Games", placeholder: "search games, studios, genres…" },
  { id: "interests", label: "Interests", placeholder: "search hobbies, topics, anything…" },
];

function createDefaultSectionData(): SectionData {
  return {
    music: [],
    tv: [],
    games: [],
    interests: [],
  };
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#fdf8f6",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    padding: "2rem",
  },
  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "2rem",
    flexWrap: "wrap" as const,
    gap: "1rem",
  },
  title: {
    fontFamily: "'Playfair Display', serif",
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "#3a1a1a",
  },
  card: {
    maxWidth: 560,
    background: "white",
    borderRadius: 16,
    boxShadow: "0 4px 24px rgba(224, 96, 96, 0.08)",
    padding: "2rem",
    border: "1px solid #f0e0dc",
  },
  subtitle: {
    fontSize: "0.875rem",
    color: "#b08080",
    marginTop: "0.5rem",
  },
  link: {
    color: "#e06060",
    textDecoration: "none",
    fontSize: "0.875rem",
    fontWeight: 500,
  },
  signOut: {
    padding: "0.5rem 1rem",
    borderRadius: 8,
    border: "1px solid #f0e0dc",
    background: "white",
    color: "#b08080",
    fontSize: "0.875rem",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1.25rem",
    marginTop: "1.5rem",
  },
  label: {
    display: "block",
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "#3a1a1a",
    marginBottom: "0.375rem",
  },
  input: {
    width: "100%",
    padding: "0.75rem 1rem",
    borderRadius: 10,
    border: "1px solid #f0e0dc",
    fontSize: "1rem",
    boxSizing: "border-box" as const,
  },
  button: {
    padding: "0.625rem 1.25rem",
    borderRadius: 10,
    border: "none",
    fontSize: "0.875rem",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  buttonPrimary: {
    background: "#e06060",
    color: "white",
  },
  buttonSecondary: {
    background: "#f5e6e6",
    color: "#b06060",
  },
  backLink: {
    display: "inline-block",
    fontSize: "0.875rem",
    color: "#e06060",
    marginBottom: "1rem",
    cursor: "pointer",
    background: "none",
    border: "none",
    padding: 0,
    fontFamily: "inherit",
  },
  error: {
    fontSize: "0.875rem",
    color: "#c04040",
    marginTop: "0.5rem",
  },
  success: {
    fontSize: "0.875rem",
    color: "#2d7a2d",
    marginTop: "0.5rem",
  },
};

export default function ProfilePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [email, setEmail] = useState("");
  const [sectionData, setSectionData] = useState<SectionData>(() => createDefaultSectionData());
  const [step, setStep] = useState<1 | 2>(1);
  const [step1Error, setStep1Error] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const loadProfile = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setUserId(user.id);
    setEmail(user.email ?? "");

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("name, age, email")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[Profile] fetch profile error", profileError);
      setError(profileError.message);
      setLoading(false);
      return;
    }
    if (profile) {
      setName(profile.name ?? "");
      setAge(profile.age != null ? String(profile.age) : "");
      setEmail(profile.email ?? user.email ?? "");
    }

    const { data: interestRows, error: interestsError } = await supabase
      .from("user_interests")
      .select("interest, category")
      .eq("user_id", user.id);

    if (interestsError) {
      console.error("[Profile] fetch interests error", interestsError);
    } else if (interestRows?.length) {
      const grouped = createDefaultSectionData();
      for (const r of interestRows) {
        const cat = (r.category ?? "interests") as InterestSectionId;
        if (cat in grouped) {
          grouped[cat].push(r.interest);
        } else {
          grouped.interests.push(r.interest);
        }
      }
      setSectionData(grouped);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSectionChange = useCallback((sectionId: InterestSectionId, items: string[]) => {
    setSectionData((prev) => ({ ...prev, [sectionId]: items }));
  }, []);

  function validateStep1(): boolean {
    const nameTrim = name.trim();
    const emailTrim = email.trim();
    const ageStr = age.trim();
    const ageNum = ageStr ? parseInt(ageStr, 10) : null;

    if (!nameTrim) {
      setStep1Error("Name is required.");
      return false;
    }
    if (!emailTrim) {
      setStep1Error("Email is required.");
      return false;
    }
    if (ageNum != null && (isNaN(ageNum) || ageNum < 18)) {
      setStep1Error("Age must be 18 or older if provided.");
      return false;
    }
    setStep1Error(null);
    return true;
  }

  function handleContinueToInterests() {
    if (!validateStep1()) return;
    setStep(2);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setError(null);
    setSuccess(false);
    setSaving(true);

    const nameTrim = name.trim();
    const emailTrim = email.trim();
    const ageStr = age.trim();
    const ageNum = ageStr ? parseInt(ageStr, 10) : null;

    if (!nameTrim) {
      setError("Name is required.");
      setSaving(false);
      return;
    }
    if (!emailTrim) {
      setError("Email is required.");
      setSaving(false);
      return;
    }
    if (ageNum != null && (isNaN(ageNum) || ageNum < 18)) {
      setError("Age must be 18 or older.");
      setSaving(false);
      return;
    }

    const payload = {
      name: nameTrim,
      email: emailTrim,
      age: ageNum ?? null,
      sectionData: {
        music: sectionData.music ?? [],
        tv: sectionData.tv ?? [],
        games: sectionData.games ?? [],
        interests: sectionData.interests ?? [],
      },
    };

    const res = await fetch("/api/profile/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError((data as { error?: string }).error ?? "Failed to save profile");
      setSaving(false);
      return;
    }

    setError(null);
    setSuccess(true);
    setSaving(false);
    loadProfile();
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <nav style={styles.nav}>
          <Link href="/" style={{ ...styles.link, fontWeight: 600 }}>
            wave~length
          </Link>
        </nav>
        <div style={styles.card}>
          <p style={styles.subtitle}>Loading profile…</p>
        </div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div style={styles.page}>
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <nav style={styles.nav}>
          <Link href="/" style={{ ...styles.link, fontWeight: 600 }}>
            wave~length
          </Link>
        </nav>
        <div style={styles.card}>
          <p style={styles.subtitle}>You’re not signed in.</p>
          <Link href="/signin" style={styles.link}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <link
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <nav style={styles.nav}>
        <Link href="/" style={{ ...styles.link, fontWeight: 600 }}>
          wave~length
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Link href="/discover" style={styles.link}>
            discover
          </Link>
          <button type="button" onClick={handleSignOut} style={styles.signOut}>
            Sign out
          </button>
        </div>
      </nav>

      <div style={styles.card}>
        <h1 style={styles.title}>Profile</h1>

        {step === 1 && (
          <>
            <p style={styles.subtitle}>
              Start with the basics. You can add interests next.
            </p>
            <div style={styles.form}>
              <div>
                <label htmlFor="name" style={styles.label}>
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Your name"
                  style={styles.input}
                  autoComplete="name"
                />
              </div>
              <div>
                <label htmlFor="age" style={styles.label}>
                  Age (18+)
                </label>
                <input
                  id="age"
                  type="number"
                  min={18}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="e.g. 25"
                  style={styles.input}
                />
              </div>
              <div>
                <label htmlFor="email" style={styles.label}>
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  style={styles.input}
                  autoComplete="email"
                />
              </div>
              {step1Error && <p style={styles.error}>{step1Error}</p>}
              <button
                type="button"
                onClick={handleContinueToInterests}
                style={{ ...styles.button, ...styles.buttonPrimary }}
              >
                Continue to interests →
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p style={styles.subtitle}>
              Add interests by category. Type and press Enter or click Add; suggestions may appear when available.
            </p>
            <button
              type="button"
              onClick={() => setStep(1)}
              style={styles.backLink}
            >
              ← Back to name, age, email
            </button>

            <form onSubmit={handleSubmit} style={styles.form}>
              <div>
                <label style={styles.label}>Interests</label>
                {INTEREST_SECTIONS.map((section) => (
                  <SearchSection
                    key={section.id}
                    section={section}
                    selected={sectionData[section.id as InterestSectionId] ?? []}
                    onChange={(items) => handleSectionChange(section.id as InterestSectionId, items)}
                  />
                ))}
              </div>

              {error && <p style={styles.error}>{error}</p>}
              {success && <p style={styles.success}>Profile saved.</p>}

              <button type="submit" style={{ ...styles.button, ...styles.buttonPrimary }} disabled={saving}>
                {saving ? "Saving…" : "Save profile"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
