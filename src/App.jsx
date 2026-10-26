import React from 'react';

import { useCallback, useEffect, useMemo, useState } from "react";

import {

  Heart, Mail, Plus, Sparkles, ArrowLeft, Bell, RotateCcw,
  Send, Trash2, BookHeart, LockKeyhole, Copy, X

} from "lucide-react";

import { supabase, supabaseConfigured } from "./lib/supabase";

const CATEGORIES = [

  "When you miss me", "When you're sad", "When you need a hug",

  "Just because", "When you need courage", "A little thank-you"

];

function friendlyError(error) {

  if (!error) return "Something went wrong. Please try again.";

  if (/row-level security|policy/i.test(error.message || "")) {

    return "That action was blocked by the database security rules. Check the setup SQL and that you're paired with your partner.";

  }

  return error.message || "Something went wrong. Please try again.";

}

export default function App() {

  async function startNewSession() {
    setBusy(true);
    setNotice("");

    try {
      const registration = "serviceWorker" in navigator
        ? await navigator.serviceWorker.getRegistration("/")
        : null;
      const subscription = await registration?.pushManager?.getSubscription();
      if (subscription && session?.user) {
        const { error: subscriptionError } = await supabase.from("push_subscriptions")
          .delete()
          .eq("user_id", session.user.id)
          .eq("endpoint", subscription.endpoint);
        if (subscriptionError) throw subscriptionError;
        await subscription.unsubscribe();
      }

      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;

      setNotificationsEnabled(false);
      setSession(null);
      setCouple(null);
      setProfile(null);
      setLetters([]);
      setInviteCode("");

      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;

      setSession(data.session);
      setNotice("New guest session created. You can create a new space.");
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  const [session, setSession] = useState(null);

  const [authLoading, setAuthLoading] = useState(true);

  const [authError, setAuthError] = useState("");

  const [profile, setProfile] = useState(null);

  const [couple, setCouple] = useState(null);

  const [partnerEmail, setPartnerEmail] = useState("");

  const [inviteCode, setInviteCode] = useState("");

  const [letters, setLetters] = useState([]);

  const [view, setView] = useState("home");

  const [activeLetter, setActiveLetter] = useState(null);

  const [busy, setBusy] = useState(false);

  const [notice, setNotice] = useState("");

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState("All");

  const [form, setForm] = useState({ title: "", category: CATEGORIES[3], body: "" });

  const [envelopeOpening, setEnvelopeOpening] = useState(false);

  const [lastLetterId, setLastLetterId] = useState(null);

  useEffect(() => {

    if (!supabaseConfigured) { setAuthLoading(false); return; }

    let mounted = true;

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {

      if (!mounted) return;

      setSession(nextSession);

      setAuthLoading(false);

    });

    (async () => {

      const { data, error } = await supabase.auth.getSession();

      if (!mounted) return;

      if (error) {

        setAuthError(friendlyError(error));

        setAuthLoading(false);

        return;

      }

      if (data.session) {

        setSession(data.session);

        setAuthLoading(false);

        return;

      }

      // Anonymous Supabase Auth creates a real auth.users identity, so RLS still protects letters.

      const { data: guestData, error: guestError } = await supabase.auth.signInAnonymously();

      if (!mounted) return;

      if (guestError) setAuthError(`${friendlyError(guestError)} Enable Anonymous Sign-Ins in Supabase Authentication settings.`);

      else setSession(guestData.session);

      setAuthLoading(false);

    })();

    return () => { mounted = false; listener.subscription.unsubscribe(); };

  }, []);

  const loadWorkspace = useCallback(async () => {

    if (!session?.user) return;

    setBusy(true);

    setNotice("");

    try {

      const user = session.user;

      const { data: prof, error: profileError } = await supabase

        .from("profiles").select("*").eq("id", user.id).maybeSingle();

      if (profileError) throw profileError;

      let currentProfile = prof;

      if (!currentProfile) {

        const { data, error } = await supabase.from("profiles")

          .insert({ id: user.id, email: user.email || null, display_name: user.user_metadata?.display_name || "" })

          .select().single();

        if (error) throw error;

        currentProfile = data;

      }

      setProfile(currentProfile);

      const { data: membership, error: membershipError } = await supabase

        .from("couple_members").select("couple_id, couples(*)").eq("user_id", user.id).maybeSingle();

      if (membershipError) throw membershipError;

      const currentCouple = membership?.couples || null;

      setCouple(currentCouple);

      if (currentCouple) {

        const { data: allLetters, error: lettersError } = await supabase

          .from("letters").select("*").eq("couple_id", currentCouple.id)

          .order("created_at", { ascending: false });

        if (lettersError) throw lettersError;

        setLetters(allLetters || []);

      } else {

        setLetters([]);

      }

    } catch (error) {

      setNotice(friendlyError(error));

    } finally {

      setBusy(false);

    }

  }, [session]);

  useEffect(() => { if (session?.user) loadWorkspace(); }, [session?.user?.id, loadWorkspace]);

  useEffect(() => {
    if (!session?.user || !("serviceWorker" in navigator) || !("Notification" in window) || !("PushManager" in window)) return;

    let mounted = true;

    async function checkSubscription() {
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();

        if (!mounted || !subscription) return;

        const { data, error } = await supabase.from("push_subscriptions")
          .select("endpoint")
          .eq("user_id", session.user.id)
          .eq("endpoint", subscription.endpoint)
          .maybeSingle();

        if (error) throw error;
        if (mounted) setNotificationsEnabled(Boolean(data));
      } catch (error) {
        if (mounted) setNotice(friendlyError(error));
      }
    }

    checkSubscription();
    return () => { mounted = false; };
  }, [session?.user?.id]);

  async function createCouple(event) {

    event.preventDefault();

    setBusy(true); setNotice("");

    try {

      const { data, error } = await supabase.rpc("create_couple", { couple_name: "Our little world" });

      if (error) throw error;

      setInviteCode(data);

      await loadWorkspace();

      setNotice("Your private space is ready. Share the invite code with your partner.");

    } catch (error) { setNotice(friendlyError(error)); }

    finally { setBusy(false); }

  }

  async function joinCouple(event) {

    event.preventDefault();

    setBusy(true); setNotice("");

    try {

      const { error } = await supabase.rpc("join_couple", { invite_code_input: inviteCode.trim().toUpperCase() });

      if (error) throw error;

      setInviteCode("");

      await loadWorkspace();

      setNotice("You're connected. Your shared little world is ready. 💗");

    } catch (error) { setNotice(friendlyError(error)); }

    finally { setBusy(false); }

  }

  async function saveLetter(event) {

    event.preventDefault();

    if (!couple) return;

    setBusy(true); setNotice("");

    try {

      const payload = {

        couple_id: couple.id,

        author_id: session.user.id,

        title: form.title.trim() || form.category,

        category: form.category,

        body: form.body.trim()

      };

      if (!payload.body) throw new Error("Write a little something first.");

      const { data, error } = await supabase.from("letters").insert(payload).select().single();

      if (error) throw error;

      let deliveryNotice = "";
      try {
        const { data: pushResult, error: pushError } = await supabase.functions.invoke("notify-letter", {
          body: { letterId: data.id }
        });
        if (pushError) {
          deliveryNotice = "Your letter was saved, but the notification could not be sent. Check the push-notification setup.";
        } else if (pushResult?.reason === "not_enabled") {
          deliveryNotice = "Your letter was saved. Your person needs to enable notifications on their device.";
        } else if (pushResult?.failed) {
          deliveryNotice = "Your letter was saved, but the notification could not be delivered.";
        }
      } catch {
        deliveryNotice = "Your letter was saved, but the notification could not be sent. Check the push-notification setup.";
      }

      setLetters((current) => [data, ...current]);

      setForm({ title: "", category: CATEGORIES[3], body: "" });

      setView("home");

      setNotice(deliveryNotice || "Your letter is tucked safely away. 💌");

    } catch (error) { setNotice(friendlyError(error)); }

    finally { setBusy(false); }

  }

  async function enableNotifications() {
    setBusy(true);
    setNotice("");

    try {
      const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
        || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const isStandalone = window.matchMedia("(display-mode: standalone)").matches
        || navigator.standalone === true;

      if (isIos && !isStandalone) {
        setNotice("On iPhone or iPad, add this site to your Home Screen from Safari, open it there, then enable notifications.");
        return;
      }
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setNotice("Push notifications are not supported by this browser. Try an up-to-date browser and, on iPhone or iPad, use the Home Screen app.");
        return;
      }

      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        setNotice("Push notifications are not configured yet. Add the VAPID public key to the app environment.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setNotice(permission === "denied"
          ? "Notifications are blocked in your browser settings. Allow them for this app, then try again."
          : "Notification permission was not granted.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const readyRegistration = await navigator.serviceWorker.ready;
      const existingSubscription = await readyRegistration.pushManager.getSubscription();
      const subscription = existingSubscription || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(vapidPublicKey)
      });

      const { error } = await supabase.from("push_subscriptions").upsert({
        user_id: session.user.id,
        endpoint: subscription.endpoint,
        subscription: subscription.toJSON()
      }, { onConflict: "endpoint" });
      if (error) throw error;

      setNotificationsEnabled(true);
      setNotice("Notifications are on for this device. 💌");
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function deleteLetter(letter) {

    if (!window.confirm("Delete this letter forever?")) return;

    const { error } = await supabase.from("letters").delete().eq("id", letter.id);

    if (error) setNotice(friendlyError(error));

    else {

      setLetters((current) => current.filter((item) => item.id !== letter.id));

      setActiveLetter(null); setView("home"); setNotice("Letter deleted.");

    }

  }

  const receivedLetters = useMemo(

    () => letters.filter((letter) => letter.author_id !== session?.user?.id),

    [letters, session?.user?.id]

  );

  const myLetters = useMemo(

    () => letters.filter((letter) => letter.author_id === session?.user?.id),

    [letters, session?.user?.id]

  );

  const filteredLetters = useMemo(() => {

    const base = view === "mine" ? myLetters : receivedLetters;

    return categoryFilter === "All" ? base : base.filter((l) => l.category === categoryFilter);

  }, [view, myLetters, receivedLetters, categoryFilter]);

  function openRandomLetter() {

    if (!receivedLetters.length) {

      setNotice("No letters from your person yet. Leave them one first. ❤️");

      return;

    }

    let choices = receivedLetters.filter((letter) => letter.id !== lastLetterId);

    if (!choices.length) choices = receivedLetters;

    const picked = choices[Math.floor(Math.random() * choices.length)];

    setLastLetterId(picked.id);

    setActiveLetter(picked);

    setEnvelopeOpening(true);

    setView("read");

    window.setTimeout(() => setEnvelopeOpening(false), 850);

  }

  function openLetter(letter) {

    setActiveLetter(letter);

    setView("read");

    setEnvelopeOpening(true);

    window.setTimeout(() => setEnvelopeOpening(false), 850);

  }

  async function copyInvite() {

    try {

      await navigator.clipboard.writeText(inviteCode);

      setNotice("Invite code copied.");

    } catch {

      setNotice(`Your invite code is ${inviteCode}. Copy it manually.`);

    }

  }

  if (!supabaseConfigured) return <SetupRequired />;

  if (authLoading) return <div className="center-screen"><div className="loader" /><p>Opening your little world…</p></div>;

  if (!session) return <main className="auth-shell">

    <div className="stars" />

    <section className="auth-card">

      <div className="brand-mark"><Mail size={28} /></div>

      <p className="eyebrow">A LITTLE PLACE FOR TWO</p>

      <h1>Letters for <em>Baby</em></h1>

      <p className="muted intro">Little words for the days you wish you were closer.</p>

      <div className="stack">

        <p className="muted">Opening your private guest session…</p>

        {authError && <p className="error-note">{authError}</p>}

        <button className="primary" onClick={async () => {

          setAuthError(""); setAuthLoading(true);

          const { data, error } = await supabase.auth.signInAnonymously();

          if (error) { setAuthError(`${friendlyError(error)} Enable Anonymous Sign-Ins in Supabase Authentication settings.`); setAuthLoading(false); }

          else setSession(data.session);

        }}>Try guest access again <Heart size={17} /></button>

      </div>

      <p className="tiny muted"><LockKeyhole size={13} /> Guest access uses a private Supabase session to protect your letters.</p>

    </section>

  </main>;

  return <main className="app-shell">

    <header className="topbar">
      <button className="wordmark" onClick={() => setView("home")}>
        <span className="mini-heart">♥</span> letters for baby
      </button>

      <div className="user-actions">
        <span className="user-email">Private guest session</span>
        {couple && <button
          className="secondary small mobile-icon-button"
          type="button"
          disabled={busy || notificationsEnabled}
          aria-label={notificationsEnabled ? "Notifications are enabled" : "Enable notifications"}
          title={notificationsEnabled ? "Notifications are enabled" : "Enable notifications"}
          onClick={enableNotifications}
        >
          <Bell size={14} /><span className="button-label">{notificationsEnabled ? "Notifications on" : "Enable notifications"}</span>
        </button>}
        <button
          className="secondary small mobile-icon-button"
          type="button"
          disabled={busy}
          aria-label="Start a new guest session"
          title="Start a new guest session"
          onClick={startNewSession}
        >
          <RotateCcw size={14} /><span className="button-label">New Session</span>
        </button>
      </div>
    </header>

    {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15}/></button></div>}

    {inviteCode && couple && (

  <div className="invite-banner">

    <span>

      Your invite code: <strong>{inviteCode}</strong>

    </span>

    <button

      type="button"

      className="secondary small"

      onClick={copyInvite}

    >

      <Copy size={14} /> Copy

    </button>

  </div>

)}

    {!couple ? <section className="pairing-layout">

      <div className="hero-copy">

        <p className="eyebrow">JUST US</p>

        <h1>A little world<br/>for <em>your words.</em></h1>

        <p className="muted">Your words means so much to me.</p>

        <div className="glow-envelope"><div className="envelope-shape"><Heart fill="currentColor" size={29}/></div><span>sealed with love</span></div>

      </div>

      <div className="pair-card">

        <h2>Make it yours</h2>

        <p className="muted">hit create and send me the code.</p>

        <form onSubmit={createCouple} className="stack">

          <button className="primary" disabled={busy}>Create our space <Heart size={16}/></button>

        </form>

        <div className="separator"><span>OR JOIN YOUR PERSON</span></div>

        <form onSubmit={joinCouple} className="stack">

          <label htmlFor="invite">Their invite code</label>

          <input id="invite" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} placeholder="E.G. A1B2C3D4" minLength={8} maxLength={8} required />

          <button className="secondary" disabled={busy}>Join our space <Heart size={16}/></button>

        </form>

        {inviteCode && inviteCode.length === 8 && <p className="tiny muted">If you created the space, your code is shown below after creation.</p>}

      </div>

    </section> : <>

      <section className="welcome">

        <div><p className="eyebrow">A NOTE FROM THE HEART</p><h1>Hi, {profile?.display_name?.trim() || "love"} <span className="pink">♡</span></h1><p className="muted">If I could be beside you, I would have thousand things to say... </p></div>

        <div className="welcome-sparkle"><Sparkles size={20}/><span>made for two</span></div>

      </section>

      <section className="feature-grid">

        <article className="feature-card random-card">

          <div className="card-topline"><span className="pill"><Sparkles size={12}/> A LITTLE SURPRISE</span><span className="card-heart"><Heart size={18}/></span></div>

          <div className={`big-envelope ${envelopeOpening ? "opening" : ""}`}><div className="envelope-back"/><div className="envelope-flap"/><div className="envelope-front"/><div className="seal"><Heart fill="currentColor" size={22}/></div><div className="letter-peek"/></div>

          <h2>Open a random letter</h2><p className="muted">Letters from the deepest corners of my heart which is only for my baby gem.</p>

          <button className="primary wide" onClick={openRandomLetter} disabled={!receivedLetters.length}><Mail size={17}/> {receivedLetters.length ? "Open my letter" : "Waiting for your first letter"}</button>

          <p className="tiny muted centered">{receivedLetters.length} {receivedLetters.length === 1 ? "letter" : "letters"} waiting for you</p>

        </article>

        <article className="feature-card write-card">

          <div className="icon-orb"><BookHeart size={22}/></div><p className="eyebrow">LEAVE A LITTLE LOVE</p><h2>Write a letter</h2>

          <p className="muted">Open up deeply to me. Your words are comforting and meaningful to me.</p>

          <button className="secondary wide" onClick={() => { setForm({ title: "", category: CATEGORIES[3], body: "" }); setView("write"); }}><Plus size={17}/> Write to my person</button>

          <div className="tiny-stat"><span><Mail size={14}/> Your letters</span><strong>{myLetters.length}</strong></div>

        </article>

      </section>

      <section className="letters-section">

        <div className="section-heading"><div><p className="eyebrow">TUCKED AWAY HERE</p><h2>Your little collection</h2></div><div className="tabs"><button className={view !== "mine" ? "tab active" : "tab"} onClick={() => {setView("home");setCategoryFilter("All");}}>From them</button><button className={view === "mine" ? "tab active" : "tab"} onClick={() => {setView("mine");setCategoryFilter("All");}}>From me</button></div></div>

        <div className="filter-row"><button className={categoryFilter === "All" ? "filter active" : "filter"} onClick={() => setCategoryFilter("All")}>All letters</button>{CATEGORIES.map((category) => <button key={category} className={categoryFilter === category ? "filter active" : "filter"} onClick={() => setCategoryFilter(category)}>{category}</button>)}</div>

        {filteredLetters.length ? <div className="letter-list">{filteredLetters.map((letter) => <button className="letter-row" key={letter.id} onClick={() => openLetter(letter)}><span className="row-envelope"><Mail size={19}/></span><span className="row-copy"><strong>{letter.title}</strong><small>{letter.category} · {new Date(letter.created_at).toLocaleDateString()}</small><span>{letter.body.slice(0, 96)}{letter.body.length > 96 ? "…" : ""}</span></span><span className="row-arrow">↗</span></button>)}</div> : <div className="empty-state"><div className="empty-icon"><Mail size={24}/></div><strong>No letters here yet</strong><p className="muted">{view === "mine" ? "Write the first little note for your person." : "Your person hasn't left a letter in this collection yet."}</p></div>}

      </section>

    </>}

    {view === "write" && <div className="modal-backdrop" role="presentation"><section className="letter-modal" role="dialog" aria-modal="true" aria-labelledby="write-title"><button className="modal-close" onClick={() => setView("home")} aria-label="Close"><X size={19}/></button><p className="eyebrow">SEALED WITH LOVE</p><h2 id="write-title">Write to your person</h2><p className="muted">It doesn't have to be perfect. It just has to be yours.</p><form className="stack" onSubmit={saveLetter}><label htmlFor="title">Letter title (optional)</label><input id="title" maxLength={80} placeholder="A little reminder…" value={form.title} onChange={(e) => setForm({...form, title:e.target.value})}/><label htmlFor="category">This letter is for…</label><select id="category" value={form.category} onChange={(e) => setForm({...form, category:e.target.value})}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select><label htmlFor="body">Your message</label><textarea id="body" required maxLength={5000} rows={8} placeholder="Hey baby… 💗" value={form.body} onChange={(e) => setForm({...form, body:e.target.value})}/><div className="form-foot"><span>{form.body.length}/5000</span><button className="primary" disabled={busy || !form.body.trim()}><Send size={16}/> Save letter</button></div></form></section></div>}

    {view === "read" && activeLetter && <div className="modal-backdrop" role="presentation"><section className="read-modal" role="dialog" aria-modal="true" aria-labelledby="letter-title"><button className="modal-close" onClick={() => setView("home")} aria-label="Close"><X size={19}/></button><button className="back-link" onClick={() => setView("home")}><ArrowLeft size={15}/> Back to our letters</button><div className={`read-envelope ${envelopeOpening ? "opening" : ""}`}><div className="read-paper"><Heart size={18} fill="currentColor"/><span>{activeLetter.category}</span></div><div className="read-envelope-front"/></div><p className="eyebrow centered">{activeLetter.author_id === session.user.id ? "A LETTER FROM YOU" : "A LETTER FROM YOUR PERSON"}</p><h2 id="letter-title">{activeLetter.title}</h2><p className="letter-date">{new Date(activeLetter.created_at).toLocaleDateString(undefined,{dateStyle:"long"})}</p><div className="letter-body">{activeLetter.body}</div><div className="signoff">with love, always <Heart size={15} fill="currentColor"/></div><div className="read-actions"><button className="secondary" onClick={() => {setView("home");setActiveLetter(null);}}><ArrowLeft size={15}/> Close letter</button>{activeLetter.author_id === session.user.id && <button className="danger-button" onClick={() => deleteLetter(activeLetter)}><Trash2 size={15}/> Delete</button>}</div></section></div>}

    <footer className="footer"><span>made with big love for my baby girl <Heart size={12} fill="currentColor"/></span><span>just US, always.</span></footer>

  </main>;

}

function base64UrlToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function SetupRequired() {

  return <main className="setup-screen"><div className="setup-card"><div className="brand-mark"><Mail size={26}/></div><p className="eyebrow">ONE LITTLE SETUP FIRST</p><h1>Let's connect your <em>love letters.</em></h1><p className="muted">This app needs a Supabase project. Create one, run the SQL in <code>supabase/schema.sql</code>, then add your project URL and publishable/anon key to a <code>.env</code> file.</p><ol><li>Create a project at <a href="https\://supabase.com/dashboard" target="_blank" rel="noreferrer">Supabase</a>.</li><li>Open SQL Editor and run <code>supabase/schema.sql</code>.</li><li>Copy <code>.env.example</code> to <code>.env</code> and fill in your Supabase URL and anon/publishable key.</li><li>Restart <code>npm run dev</code>.</li></ol><p className="tiny muted"><LockKeyhole size={13}/> Never put your Supabase service-role key in this frontend.</p></div></main>;

}