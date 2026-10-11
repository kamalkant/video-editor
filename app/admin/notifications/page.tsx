"use client";

import { useEffect, useState } from "react";
import { apiMessage } from "../admin-client";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/lib/auth/AuthContext";
import type { NotificationCampaign, NotificationRule, EmailLog, CampaignRecipient, User } from "@/lib/db/schema";

export default function AdminNotificationsPage() {
  const { user: currentAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<"direct" | "campaigns" | "automated" | "logs">("direct");

  // Server data
  const [campaigns, setCampaigns] = useState<NotificationCampaign[]>([]);
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [recentRecipients, setRecentRecipients] = useState<Array<CampaignRecipient & { campaign_title?: string }>>([]);
  const [emailConfig, setEmailConfig] = useState<{ provider: string; isLive: boolean; from: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "error" | "info">("info");

  // -------------------------------------------------------------
  // TAB 1: DIRECT 1-TO-1 SENDER & TEST STATE
  // -------------------------------------------------------------
  const [directMode, setDirectMode] = useState<"user" | "email">("user");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<User[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const [directEmail, setDirectEmail] = useState("");
  const [matchedEmailUser, setMatchedEmailUser] = useState<User | null>(null);

  const [directTitle, setDirectTitle] = useState("");
  const [directMessage, setDirectMessage] = useState("");
  const [directCtaLabel, setDirectCtaLabel] = useState("");
  const [directCtaUrl, setDirectCtaUrl] = useState("");
  const [directPriority, setDirectPriority] = useState<"normal" | "high" | "urgent">("normal");
  const [directInApp, setDirectInApp] = useState(true);
  const [directEmailChannel, setDirectEmailChannel] = useState(true);
  const [directSending, setDirectSending] = useState(false);
  const [lastDirectReceipt, setLastDirectReceipt] = useState<any>(null);

  // -------------------------------------------------------------
  // TAB 2: CAMPAIGN BUILDER STATE
  // -------------------------------------------------------------
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [priority, setPriority] = useState<"normal" | "high" | "urgent">("normal");
  const [inAppChannel, setInAppChannel] = useState(true);
  const [emailChannel, setEmailChannel] = useState(true);
  const [pushChannel, setPushChannel] = useState(false);
  const [audienceType, setAudienceType] = useState<"single_user" | "single_email" | "all" | "plan" | "csv">("single_user");
  const [planSlug, setPlanSlug] = useState("monthly-pro");
  const [csvEmails, setCsvEmails] = useState("");
  const [campaignTargetUser, setCampaignTargetUser] = useState<User | null>(null);
  const [campaignTargetEmail, setCampaignTargetEmail] = useState("");
  const [campaignUserSearch, setCampaignUserSearch] = useState("");
  const [campaignUserResults, setCampaignUserResults] = useState<User[]>([]);
  const [sending, setSending] = useState(false);
  const [planOptions, setPlanOptions] = useState<Array<{ slug: string; name: string }>>([]);
  const [canBroadcastAll, setCanBroadcastAll] = useState(false);
  const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null);

  // Custom Test Send Modal
  const [testSendModalCampaign, setTestSendModalCampaign] = useState<NotificationCampaign | null>(null);
  const [customTestEmail, setCustomTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);

  // -------------------------------------------------------------
  // FETCH DATA
  // -------------------------------------------------------------
  const fetchData = async () => {
    try {
      setLoading(true);
      const [campRes, logsRes, plansRes] = await Promise.all([
        fetch("/api/admin/notifications/campaigns"),
        fetch("/api/admin/email-logs"),
        fetch("/api/admin/plans"),
      ]);

      const plansData = await plansRes.json().catch(() => ({}));
      if (plansData.ok) {
        const opts = (plansData.plans || []).map((pl: any) => ({ slug: pl.slug, name: pl.name }));
        setPlanOptions(opts);
        setPlanSlug((cur) => (opts.some((o: { slug: string }) => o.slug === cur) ? cur : opts[0]?.slug ?? ""));
      }

      const campData = await campRes.json();
      if (campData.ok) {
        setCanBroadcastAll(Boolean(campData.canBroadcastAll));
        setCampaigns(campData.campaigns || []);
        setRules(campData.rules || []);
        setEmailConfig(campData.emailConfig || null);
        setRecentRecipients(campData.recentRecipients || []);
      }

      const logsData = await logsRes.json();
      if (logsData.ok) {
        setEmailLogs(logsData.logs || []);
      }
    } catch (err) {
      console.error("Failed to load notifications data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Search users for Direct Sender
  useEffect(() => {
    if (!userSearchQuery.trim()) {
      setUserSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const res = await fetch(`/api/admin/users?search=${encodeURIComponent(userSearchQuery)}&limit=8`);
        const data = await res.json();
        if (data.users) {
          setUserSearchResults(data.users);
        }
      } catch (e) {
        console.error("User search failed", e);
      } finally {
        setSearchingUsers(false);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [userSearchQuery]);

  // Check if directEmail belongs to a registered user
  useEffect(() => {
    const clean = directEmail.trim().toLowerCase();
    if (!clean || !clean.includes("@")) {
      setMatchedEmailUser(null);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/users?search=${encodeURIComponent(clean)}&limit=1`);
        const data = await res.json();
        const found = (data.users || []).find((u: User) => (u.email || "").toLowerCase() === clean);
        setMatchedEmailUser(found || null);
      } catch {
        setMatchedEmailUser(null);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [directEmail]);

  // Search users for Campaign Audience
  useEffect(() => {
    if (!campaignUserSearch.trim()) {
      setCampaignUserResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/users?search=${encodeURIComponent(campaignUserSearch)}&limit=8`);
        const data = await res.json();
        if (data.users) {
          setCampaignUserResults(data.users);
        }
      } catch (e) {
        console.error("User search failed", e);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [campaignUserSearch]);

  // -------------------------------------------------------------
  // SEND DIRECT NOTIFICATION (1-TO-1)
  // -------------------------------------------------------------
  const handleSendDirectNotification = async (targetOverride?: { userId?: string; email?: string }) => {
    setDirectSending(true);
    setStatusMessage(null);
    setLastDirectReceipt(null);

    const channels: Array<"in_app" | "email"> = [];
    if (directInApp) channels.push("in_app");
    if (directEmailChannel) channels.push("email");

    if (channels.length === 0) {
      setStatusMessage("Please select at least one delivery channel (In-App or Email).");
      setStatusType("error");
      setDirectSending(false);
      return;
    }

    if (!directTitle.trim() || !directMessage.trim()) {
      setStatusMessage("Please enter both a title and message for the notification.");
      setStatusType("error");
      setDirectSending(false);
      return;
    }

    let targetUserId = targetOverride?.userId;
    let targetEmail = targetOverride?.email;

    if (!targetOverride) {
      if (directMode === "user") {
        if (!selectedUser) {
          setStatusMessage("Please select a specific ViPlay user account.");
          setStatusType("error");
          setDirectSending(false);
          return;
        }
        targetUserId = selectedUser.id;
        targetEmail = selectedUser.email || undefined;
      } else {
        if (!directEmail.trim() || !directEmail.includes("@")) {
          setStatusMessage("Please enter a valid target email address.");
          setStatusType("error");
          setDirectSending(false);
          return;
        }
        targetEmail = directEmail.trim();
        if (matchedEmailUser) {
          targetUserId = matchedEmailUser.id;
        }
      }
    }

    try {
      const res = await fetch("/api/admin/notifications/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "direct_send",
          userId: targetUserId,
          email: targetEmail,
          title: directTitle,
          message: directMessage,
          ctaLabel: directCtaLabel || undefined,
          ctaUrl: directCtaUrl || undefined,
          channels,
          priority: directPriority,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(apiMessage(data, "Failed to dispatch notification"));

      setLastDirectReceipt(data.result);
      setStatusMessage(
        `Direct notification dispatched successfully to ${data.result.recipient.name} (${data.result.recipient.email || data.result.recipient.userId}) via [${data.result.channelsSent.join(", ")}]!`
      );
      setStatusType("success");
      await fetchData();
    } catch (err: any) {
      setStatusMessage(`Dispatch failed: ${err.message}`);
      setStatusType("error");
    } finally {
      setDirectSending(false);
    }
  };

  // Quick test to current admin
  const handleQuickTestToMe = () => {
    if (!currentAdmin) return;
    setDirectMode("user");
    setSelectedUser({
      id: currentAdmin.id,
      email: currentAdmin.email,
      name: currentAdmin.name,
      role: currentAdmin.role as any,
      status: "active",
      created_at: Date.now(),
      updated_at: Date.now(),
      email_verified: 1,
      phone_verified: 0,
      phone_number: null,
      password_hash: null,
      password_salt: null,
      last_login_at: null,
      must_change_password: 0,
    });
    if (!directTitle) setDirectTitle("🧪 Test Notification from Admin");
    if (!directMessage) setDirectMessage("This is an instant test notification to verify your in-app notification bell and email dispatch.");
  };

  // -------------------------------------------------------------
  // CREATE CAMPAIGN
  // -------------------------------------------------------------
  /** Asks the server how many people a filter reaches, then confirms before anything is sent. */
  const confirmAudience = async (audienceFilter: any, what: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/admin/notifications/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview_audience", audienceFilter }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(apiMessage(data, "Could not count recipients"));
      if (data.count === 0) {
        setStatusMessage("Error: this audience has no recipients.");
        setStatusType("error");
        return false;
      }
      return confirm(`${what} to ${data.count} recipient(s) now? This cannot be undone.`);
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
      setStatusType("error");
      return false;
    }
  };

  const handleDispatchDraft = async (c: NotificationCampaign) => {
    const filter = JSON.parse(c.audience_filter || "{}");
    if (!(await confirmAudience(filter, `Send "${c.title}"`))) return;
    setBusyCampaignId(c.id);
    try {
      const res = await fetch("/api/admin/notifications/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dispatch", campaignId: c.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(apiMessage(data, "Dispatch failed"));
      setStatusMessage(`Campaign dispatched: ${data.result?.delivered ?? 0} delivered, ${data.result?.failed ?? 0} failed.`);
      setStatusType("success");
      await fetchData();
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
      setStatusType("error");
    } finally {
      setBusyCampaignId(null);
    }
  };

  const handleCreateCampaign = async (sendImmediately: boolean) => {
    setSending(true);
    setStatusMessage(null);

    const channels: Array<"in_app" | "email" | "push"> = [];
    if (inAppChannel) channels.push("in_app");
    if (emailChannel) channels.push("email");
    if (pushChannel) channels.push("push");

    if (channels.length === 0) {
      setStatusMessage("Error: Select at least one delivery channel.");
      setStatusType("error");
      setSending(false);
      return;
    }

    const audienceFilter: any = { type: audienceType };
    if (audienceType === "single_user") {
      if (!campaignTargetUser) {
        setStatusMessage("Please select a target user for this single-user campaign.");
        setStatusType("error");
        setSending(false);
        return;
      }
      audienceFilter.userId = campaignTargetUser.id;
    } else if (audienceType === "single_email") {
      if (!campaignTargetEmail.trim()) {
        setStatusMessage("Please enter a target email address.");
        setStatusType("error");
        setSending(false);
        return;
      }
      audienceFilter.email = campaignTargetEmail.trim();
    } else if (audienceType === "plan") {
      audienceFilter.planSlug = planSlug;
    } else if (audienceType === "csv") {
      const parsed = csvEmails.split(/[\n,;]+/).map((e) => e.trim()).filter(Boolean);
      audienceFilter.emails = parsed;
    }

    if (sendImmediately && !(await confirmAudience(audienceFilter, `Send "${title}"`))) {
      setSending(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/notifications/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: name || title,
          title,
          message,
          ctaLabel: ctaLabel || null,
          ctaUrl: ctaUrl || null,
          priority,
          channels,
          audienceFilter,
          sendImmediately,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(apiMessage(data, "Failed to create campaign"));

      setStatusMessage(
        sendImmediately
          ? `Campaign dispatched to ${data.dispatchResult?.delivered || 0} recipient(s)!`
          : "Campaign saved as draft."
      );
      setStatusType("success");
      setName("");
      setTitle("");
      setMessage("");
      setCtaLabel("");
      setCtaUrl("");
      setCsvEmails("");
      setCampaignTargetUser(null);
      setCampaignTargetEmail("");
      await fetchData();
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
      setStatusType("error");
    } finally {
      setSending(false);
    }
  };

  // Test Send a Campaign
  const handleExecuteTestSend = async () => {
    if (!testSendModalCampaign) return;
    setTestSending(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/admin/notifications/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_send",
          campaignId: testSendModalCampaign.id,
          testEmail: customTestEmail.trim() || currentAdmin?.email || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(apiMessage(data, "Test send failed"));
      setStatusMessage(`Test send delivered to ${customTestEmail || currentAdmin?.email} & in-app bell!`);
      setStatusType("success");
      setTestSendModalCampaign(null);
      setCustomTestEmail("");
      await fetchData();
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
      setStatusType("error");
    } finally {
      setTestSending(false);
    }
  };

  const handleRetryFailed = async (campaignId: string) => {
    if (busyCampaignId) return;
    setBusyCampaignId(campaignId);
    setStatusMessage("Retrying failed recipients...");
    setStatusType("info");
    try {
      const res = await fetch("/api/admin/notifications/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_failed", campaignId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(apiMessage(data, "Retry failed"));
      setStatusMessage(`Retried delivery for ${data.retriedCount} recipient(s).`);
      setStatusType("success");
      await fetchData();
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
      setStatusType("error");
    } finally {
      setBusyCampaignId(null);
    }
  };

  const handleTriggerLifecycleScan = async () => {
    if (!confirm("Run the lifecycle scan now? Reminder emails go out to every subscriber whose renewal is due.")) return;
    setStatusMessage("Scanning subscription expiry triggers (7d, 3d, 1d)...");
    setStatusType("info");
    try {
      const res = await fetch("/api/admin/notifications/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "trigger_lifecycle" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(apiMessage(data, "Scan failed"));
      setStatusMessage(`Automated scan complete: ${data.result?.triggeredCount || 0} notification(s) dispatched.`);
      setStatusType("success");
      await fetchData();
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
      setStatusType("error");
    }
  };

  const handleUpdateRule = async (rule: NotificationRule, enabled: boolean) => {
    try {
      let ruleChannels: string[] = [];
      try {
        ruleChannels = JSON.parse(rule.channels || "[]");
      } catch {}
      const res = await fetch("/api/admin/notifications/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_rule",
          id: rule.id,
          isEnabled: enabled,
          channels: ruleChannels,
          templateTitle: rule.template_title,
          templateBody: rule.template_body,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatusMessage(`Error: ${apiMessage(data, "Failed to update rule")}`);
        setStatusType("error");
      }
      await fetchData();
    } catch {
      setStatusMessage("Error: network error while updating rule");
      setStatusType("error");
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Live Provider Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Notification Platform & Broadcasts</span>
          </h1>
          <p className="text-xs text-muted mt-1">
            Send 1-to-1 notifications to specific ViPlay accounts or emails, broadcast campaigns, and configure automated reminders.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {emailConfig && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${
              emailConfig.isLive
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-amber-500/10 border-amber-500/30 text-amber-300"
            }`}>
              <span className={`size-2 rounded-full ${emailConfig.isLive ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              <span>
                {emailConfig.isLive
                  ? `Email: ${emailConfig.provider.toUpperCase()} (Live)`
                  : "Email: Dev Console (Live API Key not set in .env.local)"}
              </span>
            </div>
          )}
          <button
            onClick={handleTriggerLifecycleScan}
            className="btn btn-secondary text-xs flex items-center gap-1.5"
          >
            <Icon name="sparkles" className="size-3.5 text-cyan-400" />
            <span>Scan Expiry Triggers</span>
          </button>
        </div>
      </div>

      {/* Dev Mode Notification Guide Banner if no Live Email */}
      {emailConfig && !emailConfig.isLive && (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3.5 text-xs text-cyan-200 flex items-start gap-3">
          <div className="mt-0.5 shrink-0 text-cyan-400">
            <Icon name="info" className="size-4" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-white">How notifications work in local development:</p>
            <p className="text-slate-300 leading-relaxed">
              <strong>• In-App Notifications:</strong> Work 100% live! When you send to any ViPlay account, it immediately appears in their header Bell icon & notification dropdown.<br />
              <strong>• Emails:</strong> Since <code className="bg-slate-900 px-1 py-0.5 rounded text-cyan-300">RESEND_API_KEY</code> is not configured in <code className="bg-slate-900 px-1 py-0.5 rounded text-cyan-300">.env.local</code>, outgoing emails are securely simulated and printed to the terminal console without throwing errors.
            </p>
          </div>
        </div>
      )}

      {/* Global Status Message */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            statusType === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : statusType === "error"
              ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
              : "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
          }`}
        >
          <div className="flex items-center gap-2">
            <Icon name={statusType === "success" ? "check" : statusType === "error" ? "alert" : "info"} className="size-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-line pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("direct")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
            activeTab === "direct"
              ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
              : "text-muted hover:text-white hover:bg-slate-800"
          }`}
        >
          <Icon name="person" className="size-3.5" />
          <span>Direct 1-to-1 Sender & Test</span>
        </button>
        <button
          onClick={() => setActiveTab("campaigns")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
            activeTab === "campaigns"
              ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
              : "text-muted hover:text-white hover:bg-slate-800"
          }`}
        >
          <Icon name="broadcast" className="size-3.5" />
          <span>Broadcast Campaigns</span>
        </button>
        <button
          onClick={() => setActiveTab("automated")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
            activeTab === "automated"
              ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
              : "text-muted hover:text-white hover:bg-slate-800"
          }`}
        >
          <Icon name="sparkles" className="size-3.5" />
          <span>Lifecycle Reminders</span>
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
            activeTab === "logs"
              ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
              : "text-muted hover:text-white hover:bg-slate-800"
          }`}
        >
          <Icon name="clock" className="size-3.5" />
          <span>Delivery Logs ({recentRecipients.length + emailLogs.length})</span>
        </button>
      </div>

      {/* ============================================================= */}
      {/* TAB 1: DIRECT 1-TO-1 SENDER & TEST SENDER                      */}
      {/* ============================================================= */}
      {activeTab === "direct" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Direct Sender Form */}
          <div className="lg:col-span-8 card space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Send Direct Notification to a Specific Person</span>
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Target a single ViPlay user account or an individual email address directly.
                </p>
              </div>
              <button
                type="button"
                onClick={handleQuickTestToMe}
                className="btn btn-secondary text-xs flex items-center gap-1.5"
                title="Prefill with your own administrator account"
              >
                <Icon name="star" className="size-3.5 text-amber-400" />
                <span>Test to My Account</span>
              </button>
            </div>

            {/* Target Mode Switcher */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white">Select Target Mode</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDirectMode("user")}
                  className={`p-3 rounded-xl border text-left transition flex items-center gap-3 ${
                    directMode === "user"
                      ? "border-cyan-500 bg-cyan-500/10 text-white shadow-xs"
                      : "border-slate-800 bg-slate-900/40 text-muted hover:border-slate-700"
                  }`}
                >
                  <div className={`size-8 rounded-lg flex items-center justify-center ${directMode === "user" ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-muted"}`}>
                    <Icon name="person" className="size-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Specific ViPlay User Account</div>
                    <div className="text-[11px] text-muted">Delivers to user's In-App Bell + Email</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setDirectMode("email")}
                  className={`p-3 rounded-xl border text-left transition flex items-center gap-3 ${
                    directMode === "email"
                      ? "border-cyan-500 bg-cyan-500/10 text-white shadow-xs"
                      : "border-slate-800 bg-slate-900/40 text-muted hover:border-slate-700"
                  }`}
                >
                  <div className={`size-8 rounded-lg flex items-center justify-center ${directMode === "email" ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-muted"}`}>
                    <Icon name="broadcast" className="size-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Specific Email Address</div>
                    <div className="text-[11px] text-muted">Any external or custom email</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Target Selector */}
            {directMode === "user" ? (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white">Target ViPlay Account</label>
                {selectedUser ? (
                  <div className="p-3 rounded-xl border border-cyan-500/40 bg-cyan-950/20 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-9 rounded-full bg-cyan-500 text-slate-950 font-bold flex items-center justify-center text-xs shrink-0">
                        {selectedUser.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate flex items-center gap-2">
                          <span>{selectedUser.name}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-300 font-mono">
                            {selectedUser.role}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted truncate">{selectedUser.email}</div>
                        <div className="text-[10px] text-slate-500 font-mono truncate">ID: {selectedUser.id}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedUser(null)}
                      className="px-2.5 py-1 rounded-md text-xs bg-slate-800 hover:bg-slate-700 text-white shrink-0"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 relative">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search user by name or email (e.g. kamal or admin)..."
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        className="input text-xs w-full pl-9"
                      />
                      <Icon name="search" className="size-4 text-muted absolute left-3 top-2.5" />
                    </div>

                    {userSearchResults.length > 0 && (
                      <div className="border border-slate-800 bg-slate-900 rounded-xl divide-y divide-slate-800/80 max-h-48 overflow-y-auto">
                        {userSearchResults.map((u) => (
                          <div
                            key={u.id}
                            onClick={() => {
                              setSelectedUser(u);
                              setUserSearchQuery("");
                              setUserSearchResults([]);
                            }}
                            className="p-2.5 hover:bg-slate-800/60 cursor-pointer flex items-center justify-between text-xs transition"
                          >
                            <div className="min-w-0">
                              <span className="font-semibold text-white mr-2">{u.name}</span>
                              <span className="text-muted">{u.email}</span>
                            </div>
                            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-400 shrink-0">
                              {u.role}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white">Target Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. kamal@example.com or user@gmail.com"
                  value={directEmail}
                  onChange={(e) => setDirectEmail(e.target.value)}
                  className="input text-xs w-full"
                />
                {matchedEmailUser ? (
                  <div className="text-[11px] text-emerald-400 flex items-center gap-1.5 mt-1 bg-emerald-950/20 p-2 rounded-lg border border-emerald-500/20">
                    <Icon name="check" className="size-3.5" />
                    <span>Linked to registered ViPlay user: <strong>{matchedEmailUser.name}</strong> (In-App Bell notification enabled!)</span>
                  </div>
                ) : directEmail.includes("@") ? (
                  <div className="text-[11px] text-muted flex items-center gap-1.5 mt-1">
                    <Icon name="info" className="size-3.5" />
                    <span>External email address (Will receive email notification).</span>
                  </div>
                ) : null}
              </div>
            )}

            {/* Channels & Priority */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white">Delivery Channels</label>
                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={directInApp}
                      onChange={(e) => setDirectInApp(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-cyan-500"
                    />
                    <span className="text-slate-200">🔔 In-App Bell</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={directEmailChannel}
                      onChange={(e) => setDirectEmailChannel(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-cyan-500"
                    />
                    <span className="text-slate-200">✉️ Email</span>
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-white">Priority Level</label>
                <select
                  value={directPriority}
                  onChange={(e) => setDirectPriority(e.target.value as any)}
                  className="input text-xs w-full"
                >
                  <option value="normal">Normal Priority</option>
                  <option value="high">High Priority</option>
                  <option value="urgent">Urgent / Alert</option>
                </select>
              </div>
            </div>

            {/* Message Content */}
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-white">Notification Subject / Title</label>
                <input
                  type="text"
                  placeholder="e.g. Action Required: Your export is ready"
                  value={directTitle}
                  onChange={(e) => setDirectTitle(e.target.value)}
                  className="input text-xs w-full"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-white">Message Body</label>
                <textarea
                  rows={3}
                  placeholder="Write your notification message here..."
                  value={directMessage}
                  onChange={(e) => setDirectMessage(e.target.value)}
                  className="input text-xs w-full"
                />
              </div>

              {/* Action Button (Optional) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-muted">Action Button Label (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Open Studio"
                    value={directCtaLabel}
                    onChange={(e) => setDirectCtaLabel(e.target.value)}
                    className="input text-xs w-full"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted">Action URL (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. /editor or https://..."
                    value={directCtaUrl}
                    onChange={(e) => setDirectCtaUrl(e.target.value)}
                    className="input text-xs w-full"
                  />
                </div>
              </div>
            </div>

            {/* Send Button */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-muted">
                {directMode === "user"
                  ? selectedUser
                    ? `Ready to send to ${selectedUser.name}`
                    : "Select a user to continue"
                  : directEmail
                  ? `Ready to send to ${directEmail}`
                  : "Enter an email to continue"}
              </span>

              <button
                type="button"
                onClick={() => handleSendDirectNotification()}
                disabled={directSending || (directMode === "user" ? !selectedUser : !directEmail)}
                className="btn btn-primary text-xs flex items-center gap-2 px-5 py-2"
              >
                <Icon name="broadcast" className="size-4" />
                <span>{directSending ? "Dispatching..." : "Send Direct Notification"}</span>
              </button>
            </div>
          </div>

          {/* Right Column: Live In-App Notification Preview & Receipt */}
          <div className="lg:col-span-4 space-y-4">
            {/* Live Visual Preview */}
            <div className="card space-y-3">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <Icon name="monitor" className="size-4 text-cyan-400" />
                <span>In-App Bell Dropdown Preview</span>
              </h3>
              <p className="text-[11px] text-muted">
                This is exactly how the recipient will see this notification in their top navigation bell:
              </p>

              <div className="p-3.5 rounded-xl border border-line bg-surface/75 space-y-2.5">
                <div className="flex items-start gap-3">
                  <div className="size-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon name="broadcast" className="size-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-bold text-ink truncate">
                        {directTitle || "Notification Title"}
                      </p>
                      <span className="text-[10px] text-muted shrink-0">Just now</span>
                    </div>
                    <p className="text-xs text-muted mt-0.5 leading-relaxed break-words">
                      {directMessage || "Your notification message will appear here in the user's notification center."}
                    </p>
                    {directCtaLabel && (
                      <div className="mt-2">
                        <span className="inline-block px-2.5 py-1 rounded bg-primary text-white text-[10px] font-semibold">
                          {directCtaLabel}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="size-2 rounded-full bg-primary shrink-0 self-center" />
                </div>
              </div>
            </div>

            {/* Delivery Confirmation Receipt */}
            {lastDirectReceipt && (
              <div className="card space-y-3 border-emerald-500/30 bg-emerald-950/10">
                <div className="flex items-center gap-2 text-emerald-400">
                  <Icon name="check" className="size-4" />
                  <span className="text-xs font-bold">Delivery Confirmation Receipt</span>
                </div>

                <div className="text-xs space-y-1.5 text-slate-300">
                  <div><strong>Recipient:</strong> {lastDirectReceipt.recipient.name}</div>
                  <div><strong>Email:</strong> {lastDirectReceipt.recipient.email || "N/A"}</div>
                  <div><strong>User ID:</strong> <code className="text-[10px] bg-slate-900 p-0.5 rounded">{lastDirectReceipt.recipient.userId || "External"}</code></div>
                  <div><strong>Channels:</strong> <span className="text-cyan-400 font-bold">{lastDirectReceipt.channelsSent.join(", ")}</span></div>
                  <div><strong>Delivered:</strong> <span className="text-emerald-400 font-bold">✓ Confirmed</span></div>
                </div>

                <div className="pt-2 border-t border-emerald-500/20 text-[11px] text-emerald-300">
                  Notification is now visible in the user's top navigation Bell icon!
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 2: BROADCAST CAMPAIGNS                                     */}
      {/* ============================================================= */}
      {activeTab === "campaigns" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Create Campaign Form */}
          <div className="lg:col-span-5 card space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h2 className="text-base font-bold text-white">Create Broadcast Campaign</h2>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded">
                Multi-Channel
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-300">Internal Campaign Name</label>
                <input
                  type="text"
                  placeholder="e.g. October Feature Drop"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input text-xs w-full"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300">Broadcast Title / Subject</label>
                <input
                  type="text"
                  placeholder="e.g. Introducing 4K Proxy Export"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input text-xs w-full"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300">Message Body</label>
                <textarea
                  rows={3}
                  placeholder="Write message content..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="input text-xs w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">CTA Label (Opt)</label>
                  <input
                    type="text"
                    placeholder="e.g. Try Now"
                    value={ctaLabel}
                    onChange={(e) => setCtaLabel(e.target.value)}
                    className="input text-xs w-full"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">CTA URL (Opt)</label>
                  <input
                    type="text"
                    placeholder="e.g. /editor"
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    className="input text-xs w-full"
                  />
                </div>
              </div>

              {/* Delivery Channels */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <label className="font-semibold text-slate-300">Delivery Channels</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inAppChannel}
                      onChange={(e) => setInAppChannel(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-cyan-500"
                    />
                    <span>🔔 In-App</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emailChannel}
                      onChange={(e) => setEmailChannel(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-cyan-500"
                    />
                    <span>✉️ Email</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pushChannel}
                      onChange={(e) => setPushChannel(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-cyan-500"
                    />
                    <span>📲 Push</span>
                  </label>
                </div>
              </div>

              {/* Target Audience */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="font-semibold text-slate-300">Target Audience</label>
                <select
                  value={audienceType}
                  onChange={(e) => setAudienceType(e.target.value as any)}
                  className="input text-xs w-full"
                >
                  <option value="single_user">👤 Specific ViPlay User Account</option>
                  <option value="single_email">✉️ Specific Single Email</option>
                  <option value="all" disabled={!canBroadcastAll}>
                    👥 All Active Users{canBroadcastAll ? "" : " (Super Admin only)"}
                  </option>
                  <option value="plan">💎 By Subscription Plan</option>
                  <option value="csv">📋 Custom Email List (CSV)</option>
                </select>

                {audienceType === "single_user" && (
                  <div className="space-y-2">
                    {campaignTargetUser ? (
                      <div className="p-2.5 rounded-lg border border-cyan-500/40 bg-cyan-950/20 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-white">{campaignTargetUser.name}</div>
                          <div className="text-muted">{campaignTargetUser.email}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCampaignTargetUser(null)}
                          className="px-2 py-0.5 rounded bg-slate-800 text-white text-[11px]"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <input
                          type="text"
                          placeholder="Search registered user..."
                          value={campaignUserSearch}
                          onChange={(e) => setCampaignUserSearch(e.target.value)}
                          className="input text-xs w-full"
                        />
                        {campaignUserResults.length > 0 && (
                          <div className="border border-slate-800 bg-slate-900 rounded-lg max-h-36 overflow-y-auto divide-y divide-slate-800">
                            {campaignUserResults.map((u) => (
                              <div
                                key={u.id}
                                onClick={() => {
                                  setCampaignTargetUser(u);
                                  setCampaignUserSearch("");
                                  setCampaignUserResults([]);
                                }}
                                className="p-2 hover:bg-slate-800 cursor-pointer text-xs flex justify-between"
                              >
                                <span className="text-white font-medium">{u.name} ({u.email})</span>
                                <span className="text-cyan-400 font-mono text-[10px]">{u.role}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {audienceType === "single_email" && (
                  <input
                    type="email"
                    placeholder="Enter target email (e.g. user@example.com)"
                    value={campaignTargetEmail}
                    onChange={(e) => setCampaignTargetEmail(e.target.value)}
                    className="input text-xs w-full"
                  />
                )}

                {audienceType === "plan" && (
                  <select
                    value={planSlug}
                    onChange={(e) => setPlanSlug(e.target.value)}
                    className="input text-xs w-full"
                  >
                    {planOptions.length === 0 && <option value="">No plans found</option>}
                    {planOptions.map((pl) => (
                      <option key={pl.slug} value={pl.slug}>
                        {pl.name} ({pl.slug})
                      </option>
                    ))}
                  </select>
                )}

                {audienceType === "csv" && (
                  <textarea
                    rows={2}
                    placeholder="Paste emails separated by commas or lines..."
                    value={csvEmails}
                    onChange={(e) => setCsvEmails(e.target.value)}
                    className="input text-xs w-full"
                  />
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleCreateCampaign(false)}
                disabled={sending || !title || !message}
                className="btn btn-secondary text-xs"
              >
                Save as Draft
              </button>

              <button
                type="button"
                onClick={() => handleCreateCampaign(true)}
                disabled={sending || !title || !message}
                className="btn btn-primary text-xs"
              >
                {sending ? "Dispatching..." : "Create & Dispatch Now"}
              </button>
            </div>
          </div>

          {/* Campaigns List */}
          <div className="lg:col-span-7 card space-y-4">
            <h2 className="text-base font-bold text-white">Broadcast History & Campaigns</h2>

            {loading ? (
              <div className="text-xs text-muted p-8 text-center">Loading campaigns...</div>
            ) : campaigns.length === 0 ? (
              <div className="text-xs text-muted p-8 text-center border border-dashed border-slate-800 rounded-xl">
                No campaigns created yet.
              </div>
            ) : (
              <div className="space-y-3">
                {campaigns.map((c) => {
                  const channelsArr: string[] = JSON.parse(c.channels || "[]");
                  const filterObj = JSON.parse(c.audience_filter || "{}");

                  return (
                    <div key={c.id} className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white">{c.title}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                            c.status === "completed"
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          }`}>
                            {c.status}
                          </span>
                        </div>
                        <span className="text-xs text-muted">{new Date(c.created_at).toLocaleDateString()}</span>
                      </div>

                      <p className="text-xs text-slate-300 line-clamp-2">{c.message}</p>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[11px] text-muted">
                        <div className="flex items-center gap-3">
                          <span>Channels: <strong className="text-cyan-400">{channelsArr.join(", ")}</strong></span>
                          <span>Audience: <strong>{filterObj.type}</strong></span>
                          <span>Delivered: <strong className="text-emerald-400">{c.delivered_recipients}</strong> / {c.total_recipients}</span>
                          {c.failed_recipients > 0 && (
                            <span>Failed: <strong className="text-rose-400">{c.failed_recipients}</strong></span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setTestSendModalCampaign(c);
                              setCustomTestEmail(currentAdmin?.email || "");
                            }}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white text-[11px] flex items-center gap-1"
                          >
                            <Icon name="star" className="size-3 text-amber-400" />
                            <span>Test Send</span>
                          </button>
                          {(c.status === "draft" || c.status === "scheduled") && (
                            <button
                              type="button"
                              disabled={busyCampaignId !== null}
                              onClick={() => handleDispatchDraft(c)}
                              className="px-2.5 py-1 rounded bg-primary/80 hover:bg-primary text-white text-[11px] disabled:opacity-50"
                            >
                              {busyCampaignId === c.id ? "Sending…" : "Dispatch"}
                            </button>
                          )}
                          {c.failed_recipients > 0 && (
                            <button
                              type="button"
                              disabled={busyCampaignId !== null}
                              onClick={() => handleRetryFailed(c.id)}
                              className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[11px]"
                            >
                              Retry Failed
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 3: AUTOMATED LIFECYCLE REMINDERS                           */}
      {/* ============================================================= */}
      {activeTab === "automated" && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-line">
            <div>
              <h2 className="text-base font-bold text-white">Configurable Subscription Lifecycle Reminders</h2>
              <p className="text-xs text-muted">
                Automated reminders triggered before subscription renewal (7d, 3d, 1d) or upon payment events.
              </p>
            </div>

            <button
              onClick={handleTriggerLifecycleScan}
              className="btn btn-primary text-xs flex items-center gap-1.5"
            >
              <Icon name="sparkles" className="size-3.5" />
              <span>Trigger Expiry Reminders (7d, 3d, 1d)</span>
            </button>
          </div>

          <div className="space-y-4">
            {rules.map((rule) => {
              const channelsArr: string[] = JSON.parse(rule.channels || "[]");

              return (
                <div key={rule.id} className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-cyan-400 uppercase tracking-wider">
                        {rule.event_type.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-muted">• Channels: {channelsArr.join(", ")}</span>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={rule.is_enabled === 1}
                        onChange={(e) => handleUpdateRule(rule, e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-cyan-500"
                      />
                      <span className={rule.is_enabled === 1 ? "text-emerald-400 font-bold" : "text-muted"}>
                        {rule.is_enabled === 1 ? "Active" : "Disabled"}
                      </span>
                    </label>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="text-slate-200 font-semibold">{rule.template_title}</div>
                    <div className="text-slate-400 font-mono text-[11px] bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                      {rule.template_body}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 4: DELIVERY LOGS & RECIPIENT HISTORY                       */}
      {/* ============================================================= */}
      {activeTab === "logs" && (
        <div className="space-y-6">
          {/* Recent In-App & Direct Recipient Deliveries */}
          <div className="card space-y-4">
            <h2 className="text-base font-bold text-white flex items-center justify-between">
              <span>Recent Dispatched Recipients ({recentRecipients.length})</span>
              <span className="text-xs text-muted font-normal">Shows in-app & direct notification deliveries</span>
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-muted uppercase text-[10px] font-mono">
                  <tr>
                    <th className="p-2.5">Target / Recipient</th>
                    <th className="p-2.5">Campaign / Subject</th>
                    <th className="p-2.5">Channels</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Sent Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/40">
                  {recentRecipients.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted">No recipient dispatches recorded yet.</td>
                    </tr>
                  ) : (
                    recentRecipients.map((r) => {
                      const channels = JSON.parse(r.channels_sent || "[]");
                      return (
                        <tr key={r.id} className="hover:bg-slate-900/40">
                          <td className="p-2.5">
                            <div className="font-medium text-white">{r.email || r.user_id}</div>
                            {r.user_id && <div className="text-[10px] text-muted font-mono">{r.user_id}</div>}
                          </td>
                          <td className="p-2.5 text-slate-300">{r.campaign_title || r.campaign_id}</td>
                          <td className="p-2.5 font-mono text-cyan-400">{channels.join(", ")}</td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                              r.status === "delivered"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-rose-500/20 text-rose-400"
                            }`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="p-2.5 text-muted">{r.sent_at ? new Date(r.sent_at).toLocaleString() : "Pending"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Email Provider Logs */}
          <div className="card space-y-4">
            <h2 className="text-base font-bold text-white flex items-center justify-between">
              <span>System Email Provider Logs ({emailLogs.length})</span>
              <span className="text-xs text-muted font-normal">Shows SMTP / Resend dispatch records</span>
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line text-muted uppercase text-[10px] font-mono">
                  <tr>
                    <th className="p-2.5">Recipient Email</th>
                    <th className="p-2.5">Subject</th>
                    <th className="p-2.5">Template</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/40">
                  {emailLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted">No email logs found.</td>
                    </tr>
                  ) : (
                    emailLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-900/40">
                        <td className="p-2.5 font-medium text-white">{log.to_email}</td>
                        <td className="p-2.5 text-slate-300">{log.subject}</td>
                        <td className="p-2.5 font-mono text-muted">{log.template_name}</td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                            log.status === "sent"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : log.status === "simulated"
                              ? "bg-cyan-500/20 text-cyan-400"
                              : "bg-rose-500/20 text-rose-400"
                          }`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="p-2.5 text-muted">{new Date(log.sent_at).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TEST SEND CUSTOM TARGET MODAL                                 */}
      {/* ============================================================= */}
      {testSendModalCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md card space-y-4 border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Icon name="star" className="size-4 text-amber-400" />
                <span>Test Send: {testSendModalCampaign.title}</span>
              </h3>
              <button
                type="button"
                onClick={() => setTestSendModalCampaign(null)}
                className="text-muted hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-muted">
              Choose the target email or account to receive this test notification before broadcasting.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-white">Target Test Email</label>
              <input
                type="email"
                placeholder="e.g. your-email@gmail.com"
                value={customTestEmail}
                onChange={(e) => setCustomTestEmail(e.target.value)}
                className="input text-xs w-full"
              />
              <span className="text-[11px] text-muted">
                Defaults to your administrator email ({currentAdmin?.email || "current user"}).
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setTestSendModalCampaign(null)}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteTestSend}
                disabled={testSending}
                className="btn btn-primary text-xs flex items-center gap-1.5"
              >
                <Icon name="broadcast" className="size-3.5" />
                <span>{testSending ? "Sending Test..." : "Send Test Now"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
