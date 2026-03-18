"use client";

import { useState } from "react";

interface NotificationSettings {
  emailFrequency: string;
  milestoneAlerts: boolean;
  struggleAlerts: boolean;
  weeklyReport: boolean;
}

export function NotificationSettingsForm({
  initialSettings,
}: {
  initialSettings: NotificationSettings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const res = await fetch("/api/parent/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to save settings. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Email frequency */}
      <div className="border border-border rounded-lg p-5">
        <h3 className="font-medium mb-1">Email Summary Frequency</h3>
        <p className="text-sm text-muted-foreground mb-4">
          How often would you like to receive an email summary of your
          child&apos;s progress?
        </p>
        <div className="flex gap-3">
          {(["DAILY", "WEEKLY", "NEVER"] as const).map((freq) => (
            <button
              key={freq}
              onClick={() =>
                setSettings((s) => ({ ...s, emailFrequency: freq }))
              }
              className={`px-4 py-2 text-sm rounded-lg border transition-colors cursor-pointer ${
                settings.emailFrequency === freq
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border hover:border-foreground/20"
              }`}
            >
              {freq.charAt(0) + freq.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Toggle options */}
      <div className="border border-border rounded-lg divide-y divide-border">
        <ToggleRow
          label="Milestone Alerts"
          description="Get notified when your child masters a new skill, completes a lesson, or reaches a streak milestone."
          checked={settings.milestoneAlerts}
          onChange={(val) =>
            setSettings((s) => ({ ...s, milestoneAlerts: val }))
          }
        />
        <ToggleRow
          label="Struggle Alerts"
          description="Get notified when your child has been stuck on a topic for multiple sessions and might need encouragement."
          checked={settings.struggleAlerts}
          onChange={(val) =>
            setSettings((s) => ({ ...s, struggleAlerts: val }))
          }
        />
        <ToggleRow
          label="Weekly Progress Report"
          description="Receive a comprehensive weekly report summarizing your child's learning progress."
          checked={settings.weeklyReport}
          onChange={(val) =>
            setSettings((s) => ({ ...s, weeklyReport: val }))
          }
        />
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {saving ? "Saving..." : "Save Preferences"}
        </button>
        {saved && (
          <span className="text-sm text-green-600">
            Settings saved successfully.
          </span>
        )}
        {error && (
          <span className="text-sm text-red-600">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-5">
      <div className="flex-1 mr-4">
        <div className="font-medium text-sm">{label}</div>
        <div className="text-sm text-muted-foreground mt-0.5">
          {description}
        </div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
          checked ? "bg-primary" : "bg-border"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
