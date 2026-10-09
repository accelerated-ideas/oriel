import { BRAND } from "@/config/brand";
import { FACE_GLYPH, FACE_PILL_TILE, faceGlyphMouth, HIVE_GLYPH, HIVE_GLYPH_RADIUS } from "@/lib/widget/avatar-shapes";

// The launcher's face and hive, built from the same shapes the widget draws.
// The mouths go from closed to talking, for the face to speak while minimized.
function launcherAvatars() {
  const face =
    '<span class="face" aria-hidden="true"><svg viewBox="0 0 100 100">' +
    `<path class="tile" d="${FACE_PILL_TILE}"/><g class="eyes">` +
    FACE_GLYPH.eyes.map((eye) => `<rect x="${eye.x}" y="${eye.y}" width="${eye.width}" height="${eye.height}" rx="${eye.radius}"/>`).join("") +
    `</g><path class="mouth" d="${faceGlyphMouth(0)}" stroke-width="${FACE_GLYPH.mouthStroke}"/></svg></span>`;
  const hive =
    '<span class="hive" aria-hidden="true"><svg viewBox="0 0 100 100">' +
    HIVE_GLYPH.map((dot, index) => `<circle cx="${dot.x}" cy="${dot.y}" r="${index ? HIVE_GLYPH_RADIUS.ring : HIVE_GLYPH_RADIUS.center}"/>`).join("") +
    "</svg></span>";
  return {
    face,
    hive,
    mouths: Array.from({ length: 10 }, (_, step) => faceGlyphMouth(step / 9)),
    hiveBands: HIVE_GLYPH.map((dot) => dot.band),
    hiveRadius: HIVE_GLYPH_RADIUS,
  };
}

// The loader customers paste on their site. It draws the launcher in a shadow
// root, hosts the assistant iframe, and runs browser-side tools on the host
// page: navigation, pointing at elements, and actions the site registers.
//
//   <script src="https://APP/embed.js" data-agent-id="..." async></script>
//
//   window.Oriel("identify", { token })            // signed user JWT
//   window.Oriel("setNavigator", (url) => router.push(url))
//   window.Oriel("registerAction", "create_campaign", async (args) => ({ id }))
//   window.Oriel("open", { mode: "voice" | "text" }) / ("close")
//   window.Oriel("on", "navigate" | "action" | "open" | "close" | "call", cb)
export function buildEmbedScript(appOrigin: string) {
  const config = JSON.stringify({ appOrigin, global: BRAND.embedGlobal, prefix: BRAND.messagePrefix });
  const avatars = JSON.stringify(launcherAvatars());

  return `(function () {
  "use strict";
  var CONFIG = ${config};
  var AVATARS = ${avatars};
  if (window["__" + CONFIG.prefix + "_loaded"]) return;
  window["__" + CONFIG.prefix + "_loaded"] = true;

  var PREFIX = CONFIG.prefix;
  var APP = CONFIG.appOrigin;
  var store = {
    get: function (storage, key) { try { return JSON.parse(storage.getItem(PREFIX + ":" + key)); } catch (e) { return null; } },
    set: function (storage, key, value) { try { storage.setItem(PREFIX + ":" + key, JSON.stringify(value)); } catch (e) {} },
    del: function (storage, key) { try { storage.removeItem(PREFIX + ":" + key); } catch (e) {} }
  };
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "v" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  var state = {
    agentId: null, options: {}, identity: {}, navigator: null, actions: {}, listeners: {},
    open: false, iframe: null, ready: false, pendingInit: null, mode: "voice", resume: null,
    pageKey: null, callActive: false, callPaused: false
  };

  function emit(event, payload) {
    (state.listeners[event] || []).forEach(function (cb) { try { cb(payload); } catch (e) { console.error(e); } });
  }

  function visitorId() {
    var id = store.get(localStorage, "vid");
    if (!id) { id = uid(); store.set(localStorage, "vid", id); }
    return id;
  }

  function conversationKey() { return "conv:" + state.agentId; }

  function pageInfo() {
    var root = document.querySelector("main, [role=main]") || document.body;
    var text = "";
    try { text = (root.innerText || "").replace(/\\n{3,}/g, "\\n\\n").slice(0, 8000); } catch (e) {}
    var links = [];
    try { links = pageLinks(root); } catch (e) {}
    return { url: location.href, title: document.title, text: text, links: links, referrer: document.referrer || null };
  }

  // Text on one line with single spaces.
  function oneLine(text) {
    var out = String(text || "");
    ["\\n", "\\r", "\\t", "\\u00a0"].forEach(function (space) { out = out.split(space).join(" "); });
    return out.split(" ").filter(Boolean).join(" ");
  }

  // Where the visible links on the page go, so the assistant can open an item
  // listed there (a row in a list, a result) that isn't in the site map.
  function pageLinks(root) {
    var links = [], seen = {};
    var here = location.pathname + location.search;
    var anchors = root.querySelectorAll("a[href]");
    for (var i = 0; i < anchors.length && links.length < 40; i++) {
      var a = anchors[i], url;
      try { url = new URL(a.getAttribute("href"), location.href); } catch (e) { continue; }
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      var target = url.origin === location.origin ? url.pathname + url.search : url.href;
      if (target === here || seen[target] || !a.getClientRects().length) continue;
      var label = oneLine(a.innerText || a.getAttribute("aria-label") || a.title).slice(0, 80);
      if (!label) continue;
      seen[target] = true;
      links.push({ text: label, url: target.slice(0, 500) });
    }
    return links;
  }

  // ---------- UI ----------
  var host = document.createElement("div");
  host.setAttribute("data-" + PREFIX + "-widget", "");
  host.style.cssText = "position:fixed;z-index:2147483000;inset:auto;";
  var root = host.attachShadow({ mode: "open" });
  var accent = "#6352F2";
  var look = "orb";

  // Figtree, served from our own origin (no third-party font requests on the
  // customer's site). Declared on the page because fonts don't load from
  // inside a shadow root; the family name is ours alone.
  if (!document.getElementById(PREFIX + "-font")) {
    var fontStyle = document.createElement("style");
    fontStyle.id = PREFIX + "-font";
    fontStyle.textContent = "@font-face{font-family:'" + PREFIX + "-figtree';src:url(" + APP + "/fonts/figtree-latin.woff2) format('woff2');font-weight:300 900;font-display:swap}";
    (document.head || document.documentElement).appendChild(fontStyle);
  }

  // Dark or light icon on the orb, whichever reads better on the assistant's color.
  function onAccent(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
    if (!m) return "#ffffff";
    var lum = [m[1], m[2], m[3]].map(function (part) {
      var c = parseInt(part, 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2] > 0.3 ? "#18181b" : "#ffffff";
  }

  // The hive's dots sit on the near-black pill: very dark colors are lifted so they show.
  function markOnDark(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
    if (!m) return hex;
    var rgb = [m[1], m[2], m[3]].map(function (part) { return parseInt(part, 16); });
    var lum = rgb.map(function (value) {
      var c = value / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    if (0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2] >= 0.06) return hex;
    return "rgb(" + rgb.map(function (value) { return Math.round(value + (255 - value) * 0.7); }).join(",") + ")";
  }

  var EASE = "cubic-bezier(.2,0,0,1)";
  // Same three layers on the launcher and the panel, so the morph blends between them.
  var PILL_SHADOW = "0 0 0 1px rgba(0,0,0,.08),0 4px 8px -2px rgba(0,0,0,.12),0 16px 32px -8px rgba(0,0,0,.32)";
  var PANEL_SHADOW = "0 0 0 1px rgba(0,0,0,.06),0 8px 16px -4px rgba(0,0,0,.08),0 32px 72px -16px rgba(0,0,0,.32)";
  var css = ""
    + ":host{all:initial}"
    + "*{box-sizing:border-box;font-family:'" + PREFIX + "-figtree',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}"
    + ".dock{position:fixed;bottom:20px;display:flex;align-items:center;gap:10px;z-index:2147483001;transition:opacity .2s ease-out,translate .2s ease-out}"
    + ".dock.right{right:20px}.dock.left{left:20px;flex-direction:row-reverse}.dock.center{left:50%;translate:-50% 0}"
    + ".dock.hidden{opacity:0;pointer-events:none;transition:none}"
    // The main pill: near-black, with a glossy orb in the assistant's color.
    + ".talk{all:unset;cursor:pointer;display:flex;align-items:center;gap:10px;height:52px;padding:0 20px 0 6px;border-radius:999px;background:#09090b;color:#fff;font-size:15px;font-weight:600;letter-spacing:-.005em;"
    + "box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 0 0 1px rgba(0,0,0,.08),0 4px 8px -2px rgba(0,0,0,.12),0 16px 32px -8px rgba(0,0,0,.32);transition:translate .2s " + EASE + ",scale .15s ease-out,box-shadow .2s ease-out}"
    + ".talk:hover{translate:0 -1px;box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 0 0 1px rgba(0,0,0,.08),0 6px 12px -2px rgba(0,0,0,.14),0 20px 40px -8px rgba(0,0,0,.36)}"
    + ".talk:active,.type:active{scale:.96}"
    + ".talk:focus-visible,.type:focus-visible{outline:2px solid var(--accent);outline-offset:3px}"
    + ".orb{position:relative;width:40px;height:40px;border-radius:999px;display:grid;place-items:center;color:var(--on-accent)}"
    + ".orb::before{content:'';position:absolute;inset:-3px;border-radius:999px;background:var(--accent);filter:blur(8px);opacity:.55;animation:breathe 3.2s ease-in-out infinite}"
    + ".orb::after{content:'';position:absolute;inset:0;border-radius:999px;box-shadow:inset 0 -3px 6px rgba(0,0,0,.2);"
    + "background:radial-gradient(circle at 32% 26%,rgba(255,255,255,.85) 0%,rgba(255,255,255,0) 36%),radial-gradient(circle at 74% 78%,color-mix(in oklch,var(--accent) 62%,#09090b) 0%,transparent 62%),var(--accent)}"
    + ".orb svg{position:relative;z-index:1;width:18px;height:18px}"
    // Audio-wave icon. Still, except while the assistant speaks during a minimized call.
    + ".wave{position:relative;z-index:1;display:flex;align-items:center;gap:2px;height:18px}"
    + ".wave i{display:block;width:2px;border-radius:2px;background:currentColor;transition:height .1s linear}"
    + ".wave i:nth-child(1){height:5px}.wave i:nth-child(2){height:9px}.wave i:nth-child(3){height:14px}.wave i:nth-child(4){height:18px}"
    + ".wave i:nth-child(5){height:12px}.wave i:nth-child(6){height:8px}.wave i:nth-child(7){height:5px}"
    + ".talk.live .orb{--accent:#059669;--on-accent:#fff}"
    + ".talk.live .orb::before{animation:live 1.6s ease-out infinite}"
    // The face: smaller than the orb, with a rounder tile than elsewhere to suit the pill.
    + ".face{position:relative;display:block;flex:none;width:32px;height:32px;margin:0 4px}"
    + ".hive{position:relative;display:block;flex:none;width:40px;height:40px}"
    + ".face svg,.hive svg{position:relative;z-index:1;display:block;width:100%;height:100%;overflow:visible}"
    + ".face .tile{fill:var(--accent)}.face rect{fill:var(--on-accent)}.face .mouth{fill:var(--on-accent);stroke:var(--on-accent);stroke-linejoin:round}"
    + ".face .eyes{transform-box:fill-box;transform-origin:center;animation:blink 5.2s ease-in-out infinite}"
    + ".hive circle{fill:var(--mark);transform-box:fill-box;transform-origin:center;animation:hum 3.2s ease-in-out infinite}"
    + ".hive circle+circle{opacity:.82;animation-delay:.3s}"
    + ".talk.speaking .hive circle{animation:none}"
    + ".talk.live .face,.talk.live .hive{--accent:#059669;--on-accent:#fff;--mark:#10b981}"
    + ".talk.live .face::before,.talk.live .hive::before{content:'';position:absolute;inset:-2px;border-radius:999px;background:var(--accent);filter:blur(8px);animation:live 1.6s ease-out infinite}"
    + ".type{all:unset;cursor:pointer;width:44px;height:44px;border-radius:999px;display:grid;place-items:center;background:#fff;color:#18181b;"
    + "box-shadow:0 0 0 1px rgba(0,0,0,.06),0 2px 4px -1px rgba(0,0,0,.06),0 10px 24px -8px rgba(0,0,0,.22);transition:translate .2s " + EASE + ",scale .15s ease-out,background-color .15s ease-out}"
    + ".type:hover{translate:0 -1px;background:#fafafa}"
    + ".type svg{width:18px;height:18px}"
    + ".panel{position:fixed;bottom:20px;width:400px;height:min(660px,calc(100vh - 40px));border-radius:24px;overflow:hidden;background:#fff;"
    + "box-shadow:" + PANEL_SHADOW + ";visibility:hidden;pointer-events:none;z-index:2147483002}"
    + ".panel.right{right:20px}.panel.left{left:20px}.panel.center{left:calc(50% - 200px)}"
    + ".panel.open{visibility:visible;pointer-events:auto}"
    + ".panel.fade{animation:panelfade .18s ease-out}"
    + ".panel iframe{width:100%;height:100%;border:0;display:block;background:#fff}"
    + "@keyframes panelfade{from{opacity:0}to{opacity:1}}"
    + "@media (max-width:520px){.panel,.panel.center{inset:0;width:100%;height:100%;border-radius:0}.dock{bottom:16px}.dock.right{right:16px}.dock.left{left:16px}}"
    + ".ring{position:fixed;pointer-events:none;border-radius:10px;border:2.5px solid var(--accent);box-shadow:0 0 0 6px color-mix(in srgb,var(--accent) 20%,transparent);opacity:0;transition:opacity .25s ease-out;z-index:2147483000}"
    + ".origin{position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none}"
    + ".ring.on{opacity:1;animation:pulse 1.2s ease-in-out 3}"
    + "@keyframes breathe{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.08);opacity:.7}}"
    + "@keyframes live{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.45);opacity:0}}"
    + "@keyframes blink{0%,94%,100%{transform:scaleY(1)}97%{transform:scaleY(.1)}}"
    + "@keyframes hum{0%,100%{transform:scale(1)}50%{transform:scale(.84)}}"
    + "@keyframes pulse{0%,100%{box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 28%,transparent)}50%{box-shadow:0 0 0 12px color-mix(in srgb,var(--accent) 0%,transparent)}}"
    + "@media (prefers-reduced-motion:reduce){.orb::before,.ring.on,.face .eyes,.hive circle,.talk.live .face::before,.talk.live .hive::before{animation:none}}";

  var WAVE = '<span class="wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>';
  // Which voice band (low to high) each bar shows: the strongest, about 330–540 Hz, in the middle.
  var WAVE_ORDER = [5, 3, 1, 2, 0, 4, 6];
  var KEYS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M8 16h8"/></svg>';

  var styleEl = document.createElement("style");
  var dock = document.createElement("div");
  var talkButton = document.createElement("button");
  var typeButton = document.createElement("button");
  var panel = document.createElement("div");
  var ring = document.createElement("div");
  ring.className = "ring";
  var origin = document.createElement("div");
  origin.className = "origin";

  function render(config) {
    var side = config.launcherPosition === "left" || config.launcherPosition === "center" ? config.launcherPosition : "right";
    accent = config.accentColor || accent;
    look = config.avatarStyle === "face" || config.avatarStyle === "hive" ? config.avatarStyle : "orb";
    host.style.setProperty("--accent", accent);
    host.style.setProperty("--on-accent", onAccent(accent));
    host.style.setProperty("--mark", markOnDark(accent));
    styleEl.textContent = css;
    dock.className = "dock " + side + (state.open ? " hidden" : "");
    panel.className = "panel " + side + (state.open ? " open" : "");
    talkButton.type = "button";
    talkButton.innerHTML = (look === "orb" ? '<span class="orb">' + WAVE + "</span>" : AVATARS[look]) + "<span></span>";
    showCallState(config);
    talkButton.setAttribute("aria-label", (config.launcherLabel || "Ask anything") + " — start a voice call");
    typeButton.className = "type";
    typeButton.type = "button";
    typeButton.innerHTML = KEYS;
    typeButton.setAttribute("aria-label", "Type instead");
    typeButton.title = "Type instead";
    typeButton.style.display = config.textModeEnabled === false ? "none" : "";
    if (config.voiceEnabled === false) {
      talkButton.setAttribute("aria-label", config.launcherLabel || "Ask anything");
    }
  }

  // Live call, minimized: the avatar follows the assistant's voice (bands,
  // each 0–1) while it speaks: the orb's bars, the face's mouth, the hive's
  // dots. Otherwise they keep their still shapes.
  function setWave(bands) {
    var animate = state.callActive && !state.callPaused && !!bands && !reducedMotion();
    var band = function (index) { return animate ? Math.max(0, Math.min(1, Number(bands[index]) || 0)) : 0; };
    talkButton.classList.toggle("speaking", animate);
    var mouth = talkButton.querySelector(".mouth");
    if (mouth) {
      var open = Math.min(1, ((band(1) + band(2) + band(3)) / 3) * 1.6);
      mouth.setAttribute("d", AVATARS.mouths[Math.round(open * (AVATARS.mouths.length - 1))]);
    }
    var dots = talkButton.querySelectorAll(".hive circle");
    for (var d = 0; d < dots.length; d++) {
      var radius = animate
        ? 7 + band(AVATARS.hiveBands[d]) * (AVATARS.hiveRadius.speaking - 7)
        : d ? AVATARS.hiveRadius.ring : AVATARS.hiveRadius.center;
      dots[d].setAttribute("r", String(radius));
    }
    var wave = talkButton.querySelector(".wave");
    if (!wave) return;
    var bars = wave.children;
    for (var i = 0; i < bars.length; i++) {
      bars[i].style.height = animate ? (3 + band(WAVE_ORDER[i]) * 15).toFixed(1) + "px" : "";
    }
  }

  // The launcher turns green during a call, and asks for a click when the
  // browser held back the call's audio after a page load.
  function showCallState(config) {
    var label = ((config || state.config || {}).launcherLabel) || "Ask anything";
    talkButton.className = state.callActive ? "talk live" : "talk";
    talkButton.lastChild.textContent = state.callPaused ? "Continue call" : state.callActive ? "Back to call" : label;
    setWave(null);
  }

  // A call carries on across full page loads: the assistant moving the page
  // (with its navigate call) or the visitor clicking around while it's minimized.
  function rememberCall(toolCallId, mode) {
    store.set(sessionStorage, "resume:" + state.agentId, { toolCallId: toolCallId || null, mode: mode || state.mode, open: state.open, at: Date.now() });
  }
  window.addEventListener("pagehide", function () {
    if (!state.agentId || !state.callActive) return;
    // Already remembered when the assistant is the one moving the page.
    if (!store.get(sessionStorage, "resume:" + state.agentId)) rememberCall(null, "voice");
  });
  window.addEventListener("pageshow", function (event) {
    // Back from the back/forward cache with the call still here.
    if (event.persisted && state.agentId) store.del(sessionStorage, "resume:" + state.agentId);
  });

  talkButton.addEventListener("click", function () {
    state.morphFrom = talkButton;
    api.open({ mode: state.config && state.config.voiceEnabled === false ? "text" : "voice" });
  });
  typeButton.addEventListener("click", function () {
    state.morphFrom = typeButton;
    api.open({ mode: "text" });
  });

  // ---------- open / close: the launcher morphs into the panel and back ----------
  var morphing = null;
  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function box(el) {
    var r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }
  function frame(rect, radius, shadow) {
    return {
      left: rect.left + "px", top: rect.top + "px", width: rect.width + "px", height: rect.height + "px",
      borderRadius: radius + "px", boxShadow: shadow
    };
  }
  // Grows the panel out of the button it was opened from (or shrinks it back).
  // The panel's content keeps its final size, pinned to the launcher's corner,
  // and fades in once the shape has mostly formed.
  function morph(opening, done) {
    if (morphing) { morphing.forEach(function (a) { a.cancel(); }); morphing = null; }
    var from = state.morphFrom || talkButton;
    var iframe = state.iframe;
    if (!panel.animate || reducedMotion() || !from.getClientRects().length) {
      if (opening) { panel.className = panel.className.replace(" fade", "") + " fade"; }
      done();
      return;
    }
    var pill = box(from);
    var full = box(panel);
    if (!full.width || !pill.width) { done(); return; }
    var pillBackground = getComputedStyle(from).backgroundColor;
    var start = frame(pill, pill.height / 2, PILL_SHADOW);
    var end = frame(full, parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 0, PANEL_SHADOW);
    var side = panel.className.indexOf(" left") >= 0 ? "left" : panel.className.indexOf(" center") >= 0 ? "center" : "right";

    panel.style.right = "auto";
    panel.style.bottom = "auto";
    if (iframe) {
      iframe.style.position = "absolute";
      iframe.style.width = full.width + "px";
      iframe.style.height = full.height + "px";
      iframe.style.bottom = "0";
      if (side === "left") iframe.style.left = "0";
      else if (side === "center") { iframe.style.left = "50%"; iframe.style.translate = "-50% 0"; }
      else iframe.style.right = "0";
    }
    var duration = opening ? 460 : 340;
    var timing = { duration: duration, easing: EASE, fill: "forwards" };
    // The color settles early, so the shape grows as a white panel rather than a grey slab.
    var paint = opening
      ? [{ backgroundColor: pillBackground }, { backgroundColor: "#ffffff", offset: 0.35 }, { backgroundColor: "#ffffff" }]
      : [{ backgroundColor: "#ffffff" }, { backgroundColor: "#ffffff", offset: 0.65 }, { backgroundColor: pillBackground }];
    var shape = panel.animate(opening ? [start, end] : [end, start], timing);
    morphing = [shape, panel.animate(paint, { duration: duration, easing: "linear", fill: "forwards" })];
    if (iframe) {
      iframe.animate(
        opening ? [{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0, offset: 0.3 }, { opacity: 0 }],
        { duration: duration, easing: "linear", fill: "forwards" }
      );
    }
    var running = morphing;
    shape.onfinish = function () {
      if (morphing !== running) return;
      morphing = null;
      done();
      running.forEach(function (a) { a.cancel(); });
      panel.style.right = panel.style.bottom = "";
      if (iframe) {
        iframe.getAnimations().forEach(function (a) { a.cancel(); });
        iframe.style.position = iframe.style.width = iframe.style.height = "";
        iframe.style.left = iframe.style.right = iframe.style.bottom = iframe.style.translate = "";
      }
    };
  }

  function mount() {
    root.appendChild(styleEl);
    dock.appendChild(typeButton);
    dock.appendChild(talkButton);
    root.appendChild(dock);
    root.appendChild(panel);
    root.appendChild(ring);
    root.appendChild(origin);
    (document.body || document.documentElement).appendChild(host);
  }

  // ---------- iframe bridge ----------
  function post(type, payload) {
    if (!state.iframe || !state.iframe.contentWindow) return;
    state.iframe.contentWindow.postMessage({ source: PREFIX + "-host", type: type, payload: payload }, APP);
  }

  function ensureIframe() {
    if (state.iframe) return;
    var iframe = document.createElement("iframe");
    var url = new URL(APP + "/widget/" + encodeURIComponent(state.agentId));
    url.searchParams.set("origin", location.origin);
    iframe.src = url.toString();
    iframe.title = "Assistant";
    iframe.allow = "microphone; autoplay; clipboard-write";
    panel.appendChild(iframe);
    state.iframe = iframe;
  }

  function sendInit() {
    var conv = store.get(localStorage, conversationKey());
    post("init", {
      visitorId: visitorId(),
      conversationId: conv && conv.id,
      page: pageInfo(),
      identity: state.identity,
      mode: state.mode,
      autostart: true,
      resume: state.resume,
      open: state.open,
      preview: !!state.options.preview,
      // Answers "page-request" with the page as it is right now.
      pageSnapshots: true
    });
    state.resume = null;
  }

  function toolReply(requestId, ok, output) {
    var text = typeof output === "string" ? output : JSON.stringify(output === undefined ? "done" : output);
    post("tool-result", { requestId: requestId, ok: ok, output: (text || "").slice(0, 4000) });
  }

  // ---------- pointing at things ----------
  // Words that describe an element rather than appear in it ("the messages box").
  var DESCRIBING = /^(the|a|an|of|my|your|this|that|number|count|total|box|card|tile|section|panel|area|field|button|link|tab|value|amount|here)$/;
  // Asking for a box rather than a control: "the messages box" means the card, not the menu link.
  var BOXY = /(^| )(box|card|tile|section|panel|area|number|count|total|value|amount)( |$)/;
  var CONTROLS = "button, a, [role=button], [role=link], [role=tab], [role=menuitem], [role=option], [role=switch], [role=checkbox], [role=radio], input, select, textarea, label, summary";
  var SKIP_TEXT = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TEXTAREA|OPTION)$/;
  // Too common to look for text by.
  var FILLER = /^(to|in|on|at|for|and|or|with|from|by|is|it|as|be)$/;
  var TEXT_TAGS = /^(P|SPAN|STRONG|B|EM|I|SMALL|LABEL|H1|H2|H3|H4|H5|H6|DT|DD)$/;
  var WORD_CHAR = /[\\p{L}\\p{N}]/u;
  var RING_MS = 4800;
  var GLIDE_MS = 280;
  var reduceMotion = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  function norm(text) { return String(text || "").replace(/\\s+/g, " ").trim().toLowerCase(); }

  // Up the tree, stepping out of shadow roots.
  function parentOf(node) { return node.parentElement || (node.parentNode && node.parentNode.host) || null; }

  // What the assistant asked for, in the forms it's compared in.
  function wantedFrom(label) {
    var full = norm(label).replace(/^["'“‘(\\[]+|["'”’)\\].,:;!?]+$/g, "");
    var words = full.split(" ").filter(function (word) { return word && !DESCRIBING.test(word); });
    var core = words.join(" ");
    return { full: full, core: core, words: words, squashed: (core || full).replace(/ /g, ""), boxy: BOXY.test(full) };
  }

  function wordAt(text, needle, index) {
    return !WORD_CHAR.test(text.charAt(index - 1)) && !WORD_CHAR.test(text.charAt(index + needle.length));
  }

  function hasWords(text, needle) {
    for (var i = text.indexOf(needle); i > -1; i = text.indexOf(needle, i + 1)) if (wordAt(text, needle, i)) return true;
    return false;
  }

  // 5 is the same text, 4 starts with it, 3 has it as whole words, 2 has it
  // inside other text (or without spaces), 1 has all its words somewhere.
  function matchScore(text, wanted) {
    if (!text) return 0;
    var squashed = text.replace(/ /g, "");
    if (text === wanted.full || text === wanted.core || squashed === wanted.squashed) return 5;
    var needles = wanted.core && wanted.core !== wanted.full ? [wanted.full, wanted.core] : [wanted.full];
    for (var i = 0; i < needles.length; i++) if (text.indexOf(needles[i]) === 0 && wordAt(text, needles[i], 0)) return 4;
    for (i = 0; i < needles.length; i++) if (hasWords(text, needles[i])) return 3;
    if (squashed.indexOf(wanted.squashed) > -1) return 2;
    return wanted.words.length && wanted.words.every(function (word) { return text.indexOf(word) > -1; }) ? 1 : 0;
  }

  function isFixed(el) {
    for (var node = el, depth = 0; node && depth < 40; node = parentOf(node), depth++) {
      if (node.nodeType === 1 && getComputedStyle(node).position === "fixed") return true;
    }
    return false;
  }

  // Off screen but within what its scrolling area (or the page) can scroll to,
  // unlike something parked at left: -9999px.
  function reachable(el, rect) {
    for (var node = parentOf(el); node && node.nodeType === 1 && node !== document.documentElement; node = parentOf(node)) {
      var style = getComputedStyle(node);
      if (!/(auto|scroll|hidden)/.test(style.overflowX + style.overflowY)) continue;
      var c = node.getBoundingClientRect();
      var top = rect.top - c.top + node.scrollTop, left = rect.left - c.left + node.scrollLeft;
      return top + rect.height > 0 && left + rect.width > 0 && top < node.scrollHeight && left < node.scrollWidth;
    }
    var page = document.documentElement;
    return rect.bottom + scrollY > 0 && rect.right + scrollX > 0 && rect.top + scrollY < page.scrollHeight && rect.left + scrollX < page.scrollWidth;
  }

  // On screen or reachable by scrolling, and not hidden, see-through,
  // screen-reader-only, or a closed drawer parked off the side.
  function shown(el) {
    var rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return false;
    if (el.checkVisibility) {
      if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    } else {
      var style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.opacity === "0") return false;
    }
    // Cut off by something that doesn't scroll (a collapsed menu or accordion).
    var clips = clippersOf(el);
    for (var i = 0; i < clips.length; i++) {
      var clip = getComputedStyle(clips[i]);
      if (/(auto|scroll)/.test(clip.overflowX + clip.overflowY)) continue;
      var c = clips[i].getBoundingClientRect();
      if (Math.min(rect.right, c.right) - Math.max(rect.left, c.left) < 4 || Math.min(rect.bottom, c.bottom) - Math.max(rect.top, c.top) < 4) return false;
    }
    if (inViewport(rect)) return true;
    return !isFixed(el) && reachable(el, rect);
  }

  function inViewport(rect) {
    return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
  }

  function painted(color) {
    return !!color && color !== "transparent" && !/^rgba\\(.*,\\s*0\\)$/.test(color) && !/\\/\\s*0\\)$/.test(color);
  }

  // Looks like a box: filled, outlined on two or more sides, or with a shadow.
  function boxed(style) {
    if (painted(style.backgroundColor) || style.backgroundImage !== "none") return true;
    var shadow = style.boxShadow === "none" ? "" : style.boxShadow.replace(/rgba\\([^)]*,\\s*0\\)|transparent|[a-z]+\\([^)]*\\/\\s*0\\)/g, "");
    if (/[a-z]+\\(/.test(shadow)) return true;
    var sides = 0;
    ["Top", "Right", "Bottom", "Left"].forEach(function (side) {
      if (parseFloat(style["border" + side + "Width"]) > 0 && style["border" + side + "Style"] !== "none" && painted(style["border" + side + "Color"])) sides++;
    });
    return sides >= 2;
  }

  // One of several alike items (rows in a list, cards in a grid).
  function repeated(node) {
    var parent = node.parentElement;
    if (!parent || TEXT_TAGS.test(node.tagName)) return false;
    var alike = 0;
    for (var child = parent.firstElementChild; child; child = child.nextElementSibling) {
      if (child.tagName === node.tagName && child.className === node.className) alike++;
    }
    return alike >= 3;
  }

  // Plain text usually sits in a card, tile or row: point at that whole box,
  // as long as it isn't a big chunk of the page.
  function boxAround(el) {
    var limit = innerWidth * innerHeight * 0.4;
    for (var node = el, depth = 0; node && node !== document.body && node.nodeType === 1 && depth < 6; node = parentOf(node), depth++) {
      var rect = node.getBoundingClientRect();
      if (rect.width * rect.height > limit) break;
      if (/^(LI|TR|ARTICLE|FIGURE|FIELDSET|BUTTON|A)$/.test(node.tagName)) return node;
      if (boxed(getComputedStyle(node)) || repeated(node)) return node;
    }
    return el;
  }

  // A label points at its field when the field takes text.
  function fieldFor(el) {
    var field = el.tagName === "LABEL" && el.control;
    if (field && !/^(checkbox|radio)$/.test(field.type) && shown(field)) return field;
    return el;
  }

  // Its text without what can't be seen (a closed menu or a skip link inside it).
  function visibleText(el, isShown) {
    var parts = [];
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (var node = walker.nextNode(); node; node = walker.nextNode()) {
      var parent = node.parentElement;
      if (parent && !SKIP_TEXT.test(parent.tagName) && isShown(parent)) parts.push(node.nodeValue);
    }
    return norm(parts.join(""));
  }

  // The page, plus any open shadow roots in it (web components), but not ours.
  function searchRoots() {
    var roots = [document];
    for (var i = 0; i < roots.length; i++) {
      var all = roots[i].querySelectorAll("*");
      for (var j = 0; j < all.length; j++) if (all[j].shadowRoot && all[j] !== host) roots.push(all[j].shadowRoot);
    }
    return roots;
  }

  // Finds what the assistant means by a label: a control by its name, or the
  // smallest piece of visible text that matches (a number, a status, a card's
  // title) and the box around it. Better matches win, then what's already on
  // screen, then controls (or boxes, when it asked for a box), then the most specific.
  function findTarget(label) {
    var wanted = wantedFrom(label);
    if (!wanted.full) return null;
    var best = null;
    var visible = new Map();
    var isShown = function (el) {
      if (!visible.has(el)) visible.set(el, shown(el));
      return visible.get(el);
    };
    var consider = function (el, text, control) {
      var score = matchScore(text, wanted);
      if (!score || (best && score < best.score) || !isShown(el)) return;
      if (!control) {
        text = visibleText(el, isShown);
        score = matchScore(text, wanted);
        if (!score || (best && score < best.score)) return;
      }
      var candidate = { el: el, score: score, control: control, inView: inViewport(el.getBoundingClientRect()), length: text.length };
      if (!best || candidate.score > best.score) { best = candidate; return; }
      if (candidate.inView !== best.inView) { if (candidate.inView) best = candidate; return; }
      if (candidate.control !== best.control) { if (candidate.control !== wanted.boxy) best = candidate; return; }
      if (candidate.length < best.length) best = candidate;
    };
    var roots = searchRoots();
    var needles = wanted.words.filter(function (word) { return !FILLER.test(word); });
    if (!needles.length) needles = wanted.words.length ? wanted.words : [wanted.full];
    var seen = new Set();
    for (var r = 0; r < roots.length; r++) {
      var controls = roots[r].querySelectorAll(CONTROLS);
      for (var i = 0; i < controls.length; i++) {
        var control = controls[i];
        consider(control, norm(control.getAttribute("aria-label") || control.innerText || control.value || control.placeholder || control.title), true);
      }
      // Text: start from text nodes with one of the words, and try them and a few levels up.
      var start = roots[r] === document ? document.body : roots[r];
      if (!start) continue;
      var walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT);
      for (var node = walker.nextNode(); node; node = walker.nextNode()) {
        var parent = node.parentElement;
        if (!parent || SKIP_TEXT.test(parent.tagName)) continue;
        var value = norm(node.nodeValue);
        if (!value || !needles.some(function (needle) { return value.indexOf(needle) > -1; })) continue;
        if (!isShown(parent)) continue;
        for (var el = parent, depth = 0; el && depth < 5 && el !== document.body && el !== host; el = el.parentElement, depth++) {
          if (seen.has(el)) continue;
          seen.add(el);
          var text = norm(el.textContent);
          if (text.length > 300) break;
          // Controls were weighed by their names above.
          if (!el.matches(CONTROLS)) consider(el, text, false);
        }
      }
    }
    if (!best) return null;
    return best.control ? fieldFor(best.el) : boxAround(best.el);
  }

  // Ancestors that clip it (scrolling areas, overflow: hidden), skipping
  // those an absolutely or fixed positioned element escapes.
  function clippersOf(el) {
    var list = [];
    var position = getComputedStyle(el).position;
    for (var node = parentOf(el); node && node.nodeType === 1 && node !== document.body && node !== document.documentElement; node = parentOf(node)) {
      if (position === "fixed") break;
      var style = getComputedStyle(node);
      if (position === "absolute" && style.position === "static" && style.transform === "none") continue;
      if (style.overflowX !== "visible" || style.overflowY !== "visible") list.push(node);
      position = style.position;
    }
    return list;
  }

  // The part of it that can be seen right now, or null.
  function visibleBox(el, clips) {
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    var box = { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
    var cut = function (c) {
      box.top = Math.max(box.top, c.top); box.left = Math.max(box.left, c.left);
      box.right = Math.min(box.right, c.right); box.bottom = Math.min(box.bottom, c.bottom);
    };
    for (var i = 0; i < clips.length; i++) cut(clips[i].getBoundingClientRect());
    cut({ top: 0, left: 0, right: innerWidth, bottom: innerHeight });
    return box.right - box.left >= 2 && box.bottom - box.top >= 2 ? box : null;
  }

  // Mostly out of sight, or under something like a sticky header.
  function needsScroll(el, clips) {
    var box = visibleBox(el, clips);
    if (!box) return true;
    var r = el.getBoundingClientRect();
    var enough = Math.min(r.width * r.height, innerWidth * innerHeight * 0.5) * 0.6;
    if ((box.right - box.left) * (box.bottom - box.top) < enough) return true;
    var scope = el.getRootNode && el.getRootNode().elementFromPoint ? el.getRootNode() : document;
    var hit = scope.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2);
    return !!hit && hit !== host && !el.contains(hit) && !hit.contains(el);
  }

  // The ring follows its element every frame (scrolling, layout changes, the
  // page re-rendering it) and glides over when it moves to something else.
  var pointing = null;

  function hideRing() {
    if (pointing) cancelAnimationFrame(pointing.frame);
    pointing = null;
    ring.className = "ring";
  }

  function pulseRing() {
    ring.className = "ring";
    void ring.offsetWidth;
    ring.className = "ring on";
  }

  function pointAt(el, label) {
    var now = performance.now();
    if (pointing && pointing.el === el) {
      // Mentioned again: keep showing it, without scrolling again.
      if (pointing.shownAt) { pointing.until = now + RING_MS; pulseRing(); }
      return;
    }
    var from = pointing && pointing.drawn;
    if (pointing) cancelAnimationFrame(pointing.frame);
    var clips = clippersOf(el);
    if (needsScroll(el, clips)) {
      var tall = el.getBoundingClientRect().height > innerHeight * 0.7;
      el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: tall ? "start" : "center", inline: "nearest" });
    }
    pointing = { el: el, label: label, clips: clips, from: from, start: now, shownAt: 0, until: 0, drawn: null, lookedAt: 0, frame: 0 };
    followRing();
  }

  function followRing() {
    var p = pointing;
    if (!p) return;
    p.frame = requestAnimationFrame(followRing);
    var now = performance.now();
    if (!p.el.isConnected && now - p.lookedAt > 250) {
      p.lookedAt = now;
      var again = findTarget(p.label);
      if (again) { p.el = again; p.clips = clippersOf(again); }
    }
    var box = p.el.isConnected ? visibleBox(p.el, p.clips) : null;
    if (!p.shownAt) {
      // Glide from the last thing only if this one is already on screen.
      if (!box) p.from = null;
      if (box) { p.shownAt = now; p.until = now + RING_MS; }
    }
    if (p.shownAt ? now > p.until : now - p.start > 3000) return hideRing();
    if (!box) { if (ring.className !== "ring") ring.className = "ring"; p.drawn = null; return; }

    var pad = 6, edge = 2;
    var target = {
      left: Math.max(edge, box.left - pad), top: Math.max(edge, box.top - pad),
      right: Math.min(innerWidth - edge, box.right + pad), bottom: Math.min(innerHeight - edge, box.bottom + pad)
    };
    var t = p.from && !reduceMotion ? Math.min(1, (now - p.shownAt) / GLIDE_MS) : 1;
    if (t < 1) {
      var ease = 1 - Math.pow(1 - t, 3);
      ["left", "top", "right", "bottom"].forEach(function (side) { target[side] = p.from[side] + (target[side] - p.from[side]) * ease; });
    } else {
      p.from = null;
    }
    p.drawn = target;
    // Fixed isn't always relative to the viewport (a transformed <body>): offset by where the corner really is.
    var corner = origin.getBoundingClientRect();
    ring.style.left = (target.left - corner.left) + "px";
    ring.style.top = (target.top - corner.top) + "px";
    ring.style.width = (target.right - target.left) + "px";
    ring.style.height = (target.bottom - target.top) + "px";
    if (ring.className !== "ring on") ring.className = "ring on";
  }

  function runTool(request) {
    var kind = request.kind, input = request.input || {};
    if (kind === "navigate") {
      var target;
      try { target = new URL(String(input.url || ""), location.href); } catch (e) { return toolReply(request.requestId, false, "Invalid URL"); }
      if (target.protocol !== "http:" && target.protocol !== "https:") return toolReply(request.requestId, false, "Invalid URL");
      emit("navigate", { url: target.toString() });
      if (target.origin !== location.origin) {
        window.open(target.toString(), "_blank", "noopener");
        return toolReply(request.requestId, true, "Opened " + target.hostname + " in a new tab.");
      }
      if (state.navigator) {
        Promise.resolve(state.navigator(target.pathname + target.search + target.hash, target.toString()))
          .then(function () { setTimeout(function () { notifyPage(true); toolReply(request.requestId, true, "Done, you moved them to " + document.title + " (" + location.href + ")."); }, 400); })
          .catch(function (e) { toolReply(request.requestId, false, "Navigation failed: " + (e && e.message || e)); });
        return;
      }
      if (target.href === location.href) return toolReply(request.requestId, true, "The user is already on this page.");
      // Full page load: remember the call so it resumes on the next page.
      rememberCall(request.toolCallId, request.mode || state.mode);
      post("navigating", { url: target.toString() });
      setTimeout(function () { location.assign(target.toString()); }, 250);
      return;
    }
    if (kind === "highlight") {
      var el = findTarget(input.label);
      if (!el) return toolReply(request.requestId, false, "Couldn't find \\"" + input.label + "\\" on this page. Describe where it is instead.");
      pointAt(el, input.label);
      var shownText = String(el.innerText || el.value || el.getAttribute("aria-label") || el.placeholder || "").replace(/\\s+/g, " ").trim().slice(0, 80);
      return toolReply(request.requestId, true, shownText ? "Highlighted it on screen: \\"" + shownText + "\\"." : "Highlighted it on screen.");
    }
    if (kind === "client_action") {
      var handler = state.actions[request.name];
      emit("action", { name: request.name, input: input });
      if (!handler) return toolReply(request.requestId, false, "The website hasn't enabled this action yet. Explain how to do it manually.");
      Promise.resolve()
        .then(function () { return handler(input); })
        .then(function (result) { toolReply(request.requestId, true, result === undefined ? "Done." : result); })
        .catch(function (e) { toolReply(request.requestId, false, "It failed: " + (e && e.message || e)); });
      return;
    }
    toolReply(request.requestId, false, "Unknown tool");
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== APP || !state.iframe || event.source !== state.iframe.contentWindow) return;
    var data = event.data || {};
    if (data.source !== PREFIX + "-widget") return;
    var payload = data.payload || {};
    switch (data.type) {
      case "ready": state.ready = true; sendInit(); break;
      case "config": state.config = payload; render(payload); break;
      case "session": store.set(localStorage, conversationKey(), { id: payload.conversationId, at: Date.now() }); break;
      case "tool": runTool(payload); break;
      case "page-request":
        state.pageKey = location.href;
        post("page-snapshot", { requestId: payload.requestId, page: pageInfo() });
        break;
      case "call":
        state.callActive = !!payload.active;
        state.callPaused = !!payload.active && !!payload.paused;
        showCallState();
        emit("call", payload);
        break;
      case "wave": setWave(payload.bands || null); break;
      case "close": api.close(); break;
    }
  });

  // ---------- page changes (SPA) ----------
  function notifyPage(force) {
    var key = location.href;
    if (!force && key === state.pageKey) return;
    state.pageKey = key;
    if (state.ready) post("page", pageInfo());
  }
  ["pushState", "replaceState"].forEach(function (method) {
    var original = history[method];
    history[method] = function () {
      var result = original.apply(this, arguments);
      setTimeout(function () { notifyPage(false); }, 350);
      return result;
    };
  });
  window.addEventListener("popstate", function () { setTimeout(function () { notifyPage(false); }, 350); });

  // ---------- public API ----------
  var api = {
    init: function (options) {
      if (state.agentId) return;
      options = options || {};
      state.agentId = options.agentId;
      state.options = options;
      if (options.userToken) state.identity.token = options.userToken;
      if (options.user) { state.identity.name = options.user.name; state.identity.email = options.user.email; }
      if (!state.agentId) { console.warn("[" + CONFIG.global + "] Missing agentId"); return; }
      state.pageKey = location.href;
      // Drawn the way it looked last time, so it doesn't change shape or
      // color when the settings arrive.
      var seen = store.get(localStorage, "look:" + state.agentId) || {};
      render({
        launcherLabel: options.label || "Ask anything",
        accentColor: options.accentColor || seen.accentColor,
        avatarStyle: seen.avatarStyle,
        launcherPosition: options.position
      });
      mount();
      fetch(APP + "/api/widget/config?agentId=" + encodeURIComponent(state.agentId) + (options.preview ? "&preview=1" : ""))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (config) {
          if (!config) { host.remove(); return; }
          state.config = config;
          render(config);
          store.set(localStorage, "look:" + state.agentId, { accentColor: config.accentColor, avatarStyle: config.avatarStyle });
          var resume = store.get(sessionStorage, "resume:" + state.agentId);
          store.del(sessionStorage, "resume:" + state.agentId);
          if (resume && Date.now() - resume.at < 120000) {
            state.resume = { toolCallId: resume.toolCallId || null };
            if (resume.open === false) {
              // It was minimized: reconnect without opening the panel.
              state.mode = resume.mode || "voice";
              ensureIframe();
            } else {
              api.open({ mode: resume.mode });
            }
          }
        })
        .catch(function () {});
    },
    open: function (options) {
      if (!state.agentId) return;
      state.mode = (options && options.mode) || state.mode;
      ensureIframe();
      var wasOpen = state.open;
      state.open = true;
      panel.className = panel.className.replace(" open", "").replace(" fade", "") + " open";
      dock.className = dock.className.replace(" hidden", "") + " hidden";
      if (!wasOpen) morph(true, function () {});
      if (state.ready) post("open", { mode: state.mode, autostart: true });
      emit("open", { mode: state.mode });
    },
    close: function () {
      if (!state.open) return;
      state.open = false;
      morph(false, function () {
        panel.className = panel.className.replace(" open", "").replace(" fade", "");
        // The shape has landed exactly on the launcher: swap them in the same frame.
        dock.style.transition = "none";
        dock.className = dock.className.replace(" hidden", "");
        void dock.offsetWidth;
        dock.style.transition = "";
      });
      post("closed", {});
      emit("close", {});
    },
    toggle: function () { state.open ? api.close() : api.open(); },
    identify: function (identity) {
      state.identity = identity || {};
      if (state.ready) post("identity", state.identity);
    },
    setNavigator: function (fn) { state.navigator = typeof fn === "function" ? fn : null; },
    registerAction: function (name, handler) { if (name && typeof handler === "function") state.actions[name] = handler; },
    on: function (event, cb) { (state.listeners[event] = state.listeners[event] || []).push(cb); }
  };

  var existing = window[CONFIG.global];
  var queue = (existing && existing.q) || [];
  var global = function (method) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (typeof api[method] === "function") return api[method].apply(null, args);
    console.warn("[" + CONFIG.global + "] Unknown method " + method);
  };
  global.q = [];
  window[CONFIG.global] = global;
  for (var i = 0; i < queue.length; i++) global.apply(null, queue[i]);

  if (!state.agentId) {
    var script = document.currentScript || document.querySelector("script[data-agent-id]");
    var agentId = script && script.getAttribute("data-agent-id");
    if (agentId) {
      var start = function () {
        api.init({
          agentId: agentId,
          userToken: script.getAttribute("data-user-token") || undefined,
          preview: script.hasAttribute("data-preview")
        });
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
    }
  }
})();`;
}
