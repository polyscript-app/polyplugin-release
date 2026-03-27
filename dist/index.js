(() => {
  // src/index.js
  var {
    core,
    event,
    console,
    menu,
    mpv,
    overlay,
    sidebar,
    http,
    file,
    utils,
    preferences
  } = iina;
  console.log("Polyscript Plugin: Restoring to the last working state.");
  var lastSubtitleText = "";
  var subtitleChangeSerial = 0;
  var pendingAutoSpeakSerial = 0;
  var lastAutoSpokenSerial = 0;
  var overlayLoaded = false;
  var translatingFile = false;
  var lastRenderedText = "";
  var lastOriginalText = "";
  var showTransliteration = true;
  var translitCache = /* @__PURE__ */ new Map();
  var translitPending = /* @__PURE__ */ new Set();
  var dictCache = /* @__PURE__ */ new Map();
  var dictPending = /* @__PURE__ */ new Set();
  var wordInfoQueue = [];
  var wordInfoActive = 0;
  var WORD_INFO_CONCURRENCY = 1;
  var DICT_PREFETCH_LIMIT = 4;
  var lineTranslationCache = /* @__PURE__ */ new Map();
  var lineTranslationPending = /* @__PURE__ */ new Set();
  var lineTranslationQueue = [];
  var lineTranslationQueued = /* @__PURE__ */ new Set();
  var lineTranslationActive = 0;
  var lineTranslationGeneration = 0;
  var usingFullFileTranslation = false;
  var showedLineTranslateOsd = false;
  var targetLang = preferences && typeof preferences.get === "function" && preferences.get("targetLang") || "en";
  var sentenceMode = coerceBoolean(
    preferences && typeof preferences.get === "function" && preferences.get("sentenceMode") || false,
    false
  );
  var subtitleEntries = null;
  var lastSentenceIndex = -1;
  var translationProvider = preferences && typeof preferences.get === "function" && preferences.get("translationProvider") || "google";
  var polyscriptToken = preferences && typeof preferences.get === "function" && preferences.get("polyscriptToken") || "";
  var DEFAULT_POLYSCRIPT_BASE_URL = "https://polyscript.app";
  var DEFAULT_NATIVE_BASE_URL = "http://127.0.0.1:8123";
  var polyscriptBaseUrl = normalizeServiceBaseUrl(
    preferences && typeof preferences.get === "function" && preferences.get("polyscriptBaseUrl") || DEFAULT_POLYSCRIPT_BASE_URL,
    DEFAULT_POLYSCRIPT_BASE_URL
  );
  var llmModel = preferences && typeof preferences.get === "function" && preferences.get("llmModel") || "gpt-4o-mini";
  var llmTemperature = preferences && typeof preferences.get === "function" && preferences.get("llmTemperature") || 0.3;
  var llmMaxTokens = preferences && typeof preferences.get === "function" && preferences.get("llmMaxTokens") || 2e3;
  var llmMode = preferences && typeof preferences.get === "function" && preferences.get("llmMode") || "translate";
  var llmMetaPrompt = preferences && typeof preferences.get === "function" && preferences.get("llmMetaPrompt") || "";
  var llmCustomPrompt = preferences && typeof preferences.get === "function" && preferences.get("llmCustomPrompt") || "";
  var llmCustomTarget = preferences && typeof preferences.get === "function" && preferences.get("llmCustomTarget") || "";
  var _a;
  var polyscriptEnabledRaw = (_a = preferences == null ? void 0 : preferences.get) == null ? void 0 : _a.call(preferences, "polyscriptEnabled");
  var polyscriptEnabled = coerceBoolean(polyscriptEnabledRaw, true);
  var deviceLoginTimer = null;
  var deviceLoginDeviceId = null;
  var deviceLoginVerificationUrl = "";
  var deviceLoginPollInFlight = false;
  var subtitlePollTimer = null;
  var BASE_MIN_SUB_DISPLAY_MS = 800;
  var PER_CHAR_MS = 30;
  var MAX_MIN_SUB_DISPLAY_MS = 3500;
  var MAX_SUB_DISPLAY_MS = 8e3;
  function contentAwareMinDisplay(text) {
    const len = (text || "").length;
    return Math.min(BASE_MIN_SUB_DISPLAY_MS + len * PER_CHAR_MS, MAX_MIN_SUB_DISPLAY_MS);
  }
  var subFirstShownAt = 0;
  var subLastDisplayedText = "";
  var subLastDisplayedSub = null;
  var subSuppressedText = "";
  var lastNativeSubId = null;
  var lastTranslatedSubPath = null;
  var transcriptTimePollTimer = null;
  var lastTranscriptTimePos = -1;
  var liveTranscriptEntries = [];
  var pendingRenderText = null;
  var renderScheduled = false;
  var currentTranslateJobId = 0;
  var originalSubPositions = { captured: false, primary: null, secondary: null };
  var lastHoverWord = "";
  var lastHoverLine = "";
  var lastOverlayInteractionAt = 0;
  var ttsActive = false;
  var ttsQueued = null;
  var cachedVoices = [];
  var cachedVoicesAt = 0;
  var cachedVoicesPending = null;
  var cachedVoicesBootstrapped = false;
  var nativeVoices = [];
  var nativeVoicesAt = 0;
  var nativeVoicesPending = null;
  var cloudVoices = [];
  var cloudVoicesAt = 0;
  var cloudVoicesPending = null;
  var cloudVoicesBootstrapped = false;
  var entitlementSnapshot = null;
  var entitlementSnapshotAt = 0;
  var entitlementSnapshotPending = null;
  var tokenRefreshPromise = null;
  var aiStatusCheckPromise = null;
  var aiStatusState = {
    checking: false,
    available: null,
    statusCode: 0,
    reason: "idle",
    checkedAt: 0
  };
  var TOKEN_REFRESH_THRESHOLD_SECONDS = 10 * 60;
  var VOICE_CACHE_TTL_MS = 5 * 60 * 1e3;
  var ENTITLEMENT_CACHE_TTL_MS = 60 * 1e3;
  var PERSONAL_VOICE_TOKEN = "__personal__";
  var VOICE_SELECTOR_SYSTEM = "system";
  var VOICE_SELECTOR_CLOUD = "cloud";
  var VOICE_SELECTOR_PERSONAL = "personal";
  var SIDEBAR_VOICE_REFRESH_COOLDOWN_MS = 10 * 1e3;
  var sidebarVoiceRefreshPromise = null;
  var sidebarVoiceRefreshAt = 0;
  var lastCloudTtsDisabledOsdAt = 0;
  var lastTtsUnsupportedNoticeAt = 0;
  var lastTtsUnsupportedNoticeKey = "";
  var lastTtsSubstitutionNoticeAt = 0;
  var lastTtsSubstitutionNoticeKey = "";
  var sentenceResumeTimer = null;
  var sentencePauseToken = 0;
  var sentencePausedByPlugin = false;
  var lastPausedSentenceIndex = -1;
  var sentenceLiveMode = false;
  var sentenceLiveIndex = 0;
  var sentenceLivePendingAccept = false;
  var lastTimePos = null;
  var sourceTrackAutoSelectedForFile = false;
  var sourceTrackSelectionAttempts = 0;
  var lastSourceTrackSelectionAttemptAt = 0;
  var lastMissingLoginOsdAt = 0;
  var lastSessionExpiredOsdAt = 0;
  var autoPickSourceSubtitlesEnabled = (() => {
    var _a4;
    const raw = (_a4 = preferences == null ? void 0 : preferences.get) == null ? void 0 : _a4.call(preferences, "autoPickSourceSubtitles");
    return coerceBoolean(raw, true);
  })();
  var segmentationEnabledSetting = (() => {
    var _a4;
    const raw = (_a4 = preferences == null ? void 0 : preferences.get) == null ? void 0 : _a4.call(preferences, "segmentationEnabled");
    return coerceBoolean(raw, true);
  })();
  var autoArrangeSubsSetting = (() => {
    var _a4;
    const raw = (_a4 = preferences == null ? void 0 : preferences.get) == null ? void 0 : _a4.call(preferences, "autoArrangeSubs");
    return coerceBoolean(raw, false);
  })();
  var primarySubPositionSetting = (() => {
    var _a4;
    const raw = String(((_a4 = preferences == null ? void 0 : preferences.get) == null ? void 0 : _a4.call(preferences, "primarySubPosition")) || "bottom");
    return raw === "top" ? "top" : "bottom";
  })();
  var secondarySubPositionSetting = (() => {
    var _a4;
    const raw = String(((_a4 = preferences == null ? void 0 : preferences.get) == null ? void 0 : _a4.call(preferences, "secondarySubPosition")) || "bottom");
    return raw === "top" ? "top" : "bottom";
  })();
  var appearanceSettingsCache = null;
  var PRESET_SLOTS = ["1", "2", "3"];
  var RECENT_LANG_LIMIT = 6;
  var BETA_SIMPLE_MENU = true;
  var sidebarHandlersRegistered = false;
  var telemetryDeviceIdCache = null;
  var menuForceUpdateScheduled = false;
  var sidebarVisible = false;
  var AUTH_FLOW_ACTIVE_PHASES = /* @__PURE__ */ new Set(["starting", "awaiting_approval", "polling"]);
  var AUTH_FLOW_PHASES = /* @__PURE__ */ new Set(["idle", "starting", "awaiting_approval", "polling", "error", "signed_in"]);
  var authFlowState = {
    phase: polyscriptToken ? "signed_in" : "idle",
    message: "",
    verificationUrl: "",
    updatedAt: Date.now()
  };
  function requestMenuForceUpdate() {
    if (menuForceUpdateScheduled) return;
    menuForceUpdateScheduled = true;
    setTimeout(() => {
      menuForceUpdateScheduled = false;
      try {
        menu.forceUpdate();
      } catch (e) {
        console.log(`POLYSCRIPT-ERROR: menu.forceUpdate failed: ${e.message}`);
      }
    }, 0);
  }
  function showSidebarPanel() {
    var _a4;
    try {
      (_a4 = sidebar == null ? void 0 : sidebar.show) == null ? void 0 : _a4.call(sidebar);
      sidebarVisible = true;
      emitSidebarSettings();
    } catch {
    }
  }
  function hideSidebarPanel() {
    try {
      if (sidebar && typeof sidebar.hide === "function") {
        sidebar.hide();
      }
    } catch {
    }
    sidebarVisible = false;
  }
  function toggleSidebarPanel() {
    if (sidebarVisible) {
      hideSidebarPanel();
      return;
    }
    showSidebarPanel();
  }
  function normalizeAuthFlowPhase(raw) {
    const phase = String(raw || "").trim();
    if (AUTH_FLOW_PHASES.has(phase)) return phase;
    return "idle";
  }
  function defaultAuthFlowMessage(phase) {
    switch (phase) {
      case "starting":
        return "Starting secure sign-in...";
      case "awaiting_approval":
        return "Approve sign-in in your browser or email.";
      case "polling":
        return "Waiting for approval...";
      case "signed_in":
        return "Signed in.";
      case "error":
        return "Sign-in failed. Try again.";
      case "idle":
      default:
        return "";
    }
  }
  function setAuthFlowState(next = {}, options = {}) {
    const phase = normalizeAuthFlowPhase(next.phase || authFlowState.phase);
    const verificationUrl = typeof next.verificationUrl === "string" ? next.verificationUrl.trim() : authFlowState.verificationUrl;
    const message = typeof next.message === "string" ? next.message.trim() : defaultAuthFlowMessage(phase);
    if (phase === authFlowState.phase && message === authFlowState.message && verificationUrl === authFlowState.verificationUrl) {
      return;
    }
    authFlowState = {
      phase,
      message,
      verificationUrl,
      updatedAt: Date.now()
    };
    if (options.emit !== false) {
      emitSidebarSettings({ skipAutoAiRefresh: true, skipVoiceRefresh: true });
    }
  }
  function stopDeviceLoginFlow(options = {}) {
    if (deviceLoginTimer) {
      clearInterval(deviceLoginTimer);
      deviceLoginTimer = null;
    }
    deviceLoginPollInFlight = false;
    deviceLoginDeviceId = null;
    if (!options.keepVerificationUrl) {
      deviceLoginVerificationUrl = "";
    }
  }
  function parseRecentLangs(raw) {
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((code) => typeof code === "string" && code) : [];
      } catch {
        return [];
      }
    }
    if (Array.isArray(raw)) {
      return raw.filter((code) => typeof code === "string" && code);
    }
    return [];
  }
  function parseTtsVoiceMap(raw) {
    if (!raw) return {};
    if (typeof raw === "object") return raw;
    try {
      const parsed = JSON.parse(String(raw));
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  function normalizeServiceBaseUrl(raw, fallback) {
    const fallbackValue = String(fallback || "").trim() || DEFAULT_POLYSCRIPT_BASE_URL;
    const input = String(raw || "").trim();
    if (!input) return fallbackValue;
    let candidate = input;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
      const lower = candidate.toLowerCase();
      const localLike = lower === "localhost" || lower.startsWith("localhost:") || lower.startsWith("127.") || lower.startsWith("0.0.0.0") || lower.startsWith("10.") || lower.startsWith("192.168.") || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(lower);
      candidate = `${localLike ? "http" : "https"}://${candidate}`;
    }
    const match = candidate.match(/^(https?):\/\/([^\/\s?#]+)(\/[^?#\s]*)?(?:[?#].*)?$/i);
    if (!match) return fallbackValue;
    const protocol = String(match[1] || "").toLowerCase();
    const authority = String(match[2] || "").trim();
    const pathname = String(match[3] || "").replace(/\/+$/, "");
    if (!authority || !/^(https?)$/.test(protocol)) return fallbackValue;
    return `${protocol}://${authority}${pathname}`;
  }
  function coerceBoolean(raw, fallback = false) {
    if (typeof raw === "boolean") return raw;
    if (typeof raw === "number") {
      if (raw === 1) return true;
      if (raw === 0) return false;
    }
    if (typeof raw === "string") {
      const normalized = raw.trim().toLowerCase();
      if (!normalized) return false;
      if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") return true;
      if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") return false;
    }
    return fallback;
  }
  function isSafeHttpRequestUrl(raw) {
    const value = String(raw || "").trim();
    if (!value || /\s/.test(value)) return false;
    return /^(https?):\/\/[^\/\s?#]+(?:[\/?#]|$)/i.test(value);
  }
  function safeHttpGet(url, options) {
    const normalized = String(url || "").trim();
    if (!http || !isSafeHttpRequestUrl(normalized)) {
      throw new Error(`Invalid HTTP GET URL: ${normalized}`);
    }
    return http.get(normalized, options);
  }
  function safeHttpPost(url, options) {
    const normalized = String(url || "").trim();
    if (!http || !isSafeHttpRequestUrl(normalized)) {
      throw new Error(`Invalid HTTP POST URL: ${normalized}`);
    }
    return http.post(normalized, options);
  }
  function normalizeSentenceSettings(raw = {}) {
    const delay = Number(raw.delay);
    return {
      autoResume: coerceBoolean(raw.autoResume, false),
      delay: Number.isFinite(delay) ? Math.max(0, Math.min(15, delay)) : 2,
      ttsOnPause: coerceBoolean(raw.ttsOnPause, false)
    };
  }
  function normalizeTtsSettings(raw = {}) {
    return {
      enabled: coerceBoolean(raw.enabled, true),
      wordClick: coerceBoolean(raw.wordClick, true),
      lineClick: coerceBoolean(raw.lineClick, true),
      rate: typeof raw.rate === "number" ? raw.rate : 190,
      voice: typeof raw.voice === "string" ? raw.voice : "",
      autoVoice: coerceBoolean(raw.autoVoice, false),
      engine: raw.engine === "native" ? "native" : raw.engine === "cloud" ? "cloud" : "say",
      nativeBaseUrl: normalizeServiceBaseUrl(raw.nativeBaseUrl, DEFAULT_NATIVE_BASE_URL),
      nativeHelperPath: typeof raw.nativeHelperPath === "string" ? raw.nativeHelperPath : "",
      nativeAutoStart: coerceBoolean(raw.nativeAutoStart, true),
      preferPersonal: coerceBoolean(raw.preferPersonal, true),
      nativeEngine: raw.nativeEngine === "av" ? "av" : "nss",
      cloudFallback: coerceBoolean(raw.cloudFallback, true)
    };
  }
  function loadSentenceSettingsFromPreferences() {
    var _a4, _b, _c;
    return normalizeSentenceSettings({
      autoResume: (_a4 = preferences == null ? void 0 : preferences.get) == null ? void 0 : _a4.call(preferences, "sentenceAutoResume"),
      delay: (_b = preferences == null ? void 0 : preferences.get) == null ? void 0 : _b.call(preferences, "sentenceAutoResumeDelay"),
      ttsOnPause: (_c = preferences == null ? void 0 : preferences.get) == null ? void 0 : _c.call(preferences, "sentenceTtsOnPause")
    });
  }
  function loadTtsSettingsFromPreferences() {
    var _a4, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
    return normalizeTtsSettings({
      enabled: (_a4 = preferences == null ? void 0 : preferences.get) == null ? void 0 : _a4.call(preferences, "ttsEnabled"),
      wordClick: (_b = preferences == null ? void 0 : preferences.get) == null ? void 0 : _b.call(preferences, "ttsOnWordClick"),
      lineClick: (_c = preferences == null ? void 0 : preferences.get) == null ? void 0 : _c.call(preferences, "ttsOnLineClick"),
      rate: (_d = preferences == null ? void 0 : preferences.get) == null ? void 0 : _d.call(preferences, "ttsRate"),
      voice: (_e = preferences == null ? void 0 : preferences.get) == null ? void 0 : _e.call(preferences, "ttsVoice"),
      autoVoice: (_f = preferences == null ? void 0 : preferences.get) == null ? void 0 : _f.call(preferences, "ttsAutoVoice"),
      engine: (_g = preferences == null ? void 0 : preferences.get) == null ? void 0 : _g.call(preferences, "ttsEngine"),
      nativeBaseUrl: (_h = preferences == null ? void 0 : preferences.get) == null ? void 0 : _h.call(preferences, "ttsNativeBaseUrl"),
      nativeHelperPath: (_i = preferences == null ? void 0 : preferences.get) == null ? void 0 : _i.call(preferences, "ttsNativeHelperPath"),
      nativeAutoStart: (_j = preferences == null ? void 0 : preferences.get) == null ? void 0 : _j.call(preferences, "ttsNativeAutoStart"),
      preferPersonal: (_k = preferences == null ? void 0 : preferences.get) == null ? void 0 : _k.call(preferences, "ttsPreferPersonal"),
      nativeEngine: (_l = preferences == null ? void 0 : preferences.get) == null ? void 0 : _l.call(preferences, "ttsNativeEngine"),
      cloudFallback: (_m = preferences == null ? void 0 : preferences.get) == null ? void 0 : _m.call(preferences, "ttsCloudFallback")
    });
  }
  var savedLoginEmailCache = (() => {
    var _a4;
    const raw = (_a4 = preferences == null ? void 0 : preferences.get) == null ? void 0 : _a4.call(preferences, "polyscriptLoginEmail");
    return typeof raw === "string" ? raw.trim() : "";
  })();
  var sentenceSettingsCache = loadSentenceSettingsFromPreferences();
  var ttsSettingsCache = loadTtsSettingsFromPreferences();
  var _a2;
  var ttsVoiceMapCache = parseTtsVoiceMap((_a2 = preferences == null ? void 0 : preferences.get) == null ? void 0 : _a2.call(preferences, "ttsVoiceMap"));
  var ttsDebugEnabledCache = (() => {
    var _a4;
    const raw = (_a4 = preferences == null ? void 0 : preferences.get) == null ? void 0 : _a4.call(preferences, "ttsDebug");
    return coerceBoolean(raw, false);
  })();
  var _a3;
  var recentLangsCache = parseRecentLangs((_a3 = preferences == null ? void 0 : preferences.get) == null ? void 0 : _a3.call(preferences, "psRecentLangs"));
  var autoLoadSubtitlesEnabled = (() => {
    var _a4;
    const raw = (_a4 = preferences == null ? void 0 : preferences.get) == null ? void 0 : _a4.call(preferences, "autoLoadSubtitles");
    return coerceBoolean(raw, false);
  })();
  var useNativeSubsWhenAvailable = (() => {
    var _a4;
    const raw = (_a4 = preferences == null ? void 0 : preferences.get) == null ? void 0 : _a4.call(preferences, "useNativeSubsWhenAvailable");
    return coerceBoolean(raw, true);
  })();
  var usingNativeTargetSubs = false;
  function updatePreferenceCachesOnSet(key, value) {
    switch (key) {
      case "polyscriptLoginEmail":
        savedLoginEmailCache = typeof value === "string" ? value.trim() : "";
        return;
      case "sentenceAutoResume":
        sentenceSettingsCache = normalizeSentenceSettings({
          ...sentenceSettingsCache,
          autoResume: coerceBoolean(value, sentenceSettingsCache.autoResume)
        });
        return;
      case "sentenceAutoResumeDelay":
        sentenceSettingsCache = normalizeSentenceSettings({
          ...sentenceSettingsCache,
          delay: Number(value)
        });
        return;
      case "sentenceTtsOnPause":
        sentenceSettingsCache = normalizeSentenceSettings({
          ...sentenceSettingsCache,
          ttsOnPause: coerceBoolean(value, sentenceSettingsCache.ttsOnPause)
        });
        return;
      case "ttsEnabled":
        ttsSettingsCache = normalizeTtsSettings({
          ...ttsSettingsCache,
          enabled: coerceBoolean(value, ttsSettingsCache.enabled)
        });
        return;
      case "ttsOnWordClick":
        ttsSettingsCache = normalizeTtsSettings({
          ...ttsSettingsCache,
          wordClick: coerceBoolean(value, ttsSettingsCache.wordClick)
        });
        return;
      case "ttsOnLineClick":
        ttsSettingsCache = normalizeTtsSettings({
          ...ttsSettingsCache,
          lineClick: coerceBoolean(value, ttsSettingsCache.lineClick)
        });
        return;
      case "ttsRate":
        ttsSettingsCache = normalizeTtsSettings({ ...ttsSettingsCache, rate: Number(value) });
        return;
      case "ttsVoice":
        ttsSettingsCache = normalizeTtsSettings({ ...ttsSettingsCache, voice: String(value || "") });
        return;
      case "ttsAutoVoice":
        ttsSettingsCache = normalizeTtsSettings({
          ...ttsSettingsCache,
          autoVoice: coerceBoolean(value, ttsSettingsCache.autoVoice)
        });
        return;
      case "ttsEngine":
        ttsSettingsCache = normalizeTtsSettings({ ...ttsSettingsCache, engine: value });
        return;
      case "ttsNativeBaseUrl":
        ttsSettingsCache = normalizeTtsSettings({
          ...ttsSettingsCache,
          nativeBaseUrl: normalizeServiceBaseUrl(value, DEFAULT_NATIVE_BASE_URL)
        });
        return;
      case "ttsNativeHelperPath":
        ttsSettingsCache = normalizeTtsSettings({
          ...ttsSettingsCache,
          nativeHelperPath: String(value || "").trim()
        });
        return;
      case "ttsNativeAutoStart":
        ttsSettingsCache = normalizeTtsSettings({
          ...ttsSettingsCache,
          nativeAutoStart: coerceBoolean(value, ttsSettingsCache.nativeAutoStart)
        });
        return;
      case "ttsPreferPersonal":
        ttsSettingsCache = normalizeTtsSettings({
          ...ttsSettingsCache,
          preferPersonal: coerceBoolean(value, ttsSettingsCache.preferPersonal)
        });
        return;
      case "ttsNativeEngine":
        ttsSettingsCache = normalizeTtsSettings({ ...ttsSettingsCache, nativeEngine: value });
        return;
      case "ttsCloudFallback":
        ttsSettingsCache = normalizeTtsSettings({
          ...ttsSettingsCache,
          cloudFallback: coerceBoolean(value, ttsSettingsCache.cloudFallback)
        });
        return;
      case "ttsVoiceMap":
        ttsVoiceMapCache = parseTtsVoiceMap(value);
        return;
      case "ttsDebug":
        ttsDebugEnabledCache = coerceBoolean(value, ttsDebugEnabledCache);
        return;
      case "psRecentLangs":
        recentLangsCache = parseRecentLangs(value);
        return;
      case "autoLoadSubtitles":
        autoLoadSubtitlesEnabled = coerceBoolean(value, autoLoadSubtitlesEnabled);
        return;
      case "autoPickSourceSubtitles":
        autoPickSourceSubtitlesEnabled = coerceBoolean(value, autoPickSourceSubtitlesEnabled);
        return;
      case "useNativeSubsWhenAvailable":
        useNativeSubsWhenAvailable = coerceBoolean(value, useNativeSubsWhenAvailable);
        return;
      default:
        return;
    }
  }
  if (preferences && typeof preferences.set === "function") {
    try {
      const rawPreferenceSet = preferences.set.bind(preferences);
      preferences.set = (key, value) => {
        updatePreferenceCachesOnSet(key, value);
        return rawPreferenceSet(key, value);
      };
    } catch {
    }
  }
  var PLUGIN_SESSION_ID = (() => {
    try {
      return typeof crypto !== "undefined" && crypto.randomUUID ? `iina_sess_${crypto.randomUUID()}` : `iina_sess_${Date.now()}`;
    } catch {
      return `iina_sess_${Date.now()}`;
    }
  })();
  var TELEMETRY_DEVICE_ID_PREF_KEY = "psTelemetryDeviceId";
  function randomId(prefix) {
    try {
      const raw = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      return `${prefix}_${raw}`;
    } catch {
      return `${prefix}_${Date.now()}`;
    }
  }
  function getTelemetryDeviceId() {
    var _a4, _b, _c;
    if (telemetryDeviceIdCache) return telemetryDeviceIdCache;
    const existing = (_a4 = preferences == null ? void 0 : preferences.get) == null ? void 0 : _a4.call(preferences, TELEMETRY_DEVICE_ID_PREF_KEY);
    if (existing) {
      telemetryDeviceIdCache = String(existing);
      return telemetryDeviceIdCache;
    }
    const created = randomId("iina_dev");
    telemetryDeviceIdCache = created;
    (_b = preferences == null ? void 0 : preferences.set) == null ? void 0 : _b.call(preferences, TELEMETRY_DEVICE_ID_PREF_KEY, created);
    (_c = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _c.call(preferences);
    return telemetryDeviceIdCache;
  }
  getTelemetryDeviceId();
  async function postTelemetryEvent(eventName, options = {}) {
    if (!eventName || !http) return;
    const {
      level = "info",
      feature = null,
      outcome = null,
      properties = {},
      metrics = {}
    } = options;
    try {
      const payload = {
        events: [
          {
            source: "iina_plugin",
            event_name: String(eventName),
            level,
            feature,
            outcome,
            session_id: PLUGIN_SESSION_ID,
            device_id: getTelemetryDeviceId(),
            platform: "iina",
            app_version: "1.0.0",
            timestamp_ms: Date.now(),
            properties,
            metrics
          }
        ]
      };
      const headers = { "Content-Type": "application/json" };
      if (polyscriptToken) headers.Authorization = `Bearer ${polyscriptToken}`;
      await safeHttpPost(`${polyscriptBaseUrl}/api/telemetry/events`, { headers, data: payload });
    } catch {
    }
  }
  var FONT_SIZE_PRESETS = {
    small: { primary: "24px", translit: "12px" },
    medium: { primary: "28px", translit: "14px" },
    large: { primary: "32px", translit: "16px" },
    xl: { primary: "40px", translit: "20px" }
  };
  var BG_COLORS = {
    "Black": "0, 0, 0",
    "Dark Gray": "24, 24, 27",
    "Navy": "15, 23, 42",
    "Slate": "30, 41, 59"
  };
  var TEXT_COLORS = {
    "White": "#ffffff",
    "Soft White": "#f8fafc",
    "Warm": "#fef3c7"
  };
  var BG_OPACITIES = [0.2, 0.4, 0.6, 0.8, 0.9];
  var DICT_LANG = "en";
  var OVERLAY_PLACEMENTS = {
    auto: "Auto (Avoid Overlap)",
    normal: "Normal",
    raised: "Raised",
    high: "High",
    custom: "Custom"
  };
  var GOOGLE_TRANSLATE_LANGS = {
    "af": "Afrikaans",
    "sq": "Albanian",
    "am": "Amharic",
    "ar": "Arabic",
    "hy": "Armenian",
    "as": "Assamese",
    "ay": "Aymara",
    "az": "Azerbaijani",
    "bm": "Bambara",
    "eu": "Basque",
    "be": "Belarusian",
    "bn": "Bengali",
    "bho": "Bhojpuri",
    "bs": "Bosnian",
    "bg": "Bulgarian",
    "ca": "Catalan",
    "ceb": "Cebuano",
    "zh-CN": "Chinese (Simplified)",
    "zh-TW": "Chinese (Traditional)",
    "co": "Corsican",
    "hr": "Croatian",
    "cs": "Czech",
    "da": "Danish",
    "dv": "Dhivehi",
    "doi": "Dogri",
    "nl": "Dutch",
    "en": "English",
    "eo": "Esperanto",
    "et": "Estonian",
    "ee": "Ewe",
    "fil": "Filipino",
    "fi": "Finnish",
    "fr": "French",
    "fy": "Frisian",
    "gl": "Galician",
    "ka": "Georgian",
    "de": "German",
    "el": "Greek",
    "gn": "Guarani",
    "gu": "Gujarati",
    "ht": "Haitian Creole",
    "ha": "Hausa",
    "haw": "Hawaiian",
    "he": "Hebrew",
    "hi": "Hindi",
    "hmn": "Hmong",
    "hu": "Hungarian",
    "is": "Icelandic",
    "ig": "Igbo",
    "id": "Indonesian",
    "ga": "Irish",
    "it": "Italian",
    "ja": "Japanese",
    "jw": "Javanese",
    "kn": "Kannada",
    "kk": "Kazakh",
    "km": "Khmer",
    "rw": "Kinyarwanda",
    "gom": "Konkani",
    "ko": "Korean",
    "kri": "Krio",
    "ku": "Kurdish",
    "ckb": "Kurdish (Sorani)",
    "ky": "Kyrgyz",
    "lo": "Lao",
    "la": "Latin",
    "lv": "Latvian",
    "ln": "Lingala",
    "lt": "Lithuanian",
    "lg": "Luganda",
    "lb": "Luxembourgish",
    "mk": "Macedonian",
    "mai": "Maithili",
    "mg": "Malagasy",
    "ms": "Malay",
    "ml": "Malayalam",
    "mt": "Maltese",
    "mi": "Maori",
    "mr": "Marathi",
    "mni-Mtei": "Meiteilon (Manipuri)",
    "lus": "Mizo",
    "mn": "Mongolian",
    "my": "Myanmar (Burmese)",
    "ne": "Nepali",
    "no": "Norwegian",
    "ny": "Nyanja (Chichewa)",
    "or": "Odia (Oriya)",
    "om": "Oromo",
    "ps": "Pashto",
    "fa": "Persian",
    "pl": "Polish",
    "pt": "Portuguese",
    "pa": "Punjabi",
    "qu": "Quechua",
    "ro": "Romanian",
    "ru": "Russian",
    "sm": "Samoan",
    "sa": "Sanskrit",
    "gd": "Scots Gaelic",
    "nso": "Sepedi",
    "sr": "Serbian",
    "st": "Sesotho",
    "sn": "Shona",
    "sd": "Sindhi",
    "si": "Sinhala",
    "sk": "Slovak",
    "sl": "Slovenian",
    "so": "Somali",
    "es": "Spanish",
    "su": "Sundanese",
    "sw": "Swahili",
    "sv": "Swedish",
    "tl": "Tagalog (Filipino)",
    "tg": "Tajik",
    "ta": "Tamil",
    "tt": "Tatar",
    "te": "Telugu",
    "th": "Thai",
    "ti": "Tigrinya",
    "ts": "Tsonga",
    "tr": "Turkish",
    "tk": "Turkmen",
    "ak": "Twi",
    "uk": "Ukrainian",
    "ur": "Urdu",
    "ug": "Uyghur",
    "uz": "Uzbek",
    "vi": "Vietnamese",
    "cy": "Welsh",
    "xh": "Xhosa",
    "yi": "Yiddish",
    "yo": "Yoruba",
    "zu": "Zulu"
  };
  if (!GOOGLE_TRANSLATE_LANGS[targetLang]) {
    targetLang = "en";
  }
  var LLM_MODES = {
    translate: "Translate",
    simplify: "Simplify",
    eli5: "Explain Like I'm 5",
    beginner: "Beginner Friendly",
    addEmojis: "Add Emojis",
    addTimestamps: "Add Context Hints",
    addVocab: "Highlight Vocab",
    explainCulture: "Explain Culture",
    formal: "Formal Tone",
    casual: "Casual Tone",
    poetic: "Poetic Tone",
    humorous: "Humorous Tone",
    custom: "Custom Prompt"
  };
  var LLM_TARGET_PRESETS = [
    "Ancient Greek",
    "Latin",
    "Pali",
    "Old English",
    "Sanskrit",
    "Classical Chinese",
    "Biblical Hebrew",
    "Old Norse",
    "Gothic",
    "Coptic"
  ];
  var TTS_LANGUAGE_SUBSTITUTIONS = [
    {
      aliases: ["ancient greek", "ancient-greek", "grc"],
      code: "el",
      voiceLabel: "Modern Greek"
    },
    {
      aliases: ["latin", "la", "lat"],
      code: "it",
      voiceLabel: "Italian"
    },
    {
      aliases: ["sanskrit", "sa", "san"],
      code: "hi",
      voiceLabel: "Hindi"
    }
  ];
  function getLangLabel(code) {
    return GOOGLE_TRANSLATE_LANGS[code] || code;
  }
  function resolveLanguageInput(input) {
    const raw = String(input || "").trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (GOOGLE_TRANSLATE_LANGS[raw]) return raw;
    const exact = Object.entries(GOOGLE_TRANSLATE_LANGS).find(
      ([code, name]) => code.toLowerCase() === lower || String(name).toLowerCase() === lower
    );
    if (exact) return exact[0];
    const partial = Object.entries(GOOGLE_TRANSLATE_LANGS).find(
      ([code, name]) => String(name).toLowerCase().includes(lower)
    );
    return partial ? partial[0] : null;
  }
  function resolveTtsLanguageSubstitution(input) {
    const normalizeAlias = (value) => String(value || "").toLowerCase().replace(/[_-]/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const raw = normalizeAlias(input);
    if (!raw) return null;
    const rawTokens = raw.split(" ").filter(Boolean);
    return TTS_LANGUAGE_SUBSTITUTIONS.find(
      (entry) => entry.aliases.some((alias) => {
        const normAlias = normalizeAlias(alias);
        if (!normAlias) return false;
        if (raw === normAlias) return true;
        if (normAlias.length <= 3 && /^[a-z0-9]+$/.test(normAlias)) {
          return rawTokens.includes(normAlias);
        }
        return raw.includes(normAlias);
      })
    ) || null;
  }
  function getTtsLanguageContext() {
    const key = String(getVoicePreferenceKey() || "").trim();
    if (!key) {
      return {
        requestedKey: "",
        requestedLabel: "current language",
        langCode: "",
        substitution: null
      };
    }
    const keyLower = key.toLowerCase();
    let substitution = resolveTtsLanguageSubstitution(keyLower);
    let langCode = "";
    if (isProbablyLangCode(key)) {
      const normalized = normalizeLangCode(key);
      const byCodeSubstitution = resolveTtsLanguageSubstitution(normalized);
      substitution = byCodeSubstitution || substitution;
      langCode = substitution ? substitution.code : normalized;
    } else {
      const resolved = resolveLanguageInput(key);
      if (resolved) {
        const normalizedResolved = normalizeLangCode(resolved);
        const byResolvedSubstitution = resolveTtsLanguageSubstitution(normalizedResolved);
        substitution = byResolvedSubstitution || substitution;
        langCode = substitution ? substitution.code : normalizedResolved;
      } else if (substitution) {
        langCode = substitution.code;
      }
    }
    const resolvedForLabel = resolveLanguageInput(key);
    const requestedLabel = resolvedForLabel ? getLangLabel(resolvedForLabel) : key;
    return {
      requestedKey: key,
      requestedLabel,
      langCode: langCode ? normalizeLangCode(langCode) : "",
      substitution
    };
  }
  function getPresets() {
    if (!preferences || typeof preferences.get !== "function") return {};
    const raw = preferences.get("psPresets");
    if (!raw) return {};
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(String(raw));
    } catch {
      return {};
    }
  }
  function savePresets(presets) {
    var _a4;
    if (!preferences || typeof preferences.set !== "function") return;
    preferences.set("psPresets", JSON.stringify(presets));
    (_a4 = preferences.sync) == null ? void 0 : _a4.call(preferences);
  }
  function getCurrentSettingsSnapshot() {
    const appearance = getAppearanceSettings();
    return {
      targetLang,
      translationProvider,
      llmMode,
      llmMetaPrompt,
      llmCustomPrompt,
      llmCustomTarget,
      llmModel,
      llmTemperature,
      llmMaxTokens,
      sentenceMode,
      polyscriptEnabled,
      autoArrangeSubs: autoArrangeSubsSetting,
      primarySubPosition: primarySubPositionSetting,
      secondarySubPosition: secondarySubPositionSetting,
      segmentationEnabled: isSegmentationEnabled(),
      appearance
    };
  }
  function applySettingsSnapshot(snapshot) {
    var _a4, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x;
    if (!snapshot || typeof snapshot !== "object") return;
    const nextTarget = snapshot.targetLang;
    if (nextTarget && GOOGLE_TRANSLATE_LANGS[nextTarget]) {
      targetLang = nextTarget;
      (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "targetLang", targetLang);
    }
    const nextProvider = snapshot.translationProvider;
    if (nextProvider === "google" || nextProvider === "polyscript") {
      translationProvider = nextProvider;
      (_b = preferences == null ? void 0 : preferences.set) == null ? void 0 : _b.call(preferences, "translationProvider", translationProvider);
    }
    const nextMode = snapshot.llmMode;
    if (nextMode && LLM_MODES[nextMode]) {
      llmMode = nextMode;
      (_c = preferences == null ? void 0 : preferences.set) == null ? void 0 : _c.call(preferences, "llmMode", llmMode);
    }
    if (typeof snapshot.llmMetaPrompt === "string") {
      llmMetaPrompt = snapshot.llmMetaPrompt;
      (_d = preferences == null ? void 0 : preferences.set) == null ? void 0 : _d.call(preferences, "llmMetaPrompt", llmMetaPrompt);
    }
    if (typeof snapshot.llmCustomPrompt === "string") {
      llmCustomPrompt = snapshot.llmCustomPrompt;
      (_e = preferences == null ? void 0 : preferences.set) == null ? void 0 : _e.call(preferences, "llmCustomPrompt", llmCustomPrompt);
    }
    if (typeof snapshot.llmCustomTarget === "string") {
      llmCustomTarget = snapshot.llmCustomTarget;
      (_f = preferences == null ? void 0 : preferences.set) == null ? void 0 : _f.call(preferences, "llmCustomTarget", llmCustomTarget);
    }
    if (typeof snapshot.llmModel === "string") {
      llmModel = snapshot.llmModel;
      (_g = preferences == null ? void 0 : preferences.set) == null ? void 0 : _g.call(preferences, "llmModel", llmModel);
    }
    if (typeof snapshot.llmTemperature === "number") {
      llmTemperature = snapshot.llmTemperature;
      (_h = preferences == null ? void 0 : preferences.set) == null ? void 0 : _h.call(preferences, "llmTemperature", llmTemperature);
    }
    if (typeof snapshot.llmMaxTokens === "number") {
      llmMaxTokens = snapshot.llmMaxTokens;
      (_i = preferences == null ? void 0 : preferences.set) == null ? void 0 : _i.call(preferences, "llmMaxTokens", llmMaxTokens);
    }
    if (typeof snapshot.sentenceMode === "boolean") {
      sentenceMode = snapshot.sentenceMode;
      (_j = preferences == null ? void 0 : preferences.set) == null ? void 0 : _j.call(preferences, "sentenceMode", sentenceMode);
    }
    if (typeof snapshot.polyscriptEnabled === "boolean") {
      polyscriptEnabled = snapshot.polyscriptEnabled;
      (_k = preferences == null ? void 0 : preferences.set) == null ? void 0 : _k.call(preferences, "polyscriptEnabled", polyscriptEnabled);
    }
    if (typeof snapshot.autoArrangeSubs === "boolean") {
      autoArrangeSubsSetting = snapshot.autoArrangeSubs;
      (_l = preferences == null ? void 0 : preferences.set) == null ? void 0 : _l.call(preferences, "autoArrangeSubs", snapshot.autoArrangeSubs);
    }
    if (typeof snapshot.primarySubPosition === "string") {
      primarySubPositionSetting = snapshot.primarySubPosition === "top" ? "top" : "bottom";
      (_m = preferences == null ? void 0 : preferences.set) == null ? void 0 : _m.call(preferences, "primarySubPosition", snapshot.primarySubPosition);
    }
    if (typeof snapshot.secondarySubPosition === "string") {
      secondarySubPositionSetting = snapshot.secondarySubPosition === "top" ? "top" : "bottom";
      (_n = preferences == null ? void 0 : preferences.set) == null ? void 0 : _n.call(preferences, "secondarySubPosition", snapshot.secondarySubPosition);
    }
    if (typeof snapshot.segmentationEnabled === "boolean") {
      segmentationEnabledSetting = snapshot.segmentationEnabled;
      (_o = preferences == null ? void 0 : preferences.set) == null ? void 0 : _o.call(preferences, "segmentationEnabled", snapshot.segmentationEnabled);
    }
    if (snapshot.appearance && typeof snapshot.appearance === "object") {
      const app = snapshot.appearance;
      if (app.fontSize) (_p = preferences == null ? void 0 : preferences.set) == null ? void 0 : _p.call(preferences, "overlayFontSize", app.fontSize);
      if (app.bgColor) (_q = preferences == null ? void 0 : preferences.set) == null ? void 0 : _q.call(preferences, "overlayBgColor", app.bgColor);
      if (typeof app.bgOpacity === "number") (_r = preferences == null ? void 0 : preferences.set) == null ? void 0 : _r.call(preferences, "overlayBgOpacity", app.bgOpacity);
      if (app.textColor) (_s = preferences == null ? void 0 : preferences.set) == null ? void 0 : _s.call(preferences, "overlayTextColor", app.textColor);
      if (typeof app.showTranslit === "boolean") (_t = preferences == null ? void 0 : preferences.set) == null ? void 0 : _t.call(preferences, "showTransliteration", app.showTranslit);
      if (app.placement) (_u = preferences == null ? void 0 : preferences.set) == null ? void 0 : _u.call(preferences, "overlayPlacement", app.placement);
      if (typeof app.customOffset === "number") (_v = preferences == null ? void 0 : preferences.set) == null ? void 0 : _v.call(preferences, "overlayCustomOffset", app.customOffset);
      if (app.overlayDock) (_w = preferences == null ? void 0 : preferences.set) == null ? void 0 : _w.call(preferences, "overlayDock", app.overlayDock);
    }
    (_x = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _x.call(preferences);
    appearanceSettingsCache = null;
    applyAppearanceSettings();
    clearTranslationCaches();
    usingFullFileTranslation = false;
    subtitleEntries = null;
    lastSentenceIndex = -1;
    currentTranslateJobId += 1;
    translateCurrentSubtitleFile();
    buildMenu();
  }
  function savePreset(slot, name) {
    var _a4;
    const presets = getPresets();
    presets[slot] = {
      name: name || ((_a4 = presets[slot]) == null ? void 0 : _a4.name) || `Preset ${slot}`,
      settings: getCurrentSettingsSnapshot(),
      updatedAt: Date.now()
    };
    savePresets(presets);
  }
  function clearPreset(slot) {
    const presets = getPresets();
    delete presets[slot];
    savePresets(presets);
  }
  function applyPreset(slot) {
    const presets = getPresets();
    const preset = presets[slot];
    if (!preset || !preset.settings) {
      core.osd(`POLYSCRIPT: Preset ${slot} is empty`, 2e3);
      return;
    }
    applySettingsSnapshot(preset.settings);
    core.osd(`POLYSCRIPT: Applied ${preset.name || `Preset ${slot}`}`, 2e3);
  }
  function updateRecentLangs(code) {
    var _a4;
    if (!preferences || typeof preferences.set !== "function") return;
    let recent = Array.isArray(recentLangsCache) ? [...recentLangsCache] : [];
    recent = recent.filter((c) => c && c !== code);
    recent.unshift(code);
    recent = recent.slice(0, RECENT_LANG_LIMIT);
    recentLangsCache = recent;
    preferences.set("psRecentLangs", JSON.stringify(recent));
    (_a4 = preferences.sync) == null ? void 0 : _a4.call(preferences);
  }
  function isSegmentationEnabled() {
    return segmentationEnabledSetting;
  }
  function readAppearanceSettingsFromPreferences() {
    const fontSize = preferences && preferences.get && preferences.get("overlayFontSize") || "large";
    const bgColor = preferences && preferences.get && preferences.get("overlayBgColor") || BG_COLORS.Black;
    const bgOpacityRaw = preferences && preferences.get && preferences.get("overlayBgOpacity");
    const bgOpacity = typeof bgOpacityRaw === "number" ? bgOpacityRaw : 0.85;
    const textColor = preferences && preferences.get && preferences.get("overlayTextColor") || TEXT_COLORS.White;
    const showTranslit = preferences && preferences.get && preferences.get("showTransliteration");
    const placement = preferences && preferences.get && preferences.get("overlayPlacement") || "auto";
    const customOffset = preferences && preferences.get && preferences.get("overlayCustomOffset");
    const overlayDock = preferences && preferences.get && preferences.get("overlayDock") || "bottom";
    return {
      fontSize: FONT_SIZE_PRESETS[fontSize] ? fontSize : "large",
      bgColor,
      bgOpacity,
      textColor,
      showTranslit: typeof showTranslit === "boolean" ? showTranslit : true,
      placement: OVERLAY_PLACEMENTS[placement] ? placement : "auto",
      customOffset: typeof customOffset === "number" ? customOffset : 140,
      overlayDock: overlayDock === "top" ? "top" : "bottom"
    };
  }
  function getAppearanceSettings() {
    if (!appearanceSettingsCache) {
      appearanceSettingsCache = readAppearanceSettingsFromPreferences();
    }
    return appearanceSettingsCache;
  }
  appearanceSettingsCache = readAppearanceSettingsFromPreferences();
  function applyAppearanceSettings() {
    const settings = getAppearanceSettings();
    showTransliteration = settings.showTranslit;
    const preset = FONT_SIZE_PRESETS[settings.fontSize];
    overlay.setStyle(`
      .ps-container {
        position: fixed;
        bottom: 60px;
        left: 0;
        right: 0;
        text-align: center;
        font: ${preset.primary} -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: ${settings.textColor};
        text-shadow: 0 1px 2px rgba(0,0,0,0.85);
        pointer-events: none;
        user-select: text;
      }
      .ps-line {
        display: block;
        width: fit-content;
        background: rgba(${settings.bgColor}, ${settings.bgOpacity});
        padding: 4px 8px;
        margin: 2px auto;
        border-radius: 4px;
        pointer-events: auto;
        cursor: pointer;
        transition: background-color 80ms ease, box-shadow 80ms ease;
      }
      .ps-line:hover {
        background: rgba(${settings.bgColor}, ${Math.min(1, settings.bgOpacity + 0.12)});
        box-shadow: 0 0 0 1px rgba(255,255,255,0.2) inset;
      }
      .ps-word-container {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        margin: 0 2px;
        vertical-align: bottom;
        position: relative;
      }
      .ps-transliteration {
        font-size: ${preset.translit};
        color: #fbbf24;
        margin-bottom: 2px;
        font-weight: 500;
        opacity: 0.9;
        display: ${showTransliteration ? "block" : "none"};
      }
      .ps-word {
        cursor: pointer;
        padding: 0 2px;
        border-radius: 2px;
        position: relative;
        display: inline-block;
      }
      .ps-word:hover {
        background: rgba(255,255,255,0.2);
        color: #4ade80;
      }
      .ps-tooltip {
        position: absolute;
        bottom: 110%;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 15, 15, 0.95);
        color: #f8fafc;
        padding: 10px 12px;
        border-radius: 8px;
        font-size: 12px;
        line-height: 1.3;
        min-width: 180px;
        max-width: 320px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.12s ease;
        z-index: 9999;
        text-align: left;
        border: 1px solid rgba(148, 163, 184, 0.35);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      }
      .ps-word-container:hover .ps-tooltip {
        opacity: 1;
      }
      .ps-dict-word {
        font-size: 14px;
        font-weight: 700;
        color: #f8fafc;
      }
      .ps-dict-translit {
        font-size: 12px;
        font-style: italic;
        color: #fbbf24;
        margin-top: 2px;
      }
      .ps-dict-section {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(148, 163, 184, 0.2);
      }
      .ps-dict-pos {
        font-size: 10px;
        font-weight: 700;
        color: #9ca3af;
        text-transform: uppercase;
        margin-top: 6px;
        margin-bottom: 2px;
      }
      .ps-dict-def {
        font-size: 12px;
        color: #e5e7eb;
        margin-top: 2px;
      }
      .ps-dict-example {
        font-size: 11px;
        font-style: italic;
        color: #94a3b8;
        margin-top: 2px;
        margin-left: 8px;
        border-left: 2px solid rgba(148, 163, 184, 0.3);
        padding-left: 6px;
      }
      .ps-dict-translation {
        font-size: 12px;
        color: #93c5fd;
        font-weight: 600;
        margin-top: 4px;
      }
      .ps-muted { color: #aaa; }
    `);
  }
  function clearTranslationCaches() {
    translitCache.clear();
    translitPending.clear();
    dictCache.clear();
    dictPending.clear();
    lineTranslationCache.clear();
    lineTranslationPending.clear();
    lineTranslationQueue.length = 0;
    lineTranslationQueued.clear();
    lineTranslationGeneration += 1;
    lastRenderedText = "";
    lastOriginalText = "";
    showedLineTranslateOsd = false;
    usingNativeTargetSubs = false;
  }
  function scheduleRender(text) {
    if (!text) return;
    pendingRenderText = text;
    if (renderScheduled) return;
    renderScheduled = true;
    setTimeout(() => {
      renderScheduled = false;
      const toRender = pendingRenderText;
      pendingRenderText = null;
      if (toRender) renderSubtitleOverlay(toRender);
    }, 80);
  }
  function scheduleDictionaryOverlayRefresh() {
    if (!lastRenderedText) return;
    const now = Date.now();
    const elapsed = now - lastOverlayInteractionAt;
    if (elapsed >= 320) {
      scheduleRender(lastRenderedText);
      return;
    }
    setTimeout(() => {
      if (!lastRenderedText) return;
      if (Date.now() - lastOverlayInteractionAt < 320) return;
      scheduleRender(lastRenderedText);
    }, 340 - elapsed);
  }
  function enqueueWordInfo(word) {
    const key = normalizeWord(word);
    if (!key) return;
    if (dictCache.has(key) || dictPending.has(key)) return;
    wordInfoQueue.push(key);
    pumpWordInfoQueue();
  }
  function pumpWordInfoQueue() {
    if (wordInfoActive >= WORD_INFO_CONCURRENCY) return;
    const next = wordInfoQueue.shift();
    if (!next) return;
    wordInfoActive += 1;
    fetchWordInfo(next).catch(() => {
    }).finally(() => {
      wordInfoActive -= 1;
      pumpWordInfoQueue();
    });
  }
  function setAppearanceSetting(key, value) {
    if (!preferences || typeof preferences.set !== "function") return;
    preferences.set(key, value);
    if (typeof preferences.sync === "function") preferences.sync();
    appearanceSettingsCache = null;
    applyAppearanceSettings();
    applySubtitleLayout();
    if (lastRenderedText) {
      scheduleRender(lastRenderedText);
    }
  }
  function setTargetLang(code) {
    if (!GOOGLE_TRANSLATE_LANGS[code]) return;
    targetLang = code;
    if (preferences && typeof preferences.set === "function") {
      preferences.set("targetLang", code);
      if (typeof preferences.sync === "function") preferences.sync();
    }
    updateRecentLangs(code);
    clearTranslationCaches();
    usingFullFileTranslation = false;
    usingNativeTargetSubs = false;
    subtitleEntries = null;
    lastSentenceIndex = -1;
    currentTranslateJobId += 1;
    core.osd(`POLYSCRIPT: Target language set to ${getLangLabel(code)}`, 2e3);
    translateCurrentSubtitleFile();
    buildMenu();
  }
  function promptSetLlmTargetLang() {
    var _a4;
    const lang = (_a4 = utils == null ? void 0 : utils.prompt) == null ? void 0 : _a4.call(utils, "LLM target language (e.g., Ancient Greek)", llmCustomTarget || targetLang);
    if (lang == null) return;
    setLlmTargetLang(lang.trim());
  }
  function setLlmTargetLang(lang) {
    var _a4, _b;
    llmCustomTarget = (lang || "").trim();
    (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "llmCustomTarget", llmCustomTarget);
    (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
    clearTranslationCaches();
    usingFullFileTranslation = false;
    subtitleEntries = null;
    lastSentenceIndex = -1;
    currentTranslateJobId += 1;
    translateCurrentSubtitleFile();
    core.osd(`POLYSCRIPT: LLM Target set to ${llmCustomTarget || targetLang}`, 2e3);
  }
  function getOverlayBottomPx() {
    const settings = getAppearanceSettings();
    const base = 60;
    if (settings.placement === "normal") return base;
    if (settings.placement === "raised") return 120;
    if (settings.placement === "high") return 180;
    if (settings.placement === "custom") {
      return Math.max(0, Math.min(400, settings.customOffset));
    }
    if (autoArrangeSubsSetting) {
      return base;
    }
    let hasBuiltInSubs = false;
    try {
      const subText = typeof mpv.getString === "function" ? mpv.getString("sub-text") : "";
      const secText = typeof mpv.getString === "function" ? mpv.getString("secondary-sub-text") : "";
      hasBuiltInSubs = !!(subText && subText.trim()) || !!(secText && secText.trim());
    } catch {
    }
    return base + (hasBuiltInSubs ? 80 : 0);
  }
  function getOverlayPositionStyle() {
    const settings = getAppearanceSettings();
    const offset = getOverlayBottomPx();
    if (settings.overlayDock === "top") {
      return `top:${offset}px; bottom:auto;`;
    }
    return `bottom:${offset}px; top:auto;`;
  }
  function safeGetNumber(prop) {
    try {
      if (typeof mpv.getNumber === "function") {
        const val = mpv.getNumber(prop);
        return typeof val === "number" ? val : null;
      }
    } catch {
    }
    return null;
  }
  function safeSetNumber(prop, value) {
    try {
      if (typeof mpv.set === "function") {
        mpv.set(prop, value);
        return true;
      }
    } catch {
    }
    return false;
  }
  function setSecondarySubPos(value) {
    if (safeSetNumber("secondary-sub-pos", value)) return true;
    if (safeSetNumber("sub2-pos", value)) return true;
    return false;
  }
  function captureSubPositions() {
    if (originalSubPositions.captured) return;
    originalSubPositions.primary = safeGetNumber("sub-pos");
    originalSubPositions.secondary = safeGetNumber("secondary-sub-pos");
    if (originalSubPositions.secondary == null) {
      originalSubPositions.secondary = safeGetNumber("sub2-pos");
    }
    originalSubPositions.captured = true;
  }
  function restoreSubPositions() {
    if (!originalSubPositions.captured) return;
    if (originalSubPositions.primary != null) {
      safeSetNumber("sub-pos", originalSubPositions.primary);
    }
    if (originalSubPositions.secondary != null) {
      setSecondarySubPos(originalSubPositions.secondary);
    }
  }
  function applySubtitleLayout() {
    const autoArrange = autoArrangeSubsSetting;
    const primaryPref = primarySubPositionSetting;
    const secondaryPref = secondarySubPositionSetting;
    if (autoArrange) {
      captureSubPositions();
      const dock = getAppearanceSettings().overlayDock;
      if (dock === "bottom") {
        safeSetNumber("sub-pos", 15);
        setSecondarySubPos(30);
      } else {
        safeSetNumber("sub-pos", 90);
        setSecondarySubPos(75);
      }
      return;
    }
    const primaryPos = primaryPref === "top" ? 15 : 90;
    const secondaryPos = secondaryPref === "top" ? 30 : 75;
    safeSetNumber("sub-pos", primaryPos);
    setSecondarySubPos(secondaryPos);
  }
  function getTtsSettings() {
    return { ...ttsSettingsCache };
  }
  function getTtsVoiceMap() {
    return { ...ttsVoiceMapCache };
  }
  function saveTtsVoiceMap(map) {
    var _a4;
    if (!(preferences == null ? void 0 : preferences.set)) return;
    ttsVoiceMapCache = parseTtsVoiceMap(map);
    preferences.set("ttsVoiceMap", JSON.stringify(map));
    (_a4 = preferences.sync) == null ? void 0 : _a4.call(preferences);
  }
  function getVoicePreferenceKey() {
    if (llmCustomTarget) {
      return String(llmCustomTarget).trim();
    }
    return targetLang || "";
  }
  function getVoicePreferenceLabel(key) {
    if (!key) return "current";
    if (GOOGLE_TRANSLATE_LANGS[key]) return `${GOOGLE_TRANSLATE_LANGS[key]} (${key})`;
    return key;
  }
  function isProbablyLangCode(value) {
    return /^[a-z]{2,3}([_-][a-z0-9]{2,4})?$/i.test(String(value || "").trim());
  }
  function normalizeLangCode(value) {
    return String(value || "").trim().replace("_", "-").toLowerCase();
  }
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function shellQuote(text) {
    if (text == null) return "''";
    return `'${String(text).replace(/'/g, `'"'"'`)}'`;
  }
  function getNativePort(baseUrl) {
    const match = String(baseUrl || "").match(/:(\d+)/);
    if (match) {
      const port = Number(match[1]);
      if (!Number.isNaN(port)) return port;
    }
    return 8123;
  }
  function getAutoVoiceLangCode() {
    const context = getTtsLanguageContext();
    return context.langCode || "";
  }
  function maybeShowTtsSubstitutionNotice(context) {
    const substitution = context == null ? void 0 : context.substitution;
    if (!(substitution == null ? void 0 : substitution.voiceLabel) || !(context == null ? void 0 : context.requestedLabel)) return;
    const key = `${context.requestedKey || context.requestedLabel}:${substitution.code}`;
    const now = Date.now();
    if (lastTtsSubstitutionNoticeKey === key && now - lastTtsSubstitutionNoticeAt < 1e4) return;
    lastTtsSubstitutionNoticeKey = key;
    lastTtsSubstitutionNoticeAt = now;
    core.osd(`POLYSCRIPT: Using ${substitution.voiceLabel} voice for ${context.requestedLabel}.`, 2200);
  }
  function maybeShowTtsUnsupportedNotice(context) {
    const label = String((context == null ? void 0 : context.requestedLabel) || (context == null ? void 0 : context.requestedKey) || "this language").trim();
    const key = String((context == null ? void 0 : context.requestedKey) || label).toLowerCase();
    const now = Date.now();
    if (lastTtsUnsupportedNoticeKey === key && now - lastTtsUnsupportedNoticeAt < 8e3) return;
    lastTtsUnsupportedNoticeKey = key;
    lastTtsUnsupportedNoticeAt = now;
    core.osd(`POLYSCRIPT: Language not supported for TTS (${label}).`, 2500);
  }
  function getMappedVoiceForCurrentTarget() {
    const map = getTtsVoiceMap();
    const key = getVoicePreferenceKey();
    if (!key) return "";
    return String(map[key] || "").trim();
  }
  function setMappedVoiceForCurrentTarget(nextVoice) {
    var _a4;
    const key = getVoicePreferenceKey();
    const voice = String(nextVoice || "").trim();
    if (!key) {
      (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "ttsVoice", voice);
      return;
    }
    const map = getTtsVoiceMap();
    if (voice) {
      map[key] = voice;
    } else {
      delete map[key];
    }
    saveTtsVoiceMap(map);
  }
  function hasPersonalVoiceForLanguage(langCode) {
    if (!langCode || !nativeVoices.length) return false;
    const norm = normalizeLangCode(langCode);
    const base = norm.split("-")[0];
    return nativeVoices.some((voice) => {
      if (!(voice == null ? void 0 : voice.isPersonal)) return false;
      const voiceLang = normalizeLangCode(voice.language || "");
      if (!voiceLang) return false;
      return voiceLang === norm || voiceLang.split("-")[0] === base;
    });
  }
  function buildVoiceSelectorState() {
    var _a4;
    const settings = getTtsSettings();
    const mappedVoice = getMappedVoiceForCurrentTarget();
    const langCode = getAutoVoiceLangCode();
    const personalAvailable = hasPersonalVoiceForLanguage(langCode);
    const cloudAvailable = !!polyscriptToken;
    const cloudVoiceOptions = Array.isArray(cloudVoices) ? cloudVoices.map((voice) => String((voice == null ? void 0 : voice.name) || "").trim()).filter((name) => name).map((name) => ({ value: name, label: name })) : [];
    const options = [{ value: VOICE_SELECTOR_SYSTEM, label: "System Voice" }];
    if (cloudAvailable) {
      options.push({ value: VOICE_SELECTOR_CLOUD, label: "Cloud Voice" });
    }
    if (personalAvailable) {
      options.push({ value: VOICE_SELECTOR_PERSONAL, label: "Personal Voice" });
    }
    let value = VOICE_SELECTOR_SYSTEM;
    if (settings.engine === "cloud" && cloudAvailable) {
      value = VOICE_SELECTOR_CLOUD;
    } else if (mappedVoice === PERSONAL_VOICE_TOKEN || settings.engine === "native" && personalAvailable) {
      value = VOICE_SELECTOR_PERSONAL;
    }
    return {
      value,
      options,
      personalAvailable,
      cloudAvailable,
      cloudVoiceOptions,
      selectedCloudVoice: value === VOICE_SELECTOR_CLOUD ? String(mappedVoice || settings.voice || ((_a4 = cloudVoiceOptions[0]) == null ? void 0 : _a4.value) || "").trim() : "",
      targetLabel: getVoicePreferenceLabel(getVoicePreferenceKey())
    };
  }
  function applyVoiceSelectorChoice(rawValue) {
    var _a4, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q;
    const value = String(rawValue || "").trim();
    if (!value) return;
    if (value === VOICE_SELECTOR_PERSONAL) {
      const langCode = getAutoVoiceLangCode();
      if (!hasPersonalVoiceForLanguage(langCode)) {
        core.osd("POLYSCRIPT: Personal Voice unavailable for this language", 1800);
        return;
      }
      (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "ttsEnabled", true);
      (_b = preferences == null ? void 0 : preferences.set) == null ? void 0 : _b.call(preferences, "ttsEngine", "native");
      (_c = preferences == null ? void 0 : preferences.set) == null ? void 0 : _c.call(preferences, "ttsAutoVoice", true);
      (_d = preferences == null ? void 0 : preferences.set) == null ? void 0 : _d.call(preferences, "ttsPreferPersonal", true);
      (_e = preferences == null ? void 0 : preferences.set) == null ? void 0 : _e.call(preferences, "ttsVoice", "");
      setMappedVoiceForCurrentTarget(PERSONAL_VOICE_TOKEN);
      (_f = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _f.call(preferences);
      buildMenu();
      return;
    }
    if (value === VOICE_SELECTOR_CLOUD) {
      const settings = getTtsSettings();
      const mappedVoice = getMappedVoiceForCurrentTarget();
      const fallbackVoice = String(mappedVoice || settings.voice || ((_g = cloudVoices[0]) == null ? void 0 : _g.name) || "").trim();
      (_h = preferences == null ? void 0 : preferences.set) == null ? void 0 : _h.call(preferences, "ttsEnabled", true);
      (_i = preferences == null ? void 0 : preferences.set) == null ? void 0 : _i.call(preferences, "ttsEngine", "cloud");
      (_j = preferences == null ? void 0 : preferences.set) == null ? void 0 : _j.call(preferences, "ttsAutoVoice", false);
      (_k = preferences == null ? void 0 : preferences.set) == null ? void 0 : _k.call(preferences, "ttsVoice", fallbackVoice);
      setMappedVoiceForCurrentTarget(fallbackVoice);
      (_l = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _l.call(preferences);
      buildMenu();
      return;
    }
    (_m = preferences == null ? void 0 : preferences.set) == null ? void 0 : _m.call(preferences, "ttsEnabled", true);
    (_n = preferences == null ? void 0 : preferences.set) == null ? void 0 : _n.call(preferences, "ttsEngine", "say");
    (_o = preferences == null ? void 0 : preferences.set) == null ? void 0 : _o.call(preferences, "ttsAutoVoice", true);
    (_p = preferences == null ? void 0 : preferences.set) == null ? void 0 : _p.call(preferences, "ttsVoice", "");
    setMappedVoiceForCurrentTarget("");
    (_q = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _q.call(preferences);
    buildMenu();
  }
  function parseSayVoices(stdout) {
    const lines = String(stdout || "").split("\n");
    const voices = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = trimmed.match(/^(.+?)\s+([A-Za-z]{2,3}[_-][A-Za-z]{2,4})\s+#\s*(.*)$/);
      let name = "";
      let locale = "";
      let desc = "";
      if (match) {
        name = match[1].trim();
        locale = match[2].trim();
        desc = match[3].trim();
      } else {
        const parts = trimmed.split(/\s+/);
        name = parts.shift() || "";
        locale = parts.shift() || "";
        desc = parts.join(" ");
      }
      if (!name) continue;
      const normLocale = normalizeLangCode(locale);
      const lang = normLocale ? normLocale.split("-")[0] : "";
      voices.push({ name, locale, normLocale, lang, desc });
    }
    return voices;
  }
  async function refreshVoiceList(force = false) {
    if (!(utils == null ? void 0 : utils.exec)) return cachedVoices;
    const now = Date.now();
    if (!force && cachedVoices.length && now - cachedVoicesAt < VOICE_CACHE_TTL_MS) {
      return cachedVoices;
    }
    if (cachedVoicesPending) return cachedVoicesPending;
    cachedVoicesPending = (async () => {
      try {
        const result = await utils.exec("/usr/bin/say", ["-v", "?"]);
        cachedVoices = parseSayVoices((result == null ? void 0 : result.stdout) || "");
        cachedVoicesAt = Date.now();
      } catch (e) {
        core.osd(`POLYSCRIPT: Unable to list voices (${e.message || e})`, 2e3);
      } finally {
        cachedVoicesPending = null;
        buildMenu();
      }
      return cachedVoices;
    })();
    return cachedVoicesPending;
  }
  function pickVoiceForLang(langCode) {
    if (!langCode || !cachedVoices.length) return "";
    const norm = normalizeLangCode(langCode);
    const exact = cachedVoices.find((v) => v.normLocale === norm);
    if (exact) return exact.name;
    const base = norm.split("-")[0];
    const byLang = cachedVoices.find((v) => v.lang === base);
    if (byLang) return byLang.name;
    const langLabel = String(GOOGLE_TRANSLATE_LANGS[norm] || GOOGLE_TRANSLATE_LANGS[base] || "").trim().toLowerCase();
    if (langLabel) {
      const tokens = langLabel.split(/[^a-z]+/g).map((token) => token.trim()).filter((token) => token.length >= 3);
      if (tokens.length) {
        const byDesc = cachedVoices.find((voice) => {
          const haystack = `${voice.name || ""} ${voice.desc || ""}`.toLowerCase();
          return tokens.some((token) => haystack.includes(token));
        });
        if (byDesc) return byDesc.name;
      }
    }
    return "";
  }
  function filterVoicesByLang(voices, langCode) {
    if (!langCode || !voices.length) return voices || [];
    const norm = normalizeLangCode(langCode);
    const base = norm.split("-")[0];
    return voices.filter((voice) => {
      const locale = normalizeLangCode(voice.locale || voice.language || "");
      if (!locale) return false;
      return locale === norm || locale.split("-")[0] === base;
    });
  }
  function normalizeVoiceToken(value) {
    return String(value || "").toLowerCase().replace(/[\u2018\u2019\u201A\u201B\u2032\u2035\u00B4]/g, "'").replace(/[^a-z0-9]+/g, "");
  }
  function resolveVoiceByName(input, voices) {
    const raw = String(input || "").trim();
    if (!raw) return { voice: null, reason: "empty" };
    const lower = raw.toLowerCase();
    const norm = normalizeVoiceToken(raw);
    const exact = voices.find((v) => {
      const nameNorm = normalizeVoiceToken(v.name);
      const idNorm = normalizeVoiceToken(v.identifier || "");
      return nameNorm === norm || idNorm === norm || v.name.toLowerCase() === lower || v.identifier && v.identifier.toLowerCase() === lower;
    });
    if (exact) return { voice: exact, reason: "exact" };
    const matches = voices.filter((v) => {
      const name = v.name.toLowerCase();
      const id = (v.identifier || "").toLowerCase();
      const nameNorm = normalizeVoiceToken(v.name);
      const idNorm = normalizeVoiceToken(v.identifier || "");
      return name.includes(lower) || id.includes(lower) || norm && (nameNorm.includes(norm) || idNorm.includes(norm));
    });
    if (matches.length === 1) return { voice: matches[0], reason: "partial" };
    if (matches.length > 1) return { voice: null, reason: "multiple", matches };
    return { voice: null, reason: "not_found" };
  }
  function resolveTtsVoiceForCurrentLang() {
    const settings = getTtsSettings();
    const map = getTtsVoiceMap();
    const key = getVoicePreferenceKey();
    const mapped = key ? String(map[key] || "").trim() : "";
    const resolveSayVoice = (candidate) => {
      const raw = String(candidate || "").trim();
      if (!raw || !cachedVoices.length) return "";
      const resolved = resolveVoiceByName(raw, cachedVoices);
      return resolved.voice ? resolved.voice.name : "";
    };
    if (mapped === PERSONAL_VOICE_TOKEN) return "";
    const mappedVoice = resolveSayVoice(mapped);
    if (mappedVoice) return mappedVoice;
    if (settings.autoVoice) {
      const langCode = getAutoVoiceLangCode();
      const autoVoice = pickVoiceForLang(langCode);
      if (autoVoice) return autoVoice;
    }
    const fallbackVoice = resolveSayVoice(settings.voice || "");
    if (fallbackVoice) return fallbackVoice;
    return "";
  }
  async function refreshNativeVoices(force = false) {
    const settings = getTtsSettings();
    const now = Date.now();
    if (!force && nativeVoices.length && now - nativeVoicesAt < VOICE_CACHE_TTL_MS) {
      return nativeVoices;
    }
    if (nativeVoicesPending) return nativeVoicesPending;
    nativeVoicesPending = (async () => {
      const ready = await ensureNativeHelperReady();
      if (!ready) {
        nativeVoicesPending = null;
        return nativeVoices;
      }
      try {
        const endpoint = settings.nativeEngine === "nss" ? "voices-ns" : "voices";
        const resp = await safeHttpGet(`${settings.nativeBaseUrl}/${endpoint}`, { timeout: 1.5 });
        if (resp.statusCode && resp.statusCode >= 400) {
          core.osd(`POLYSCRIPT: Native voices failed (HTTP ${resp.statusCode})`, 2e3);
        } else if (Array.isArray(resp.data)) {
          nativeVoices = resp.data.map((v) => ({
            name: v.name || v.identifier || "",
            identifier: v.identifier || "",
            language: v.language || "",
            isPersonal: !!v.isPersonal
          })).filter((v) => v.name);
          nativeVoicesAt = Date.now();
        }
      } catch (e) {
        core.osd(`POLYSCRIPT: Native voices error (${e.message || e})`, 2e3);
      } finally {
        nativeVoicesPending = null;
        buildMenu();
      }
      return nativeVoices;
    })();
    return nativeVoicesPending;
  }
  function pickNativeVoiceForLang(langCode, preferPersonal) {
    if (!langCode || !nativeVoices.length) return "";
    const norm = normalizeLangCode(langCode);
    const base = norm.split("-")[0];
    const candidates = nativeVoices.filter((v) => {
      const lang = normalizeLangCode(v.language);
      return lang === norm || lang.split("-")[0] === base;
    });
    if (!candidates.length) return "";
    if (preferPersonal) {
      const personal = candidates.find((v) => v.isPersonal);
      if (personal) return personal.identifier || personal.name;
    }
    return candidates[0].identifier || candidates[0].name;
  }
  async function checkNativeHelper() {
    const settings = getTtsSettings();
    try {
      const resp = await safeHttpGet(`${settings.nativeBaseUrl}/health`, { timeout: 1 });
      if (resp.statusCode && resp.statusCode >= 400) return false;
      return true;
    } catch {
      return false;
    }
  }
  async function fetchPersonalVoiceStatus() {
    var _a4;
    const settings = getTtsSettings();
    const ready = await ensureNativeHelperReady();
    if (!ready) return null;
    try {
      const resp = await safeHttpGet(`${settings.nativeBaseUrl}/personal-voice-status`, { timeout: 1.5 });
      if (resp.statusCode && resp.statusCode >= 400) return null;
      return ((_a4 = resp.data) == null ? void 0 : _a4.status) || null;
    } catch {
      return null;
    }
  }
  async function requestPersonalVoiceAccess() {
    var _a4;
    const settings = getTtsSettings();
    const ready = await ensureNativeHelperReady();
    if (!ready) {
      core.osd("POLYSCRIPT: Native helper not ready", 1500);
      return;
    }
    try {
      const resp = await safeHttpPost(`${settings.nativeBaseUrl}/personal-voice-request`, {
        headers: { "Content-Type": "application/json" },
        data: {},
        timeout: 3
      });
      const status = ((_a4 = resp.data) == null ? void 0 : _a4.status) || "unknown";
      core.osd(`POLYSCRIPT: Personal Voice ${status}`, 2e3);
      if (status === "authorized") {
        refreshNativeVoices(true);
      }
    } catch (e) {
      core.osd("POLYSCRIPT: Personal Voice request failed", 2e3);
    }
  }
  async function startNativeHelper() {
    const settings = getTtsSettings();
    if (!settings.nativeHelperPath || !(utils == null ? void 0 : utils.exec)) return false;
    const port = getNativePort(settings.nativeBaseUrl);
    const cmd = `${shellQuote(settings.nativeHelperPath)} --port ${port} >/tmp/polyscript_tts.log 2>&1 &`;
    try {
      await utils.exec("/bin/sh", ["-c", cmd]);
      return true;
    } catch {
      return false;
    }
  }
  async function ensureNativeHelperReady() {
    const settings = getTtsSettings();
    if (await checkNativeHelper()) return true;
    if (!settings.nativeAutoStart) return false;
    const started = await startNativeHelper();
    if (!started) return false;
    for (let i = 0; i < 6; i += 1) {
      await sleep(250);
      if (await checkNativeHelper()) return true;
    }
    return false;
  }
  function decodeBase64ToBytes(base64) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const lookup = new Uint8Array(256);
    for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
    const clean = String(base64).replace(/[=\s]/g, "");
    const len = clean.length;
    const bytes = new Uint8Array(Math.floor(len * 3 / 4));
    let p = 0;
    for (let i = 0; i < len; i += 4) {
      const c1 = lookup[clean.charCodeAt(i)];
      const c2 = lookup[clean.charCodeAt(i + 1)];
      const c3 = lookup[clean.charCodeAt(i + 2)];
      const c4 = lookup[clean.charCodeAt(i + 3)];
      bytes[p++] = c1 << 2 | c2 >> 4;
      if (i + 2 < len) bytes[p++] = (c2 & 15) << 4 | c3 >> 2;
      if (i + 3 < len) bytes[p++] = (c3 & 3) << 6 | c4;
    }
    return bytes;
  }
  function encodeBytesToBase64(bytes) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const len = bytes.length;
    let output = "";
    const parts = [];
    const chunk = 8192;
    for (let i = 0; i < len; i += 3) {
      const b1 = bytes[i];
      const b2 = bytes[i + 1];
      const b3 = bytes[i + 2];
      const t = b1 << 16 | b2 << 8 | b3;
      let s = chars[t >> 18 & 63] + chars[t >> 12 & 63];
      s += i + 1 < len ? chars[t >> 6 & 63] : "=";
      s += i + 2 < len ? chars[t & 63] : "=";
      parts.push(s);
      if (parts.length >= chunk) {
        output += parts.join("");
        parts.length = 0;
      }
    }
    if (parts.length) output += parts.join("");
    return output;
  }
  function buildWavBytesFromPcm16(chunks, sampleRate = 24e3, channels = 1) {
    const bytesPerSample = 2;
    const dataSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(44 + dataSize);
    const view = new DataView(out.buffer);
    let offset = 0;
    const writeAscii = (value) => {
      for (let i = 0; i < value.length; i += 1) {
        view.setUint8(offset++, value.charCodeAt(i));
      }
    };
    writeAscii("RIFF");
    view.setUint32(offset, 36 + dataSize, true);
    offset += 4;
    writeAscii("WAVE");
    writeAscii("fmt ");
    view.setUint32(offset, 16, true);
    offset += 4;
    view.setUint16(offset, 1, true);
    offset += 2;
    view.setUint16(offset, channels, true);
    offset += 2;
    view.setUint32(offset, sampleRate, true);
    offset += 4;
    view.setUint32(offset, sampleRate * channels * bytesPerSample, true);
    offset += 4;
    view.setUint16(offset, channels * bytesPerSample, true);
    offset += 2;
    view.setUint16(offset, bytesPerSample * 8, true);
    offset += 2;
    writeAscii("data");
    view.setUint32(offset, dataSize, true);
    offset += 4;
    chunks.forEach((chunk) => {
      out.set(chunk, offset);
      offset += chunk.length;
    });
    return out;
  }
  function parseJsonPayload(raw) {
    if (!raw) return null;
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(String(raw));
    } catch {
      return null;
    }
  }
  function getNestedValue(obj, path) {
    if (!obj || typeof obj !== "object") return void 0;
    let current = obj;
    for (const key of path) {
      if (!current || typeof current !== "object" || !(key in current)) return void 0;
      current = current[key];
    }
    return current;
  }
  function extractAccessToken(payload) {
    if (!payload || typeof payload !== "object") return "";
    const candidatePaths = [
      ["access_token"],
      ["accessToken"],
      ["token"],
      ["id_token"],
      ["idToken"],
      ["jwt"],
      ["bearer_token"],
      ["bearerToken"],
      ["auth", "access_token"],
      ["auth", "accessToken"],
      ["auth", "token"],
      ["session", "access_token"],
      ["session", "accessToken"],
      ["session", "token"],
      ["tokens", "access_token"],
      ["tokens", "accessToken"],
      ["tokens", "token"],
      ["data", "access_token"],
      ["data", "accessToken"],
      ["data", "token"],
      ["result", "access_token"],
      ["result", "accessToken"],
      ["result", "token"]
    ];
    for (const path of candidatePaths) {
      const value = getNestedValue(payload, path);
      const token = typeof value === "string" ? value.trim() : "";
      if (token) return token;
    }
    const authHeader = String(payload.authorization || payload.Authorization || "").trim();
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      return authHeader.slice(7).trim();
    }
    return "";
  }
  function extractDeviceAuthorized(payload) {
    if (!payload || typeof payload !== "object") return false;
    const direct = [
      payload.authorized,
      payload.approved,
      getNestedValue(payload, ["data", "authorized"]),
      getNestedValue(payload, ["data", "approved"]),
      getNestedValue(payload, ["result", "authorized"]),
      getNestedValue(payload, ["result", "approved"])
    ];
    if (direct.some((value) => value === true)) return true;
    const status = String(
      payload.status || payload.state || getNestedValue(payload, ["data", "status"]) || getNestedValue(payload, ["data", "state"]) || getNestedValue(payload, ["result", "status"]) || getNestedValue(payload, ["result", "state"]) || ""
    ).toLowerCase();
    return status === "authorized" || status === "approved" || status === "complete" || status === "completed" || status === "success";
  }
  function extractDeviceId(payload) {
    if (!payload || typeof payload !== "object") return "";
    const value = payload.device_id || payload.deviceId || getNestedValue(payload, ["device", "id"]) || getNestedValue(payload, ["data", "device_id"]) || getNestedValue(payload, ["data", "deviceId"]) || getNestedValue(payload, ["result", "device_id"]) || getNestedValue(payload, ["result", "deviceId"]) || "";
    return String(value || "").trim();
  }
  function extractUserCode(payload) {
    if (!payload || typeof payload !== "object") return "";
    const value = payload.user_code || payload.userCode || payload.code || getNestedValue(payload, ["data", "user_code"]) || getNestedValue(payload, ["data", "userCode"]) || getNestedValue(payload, ["data", "code"]) || getNestedValue(payload, ["result", "user_code"]) || getNestedValue(payload, ["result", "userCode"]) || getNestedValue(payload, ["result", "code"]) || "";
    return String(value || "").trim();
  }
  function extractVerificationUrl(payload) {
    if (!payload || typeof payload !== "object") return "";
    const value = payload.verification_url || payload.verificationUrl || payload.verify_url || payload.verifyUrl || getNestedValue(payload, ["data", "verification_url"]) || getNestedValue(payload, ["data", "verificationUrl"]) || getNestedValue(payload, ["result", "verification_url"]) || getNestedValue(payload, ["result", "verificationUrl"]) || "";
    return String(value || "").trim();
  }
  function buildApiDeviceVerificationUrl(deviceId, userCode) {
    const base = String(polyscriptBaseUrl || DEFAULT_POLYSCRIPT_BASE_URL).replace(/\/+$/, "");
    if (!deviceId || !userCode) return "";
    return `${base}/api/auth/device/verify?device_id=${encodeURIComponent(deviceId)}&code=${encodeURIComponent(userCode)}`;
  }
  function normalizeDeviceVerificationUrl(rawUrl, deviceId, userCode) {
    const direct = String(rawUrl || "").trim();
    if (!direct) return buildApiDeviceVerificationUrl(deviceId, userCode);
    const normalized = direct.replace(
      /^(https?:\/\/[^\/]+)\/auth\/device\/verify\?/i,
      "$1/api/auth/device/verify?"
    );
    return normalized || buildApiDeviceVerificationUrl(deviceId, userCode);
  }
  function buildTrialOnboardingUrl(email) {
    const base = String(polyscriptBaseUrl || DEFAULT_POLYSCRIPT_BASE_URL).replace(/\/+$/, "");
    const params = ["source=iina_plugin", "intent=free_trial", "utm_medium=plugin", "utm_campaign=iina_beta"];
    const normalizedEmail = String(email || "").trim();
    if (normalizedEmail) {
      params.push(`email=${encodeURIComponent(normalizedEmail)}`);
    }
    return `${base}/login?${params.join("&")}`;
  }
  async function openTrialOnboarding() {
    const email = getSavedLoginEmail();
    const targetUrl = buildTrialOnboardingUrl(email);
    const opened = await openUrlExternal(targetUrl);
    if (opened) {
      core.osd("POLYSCRIPT: Opened free trial in browser", 2200);
    } else {
      core.osd("POLYSCRIPT: Could not open browser for trial", 2500);
    }
    void postTelemetryEvent("onboarding.trial_cta_clicked", {
      feature: "onboarding",
      outcome: opened ? "opened" : "failed",
      properties: {
        has_email: !!email,
        target_url: targetUrl
      }
    });
  }
  async function exchangeDeviceAccessToken(deviceId) {
    if (!http || !deviceId) return "";
    const encoded = encodeURIComponent(deviceId);
    const attempts = [
      { method: "post", url: `${polyscriptBaseUrl}/api/auth/device/token`, data: { device_id: deviceId } },
      { method: "get", url: `${polyscriptBaseUrl}/api/auth/device/token?device_id=${encoded}` },
      { method: "post", url: `${polyscriptBaseUrl}/api/auth/device/exchange`, data: { device_id: deviceId } },
      { method: "get", url: `${polyscriptBaseUrl}/api/auth/device/exchange?device_id=${encoded}` }
    ];
    for (const attempt of attempts) {
      try {
        const resp = attempt.method === "post" ? await safeHttpPost(attempt.url, {
          headers: { "Content-Type": "application/json" },
          data: attempt.data || {},
          timeout: 3
        }) : await safeHttpGet(attempt.url, { timeout: 3 });
        if ((resp == null ? void 0 : resp.statusCode) && resp.statusCode >= 400) continue;
        const payload = parseJsonPayload((resp == null ? void 0 : resp.data) || (resp == null ? void 0 : resp.text)) || {};
        const token = extractAccessToken(payload);
        if (token) return token;
      } catch {
      }
    }
    return "";
  }
  async function openUrlExternal(url) {
    const target = String(url || "").trim();
    if (!target || !(utils == null ? void 0 : utils.exec)) return false;
    try {
      await utils.exec("/usr/bin/open", [target]);
      return true;
    } catch {
      return false;
    }
  }
  function getSavedLoginEmail() {
    return savedLoginEmailCache;
  }
  function saveLoginEmail(email) {
    var _a4, _b;
    const normalized = String(email || "").trim();
    savedLoginEmailCache = normalized;
    (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "polyscriptLoginEmail", normalized);
    (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
  }
  function setPolyscriptToken(token) {
    var _a4;
    polyscriptToken = String(token || "").trim();
    (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "polyscriptToken", polyscriptToken);
    if (polyscriptToken) {
      stopDeviceLoginFlow();
    }
    cloudVoices = [];
    cloudVoicesAt = 0;
    cloudVoicesPending = null;
    cloudVoicesBootstrapped = false;
    entitlementSnapshot = null;
    entitlementSnapshotAt = 0;
    entitlementSnapshotPending = null;
    sidebarVoiceRefreshAt = 0;
    console.log(`POLYSCRIPT: ${polyscriptToken ? "Token set" : "Token cleared"} (${polyscriptToken.length} chars)`);
    if (!polyscriptToken) {
      aiStatusState = {
        checking: false,
        available: false,
        statusCode: 401,
        reason: "missing_token",
        checkedAt: Date.now()
      };
    } else {
      aiStatusState = {
        checking: true,
        available: null,
        statusCode: 0,
        reason: "pending",
        checkedAt: 0
      };
    }
    if (polyscriptToken) {
      setAuthFlowState({ phase: "signed_in", message: "Signed in.", verificationUrl: "" }, { emit: false });
    } else if (authFlowState.phase !== "error") {
      setAuthFlowState({ phase: "idle", message: "", verificationUrl: "" }, { emit: false });
    }
  }
  function decodeJwtPayload(token) {
    try {
      const parts = String(token || "").split(".");
      if (parts.length < 2) return null;
      const payloadPart = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = payloadPart + "=".repeat((4 - payloadPart.length % 4) % 4);
      const bytes = decodeBase64ToBytes(padded);
      if (!bytes || !bytes.length) return null;
      let json = "";
      for (let i = 0; i < bytes.length; i += 1) {
        json += String.fromCharCode(bytes[i]);
      }
      return JSON.parse(json);
    } catch {
      return null;
    }
  }
  function isTokenExpiringSoon(token, thresholdSeconds = TOKEN_REFRESH_THRESHOLD_SECONDS) {
    const payload = decodeJwtPayload(token);
    const exp = Number(payload == null ? void 0 : payload.exp);
    if (!Number.isFinite(exp) || exp <= 0) return false;
    const nowSeconds = Math.floor(Date.now() / 1e3);
    return exp - nowSeconds <= Math.max(30, Number(thresholdSeconds) || TOKEN_REFRESH_THRESHOLD_SECONDS);
  }
  function getTokenExpiresInSeconds(token) {
    const payload = decodeJwtPayload(token);
    const exp = Number(payload == null ? void 0 : payload.exp);
    if (!Number.isFinite(exp) || exp <= 0) return null;
    const nowSeconds = Math.floor(Date.now() / 1e3);
    return exp - nowSeconds;
  }
  function buildAiStatusSummary() {
    if (!shouldUseLlmTranslation(getEffectiveTargetLang())) {
      return {
        state: "fast_mode",
        label: "Standard translation active."
      };
    }
    if (!polyscriptToken) {
      return {
        state: "signin_required",
        label: "Use Sign In to enable LLM mode."
      };
    }
    if (aiStatusState.checking || !aiStatusState.checkedAt) {
      return {
        state: "checking",
        label: "Checking LLM status..."
      };
    }
    if (aiStatusState.available === true) {
      return {
        state: "ready",
        label: "LLM ready."
      };
    }
    if (aiStatusState.available === false) {
      if (aiStatusState.reason === "missing_token") {
        return {
          state: "signin_required",
          label: "Use Sign In to enable LLM mode."
        };
      }
      if (aiStatusState.reason === "unavailable") {
        return {
          state: "unavailable",
          label: "LLM temporarily unavailable."
        };
      }
      if (aiStatusState.statusCode > 0) {
        return {
          state: "unavailable",
          label: `LLM unavailable (HTTP ${aiStatusState.statusCode}).`
        };
      }
      return {
        state: "unavailable",
        label: "LLM unavailable."
      };
    }
    const expiresIn = getTokenExpiresInSeconds(polyscriptToken);
    if (typeof expiresIn === "number") {
      if (expiresIn <= 0) {
        return {
          state: "expired",
          label: "Session expired. Sign in again."
        };
      }
    }
    return {
      state: "ready",
      label: "LLM ready."
    };
  }
  async function refreshPolyscriptToken(token) {
    if (!http || !token) return "";
    try {
      const resp = await safeHttpPost(`${polyscriptBaseUrl}/api/auth/refresh`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        data: {},
        timeout: 3
      });
      if (resp.statusCode && resp.statusCode >= 400) return "";
      const payload = parseJsonPayload(resp.data || resp.text);
      const nextToken = String((payload == null ? void 0 : payload.access_token) || "").trim();
      if (!nextToken) return "";
      setPolyscriptToken(nextToken);
      return nextToken;
    } catch {
      return "";
    }
  }
  async function maybeRefreshPolyscriptToken(token) {
    if (!token || !isTokenExpiringSoon(token)) return token;
    if (!tokenRefreshPromise) {
      tokenRefreshPromise = (async () => {
        try {
          const refreshed = await refreshPolyscriptToken(token);
          return refreshed || token;
        } catch {
          return token;
        } finally {
          tokenRefreshPromise = null;
        }
      })();
    }
    return await tokenRefreshPromise;
  }
  async function getValidPolyscriptToken(options = {}) {
    const { forceRefresh = false } = options || {};
    const current = String(polyscriptToken || "").trim();
    if (!current) return "";
    const expiresIn = getTokenExpiresInSeconds(current);
    if (typeof expiresIn === "number" && expiresIn <= 0) {
      handleExpiredPolyscriptSession();
      return "";
    }
    if (forceRefresh) {
      const refreshed = await refreshPolyscriptToken(current);
      if (!refreshed) {
        handleExpiredPolyscriptSession();
        return "";
      }
      return refreshed;
    }
    return await maybeRefreshPolyscriptToken(current);
  }
  function handleExpiredPolyscriptSession() {
    const hadToken = !!polyscriptToken;
    const now = Date.now();
    setPolyscriptToken("");
    setAuthFlowState({ phase: "error", message: "Session expired. Sign in again.", verificationUrl: "" }, { emit: false });
    emitSidebarSettings({ skipAutoAiRefresh: true });
    if (hadToken && now - lastSessionExpiredOsdAt > 3e4) {
      lastSessionExpiredOsdAt = now;
      core.osd("POLYSCRIPT: Session expired. Please sign in again.", 2500);
    }
    buildMenu();
  }
  async function authedGet(url, options = {}) {
    const invalidateOnUnauthorized = !!(options == null ? void 0 : options.invalidateOnUnauthorized);
    const { invalidateOnUnauthorized: _unusedInvalidateOnUnauthorized, ...requestOptions } = options || {};
    const token = await getValidPolyscriptToken();
    if (!token) return { statusCode: 401, text: "missing_token", data: null };
    const headers = { ...requestOptions.headers || {}, Authorization: `Bearer ${token}` };
    let resp = await safeHttpGet(url, { ...requestOptions, headers });
    if ((resp == null ? void 0 : resp.statusCode) === 401) {
      const refreshed = await getValidPolyscriptToken({ forceRefresh: true });
      if (refreshed && refreshed !== token) {
        resp = await safeHttpGet(url, {
          ...requestOptions,
          headers: { ...requestOptions.headers || {}, Authorization: `Bearer ${refreshed}` }
        });
      }
      if ((resp == null ? void 0 : resp.statusCode) === 401 && invalidateOnUnauthorized) {
        handleExpiredPolyscriptSession();
      }
    }
    return resp;
  }
  async function authedPost(url, options = {}) {
    const invalidateOnUnauthorized = !!(options == null ? void 0 : options.invalidateOnUnauthorized);
    const { invalidateOnUnauthorized: _unusedInvalidateOnUnauthorized, ...requestOptions } = options || {};
    const token = await getValidPolyscriptToken();
    if (!token) return { statusCode: 401, text: "missing_token", data: null };
    const headers = { ...requestOptions.headers || {}, Authorization: `Bearer ${token}` };
    let resp = await safeHttpPost(url, { ...requestOptions, headers });
    if ((resp == null ? void 0 : resp.statusCode) === 401) {
      const refreshed = await getValidPolyscriptToken({ forceRefresh: true });
      if (refreshed && refreshed !== token) {
        resp = await safeHttpPost(url, {
          ...requestOptions,
          headers: { ...requestOptions.headers || {}, Authorization: `Bearer ${refreshed}` }
        });
      }
      if ((resp == null ? void 0 : resp.statusCode) === 401 && invalidateOnUnauthorized) {
        handleExpiredPolyscriptSession();
      }
    }
    return resp;
  }
  function isEntitlementFeatureEnabled(snapshot, featureKey) {
    const features = snapshot && typeof snapshot === "object" ? snapshot.features || {} : {};
    return !!(features == null ? void 0 : features[String(featureKey || "").trim()]);
  }
  async function fetchEntitlementSnapshot(force = false) {
    const token = await getValidPolyscriptToken();
    if (!token) return { ok: false, statusCode: 401, data: null, error: "missing_token" };
    const now = Date.now();
    if (!force && entitlementSnapshot && now - entitlementSnapshotAt < ENTITLEMENT_CACHE_TTL_MS) {
      return { ok: true, statusCode: 200, data: entitlementSnapshot };
    }
    if (!force && entitlementSnapshotPending) return entitlementSnapshotPending;
    entitlementSnapshotPending = (async () => {
      try {
        const resp = await authedGet(`${polyscriptBaseUrl}/api/entitlements/me`, {
          timeout: 3
        });
        if (resp.statusCode && resp.statusCode >= 400) {
          return { ok: false, statusCode: resp.statusCode, data: null, error: String(resp.text || "entitlements_failed") };
        }
        const payload = parseJsonPayload(resp.data || resp.text);
        entitlementSnapshot = payload && typeof payload === "object" ? payload : null;
        entitlementSnapshotAt = Date.now();
        return { ok: true, statusCode: 200, data: entitlementSnapshot };
      } catch (error) {
        return { ok: false, statusCode: 0, data: null, error: String((error == null ? void 0 : error.message) || error || "entitlements_failed") };
      } finally {
        entitlementSnapshotPending = null;
      }
    })();
    return entitlementSnapshotPending;
  }
  async function checkLlmStatus(showOsd = true, options = {}) {
    const force = !!(options == null ? void 0 : options.force);
    if (aiStatusCheckPromise && !force) {
      return aiStatusCheckPromise;
    }
    aiStatusState = {
      ...aiStatusState,
      checking: true
    };
    emitSidebarSettings({ skipAutoAiRefresh: true });
    aiStatusCheckPromise = (async () => {
      if (!http) return { ok: false, statusCode: 0, available: false, reason: "no_http" };
      const token = await getValidPolyscriptToken();
      if (!token) {
        aiStatusState = {
          checking: false,
          available: false,
          statusCode: 401,
          reason: "missing_token",
          checkedAt: Date.now()
        };
        emitSidebarSettings({ skipAutoAiRefresh: true });
        if (showOsd) {
          core.osd("POLYSCRIPT: Not signed in. Use Sign In in the panel.", 2500);
        }
        return { ok: false, statusCode: 401, available: false, reason: "missing_token" };
      }
      try {
        const resp = await authedGet(`${polyscriptBaseUrl}/api/llm/status`, {
          timeout: 3,
          invalidateOnUnauthorized: true
        });
        if (resp.statusCode && resp.statusCode >= 400) {
          aiStatusState = {
            checking: false,
            available: false,
            statusCode: Number(resp.statusCode) || 0,
            reason: "http_error",
            checkedAt: Date.now()
          };
          emitSidebarSettings({ skipAutoAiRefresh: true });
          if (showOsd) {
            core.osd(`POLYSCRIPT: LLM status failed (HTTP ${resp.statusCode})`, 2500);
          }
          return { ok: false, statusCode: resp.statusCode, available: false, reason: "http_error" };
        }
        const data = parseJsonPayload(resp.data || resp.text) || {};
        const state = String(data.state || data.status || "").toLowerCase();
        const available = typeof data.available === "boolean" ? data.available : typeof data.ready === "boolean" ? data.ready : typeof data.ok === "boolean" ? data.ok : typeof data.enabled === "boolean" ? data.enabled : state === "ok" || state === "ready" || state === "available";
        aiStatusState = {
          checking: false,
          available,
          statusCode: 200,
          reason: available ? "ready" : "unavailable",
          checkedAt: Date.now()
        };
        emitSidebarSettings({ skipAutoAiRefresh: true });
        if (showOsd) {
          core.osd(`POLYSCRIPT: LLM ${available ? "ready" : "unavailable"}`, 2e3);
        }
        return { ok: true, statusCode: 200, available, reason: available ? "ready" : "unavailable" };
      } catch {
        aiStatusState = {
          checking: false,
          available: false,
          statusCode: 0,
          reason: "request_error",
          checkedAt: Date.now()
        };
        emitSidebarSettings({ skipAutoAiRefresh: true });
        if (showOsd) {
          core.osd("POLYSCRIPT: LLM status check failed", 2e3);
        }
        return { ok: false, statusCode: 0, available: false, reason: "request_error" };
      }
    })();
    try {
      return await aiStatusCheckPromise;
    } finally {
      aiStatusCheckPromise = null;
    }
  }
  function maybeAutoRefreshAiStatus(force = false) {
    if (!shouldUseLlmTranslation(getEffectiveTargetLang())) return;
    if (!polyscriptToken) return;
    if (aiStatusCheckPromise) return;
    if (!force && aiStatusState.checkedAt > 0) return;
    void checkLlmStatus(false, { force });
  }
  async function fetchCloudVoices(force = false) {
    if (!http) return [];
    const token = await getValidPolyscriptToken();
    if (!token) return [];
    const entitlements = await fetchEntitlementSnapshot(force);
    if (entitlements.ok && !isEntitlementFeatureEnabled(entitlements.data, "cloud_tts")) {
      cloudVoices = [];
      cloudVoicesAt = Date.now();
      return [];
    }
    const now = Date.now();
    if (!force && cloudVoices.length && now - cloudVoicesAt < VOICE_CACHE_TTL_MS) {
      return cloudVoices;
    }
    if (cloudVoicesPending) return cloudVoicesPending;
    cloudVoicesPending = (async () => {
      try {
        const resp = await authedGet(`${polyscriptBaseUrl}/api/synthesis/voices`, {
          timeout: 3
        });
        if (resp.statusCode && resp.statusCode >= 400) {
          return cloudVoices;
        }
        const payload = parseJsonPayload(resp.data || resp.text);
        if (Array.isArray(payload)) {
          cloudVoices = payload.map((voice) => ({ id: Number((voice == null ? void 0 : voice.id) || 0), name: String((voice == null ? void 0 : voice.name) || "").trim() })).filter((voice) => voice.name);
          cloudVoicesAt = Date.now();
        }
      } catch {
      } finally {
        cloudVoicesPending = null;
      }
      return cloudVoices;
    })();
    return cloudVoicesPending;
  }
  async function resolveCloudVoiceForCurrentLang(settings) {
    const map = getTtsVoiceMap();
    const key = getVoicePreferenceKey();
    const mapped = key ? String(map[key] || "").trim() : "";
    const fallback = String(settings.voice || "").trim();
    const requested = mapped || fallback;
    const voices = await fetchCloudVoices(false);
    if (!voices.length) return requested || "";
    if (requested) {
      const matched = voices.find((voice) => voice.name === requested);
      if (matched) return matched.name;
    }
    return voices[0].name;
  }
  function buildCloudStreamWebsocketUrl(token) {
    const base = String(polyscriptBaseUrl || "https://polyscript.app").replace(/\/+$/, "");
    const endpoint = `${base}/api/synthesis/stream/ws`;
    const wsEndpoint = endpoint.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:");
    const sep = wsEndpoint.includes("?") ? "&" : "?";
    return `${wsEndpoint}${sep}token=${encodeURIComponent(String(token || ""))}`;
  }
  function appendQueryParam(url, key, value) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    const encodedKey = encodeURIComponent(String(key || ""));
    if (!encodedKey) return raw;
    const encodedVal = encodeURIComponent(String(value || ""));
    const hashIndex = raw.indexOf("#");
    const base = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
    const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";
    const hasQuery = base.includes("?");
    const sep = hasQuery ? "&" : "?";
    return `${base}${sep}${encodedKey}=${encodedVal}${hash}`;
  }
  function buildCloudHttpAudioUrlCandidates(token, sessionData = null) {
    const base = String(polyscriptBaseUrl || "https://polyscript.app").trim().replace(/\/+$/, "");
    const pushUnique = (list, seen2, value) => {
      const raw = String(value || "").trim();
      if (!raw || seen2.has(raw)) return;
      seen2.add(raw);
      list.push(raw);
    };
    const resolved = [];
    const seen = /* @__PURE__ */ new Set();
    const session = sessionData && typeof sessionData === "object" ? sessionData : {};
    const audioIdCandidates = [
      session.audio_id,
      session.audioId,
      session.id,
      session.stream_id,
      session.streamId
    ].map((value) => String(value || "").trim()).filter((value) => value);
    const urlFields = [
      session.stream_url,
      session.streamUrl,
      session.audio_url,
      session.audioUrl,
      session.url
    ];
    urlFields.forEach((value) => {
      let url = String(value || "").trim();
      if (!url) return;
      url = url.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
      if (/\/synthesis\/stream\/ws(?:[/?#]|$)/i.test(url) && audioIdCandidates.length) {
        audioIdCandidates.forEach((id) => {
          const replaced = url.replace(/\/synthesis\/stream\/ws(?=[/?#]|$)/i, `/synthesis/stream/${encodeURIComponent(id)}`);
          pushUnique(resolved, seen, replaced);
        });
        return;
      }
      pushUnique(resolved, seen, url);
    });
    audioIdCandidates.forEach((id) => {
      pushUnique(resolved, seen, `${base}/api/synthesis/stream/${encodeURIComponent(id)}`);
      pushUnique(resolved, seen, `${base}/synthesis/stream/${encodeURIComponent(id)}`);
    });
    if (token) {
      const withToken = [];
      const withTokenSeen = /* @__PURE__ */ new Set();
      resolved.forEach((url) => {
        pushUnique(withToken, withTokenSeen, appendQueryParam(url, "token", token));
        pushUnique(withToken, withTokenSeen, url);
      });
      return withToken;
    }
    return resolved;
  }
  async function playCloudAudioUrl(url) {
    if (!(utils == null ? void 0 : utils.exec)) return false;
    const cleanUrl = String(url || "").trim();
    if (!cleanUrl) return false;
    const token = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const audioPath = `/tmp/polyscript_cloud_tts_${token}.audio`;
    try {
      await utils.exec("/usr/bin/curl", ["-sS", "-L", "--max-time", "35", cleanUrl, "-o", audioPath]);
      if ((file == null ? void 0 : file.exists) && !file.exists(audioPath)) {
        return false;
      }
      await utils.exec("/bin/sh", [
        "-c",
        `(/usr/bin/killall afplay || true); /usr/bin/afplay ${shellQuote(audioPath)} >/dev/null 2>&1 & (/bin/sleep 45; /bin/rm -f ${shellQuote(audioPath)} >/dev/null 2>&1) &`
      ]);
      return true;
    } catch {
      try {
        await utils.exec("/bin/rm", ["-f", audioPath]);
      } catch {
      }
      return false;
    }
  }
  async function tryCloudHttpAudioFallback(sessionData, token) {
    const candidates = buildCloudHttpAudioUrlCandidates(token, sessionData);
    if (!candidates.length) {
      return { ok: false, reason: "http_audio_url_missing", error: "No HTTP audio URL candidates from session response." };
    }
    const errors = [];
    for (const candidate of candidates) {
      try {
        const played = await playCloudAudioUrl(candidate);
        if (played) {
          return { ok: true, candidate };
        }
        errors.push(`play_failed:${candidate}`);
      } catch (e) {
        errors.push(`${String((e == null ? void 0 : e.message) || e)}:${candidate}`);
      }
    }
    return { ok: false, reason: "http_audio_play_failed", error: errors.join(" | ") };
  }
  function buildCloudStreamWebsocketCandidates(token, sessionData = null) {
    const base = String(polyscriptBaseUrl || "https://polyscript.app");
    const buildCandidate = (rawUrl) => {
      const value = String(rawUrl || "").trim();
      if (!value) return "";
      let resolved = value;
      const baseTrimmed = String(base || "").trim().replace(/\/+$/, "");
      const isAbsolute = /^(https?|wss?):\/\//i.test(value);
      if (!isAbsolute) {
        if (!baseTrimmed) return "";
        resolved = value.startsWith("/") ? `${baseTrimmed}${value}` : `${baseTrimmed}/${value}`;
      }
      const wsResolved = resolved.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:");
      const sep = wsResolved.includes("?") ? "&" : "?";
      return `${wsResolved}${sep}token=${encodeURIComponent(String(token || ""))}`;
    };
    const wsCandidates = [];
    const preferred = buildCandidate((sessionData == null ? void 0 : sessionData.url) || "");
    if (preferred) wsCandidates.push(preferred);
    const apiDefault = buildCandidate(`${base.replace(/\/+$/, "")}/api/synthesis/stream/ws`);
    if (apiDefault) wsCandidates.push(apiDefault);
    if ((sessionData == null ? void 0 : sessionData.url) && String(sessionData.url).startsWith("/api/")) {
      const noApiPath = String(sessionData.url).replace(/^\/api\//, "/");
      const fallbackNoApi = buildCandidate(noApiPath);
      if (fallbackNoApi) wsCandidates.push(fallbackNoApi);
    }
    if (!wsCandidates.length) {
      const direct = buildCloudStreamWebsocketUrl(token);
      if (direct) wsCandidates.push(direct);
    }
    return Array.from(new Set(wsCandidates.filter(Boolean)));
  }
  async function streamCloudSynthesisToWavBase64(payload, token, wsCandidatesInput = null) {
    if (typeof WebSocket === "undefined") {
      throw new Error("WebSocket is unavailable in this IINA runtime.");
    }
    if (!token) {
      throw new Error("Cloud stream requires a valid login token.");
    }
    const wsCandidates = Array.isArray(wsCandidatesInput) && wsCandidatesInput.length ? Array.from(new Set(wsCandidatesInput.filter(Boolean))) : [buildCloudStreamWebsocketUrl(token)];
    if (!wsCandidates.length) {
      throw new Error("Cloud stream websocket URL missing.");
    }
    const streamOverWebSocket = async (wsUrl) => await new Promise((resolve, reject) => {
      const chunks = [];
      let sampleRate = Number(payload.sample_rate || 24e3);
      let settled = false;
      let timeoutHandle = null;
      const startedAt = Date.now();
      let firstChunkAt = null;
      let chunkCount = 0;
      let audioBytes = 0;
      let sawSocketError = false;
      const fail = (message) => {
        if (settled) return;
        settled = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        reject(new Error(message));
      };
      const succeed = (socket2) => {
        var _a4;
        if (settled) return;
        settled = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        try {
          (_a4 = socket2 == null ? void 0 : socket2.close) == null ? void 0 : _a4.call(socket2);
        } catch {
        }
        if (!chunks.length) {
          reject(new Error("Cloud stream returned no audio chunks."));
          return;
        }
        const wavBytes = buildWavBytesFromPcm16(chunks, sampleRate, 1);
        resolve({
          audioBase64: encodeBytesToBase64(wavBytes),
          metrics: {
            elapsedMs: Date.now() - startedAt,
            ttfbMs: firstChunkAt != null ? firstChunkAt - startedAt : null,
            chunkCount,
            audioBytes
          }
        });
      };
      timeoutHandle = setTimeout(() => fail(`Cloud stream timed out. URL: ${wsUrl}`), 3e4);
      let socket = null;
      try {
        socket = new WebSocket(wsUrl);
      } catch (socketCreateError) {
        fail(`Cloud websocket unavailable: ${(socketCreateError == null ? void 0 : socketCreateError.message) || socketCreateError}. URL: ${wsUrl}`);
        return;
      }
      socket.onerror = () => {
        sawSocketError = true;
      };
      socket.onclose = (event2) => {
        if (settled) return;
        const code = Number.isFinite(Number(event2 == null ? void 0 : event2.code)) ? Number(event2.code) : null;
        const reason = String((event2 == null ? void 0 : event2.reason) || "").trim();
        if (code === 4401) {
          fail(`Cloud websocket unauthorized (4401). URL: ${wsUrl}`);
          return;
        }
        const prefix = sawSocketError ? "Cloud websocket failed." : "Cloud websocket closed.";
        fail(`${prefix} code=${code != null ? code : "unknown"} reason=${reason || "n/a"} URL: ${wsUrl}`);
      };
      socket.onmessage = (event2) => {
        const data = parseJsonPayload(event2 == null ? void 0 : event2.data);
        const type = String((data == null ? void 0 : data.type) || "").toLowerCase();
        if (type === "connection.ready") {
          try {
            socket.send(JSON.stringify({ type: "session.start", payload }));
          } catch (sendError) {
            fail(`Cloud websocket send failed: ${(sendError == null ? void 0 : sendError.message) || sendError}. URL: ${wsUrl}`);
          }
          return;
        }
        if (type === "session.started") {
          const negotiated = Number(data == null ? void 0 : data.sample_rate);
          if (Number.isFinite(negotiated) && negotiated > 0) sampleRate = negotiated;
          return;
        }
        if (type === "audio.chunk") {
          const chunk = String((data == null ? void 0 : data.payload_b64) || "");
          if (chunk) {
            const decoded = decodeBase64ToBytes(chunk);
            if (decoded.length) {
              chunks.push(decoded);
              chunkCount += 1;
              audioBytes += decoded.length;
              if (firstChunkAt == null) firstChunkAt = Date.now();
            }
          }
          return;
        }
        if (type === "session.error") {
          fail(String((data == null ? void 0 : data.error) || `Cloud stream failed. URL: ${wsUrl}`));
          try {
            socket.close();
          } catch {
          }
          return;
        }
        if (type === "session.completed") {
          succeed(socket);
        }
      };
    });
    const attemptErrors = [];
    for (const candidateUrl of wsCandidates) {
      try {
        return await streamOverWebSocket(candidateUrl);
      } catch (attemptError) {
        attemptErrors.push(String((attemptError == null ? void 0 : attemptError.message) || attemptError));
      }
    }
    throw new Error(`Cloud stream failed after ${wsCandidates.length} attempt(s): ${attemptErrors.join(" | ")}`);
  }
  async function playCloudAudioBase64(audioBase64) {
    if (!(utils == null ? void 0 : utils.exec) || !(file == null ? void 0 : file.write)) return false;
    const token = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const base64Path = `/tmp/polyscript_cloud_tts_${token}.b64`;
    const wavPath = `/tmp/polyscript_cloud_tts_${token}.wav`;
    try {
      file.write(base64Path, String(audioBase64 || ""));
      const decodeAndPlay = [
        "(/usr/bin/killall afplay || true);",
        "/usr/bin/base64 -D -i",
        shellQuote(base64Path),
        "-o",
        shellQuote(wavPath),
        "&& /usr/bin/afplay",
        shellQuote(wavPath),
        "; /bin/rm -f",
        shellQuote(base64Path),
        shellQuote(wavPath),
        ">/dev/null 2>&1 &"
      ].join(" ");
      await utils.exec("/bin/sh", ["-c", decodeAndPlay]);
      return true;
    } catch {
      try {
        await utils.exec("/bin/rm", ["-f", base64Path, wavPath]);
      } catch {
      }
      return false;
    }
  }
  async function playCloudAudioFile(audioPath) {
    if (!(utils == null ? void 0 : utils.exec)) return false;
    const cleanPath = String(audioPath || "").trim();
    if (!cleanPath) return false;
    try {
      await utils.exec("/bin/sh", [
        "-c",
        `(/usr/bin/killall afplay || true); /usr/bin/afplay ${shellQuote(cleanPath)} >/dev/null 2>&1 & (/bin/sleep 45; /bin/rm -f ${shellQuote(cleanPath)} >/dev/null 2>&1) &`
      ]);
      return true;
    } catch {
      try {
        await utils.exec("/bin/rm", ["-f", cleanPath]);
      } catch {
      }
      return false;
    }
  }
  function buildCloudNodeBridgeScript() {
    return String.raw`const fs = require("fs");
const inputPath = process.argv[2];
if (!inputPath) {
  console.error("missing_input");
  process.exit(1);
}
const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const payload = input.payload || {};
const token = String(input.token || "").trim();
const baseUrl = String(input.baseUrl || "").trim().replace(/\/+$/, "");
const wavPath = String(input.wavPath || "").trim();
if (!token || !baseUrl || !wavPath) {
  console.error("missing_parameters");
  process.exit(1);
}
const wsUrl = baseUrl.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:") + "/api/synthesis/stream/ws?token=" + encodeURIComponent(token);
const pcmChunks = [];
let sampleRate = Number(payload.sample_rate || 24000);
let settled = false;
const timeout = setTimeout(() => fail("timeout"), 30000);

function fail(message) {
  if (settled) return;
  settled = true;
  clearTimeout(timeout);
  console.error(String(message || "unknown_error"));
  process.exit(1);
}

function wavFromPcm16(chunks, rate, channels = 1) {
  const dataSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = Buffer.alloc(44 + dataSize);
  let offset = 0;
  const writeAscii = (value) => {
    out.write(value, offset, "ascii");
    offset += value.length;
  };
  writeAscii("RIFF");
  out.writeUInt32LE(36 + dataSize, offset); offset += 4;
  writeAscii("WAVE");
  writeAscii("fmt ");
  out.writeUInt32LE(16, offset); offset += 4;
  out.writeUInt16LE(1, offset); offset += 2;
  out.writeUInt16LE(channels, offset); offset += 2;
  out.writeUInt32LE(rate, offset); offset += 4;
  out.writeUInt32LE(rate * channels * 2, offset); offset += 4;
  out.writeUInt16LE(channels * 2, offset); offset += 2;
  out.writeUInt16LE(16, offset); offset += 2;
  writeAscii("data");
  out.writeUInt32LE(dataSize, offset); offset += 4;
  for (const chunk of chunks) {
    chunk.copy(out, offset);
    offset += chunk.length;
  }
  return out;
}

const ws = new WebSocket(wsUrl);
ws.onerror = (event) => {
  fail(event?.message || "websocket_error");
};
ws.onclose = (event) => {
  if (!settled) {
    fail("closed_" + (event?.code || "unknown"));
  }
};
ws.onmessage = (event) => {
  let data = null;
  try {
    data = JSON.parse(String(event.data || ""));
  } catch (error) {
    fail("json_" + (error.message || error));
    return;
  }
  const type = String(data?.type || "").toLowerCase();
  if (type === "connection.ready") {
    ws.send(JSON.stringify({ type: "session.start", payload }));
    return;
  }
  if (type === "session.started") {
    const nextRate = Number(data?.sample_rate || 0);
    if (Number.isFinite(nextRate) && nextRate > 0) sampleRate = nextRate;
    return;
  }
  if (type === "audio.chunk") {
    const chunk = String(data?.payload_b64 || "");
    if (chunk) pcmChunks.push(Buffer.from(chunk, "base64"));
    return;
  }
  if (type === "session.error") {
    fail(data?.error || "session_error");
    return;
  }
  if (type === "session.completed") {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    try {
      const wav = wavFromPcm16(pcmChunks, sampleRate, 1);
      fs.writeFileSync(wavPath, wav);
      process.stdout.write(JSON.stringify({ ok: true, wavPath, chunks: pcmChunks.length }));
      process.exit(0);
    } catch (error) {
      fail("write_" + (error.message || error));
    }
  }
};`;
  }
  async function tryCloudNodeWebSocketFallback(payload, token) {
    if (!(utils == null ? void 0 : utils.exec) || !(file == null ? void 0 : file.write)) {
      return { ok: false, error: "node_bridge_unavailable" };
    }
    const tmpToken = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const inputPath = `/tmp/polyscript_cloud_tts_input_${tmpToken}.json`;
    const helperPath = `/tmp/polyscript_cloud_tts_bridge_${tmpToken}.cjs`;
    const wavPath = `/tmp/polyscript_cloud_tts_bridge_${tmpToken}.wav`;
    try {
      file.write(inputPath, JSON.stringify({ token, baseUrl: polyscriptBaseUrl, payload, wavPath }));
      file.write(helperPath, buildCloudNodeBridgeScript());
      const command = `PATH=/opt/homebrew/bin:/usr/local/bin:$PATH; node ${shellQuote(helperPath)} ${shellQuote(inputPath)}`;
      await utils.exec("/bin/sh", ["-lc", command]);
      const played = await playCloudAudioFile(wavPath);
      if (!played) {
        return { ok: false, error: "node_bridge_play_failed" };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String((error == null ? void 0 : error.message) || error || "node_bridge_failed") };
    } finally {
      try {
        await utils.exec("/bin/rm", ["-f", inputPath, helperPath]);
      } catch {
      }
    }
  }
  function absolutizePolyscriptUrl(rawUrl) {
    const value = String(rawUrl || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    const base = String(polyscriptBaseUrl || "https://polyscript.app").replace(/\/+$/, "");
    return value.startsWith("/") ? `${base}${value}` : `${base}/${value}`;
  }
  async function resolveGeneratedAudioUrl(jobId) {
    const numericJobId = Number(jobId);
    if (!Number.isFinite(numericJobId) || numericJobId <= 0) {
      throw new Error("Generated audio job missing a valid job id.");
    }
    for (let attempt = 0; attempt < 18; attempt += 1) {
      if (attempt > 0) {
        await sleep(700);
      }
      const jobResp = await authedGet(`${polyscriptBaseUrl}/api/jobs/${numericJobId}`, {
        timeout: 4
      });
      if (jobResp.statusCode && jobResp.statusCode >= 400) {
        throw new Error(`Generated audio job poll failed (${jobResp.statusCode}).`);
      }
      const jobData = parseJsonPayload(jobResp.data || jobResp.text) || {};
      const status = String(jobData.status || "").trim().toUpperCase();
      if (status === "FAILED") {
        throw new Error(String(jobData.error || "Generated audio job failed."));
      }
      if (status !== "COMPLETED") {
        continue;
      }
      const result = jobData.result && typeof jobData.result === "object" ? jobData.result : {};
      const directUrl = absolutizePolyscriptUrl(result.audio_url || "");
      if (directUrl) {
        return directUrl;
      }
      const generatedAudioId = Number(result.generated_audio_id || 0);
      if (Number.isFinite(generatedAudioId) && generatedAudioId > 0) {
        const urlResp = await authedGet(`${polyscriptBaseUrl}/api/synthesis/stream_url/${generatedAudioId}`, {
          timeout: 4
        });
        if (urlResp.statusCode && urlResp.statusCode >= 400) {
          throw new Error(`Generated audio stream URL failed (${urlResp.statusCode}).`);
        }
        const urlPayload = parseJsonPayload(urlResp.data || urlResp.text) || {};
        const resolvedUrl = absolutizePolyscriptUrl(urlPayload.url || "");
        if (resolvedUrl) {
          return resolvedUrl;
        }
      }
      break;
    }
    throw new Error("Generated audio job timed out before audio became available.");
  }
  async function tryGeneratedAudioFallback(payload) {
    const generationResp = await authedPost(`${polyscriptBaseUrl}/api/synthesis/generate-audio`, {
      headers: {
        "Content-Type": "application/json"
      },
      data: {
        voice_name: payload.voice_name,
        text_segment: payload.text,
        document_id: 0,
        language: payload.language || "auto",
        quality_options: {
          quality_profile: "balanced"
        }
      },
      timeout: 4
    });
    if (generationResp.statusCode && generationResp.statusCode >= 400) {
      return {
        ok: false,
        error: `generate_audio_http_${generationResp.statusCode}`
      };
    }
    const generationData = parseJsonPayload(generationResp.data || generationResp.text) || {};
    const jobId = Number(generationData.job_id || 0);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return { ok: false, error: "generate_audio_missing_job" };
    }
    try {
      const audioUrl = await resolveGeneratedAudioUrl(jobId);
      const played = await playCloudAudioUrl(audioUrl);
      if (!played) {
        return { ok: false, error: "generated_audio_play_failed" };
      }
      return { ok: true, audioUrl, jobId };
    } catch (error) {
      return {
        ok: false,
        error: String((error == null ? void 0 : error.message) || error || "generated_audio_failed"),
        jobId
      };
    }
  }
  async function speakTextCloud(text, settings) {
    var _a4, _b, _c, _d, _e, _f, _g, _h;
    if (!http) return { ok: false, reason: "http_unavailable", message: "POLYSCRIPT: Cloud TTS unavailable (HTTP unavailable), using fallback" };
    const fail = (reason, message, extra = {}) => ({ ok: false, reason, message, ...extra });
    const token = await getValidPolyscriptToken();
    if (!token) return fail("missing_token", "POLYSCRIPT: Cloud TTS unavailable (not signed in), using fallback");
    const entitlements = await fetchEntitlementSnapshot(false);
    if (entitlements.ok && !isEntitlementFeatureEnabled(entitlements.data, "cloud_tts")) {
      return fail("upgrade_required", "POLYSCRIPT: Cloud voices are a Pro feature. Start a trial or upgrade on polyscript.app.", {
        upgradeRequired: true
      });
    }
    const startedAt = Date.now();
    const language = getAutoVoiceLangCode() || void 0;
    void postTelemetryEvent("tts.stream.started", {
      feature: "tts_stream",
      outcome: "started",
      properties: {
        source: "polyplugin",
        language: language || null,
        text_chars: String(text || "").length
      }
    });
    const voiceName = await resolveCloudVoiceForCurrentLang(settings);
    if (!voiceName) {
      void postTelemetryEvent("tts.stream.failed", {
        level: "error",
        feature: "tts_stream",
        outcome: "no_voice",
        properties: {
          source: "polyplugin",
          language: language || null
        }
      });
      return fail("no_voice", "POLYSCRIPT: Cloud TTS unavailable (no cloud voice for this language), using fallback");
    }
    const payload = {
      text,
      voice_name: voiceName,
      language,
      sample_rate: 24e3,
      frame_ms: 120,
      max_chunk_chars: 220,
      first_chunk_chars: 120,
      prefetch_chunks: 2
    };
    try {
      const sessionResp = await authedPost(`${polyscriptBaseUrl}/api/synthesis/stream/session`, {
        headers: {
          "Content-Type": "application/json"
        },
        data: payload,
        timeout: 3
      });
      if (sessionResp.statusCode && sessionResp.statusCode >= 400) {
        void postTelemetryEvent("tts.stream.failed", {
          level: "error",
          feature: "tts_stream",
          outcome: "session_http_error",
          properties: {
            source: "polyplugin",
            language: language || null,
            voice_name: voiceName,
            status: sessionResp.statusCode,
            elapsed_ms: Date.now() - startedAt
          }
        });
        return fail(
          "session_http_error",
          `POLYSCRIPT: Cloud TTS unavailable (session HTTP ${sessionResp.statusCode}), using fallback`,
          { statusCode: sessionResp.statusCode }
        );
      }
      const sessionData = parseJsonPayload(sessionResp.data || sessionResp.text) || {};
      const streamingToken = await getValidPolyscriptToken();
      const effectiveToken = streamingToken || token;
      if (typeof WebSocket === "undefined") {
        const nodeBridge = await tryCloudNodeWebSocketFallback(payload, effectiveToken);
        if (nodeBridge.ok) {
          void postTelemetryEvent("tts.stream.success", {
            feature: "tts_stream",
            outcome: "success_node_ws_bridge",
            properties: {
              source: "polyplugin",
              language: language || null,
              voice_name: voiceName,
              elapsed_ms: Date.now() - startedAt
            }
          });
          return { ok: true, reason: "success_node_ws_bridge" };
        }
        const httpFallback = await tryCloudHttpAudioFallback(sessionData, effectiveToken);
        if (httpFallback.ok) {
          void postTelemetryEvent("tts.stream.success", {
            feature: "tts_stream",
            outcome: "success_http_fallback",
            properties: {
              source: "polyplugin",
              language: language || null,
              voice_name: voiceName,
              elapsed_ms: Date.now() - startedAt,
              candidate_url: httpFallback.candidate || null
            }
          });
          return { ok: true, reason: "success_http_fallback" };
        }
        const generatedFallback2 = await tryGeneratedAudioFallback(payload);
        if (generatedFallback2.ok) {
          void postTelemetryEvent("tts.stream.success", {
            feature: "tts_stream",
            outcome: "success_generated_audio_fallback",
            properties: {
              source: "polyplugin",
              language: language || null,
              voice_name: voiceName,
              elapsed_ms: Date.now() - startedAt,
              job_id: generatedFallback2.jobId || null
            }
          });
          return { ok: true, reason: "success_generated_audio_fallback" };
        }
        return fail(
          "websocket_unavailable",
          "POLYSCRIPT: Cloud TTS unavailable (cloud playback bridge and fallback audio failed), using fallback",
          {
            nodeBridgeError: nodeBridge.error || "",
            error: httpFallback.error || "HTTP fallback failed.",
            generatedFallbackError: generatedFallback2.error || ""
          }
        );
      }
      const wsCandidates = buildCloudStreamWebsocketCandidates(streamingToken || token, sessionData);
      if (!wsCandidates.length) {
        return fail("stream_url_missing", "POLYSCRIPT: Cloud TTS unavailable (stream URL missing), using fallback");
      }
      const streamed = await streamCloudSynthesisToWavBase64(payload, effectiveToken, wsCandidates);
      const played = await playCloudAudioBase64(streamed.audioBase64);
      if (played) {
        void postTelemetryEvent("tts.stream.success", {
          feature: "tts_stream",
          outcome: "success",
          properties: {
            source: "polyplugin",
            language: language || null,
            voice_name: voiceName,
            ttfb_ms: (_b = (_a4 = streamed == null ? void 0 : streamed.metrics) == null ? void 0 : _a4.ttfbMs) != null ? _b : null,
            elapsed_ms: (_d = (_c = streamed == null ? void 0 : streamed.metrics) == null ? void 0 : _c.elapsedMs) != null ? _d : Date.now() - startedAt,
            chunks: (_f = (_e = streamed == null ? void 0 : streamed.metrics) == null ? void 0 : _e.chunkCount) != null ? _f : null,
            audio_bytes: (_h = (_g = streamed == null ? void 0 : streamed.metrics) == null ? void 0 : _g.audioBytes) != null ? _h : null
          }
        });
        return { ok: true, reason: "success" };
      }
      const generatedFallback = await tryGeneratedAudioFallback(payload);
      if (generatedFallback.ok) {
        void postTelemetryEvent("tts.stream.success", {
          feature: "tts_stream",
          outcome: "success_generated_audio_fallback",
          properties: {
            source: "polyplugin",
            language: language || null,
            voice_name: voiceName,
            elapsed_ms: Date.now() - startedAt,
            job_id: generatedFallback.jobId || null
          }
        });
        return { ok: true, reason: "success_generated_audio_fallback" };
      }
      void postTelemetryEvent("tts.stream.failed", {
        level: "error",
        feature: "tts_stream",
        outcome: "playback_failed",
        properties: {
          source: "polyplugin",
          language: language || null,
          voice_name: voiceName,
          elapsed_ms: Date.now() - startedAt,
          generated_fallback_error: generatedFallback.error || null
        }
      });
      return fail("playback_failed", "POLYSCRIPT: Cloud TTS unavailable (audio playback failed), using fallback");
    } catch (sessionError) {
      const detailRaw = String((sessionError == null ? void 0 : sessionError.message) || sessionError || "unknown");
      const detail = detailRaw.replace(/\s+/g, " ").trim();
      const compactDetail = detail.length > 110 ? `${detail.slice(0, 107)}...` : detail;
      const isStreamError = /cloud stream|cloud websocket|websocket|stream/i.test(detail.toLowerCase());
      const outcome = isStreamError ? "stream_error" : "session_error";
      void postTelemetryEvent("tts.stream.failed", {
        level: "error",
        feature: "tts_stream",
        outcome,
        properties: {
          source: "polyplugin",
          language: language || null,
          voice_name: voiceName,
          elapsed_ms: Date.now() - startedAt,
          message: detail
        }
      });
      console.log(`POLYSCRIPT: Cloud TTS ${outcome}: ${detail}`);
      const generatedFallback = await tryGeneratedAudioFallback(payload);
      if (generatedFallback.ok) {
        void postTelemetryEvent("tts.stream.success", {
          feature: "tts_stream",
          outcome: "success_generated_audio_fallback",
          properties: {
            source: "polyplugin",
            language: language || null,
            voice_name: voiceName,
            elapsed_ms: Date.now() - startedAt,
            job_id: generatedFallback.jobId || null,
            stream_error: detail
          }
        });
        return { ok: true, reason: "success_generated_audio_fallback" };
      }
      return fail(
        outcome,
        `POLYSCRIPT: Cloud TTS unavailable (${outcome === "stream_error" ? "stream" : "session"}: ${compactDetail}), using fallback`,
        { error: detail, generatedFallbackError: generatedFallback.error || "" }
      );
    }
  }
  function stopSpeaking() {
    if (!(utils == null ? void 0 : utils.exec)) return;
    try {
      utils.exec("/usr/bin/killall", ["say"]);
    } catch {
    }
    try {
      utils.exec("/usr/bin/killall", ["afplay"]);
    } catch {
    }
    try {
      const settings = getTtsSettings();
      if (settings.engine === "native") {
        safeHttpPost(`${settings.nativeBaseUrl}/stop`, { headers: { "Content-Type": "application/json" }, data: {} });
      }
    } catch {
    }
  }
  async function speakText(text) {
    let settings = getTtsSettings();
    const clean = String(text || "").trim();
    if (!settings.enabled || !clean) return;
    const ttsLang = getTtsLanguageContext();
    if (!ttsLang.langCode) {
      maybeShowTtsUnsupportedNotice(ttsLang);
      return;
    }
    if (ttsLang.substitution) {
      maybeShowTtsSubstitutionNotice(ttsLang);
    }
    if (!cachedVoices.length) {
      await refreshVoiceList(false);
    }
    if ((settings.nativeHelperPath || nativeVoices.length) && !nativeVoices.length) {
      await refreshNativeVoices(false);
    }
    if (settings.engine === "cloud") {
      const cloudResult = await speakTextCloud(clean, settings);
      if (cloudResult == null ? void 0 : cloudResult.ok) return;
      if (!settings.cloudFallback) {
        if (cloudResult == null ? void 0 : cloudResult.message) {
          core.osd(cloudResult.message, 2200);
        }
        return;
      }
      if (cloudResult == null ? void 0 : cloudResult.message) {
        const now = Date.now();
        if (now - lastCloudTtsDisabledOsdAt > 5e3) {
          lastCloudTtsDisabledOsdAt = now;
          core.osd(cloudResult.message, 2200);
        }
      }
      const nativeFallbackSettings = normalizeTtsSettings({
        ...settings,
        engine: "native",
        autoVoice: true,
        voice: ""
      });
      const preferPersonalFallback = nativeFallbackSettings.preferPersonal || hasPersonalVoiceForLanguage(ttsLang.langCode);
      const nativeFallbackOk = await speakTextNative(clean, nativeFallbackSettings, {
        language: ttsLang.langCode,
        forcePersonal: preferPersonalFallback,
        ignoreMappedVoice: true
      });
      if (nativeFallbackOk) return;
      settings = normalizeTtsSettings({ ...nativeFallbackSettings, engine: "say", autoVoice: true });
    } else if (settings.engine === "native") {
      const nativeOk = await speakTextNative(clean, settings, {
        language: ttsLang.langCode
      });
      if (nativeOk) return;
      settings = normalizeTtsSettings({ ...settings, engine: "say", autoVoice: true });
    }
    const autoSystemVoice = pickVoiceForLang(ttsLang.langCode);
    if (!autoSystemVoice) {
      maybeShowTtsUnsupportedNotice(ttsLang);
      return;
    }
    if (!(utils == null ? void 0 : utils.exec)) return;
    if (ttsActive) {
      ttsQueued = clean;
      stopSpeaking();
      return;
    }
    ttsActive = true;
    try {
      if (ttsDebugEnabledCache) {
        core.osd(`POLYSCRIPT: Speaking "${clean.slice(0, 24)}"`, 1200);
      }
      const args = [];
      const resolvedVoice = autoSystemVoice || resolveTtsVoiceForCurrentLang();
      if (resolvedVoice) {
        args.push("-v", resolvedVoice);
      }
      if (settings.rate) {
        args.push("-r", String(settings.rate));
      }
      args.push(clean);
      const result = await utils.exec("/usr/bin/say", args);
      if (result == null ? void 0 : result.stderr) {
        core.osd(`POLYSCRIPT: TTS error ${String(result.stderr).slice(0, 80)}`, 2e3);
      }
    } catch (e) {
      core.osd(`POLYSCRIPT: TTS failed (${e.message || e})`, 2e3);
    } finally {
      ttsActive = false;
      if (ttsQueued) {
        const next = ttsQueued;
        ttsQueued = null;
        speakText(next);
      }
    }
  }
  async function speakTextNative(text, settings, options = {}) {
    if (!http) return false;
    const useMappedVoice = !(options == null ? void 0 : options.ignoreMappedVoice);
    const map = getTtsVoiceMap();
    const key = getVoicePreferenceKey();
    const mappedVoice = useMappedVoice && key ? String(map[key] || "").trim() : "";
    const forcedLangCode = normalizeLangCode((options == null ? void 0 : options.language) || "");
    const langCode = forcedLangCode || getAutoVoiceLangCode();
    const forcePersonal = !!(options == null ? void 0 : options.forcePersonal);
    const personalRequested = forcePersonal || mappedVoice === PERSONAL_VOICE_TOKEN;
    let voice = forcePersonal ? PERSONAL_VOICE_TOKEN : mappedVoice || settings.voice || "";
    if (personalRequested) {
      voice = PERSONAL_VOICE_TOKEN;
    } else if (settings.autoVoice && !voice && nativeVoices.length) {
      voice = pickNativeVoiceForLang(langCode, settings.preferPersonal);
    }
    const payload = {
      text,
      voice: voice || void 0,
      language: langCode || void 0,
      rate: settings.rate || void 0,
      preferPersonal: personalRequested ? true : settings.preferPersonal
    };
    const endpoint = settings.nativeEngine === "nss" ? "speak-ns" : "speak";
    const url = `${settings.nativeBaseUrl}/${endpoint}`;
    if ((utils == null ? void 0 : utils.exec) && file) {
      if (settings.nativeAutoStart) {
        startNativeHelper();
      }
      const tmpPath = `/tmp/polyscript_tts_${Date.now()}_${Math.floor(Math.random() * 1e6)}.json`;
      try {
        file.write(tmpPath, JSON.stringify(payload));
        const cmd = `curl -s --max-time 2 -X POST ${shellQuote(url)} -H 'Content-Type: application/json' --data-binary @${shellQuote(tmpPath)} >/dev/null 2>&1; rm -f ${shellQuote(tmpPath)}`;
        await utils.exec("/bin/sh", ["-c", `${cmd} &`]);
        return true;
      } catch {
      }
    }
    try {
      const resp = await safeHttpPost(url, {
        headers: { "Content-Type": "application/json" },
        data: payload,
        timeout: 2
      });
      if (resp.statusCode && resp.statusCode >= 400) return false;
      return true;
    } catch {
      return false;
    }
  }
  function handleOverlaySpeak(payload) {
    if (!payload || typeof payload !== "object") return;
    const { kind, text } = payload;
    const settings = getTtsSettings();
    if (!settings.enabled) return;
    if (kind === "word" && !settings.wordClick) return;
    if (kind === "line" && !settings.lineClick) return;
    const speakable = getSpeakableText(text);
    if (!speakable) return;
    if (ttsDebugEnabledCache) {
      core.osd(`POLYSCRIPT: Speak ${kind}: ${speakable.slice(0, 24)}`, 1200);
    }
    speakText(speakable);
  }
  function getSentenceSettings() {
    return { ...sentenceSettingsCache };
  }
  function getPreferredSpokenSubtitleText(options = {}) {
    const allowSourceFallback = options.allowSourceFallback !== false;
    const rendered = getSpeakableText(lastRenderedText || "");
    if (rendered) return rendered;
    if (allowSourceFallback) {
      const source = getSpeakableText(lastSubtitleText || "");
      if (source) return source;
    }
    return "";
  }
  function clearSentenceAutoResume(resetPauseState = true) {
    if (sentenceResumeTimer) {
      clearTimeout(sentenceResumeTimer);
      sentenceResumeTimer = null;
    }
    if (resetPauseState) {
      sentencePausedByPlugin = false;
    }
  }
  async function handleSentencePause(entry, index) {
    if (!sentenceMode) return;
    if (index === lastPausedSentenceIndex) return;
    lastPausedSentenceIndex = index;
    sentencePauseToken += 1;
    const token = sentencePauseToken;
    sentencePausedByPlugin = true;
    core.pause();
    const settings = getSentenceSettings();
    if (settings.ttsOnPause) {
      const prefersLlmTarget = shouldUseLlmTranslation(getEffectiveTargetLang());
      const speakTextValue = getSpeakableText((entry == null ? void 0 : entry.content) || "") || getPreferredSpokenSubtitleText({ allowSourceFallback: !prefersLlmTarget });
      if (speakTextValue) {
        await speakText(speakTextValue);
      }
    }
    if (!settings.autoResume) return;
    clearSentenceAutoResume(false);
    const delayMs = Math.max(0, settings.delay * 1e3);
    sentenceResumeTimer = setTimeout(() => {
      var _a4;
      if (token !== sentencePauseToken) return;
      if (!sentenceMode) return;
      if (!sentencePausedByPlugin) return;
      if (!mpv.getFlag("pause")) {
        sentencePausedByPlugin = false;
        return;
      }
      (_a4 = core.resume) == null ? void 0 : _a4.call(core);
      sentencePausedByPlugin = false;
    }, delayMs);
  }
  function setPolyscriptEnabled(nextEnabled) {
    var _a4, _b, _c, _d, _e, _f;
    polyscriptEnabled = !!nextEnabled;
    (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "polyscriptEnabled", polyscriptEnabled);
    (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
    if (!polyscriptEnabled) {
      usingFullFileTranslation = false;
      subtitleEntries = null;
      lastSentenceIndex = -1;
      lastSubtitleText = "";
      lastOriginalText = "";
      lastRenderedText = "";
      subtitleChangeSerial = 0;
      pendingAutoSpeakSerial = 0;
      lastAutoSpokenSerial = 0;
      currentTranslateJobId += 1;
      clearSubtitleOverlay();
      try {
        if (lastNativeSubId != null) {
          mpv.set("sid", lastNativeSubId);
        }
        mpv.set("secondary-sid", "no");
      } catch {
      }
      try {
        (_c = overlay == null ? void 0 : overlay.setOpacity) == null ? void 0 : _c.call(overlay, 0);
        (_d = overlay == null ? void 0 : overlay.hide) == null ? void 0 : _d.call(overlay);
      } catch {
      }
    } else {
      ensureOverlayLoaded();
      (_e = overlay == null ? void 0 : overlay.show) == null ? void 0 : _e.call(overlay);
      (_f = overlay == null ? void 0 : overlay.setOpacity) == null ? void 0 : _f.call(overlay, 1);
      translateCurrentSubtitleFile();
    }
    core.osd(`POLYSCRIPT: Subtitles ${polyscriptEnabled ? "On" : "Off"}`, 1500);
    buildMenu();
  }
  function refreshSidebarVoiceData(force = false) {
    if (sidebarVoiceRefreshPromise) return sidebarVoiceRefreshPromise;
    const now = Date.now();
    if (!force && now - sidebarVoiceRefreshAt < SIDEBAR_VOICE_REFRESH_COOLDOWN_MS) {
      return Promise.resolve();
    }
    sidebarVoiceRefreshPromise = Promise.allSettled([
      refreshVoiceList(force),
      refreshNativeVoices(force),
      fetchCloudVoices(force)
    ]).then(() => {
      sidebarVoiceRefreshAt = Date.now();
      emitSidebarSettings({ skipAutoAiRefresh: true, skipVoiceRefresh: true });
    }).catch(() => {
    }).finally(() => {
      sidebarVoiceRefreshPromise = null;
    });
    return sidebarVoiceRefreshPromise;
  }
  function buildSidebarSettings() {
    const appearance = getAppearanceSettings();
    const sentenceSettings = getSentenceSettings();
    const aiStatus = buildAiStatusSummary();
    return {
      targetLang,
      translationProvider,
      llmMode,
      llmCustomTarget,
      llmMetaPrompt,
      llmModel,
      llmTemperature,
      llmMaxTokens,
      sentenceMode,
      sentenceAutoResume: sentenceSettings.autoResume,
      sentenceAutoResumeDelay: sentenceSettings.delay,
      sentenceTtsOnPause: sentenceSettings.ttsOnPause,
      polyscriptEnabled,
      appearance,
      segmentationEnabled: isSegmentationEnabled(),
      useNativeSubsWhenAvailable,
      autoArrangeSubs: autoArrangeSubsSetting,
      primarySubPosition: primarySubPositionSetting,
      secondarySubPosition: secondarySubPositionSetting,
      tts: getTtsSettings(),
      voiceSelector: buildVoiceSelectorState(),
      overlayPlacements: OVERLAY_PLACEMENTS,
      llmModes: LLM_MODES,
      googleLangs: GOOGLE_TRANSLATE_LANGS,
      llmTargetPresets: LLM_TARGET_PRESETS,
      isLoggedIn: !!polyscriptToken,
      loginEmail: getSavedLoginEmail(),
      aiStatus,
      authFlow: {
        ...authFlowState,
        active: AUTH_FLOW_ACTIVE_PHASES.has(authFlowState.phase)
      }
    };
  }
  function sendSidebarMessage(name, data) {
    try {
      if (sidebar && typeof sidebar.postMessage === "function") {
        sidebar.postMessage(name, data);
        return true;
      }
    } catch (e) {
      console.log(`POLYSCRIPT-ERROR: sidebar sendMessage failed: ${e.message}`);
    }
    return false;
  }
  function emitSidebarSettings(options = {}) {
    const sent = sendSidebarMessage("ps:settings", buildSidebarSettings());
    if (sent && !(options == null ? void 0 : options.skipVoiceRefresh)) {
      void refreshSidebarVoiceData(false);
    }
    if (!(options == null ? void 0 : options.skipAutoAiRefresh)) {
      maybeAutoRefreshAiStatus(false);
    }
  }
  function applySidebarLanguageDrafts(payload = {}) {
    var _a4, _b, _c;
    let changed = false;
    let targetChanged = false;
    const nextCustomTarget = typeof payload.llmCustomTarget === "string" ? String(payload.llmCustomTarget || "").trim() : null;
    const nextMetaPrompt = typeof payload.llmMetaPrompt === "string" ? String(payload.llmMetaPrompt || "") : null;
    if (nextCustomTarget != null && nextCustomTarget !== llmCustomTarget) {
      llmCustomTarget = nextCustomTarget;
      (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "llmCustomTarget", llmCustomTarget);
      changed = true;
      targetChanged = true;
    }
    if (nextMetaPrompt != null && nextMetaPrompt !== llmMetaPrompt) {
      llmMetaPrompt = nextMetaPrompt;
      (_b = preferences == null ? void 0 : preferences.set) == null ? void 0 : _b.call(preferences, "llmMetaPrompt", llmMetaPrompt);
      changed = true;
    }
    if (changed) {
      (_c = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _c.call(preferences);
    }
    if (targetChanged) {
      void refreshSidebarVoiceData(true);
    }
    return changed;
  }
  function applySidebarSetting(key, value) {
    var _a4, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G, _H, _I, _J, _K, _L, _M, _N, _O, _P, _Q, _R, _S, _T, _U, _V, _W, _X, _Y, _Z, __, _$;
    switch (key) {
      case "targetLang":
        setTargetLang(value);
        void refreshSidebarVoiceData(true);
        return;
      case "translationProvider":
        translationProvider = value === "polyscript" ? "polyscript" : "google";
        (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "translationProvider", translationProvider);
        (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
        clearTranslationCaches();
        usingFullFileTranslation = false;
        subtitleEntries = null;
        lastSentenceIndex = -1;
        translateCurrentSubtitleFile();
        buildMenu();
        if (shouldUseLlmTranslation(getEffectiveTargetLang())) {
          maybeAutoRefreshAiStatus(true);
        }
        return;
      case "llmMode":
        if (LLM_MODES[value]) {
          llmMode = value;
          (_c = preferences == null ? void 0 : preferences.set) == null ? void 0 : _c.call(preferences, "llmMode", llmMode);
          (_d = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _d.call(preferences);
          clearTranslationCaches();
          usingFullFileTranslation = false;
          subtitleEntries = null;
          lastSentenceIndex = -1;
          translateCurrentSubtitleFile();
          buildMenu();
        }
        return;
      case "llmCustomTarget":
        setLlmTargetLang(value || "");
        void refreshSidebarVoiceData(true);
        return;
      case "llmMetaPrompt":
        llmMetaPrompt = String(value || "");
        (_e = preferences == null ? void 0 : preferences.set) == null ? void 0 : _e.call(preferences, "llmMetaPrompt", llmMetaPrompt);
        (_f = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _f.call(preferences);
        return;
      case "llmModel":
        llmModel = String(value || llmModel);
        (_g = preferences == null ? void 0 : preferences.set) == null ? void 0 : _g.call(preferences, "llmModel", llmModel);
        (_h = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _h.call(preferences);
        return;
      case "llmTemperature": {
        const num = Number(value);
        if (!Number.isNaN(num)) {
          llmTemperature = Math.max(0, Math.min(1, num));
          (_i = preferences == null ? void 0 : preferences.set) == null ? void 0 : _i.call(preferences, "llmTemperature", llmTemperature);
          (_j = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _j.call(preferences);
        }
        return;
      }
      case "llmMaxTokens": {
        const num = Number(value);
        if (!Number.isNaN(num)) {
          llmMaxTokens = Math.max(256, num);
          (_k = preferences == null ? void 0 : preferences.set) == null ? void 0 : _k.call(preferences, "llmMaxTokens", llmMaxTokens);
          (_l = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _l.call(preferences);
        }
        return;
      }
      case "sentenceMode":
        if (value) {
          ensureSentenceEntries().then((ok) => {
            var _a5, _b2;
            if (!ok) {
              sentenceLiveMode = true;
              sentenceLiveIndex = 0;
              sentenceLivePendingAccept = false;
              core.osd("POLYSCRIPT: Sentence mode using live timing", 2e3);
            }
            sentenceMode = true;
            (_a5 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a5.call(preferences, "sentenceMode", true);
            (_b2 = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b2.call(preferences);
            lastSentenceIndex = -1;
            lastPausedSentenceIndex = -1;
            clearSentenceAutoResume();
            buildMenu();
            emitSidebarSettings();
          });
          return;
        }
        sentenceMode = false;
        sentenceLiveMode = false;
        sentenceLivePendingAccept = false;
        (_m = preferences == null ? void 0 : preferences.set) == null ? void 0 : _m.call(preferences, "sentenceMode", false);
        (_n = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _n.call(preferences);
        clearSentenceAutoResume();
        buildMenu();
        return;
      case "sentenceAutoResume":
        (_o = preferences == null ? void 0 : preferences.set) == null ? void 0 : _o.call(preferences, "sentenceAutoResume", coerceBoolean(value, false));
        (_p = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _p.call(preferences);
        return;
      case "sentenceAutoResumeDelay": {
        const num = Number(value);
        if (!Number.isNaN(num)) {
          (_q = preferences == null ? void 0 : preferences.set) == null ? void 0 : _q.call(preferences, "sentenceAutoResumeDelay", Math.max(0, Math.min(15, num)));
          (_r = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _r.call(preferences);
        }
        return;
      }
      case "sentenceTtsOnPause":
        (_s = preferences == null ? void 0 : preferences.set) == null ? void 0 : _s.call(preferences, "sentenceTtsOnPause", coerceBoolean(value, false));
        (_t = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _t.call(preferences);
        return;
      case "loginEmail":
        saveLoginEmail(value || "");
        return;
      case "polyscriptEnabled":
        setPolyscriptEnabled(coerceBoolean(value, true));
        return;
      case "overlayDock":
        setAppearanceSetting("overlayDock", value === "top" ? "top" : "bottom");
        return;
      case "overlayPlacement":
        if (OVERLAY_PLACEMENTS[value]) {
          setAppearanceSetting("overlayPlacement", value);
        }
        return;
      case "overlayCustomOffset": {
        const num = Number(value);
        if (!Number.isNaN(num)) {
          setAppearanceSetting("overlayCustomOffset", Math.max(0, Math.min(400, num)));
        }
        return;
      }
      case "fontSize":
        if (FONT_SIZE_PRESETS[value]) {
          setAppearanceSetting("overlayFontSize", value);
        }
        return;
      case "overlayBgOpacity": {
        const num = Number(value);
        if (!Number.isNaN(num)) {
          setAppearanceSetting("overlayBgOpacity", Math.max(0, Math.min(1, num)));
        }
        return;
      }
      case "showTransliteration":
        setAppearanceSetting("showTransliteration", coerceBoolean(value, true));
        return;
      case "segmentationEnabled":
        segmentationEnabledSetting = coerceBoolean(value, segmentationEnabledSetting);
        (_u = preferences == null ? void 0 : preferences.set) == null ? void 0 : _u.call(preferences, "segmentationEnabled", segmentationEnabledSetting);
        (_v = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _v.call(preferences);
        if (lastRenderedText) scheduleRender(lastRenderedText);
        return;
      case "useNativeSubsWhenAvailable":
        useNativeSubsWhenAvailable = coerceBoolean(value, useNativeSubsWhenAvailable);
        (_w = preferences == null ? void 0 : preferences.set) == null ? void 0 : _w.call(preferences, "useNativeSubsWhenAvailable", useNativeSubsWhenAvailable);
        (_x = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _x.call(preferences);
        return;
      case "autoArrangeSubs":
        autoArrangeSubsSetting = coerceBoolean(value, autoArrangeSubsSetting);
        (_y = preferences == null ? void 0 : preferences.set) == null ? void 0 : _y.call(preferences, "autoArrangeSubs", autoArrangeSubsSetting);
        (_z = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _z.call(preferences);
        applySubtitleLayout();
        return;
      case "primarySubPosition":
        primarySubPositionSetting = value === "top" ? "top" : "bottom";
        (_A = preferences == null ? void 0 : preferences.set) == null ? void 0 : _A.call(preferences, "primarySubPosition", value === "top" ? "top" : "bottom");
        (_B = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _B.call(preferences);
        applySubtitleLayout();
        return;
      case "secondarySubPosition":
        secondarySubPositionSetting = value === "top" ? "top" : "bottom";
        (_C = preferences == null ? void 0 : preferences.set) == null ? void 0 : _C.call(preferences, "secondarySubPosition", value === "top" ? "top" : "bottom");
        (_D = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _D.call(preferences);
        applySubtitleLayout();
        return;
      case "ttsEnabled":
        (_E = preferences == null ? void 0 : preferences.set) == null ? void 0 : _E.call(preferences, "ttsEnabled", coerceBoolean(value, true));
        (_F = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _F.call(preferences);
        return;
      case "ttsOnWordClick":
        (_G = preferences == null ? void 0 : preferences.set) == null ? void 0 : _G.call(preferences, "ttsOnWordClick", coerceBoolean(value, true));
        (_H = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _H.call(preferences);
        return;
      case "ttsOnLineClick":
        (_I = preferences == null ? void 0 : preferences.set) == null ? void 0 : _I.call(preferences, "ttsOnLineClick", coerceBoolean(value, true));
        (_J = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _J.call(preferences);
        return;
      case "ttsRate": {
        const num = Number(value);
        if (!Number.isNaN(num)) {
          (_K = preferences == null ? void 0 : preferences.set) == null ? void 0 : _K.call(preferences, "ttsRate", Math.max(100, Math.min(400, num)));
          (_L = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _L.call(preferences);
        }
        return;
      }
      case "ttsVoice":
        (_M = preferences == null ? void 0 : preferences.set) == null ? void 0 : _M.call(preferences, "ttsVoice", String(value || ""));
        setMappedVoiceForCurrentTarget(String(value || ""));
        (_N = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _N.call(preferences);
        return;
      case "ttsVoiceSelector":
        applyVoiceSelectorChoice(value);
        return;
      case "ttsAutoVoice":
        (_O = preferences == null ? void 0 : preferences.set) == null ? void 0 : _O.call(preferences, "ttsAutoVoice", coerceBoolean(value, false));
        (_P = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _P.call(preferences);
        return;
      case "ttsEngine":
        (_Q = preferences == null ? void 0 : preferences.set) == null ? void 0 : _Q.call(preferences, "ttsEngine", value === "native" ? "native" : value === "cloud" ? "cloud" : "say");
        (_R = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _R.call(preferences);
        buildMenu();
        return;
      case "ttsNativeBaseUrl":
        (_S = preferences == null ? void 0 : preferences.set) == null ? void 0 : _S.call(preferences, "ttsNativeBaseUrl", normalizeServiceBaseUrl(value, DEFAULT_NATIVE_BASE_URL));
        (_T = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _T.call(preferences);
        return;
      case "ttsNativeHelperPath":
        (_U = preferences == null ? void 0 : preferences.set) == null ? void 0 : _U.call(preferences, "ttsNativeHelperPath", String(value || "").trim());
        (_V = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _V.call(preferences);
        return;
      case "ttsNativeAutoStart":
        (_W = preferences == null ? void 0 : preferences.set) == null ? void 0 : _W.call(preferences, "ttsNativeAutoStart", coerceBoolean(value, true));
        (_X = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _X.call(preferences);
        return;
      case "ttsPreferPersonal":
        (_Y = preferences == null ? void 0 : preferences.set) == null ? void 0 : _Y.call(preferences, "ttsPreferPersonal", coerceBoolean(value, true));
        (_Z = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _Z.call(preferences);
        return;
      case "ttsNativeEngine":
        (__ = preferences == null ? void 0 : preferences.set) == null ? void 0 : __.call(preferences, "ttsNativeEngine", value === "av" ? "av" : "nss");
        (_$ = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _$.call(preferences);
        nativeVoices = [];
        nativeVoicesAt = 0;
        buildMenu();
        return;
      default:
        return;
    }
  }
  async function reopenDeviceLoginApprovalLink() {
    const verifyUrl = String(deviceLoginVerificationUrl || "").trim();
    if (!verifyUrl) {
      core.osd("POLYSCRIPT: No pending approval link", 1800);
      return;
    }
    const opened = await openUrlExternal(verifyUrl);
    if (opened) {
      core.osd("POLYSCRIPT: Opened approval link", 1800);
      if (AUTH_FLOW_ACTIVE_PHASES.has(authFlowState.phase)) {
        setAuthFlowState({
          phase: "awaiting_approval",
          message: "Approve sign-in in your browser or email.",
          verificationUrl: verifyUrl
        });
      }
      return;
    }
    core.osd("POLYSCRIPT: Could not open approval link", 2200);
  }
  async function startDeviceLogin(options = {}) {
    stopDeviceLoginFlow();
    setAuthFlowState({ phase: "starting", message: "Starting secure sign-in...", verificationUrl: "" });
    const explicitEmail = String((options == null ? void 0 : options.email) || "").trim();
    const savedEmail = getSavedLoginEmail();
    const promptDefault = explicitEmail || savedEmail;
    const skipPrompt = !!(options == null ? void 0 : options.skipPrompt);
    const canPrompt = typeof (utils == null ? void 0 : utils.prompt) === "function";
    let email = explicitEmail;
    if (!email) {
      if ((skipPrompt || !canPrompt) && promptDefault) {
        email = promptDefault;
      } else if (canPrompt) {
        const prompted = utils.prompt("Polyscript email for device login", promptDefault);
        if (!prompted) {
          setAuthFlowState({ phase: "idle", message: "", verificationUrl: "" });
          return;
        }
        email = String(prompted).trim();
      } else {
        setAuthFlowState({
          phase: "error",
          message: "Cannot prompt for email in this environment.",
          verificationUrl: ""
        });
        core.osd("POLYSCRIPT: Please enter your sign-in email in the sidebar.", 2500);
        return;
      }
    }
    if (!email) {
      setAuthFlowState({ phase: "error", message: "Please enter your email to sign in.", verificationUrl: "" });
      core.osd("POLYSCRIPT: Please enter your email to sign in.", 2e3);
      return;
    }
    saveLoginEmail(email);
    aiStatusState = {
      checking: true,
      available: null,
      statusCode: 0,
      reason: "pending",
      checkedAt: 0
    };
    emitSidebarSettings({ skipAutoAiRefresh: true });
    try {
      const resp = await safeHttpPost(`${polyscriptBaseUrl}/api/auth/device-code`, {
        headers: { "Content-Type": "application/json" },
        data: { email }
      });
      if (resp.statusCode && resp.statusCode >= 400) {
        const message = `Device login failed (HTTP ${resp.statusCode}).`;
        setAuthFlowState({ phase: "error", message, verificationUrl: "" });
        core.osd(`POLYSCRIPT: ${message}`, 2500);
        return;
      }
      const data = parseJsonPayload(resp.data || resp.text) || {};
      const immediateToken = extractAccessToken(data);
      console.log(`POLYSCRIPT: Device-code response received (immediateToken=${!!immediateToken})`);
      if (immediateToken) {
        setPolyscriptToken(immediateToken);
        core.osd("POLYSCRIPT: Signed in", 1500);
        emitSidebarSettings({ skipAutoAiRefresh: true });
        maybeAutoRefreshAiStatus(true);
        if (shouldUseLlmTranslation(getEffectiveTargetLang())) {
          clearTranslationCaches();
          usingFullFileTranslation = false;
          subtitleEntries = null;
          lastSentenceIndex = -1;
          currentTranslateJobId += 1;
          translateCurrentSubtitleFile();
        }
        buildMenu();
        return;
      }
      const deviceId = extractDeviceId(data);
      const userCode = extractUserCode(data);
      const verificationUrl = extractVerificationUrl(data);
      console.log(`POLYSCRIPT: Device-code parsed (deviceId=${deviceId ? "present" : "missing"})`);
      if (!deviceId) {
        setAuthFlowState({ phase: "error", message: "Device sign-in link unavailable. Try again.", verificationUrl: "" });
        core.osd("POLYSCRIPT: Device login failed", 2e3);
        aiStatusState = {
          checking: false,
          available: false,
          statusCode: 0,
          reason: "request_error",
          checkedAt: Date.now()
        };
        emitSidebarSettings({ skipAutoAiRefresh: true });
        return;
      }
      deviceLoginDeviceId = deviceId;
      const verifyUrl = normalizeDeviceVerificationUrl(verificationUrl, deviceLoginDeviceId, userCode);
      deviceLoginVerificationUrl = verifyUrl || "";
      if (verifyUrl) {
        const opened = await openUrlExternal(verifyUrl);
        if (opened) {
          core.osd("POLYSCRIPT: Approve sign-in in your browser", 2500);
        } else {
          core.osd("POLYSCRIPT: Check email to approve login", 3e3);
        }
      } else {
        core.osd("POLYSCRIPT: Check email to approve login", 3e3);
      }
      setAuthFlowState({
        phase: "awaiting_approval",
        message: "Approve sign-in in your browser or email.",
        verificationUrl: deviceLoginVerificationUrl
      });
      const started = Date.now();
      let lastExchangeAttemptAt = 0;
      deviceLoginTimer = setInterval(async () => {
        if (!deviceLoginDeviceId || deviceLoginPollInFlight) return;
        deviceLoginPollInFlight = true;
        try {
          const status = await safeHttpGet(
            `${polyscriptBaseUrl}/api/auth/device/status?device_id=${encodeURIComponent(deviceLoginDeviceId)}`
          );
          const statusCode = Number((status == null ? void 0 : status.statusCode) || 0);
          if (statusCode === 401 || statusCode === 404 || statusCode === 410) {
            stopDeviceLoginFlow({ keepVerificationUrl: true });
            const message = statusCode === 401 ? "Device login expired. Start again." : "Device login no longer available. Start again.";
            setAuthFlowState({
              phase: "error",
              message,
              verificationUrl: deviceLoginVerificationUrl
            });
            core.osd(`POLYSCRIPT: ${message}`, 2200);
            aiStatusState = {
              checking: false,
              available: false,
              statusCode,
              reason: statusCode === 401 ? "missing_token" : "http_error",
              checkedAt: Date.now()
            };
            emitSidebarSettings({ skipAutoAiRefresh: true });
            return;
          }
          if (statusCode >= 400) {
            return;
          }
          const sdata = parseJsonPayload(status.data || status.text) || {};
          const authorized = extractDeviceAuthorized(sdata);
          let accessToken = extractAccessToken(sdata);
          if (!accessToken && authorized && Date.now() - lastExchangeAttemptAt > 8e3) {
            lastExchangeAttemptAt = Date.now();
            accessToken = await exchangeDeviceAccessToken(deviceLoginDeviceId);
            if (!accessToken) {
              console.log("POLYSCRIPT: Device authorized but token exchange returned empty token.");
            }
          }
          if (accessToken) {
            setPolyscriptToken(accessToken);
            core.osd("POLYSCRIPT: Signed in", 1500);
            emitSidebarSettings({ skipAutoAiRefresh: true });
            maybeAutoRefreshAiStatus(true);
            if (shouldUseLlmTranslation(getEffectiveTargetLang())) {
              clearTranslationCaches();
              usingFullFileTranslation = false;
              subtitleEntries = null;
              lastSentenceIndex = -1;
              currentTranslateJobId += 1;
              translateCurrentSubtitleFile();
            }
            buildMenu();
            return;
          }
          const loginError = String(sdata.error || getNestedValue(sdata, ["data", "error"]) || "").toLowerCase();
          if (loginError === "expired") {
            stopDeviceLoginFlow({ keepVerificationUrl: true });
            core.osd("POLYSCRIPT: Device login expired", 2e3);
            setAuthFlowState({
              phase: "error",
              message: "Device login expired. Start again.",
              verificationUrl: deviceLoginVerificationUrl
            });
            aiStatusState = {
              checking: false,
              available: false,
              statusCode: 401,
              reason: "missing_token",
              checkedAt: Date.now()
            };
            emitSidebarSettings({ skipAutoAiRefresh: true });
            return;
          }
          if (loginError === "not_found") {
            stopDeviceLoginFlow({ keepVerificationUrl: true });
            core.osd("POLYSCRIPT: Device login not found", 2e3);
            setAuthFlowState({
              phase: "error",
              message: "Device login was not found. Start again.",
              verificationUrl: deviceLoginVerificationUrl
            });
            aiStatusState = {
              checking: false,
              available: false,
              statusCode: 404,
              reason: "http_error",
              checkedAt: Date.now()
            };
            emitSidebarSettings({ skipAutoAiRefresh: true });
            return;
          }
          if (Date.now() - started > 10 * 60 * 1e3) {
            stopDeviceLoginFlow({ keepVerificationUrl: true });
            core.osd("POLYSCRIPT: Device login timed out", 2e3);
            setAuthFlowState({
              phase: "error",
              message: "Device login timed out. Start again.",
              verificationUrl: deviceLoginVerificationUrl
            });
            aiStatusState = {
              checking: false,
              available: false,
              statusCode: 408,
              reason: "request_error",
              checkedAt: Date.now()
            };
            emitSidebarSettings({ skipAutoAiRefresh: true });
            return;
          }
          setAuthFlowState({
            phase: "polling",
            message: "Waiting for approval...",
            verificationUrl: deviceLoginVerificationUrl
          });
        } catch {
        } finally {
          deviceLoginPollInFlight = false;
        }
      }, 2500);
    } catch {
      stopDeviceLoginFlow();
      setAuthFlowState({ phase: "error", message: "Device login failed. Try again.", verificationUrl: "" });
      core.osd("POLYSCRIPT: Device login failed", 2e3);
      aiStatusState = {
        checking: false,
        available: false,
        statusCode: 0,
        reason: "request_error",
        checkedAt: Date.now()
      };
      emitSidebarSettings({ skipAutoAiRefresh: true });
    }
  }
  function handleSidebarAction(action, payload = {}) {
    var _a4, _b, _c;
    switch (action) {
      case "applyLanguageDrafts": {
        const changed = applySidebarLanguageDrafts(payload);
        if (coerceBoolean(payload.retranslate, false)) {
          clearTranslationCaches();
          usingFullFileTranslation = false;
          subtitleEntries = null;
          lastSentenceIndex = -1;
          currentTranslateJobId += 1;
          translateCurrentSubtitleFile();
          core.osd(changed ? "POLYSCRIPT: Applied AI target changes" : "POLYSCRIPT: Re-translating current subtitles", 1800);
        } else if (changed) {
          core.osd("POLYSCRIPT: Saved AI target settings", 1500);
        }
        return;
      }
      case "retranslate":
        translateCurrentSubtitleFile();
        return;
      case "toggleSentence":
        sentenceMode = !sentenceMode;
        (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "sentenceMode", sentenceMode);
        (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
        buildMenu();
        return;
      case "deviceLogin":
        startDeviceLogin();
        return;
      case "deviceLoginSaved":
        startDeviceLogin({ skipPrompt: true, email: payload == null ? void 0 : payload.email });
        return;
      case "trialThenSignIn":
        void openTrialOnboarding();
        startDeviceLogin({ skipPrompt: true, email: payload == null ? void 0 : payload.email });
        return;
      case "openTrial":
        void openTrialOnboarding();
        return;
      case "openApprovalLink":
        void reopenDeviceLoginApprovalLink();
        return;
      case "cancelDeviceLogin":
        stopDeviceLoginFlow();
        setAuthFlowState({
          phase: "idle",
          message: "Sign-in canceled.",
          verificationUrl: ""
        });
        core.osd("POLYSCRIPT: Device sign-in canceled", 1800);
        return;
      case "signOut":
        stopDeviceLoginFlow();
        setPolyscriptToken("");
        setAuthFlowState({ phase: "idle", message: "", verificationUrl: "" });
        (_c = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _c.call(preferences);
        core.osd("POLYSCRIPT: Signed out", 1500);
        return;
      case "llmStatus":
        checkLlmStatus(true);
        return;
      case "applyLayout":
        applySubtitleLayout();
        core.osd("POLYSCRIPT: Subtitle layout applied", 1500);
        return;
      case "restoreLayout":
        restoreSubPositions();
        core.osd("POLYSCRIPT: Restored IINA subtitle positions", 1500);
        return;
      case "openSidebar":
        showSidebarPanel();
        return;
      case "toggleSidebar":
        toggleSidebarPanel();
        return;
      case "personalVoiceRequest":
        requestPersonalVoiceAccess();
        return;
      case "personalVoiceStatus":
        fetchPersonalVoiceStatus().then((status) => {
          if (!status) {
            core.osd("POLYSCRIPT: Personal Voice status unavailable", 2e3);
          } else {
            core.osd(`POLYSCRIPT: Personal Voice ${status}`, 2e3);
          }
        });
        return;
      default:
        return;
    }
  }
  function registerSidebarHandlers() {
    if (sidebarHandlersRegistered) return;
    sidebarHandlersRegistered = true;
    if (sidebar && typeof sidebar.onMessage === "function") {
      sidebar.onMessage("sidebarReady", () => {
        sidebarVisible = true;
        emitSidebarSettings();
        maybeAutoRefreshAiStatus(true);
        void refreshSidebarVoiceData(true);
        startTranscriptTimePoll();
        loadTranscriptFromCurrentSubs();
      });
      sidebar.onMessage("sidebarClosed", () => {
        sidebarVisible = false;
        stopTranscriptTimePoll();
      });
      sidebar.onMessage("ps:getTranscript", () => {
        loadTranscriptFromCurrentSubs();
      });
      sidebar.onMessage("ps:transcriptSeek", (payload) => {
        if (payload && payload.time != null) {
          handleTranscriptSeek(payload.time);
        }
      });
      sidebar.onMessage("ps:exportTranscript", () => {
        exportTranscript();
      });
      sidebar.onMessage("ps:getSettings", () => {
        emitSidebarSettings();
        maybeAutoRefreshAiStatus(false);
        void refreshSidebarVoiceData(false);
      });
      sidebar.onMessage("ps:setSetting", (payload) => {
        if (!payload) return;
        applySidebarSetting(payload.key, payload.value);
        emitSidebarSettings();
      });
      sidebar.onMessage("ps:action", (payload) => {
        if (!payload) return;
        handleSidebarAction(payload.action, payload);
        emitSidebarSettings();
      });
    }
    if (event && typeof event.on === "function") {
      event.on("iina.message", (message) => {
        const { name, data } = message || {};
        if (name === "sidebarReady" || name === "ps:getSettings") {
          if (name === "sidebarReady") {
            sidebarVisible = true;
            startTranscriptTimePoll();
            loadTranscriptFromCurrentSubs();
          }
          emitSidebarSettings();
          maybeAutoRefreshAiStatus(name === "sidebarReady");
          void refreshSidebarVoiceData(name === "sidebarReady");
        } else if (name === "sidebarClosed") {
          sidebarVisible = false;
          stopTranscriptTimePoll();
        } else if (name === "ps:getTranscript") {
          loadTranscriptFromCurrentSubs();
        } else if (name === "ps:transcriptSeek") {
          if (data && data.time != null) handleTranscriptSeek(data.time);
        } else if (name === "ps:exportTranscript") {
          exportTranscript();
        } else if (name === "ps:setSetting") {
          applySidebarSetting(data == null ? void 0 : data.key, data == null ? void 0 : data.value);
          emitSidebarSettings();
        } else if (name === "ps:action") {
          handleSidebarAction(data == null ? void 0 : data.action, data || {});
          emitSidebarSettings();
        }
      });
    }
  }
  function toggleSentenceModeSimple() {
    var _a4, _b;
    sentenceMode = !sentenceMode;
    (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "sentenceMode", sentenceMode);
    (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
    if (!sentenceMode) {
      sentenceLiveMode = false;
      sentenceLivePendingAccept = false;
    }
    clearSentenceAutoResume();
    core.osd(`POLYSCRIPT: Sentence Mode ${sentenceMode ? "On" : "Off"}`, 1500);
    buildMenu();
    emitSidebarSettings();
  }
  function toggleSpeakingModeSimple() {
    var _a4, _b;
    const settings = getTtsSettings();
    const next = !settings.enabled;
    (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "ttsEnabled", next);
    (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
    if (!next) {
      stopSpeaking();
    }
    core.osd(`POLYSCRIPT: Speaking Mode ${next ? "On" : "Off"}`, 1500);
    buildMenu();
    emitSidebarSettings();
  }
  function buildBetaMenu() {
    menu.removeAllItems();
    menu.addItem(
      menu.item(
        "Toggle Polyscript Panel",
        () => {
          toggleSidebarPanel();
        },
        { keyBinding: "cmd+a" }
      )
    );
    menu.addItem(
      menu.item(`Polyscript Subtitles (${polyscriptEnabled ? "On" : "Off"})`, () => {
        setPolyscriptEnabled(!polyscriptEnabled);
      })
    );
    menu.addItem(
      menu.item(`Sentence Mode (${sentenceMode ? "On" : "Off"})`, () => {
        toggleSentenceModeSimple();
      }, { keyBinding: "cmd+shift+s" })
    );
    menu.addItem(
      menu.item(`Speaking Mode (${getTtsSettings().enabled ? "On" : "Off"})`, () => {
        toggleSpeakingModeSimple();
      }, { keyBinding: "cmd+shift+v" })
    );
    menu.addItem(
      menu.item("Re-translate Subtitles", () => {
        translateCurrentSubtitleFile();
      }, { keyBinding: "cmd+shift+r" })
    );
    if (polyscriptToken) {
      menu.addItem(
        menu.item("Sign Out", () => {
          var _a4;
          stopDeviceLoginFlow();
          setPolyscriptToken("");
          setAuthFlowState({ phase: "idle", message: "", verificationUrl: "" });
          (_a4 = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _a4.call(preferences);
          core.osd("POLYSCRIPT: Signed out", 1500);
          emitSidebarSettings({ skipAutoAiRefresh: true });
          buildMenu();
        })
      );
    } else {
      menu.addItem(
        menu.item("Sign In...", async () => {
          await startDeviceLogin({ skipPrompt: false });
        })
      );
    }
    requestMenuForceUpdate();
  }
  function buildMenu() {
    try {
      if (BETA_SIMPLE_MENU) {
        buildBetaMenu();
        return;
      }
      menu.removeAllItems();
      if (!cachedVoices.length && !cachedVoicesBootstrapped) {
        cachedVoicesBootstrapped = true;
        refreshVoiceList(false).finally(() => {
          cachedVoicesBootstrapped = false;
        });
      }
      menu.addItem(
        menu.item("Toggle Polyscript Panel", () => {
          toggleSidebarPanel();
        }, { keyBinding: "cmd+a" })
      );
      menu.addItem(
        menu.item(`Polyscript Subtitles (${polyscriptEnabled ? "On" : "Off"})`, () => {
          setPolyscriptEnabled(!polyscriptEnabled);
        })
      );
      menu.addItem(
        menu.item("Device Login (Email)...", async () => {
          await startDeviceLogin();
        })
      );
      menu.addItem(
        menu.item("Target Language...", () => {
          var _a4;
          const input = (_a4 = utils == null ? void 0 : utils.prompt) == null ? void 0 : _a4.call(utils, "Target language (name or code)", getLangLabel(targetLang));
          const resolved = resolveLanguageInput(input);
          if (!resolved) {
            core.osd("POLYSCRIPT: Language not found", 1500);
            return;
          }
          setTargetLang(resolved);
        })
      );
      menu.addItem(
        menu.item(`Translation Provider (${translationProvider === "polyscript" ? "LLM" : "Google"})`, () => {
          var _a4, _b;
          translationProvider = translationProvider === "google" ? "polyscript" : "google";
          (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "translationProvider", translationProvider);
          (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
          clearTranslationCaches();
          usingFullFileTranslation = false;
          subtitleEntries = null;
          lastSentenceIndex = -1;
          translateCurrentSubtitleFile();
          buildMenu();
        })
      );
      menu.addItem(
        menu.item("LLM Target Language...", () => {
          promptSetLlmTargetLang();
          buildMenu();
        }, { keyBinding: "cmd+shift+l" })
      );
      const sentenceSettings = getSentenceSettings();
      const sentenceRoot = menu.item(`Sentence Mode (${sentenceMode ? "On" : "Off"})`);
      sentenceRoot.addSubMenuItem(
        menu.item(`Enable (${sentenceMode ? "On" : "Off"})`, async () => {
          var _a4, _b;
          if (!sentenceMode) {
            const ok = await ensureSentenceEntries();
            if (!ok) {
              sentenceLiveMode = true;
              sentenceLiveIndex = 0;
              sentenceLivePendingAccept = false;
              core.osd("POLYSCRIPT: Sentence mode using live timing", 2e3);
            }
          }
          sentenceMode = !sentenceMode;
          (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "sentenceMode", sentenceMode);
          (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
          lastSentenceIndex = -1;
          lastPausedSentenceIndex = -1;
          if (!sentenceMode) {
            sentenceLiveMode = false;
            sentenceLivePendingAccept = false;
          }
          clearSentenceAutoResume();
          core.osd(`POLYSCRIPT: Sentence Mode ${sentenceMode ? "On" : "Off"}`, 1500);
          buildMenu();
        }, { keyBinding: "cmd+shift+s", selected: sentenceMode })
      );
      sentenceRoot.addSubMenuItem(
        menu.item(`Auto Resume (${sentenceSettings.autoResume ? "On" : "Off"})`, () => {
          var _a4, _b;
          (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "sentenceAutoResume", !sentenceSettings.autoResume);
          (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
          buildMenu();
        }, { selected: sentenceSettings.autoResume })
      );
      sentenceRoot.addSubMenuItem(
        menu.item(`Auto Resume Delay (${sentenceSettings.delay}s)`, () => {
          var _a4, _b, _c;
          const next = (_a4 = utils == null ? void 0 : utils.prompt) == null ? void 0 : _a4.call(utils, "Auto resume delay (seconds)", String(sentenceSettings.delay));
          const num = Number(next);
          if (!Number.isNaN(num)) {
            (_b = preferences == null ? void 0 : preferences.set) == null ? void 0 : _b.call(preferences, "sentenceAutoResumeDelay", Math.max(0, Math.min(15, num)));
            (_c = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _c.call(preferences);
            buildMenu();
          }
        })
      );
      sentenceRoot.addSubMenuItem(
        menu.item(`Speak Translation On Pause (${sentenceSettings.ttsOnPause ? "On" : "Off"})`, () => {
          var _a4, _b;
          (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "sentenceTtsOnPause", !sentenceSettings.ttsOnPause);
          (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
          buildMenu();
        }, { selected: sentenceSettings.ttsOnPause })
      );
      menu.addItem(sentenceRoot);
      menu.addItem(
        menu.item("Toggle Transliteration", () => {
          const appearance2 = getAppearanceSettings();
          setAppearanceSetting("showTransliteration", !appearance2.showTranslit);
        }, { keyBinding: "cmd+shift+t" })
      );
      menu.addItem(
        menu.item("Re-translate Subtitles", () => translateCurrentSubtitleFile(), { keyBinding: "cmd+shift+r" })
      );
      menu.addItem(menu.separator());
      const quickRoot = menu.item("Quick Actions");
      quickRoot.addSubMenuItem(
        menu.item("Toggle Provider (Google/LLM)", () => {
          var _a4, _b;
          translationProvider = translationProvider === "google" ? "polyscript" : "google";
          (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "translationProvider", translationProvider);
          (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
          clearTranslationCaches();
          usingFullFileTranslation = false;
          subtitleEntries = null;
          lastSentenceIndex = -1;
          translateCurrentSubtitleFile();
          buildMenu();
        })
      );
      quickRoot.addSubMenuItem(
        menu.item(`LLM Target Language: ${llmCustomTarget || targetLang}`, () => {
          promptSetLlmTargetLang();
          buildMenu();
        })
      );
      const llmPresetRoot = menu.item("LLM Target Presets");
      LLM_TARGET_PRESETS.forEach((lang) => {
        llmPresetRoot.addSubMenuItem(
          menu.item(lang, () => {
            setLlmTargetLang(lang);
            buildMenu();
          })
        );
      });
      llmPresetRoot.addSubMenuItem(
        menu.item("Use Default Target Language", () => {
          setLlmTargetLang("");
          buildMenu();
        })
      );
      quickRoot.addSubMenuItem(llmPresetRoot);
      quickRoot.addSubMenuItem(menu.item("Set LLM Target Language...", () => {
        promptSetLlmTargetLang();
        buildMenu();
      }, { keyBinding: "cmd+shift+l" }));
      menu.addItem(quickRoot);
      menu.addItem(menu.separator());
      menu.addItem(menu.separator());
      const speechRoot = menu.item("Speech");
      const ttsSettings = getTtsSettings();
      const engineLabel = ttsSettings.engine === "native" ? "Native Helper" : "macOS say";
      const engineRoot = menu.item(`TTS Engine (${engineLabel})`);
      engineRoot.addSubMenuItem(
        menu.item("macOS say (Built-in)", () => {
          var _a4, _b;
          (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "ttsEngine", "say");
          (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
          buildMenu();
        }, { selected: ttsSettings.engine === "say" })
      );
      engineRoot.addSubMenuItem(
        menu.item("Native Helper (Personal Voice)", () => {
          var _a4, _b;
          (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "ttsEngine", "native");
          (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
          buildMenu();
        }, { selected: ttsSettings.engine === "native" })
      );
      engineRoot.addSubMenuItem(menu.separator());
      engineRoot.addSubMenuItem(
        menu.item("Set Helper Path...", () => {
          var _a4, _b, _c;
          const current = ttsSettings.nativeHelperPath || "";
          const next = (_a4 = utils == null ? void 0 : utils.prompt) == null ? void 0 : _a4.call(utils, "Path to PolyscriptTTSHelper", current);
          if (next != null) {
            (_b = preferences == null ? void 0 : preferences.set) == null ? void 0 : _b.call(preferences, "ttsNativeHelperPath", next.trim());
            (_c = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _c.call(preferences);
            buildMenu();
          }
        })
      );
      engineRoot.addSubMenuItem(
        menu.item(`Auto-Start Helper (${ttsSettings.nativeAutoStart ? "On" : "Off"})`, () => {
          var _a4, _b;
          (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "ttsNativeAutoStart", !ttsSettings.nativeAutoStart);
          (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
          buildMenu();
        }, { selected: ttsSettings.nativeAutoStart })
      );
      engineRoot.addSubMenuItem(
        menu.item("Start Helper Now", async () => {
          const ok = await startNativeHelper();
          if (ok) {
            core.osd("POLYSCRIPT: Native TTS helper started", 1500);
          } else {
            core.osd("POLYSCRIPT: Failed to start helper", 2e3);
          }
        })
      );
      if (ttsSettings.engine === "native") {
        const nativeEngineRoot = menu.item(`Native Engine (${ttsSettings.nativeEngine === "nss" ? "NSSpeechSynthesizer" : "AVSpeechSynthesizer"})`);
        nativeEngineRoot.addSubMenuItem(
          menu.item("NSSpeechSynthesizer (Personal Voice)", () => {
            var _a4, _b;
            (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "ttsNativeEngine", "nss");
            (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
            nativeVoices = [];
            nativeVoicesAt = 0;
            buildMenu();
          }, { selected: ttsSettings.nativeEngine === "nss" })
        );
        nativeEngineRoot.addSubMenuItem(
          menu.item("AVSpeechSynthesizer", () => {
            var _a4, _b;
            (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "ttsNativeEngine", "av");
            (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
            nativeVoices = [];
            nativeVoicesAt = 0;
            buildMenu();
          }, { selected: ttsSettings.nativeEngine === "av" })
        );
        speechRoot.addSubMenuItem(nativeEngineRoot);
      }
      speechRoot.addSubMenuItem(engineRoot);
      speechRoot.addSubMenuItem(
        menu.item(`TTS Enabled (${ttsSettings.enabled ? "On" : "Off"})`, () => {
          var _a4, _b;
          (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "ttsEnabled", !ttsSettings.enabled);
          (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
          buildMenu();
        }, { selected: ttsSettings.enabled })
      );
      speechRoot.addSubMenuItem(
        menu.item(`Speak On Word Click (${ttsSettings.wordClick ? "On" : "Off"})`, () => {
          var _a4, _b;
          (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "ttsOnWordClick", !ttsSettings.wordClick);
          (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
          buildMenu();
        }, { selected: ttsSettings.wordClick })
      );
      speechRoot.addSubMenuItem(
        menu.item(`Speak On Line Click (${ttsSettings.lineClick ? "On" : "Off"})`, () => {
          var _a4, _b;
          (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "ttsOnLineClick", !ttsSettings.lineClick);
          (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
          buildMenu();
        }, { selected: ttsSettings.lineClick })
      );
      speechRoot.addSubMenuItem(
        menu.item("Speak Hovered Word", () => {
          if (!lastHoverWord) {
            core.osd("POLYSCRIPT: Hover a word first", 1500);
            return;
          }
          speakText(getSpeakableText(lastHoverWord));
        }, { keyBinding: "cmd+shift+w" })
      );
      speechRoot.addSubMenuItem(
        menu.item("Speak Current Line", () => {
          if (!lastHoverLine) {
            core.osd("POLYSCRIPT: Hover a line first", 1500);
            return;
          }
          speakText(getSpeakableText(lastHoverLine));
        }, { keyBinding: "cmd+shift+e" })
      );
      speechRoot.addSubMenuItem(
        menu.item("Set TTS Rate...", () => {
          var _a4, _b, _c;
          const current = String(ttsSettings.rate);
          const next = (_a4 = utils == null ? void 0 : utils.prompt) == null ? void 0 : _a4.call(utils, "TTS rate (words per minute)", current);
          const num = Number(next);
          if (!Number.isNaN(num)) {
            (_b = preferences == null ? void 0 : preferences.set) == null ? void 0 : _b.call(preferences, "ttsRate", Math.max(100, Math.min(400, num)));
            (_c = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _c.call(preferences);
            buildMenu();
          }
        })
      );
      speechRoot.addSubMenuItem(
        menu.item("Set TTS Voice...", () => {
          var _a4, _b, _c;
          const current = ttsSettings.voice || "";
          const engineHint = ttsSettings.engine === "native" ? "native voice name or identifier" : ttsSettings.engine === "cloud" ? "cloud voice name" : "macOS say -v voice";
          const next = (_a4 = utils == null ? void 0 : utils.prompt) == null ? void 0 : _a4.call(utils, `TTS voice (${engineHint})`, current);
          if (next != null) {
            (_b = preferences == null ? void 0 : preferences.set) == null ? void 0 : _b.call(preferences, "ttsVoice", next.trim());
            (_c = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _c.call(preferences);
            buildMenu();
          }
        })
      );
      speechRoot.addSubMenuItem(
        menu.item(`Auto Select Voice (${ttsSettings.autoVoice ? "On" : "Off"})`, () => {
          var _a4, _b;
          (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "ttsAutoVoice", !ttsSettings.autoVoice);
          (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
          buildMenu();
        }, { selected: ttsSettings.autoVoice })
      );
      if (ttsSettings.engine === "native") {
        speechRoot.addSubMenuItem(
          menu.item("Request Personal Voice Access", () => {
            requestPersonalVoiceAccess();
          })
        );
        speechRoot.addSubMenuItem(
          menu.item("Check Personal Voice Status", async () => {
            const status = await fetchPersonalVoiceStatus();
            if (!status) {
              core.osd("POLYSCRIPT: Personal Voice status unavailable", 2e3);
            } else {
              core.osd(`POLYSCRIPT: Personal Voice ${status}`, 2e3);
            }
          })
        );
      }
      const voiceKey = getVoicePreferenceKey();
      const voiceLabel = getVoicePreferenceLabel(voiceKey);
      const voiceMap = getTtsVoiceMap();
      const voiceForLang = voiceKey ? voiceMap[voiceKey] : "";
      const voiceList = ttsSettings.engine === "native" ? nativeVoices : ttsSettings.engine === "cloud" ? cloudVoices : cachedVoices;
      const voiceForLangEntry = voiceList.find(
        (v) => v.identifier && v.identifier === voiceForLang || v.name === voiceForLang
      );
      const voiceForLangLabel = voiceForLang === PERSONAL_VOICE_TOKEN ? "Personal" : (voiceForLangEntry == null ? void 0 : voiceForLangEntry.name) || voiceForLang || "Auto";
      const voiceForLangRoot = menu.item(`Voice for ${voiceLabel} (${voiceForLangLabel})`);
      const langCode = getAutoVoiceLangCode();
      const langVoices = ttsSettings.engine === "native" ? filterVoicesByLang(voiceList, langCode) : voiceList;
      if (langVoices.length) {
        const limit = ttsSettings.engine === "native" ? 40 : 80;
        langVoices.slice(0, limit).forEach((voice) => {
          const extra = ttsSettings.engine === "native" && voice.isPersonal ? " Personal" : "";
          const locale = voice.locale || voice.language || "";
          const label = `${voice.name}${locale ? ` (${locale}${extra})` : extra}`;
          voiceForLangRoot.addSubMenuItem(
            menu.item(label, () => {
              if (!voiceKey) {
                core.osd("POLYSCRIPT: No language key available", 1500);
                return;
              }
              const nextMap = getTtsVoiceMap();
              nextMap[voiceKey] = voice.identifier || voice.name;
              saveTtsVoiceMap(nextMap);
              buildMenu();
            }, { selected: voiceForLang === (voice.identifier || voice.name) })
          );
        });
        if (langVoices.length > limit) {
          voiceForLangRoot.addSubMenuItem(
            menu.item(`(${langVoices.length - limit} more hidden)`, () => {
              core.osd("POLYSCRIPT: Use 'Set Voice by Name' to pick hidden voices", 2e3);
            })
          );
        }
      } else {
        voiceForLangRoot.addSubMenuItem(
          menu.item("Load voices\u2026", () => {
            if (ttsSettings.engine === "native") {
              refreshNativeVoices(true);
            } else if (ttsSettings.engine === "cloud") {
              fetchCloudVoices(true).then(() => buildMenu());
            } else {
              refreshVoiceList(true);
            }
          })
        );
      }
      voiceForLangRoot.addSubMenuItem(
        menu.item("Set Voice by Name...", () => {
          var _a4;
          if (!voiceKey) {
            core.osd("POLYSCRIPT: No language key available", 1500);
            return;
          }
          const input = (_a4 = utils == null ? void 0 : utils.prompt) == null ? void 0 : _a4.call(utils, "Voice name or identifier", voiceForLang || "");
          if (input == null) return;
          if (!voiceList.length) {
            const nextMap = getTtsVoiceMap();
            nextMap[voiceKey] = input.trim();
            saveTtsVoiceMap(nextMap);
            core.osd("POLYSCRIPT: Voice set (unverified)", 1500);
            buildMenu();
            return;
          }
          const result = resolveVoiceByName(input, voiceList);
          if (result.voice) {
            const nextMap = getTtsVoiceMap();
            nextMap[voiceKey] = result.voice.identifier || result.voice.name;
            saveTtsVoiceMap(nextMap);
            buildMenu();
            return;
          }
          if (result.reason === "multiple") {
            const names = result.matches.slice(0, 6).map((v) => v.name).join(", ");
            core.osd(`POLYSCRIPT: Multiple matches (${names})`, 2500);
          } else {
            const nextMap = getTtsVoiceMap();
            nextMap[voiceKey] = input.trim();
            saveTtsVoiceMap(nextMap);
            core.osd("POLYSCRIPT: Voice set (fallback)", 1500);
            buildMenu();
          }
        })
      );
      voiceForLangRoot.addSubMenuItem(menu.separator());
      voiceForLangRoot.addSubMenuItem(
        menu.item("Clear for this language", () => {
          if (!voiceKey) return;
          const nextMap = getTtsVoiceMap();
          delete nextMap[voiceKey];
          saveTtsVoiceMap(nextMap);
          buildMenu();
        })
      );
      speechRoot.addSubMenuItem(voiceForLangRoot);
      if (ttsSettings.engine === "say") {
        const voiceListRoot = menu.item("Available Voices (say)");
        if (voiceList.length) {
          voiceList.forEach((voice) => {
            const label = `${voice.name}${voice.locale ? ` (${voice.locale})` : ""}`;
            voiceListRoot.addSubMenuItem(
              menu.item(label, () => {
                var _a4, _b;
                (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "ttsVoice", voice.name);
                (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
                buildMenu();
              }, { selected: ttsSettings.voice === voice.name })
            );
          });
        } else {
          voiceListRoot.addSubMenuItem(
            menu.item("Load voices\u2026", () => {
              refreshVoiceList(true);
            })
          );
        }
        speechRoot.addSubMenuItem(voiceListRoot);
      } else {
        const globalVoiceRoot = menu.item(
          ttsSettings.engine === "cloud" ? "Set Global Voice (Cloud)" : "Set Global Voice (Native)"
        );
        globalVoiceRoot.addSubMenuItem(
          menu.item("Set by Name...", () => {
            var _a4, _b, _c, _d, _e;
            const input = (_a4 = utils == null ? void 0 : utils.prompt) == null ? void 0 : _a4.call(utils, "Voice name or identifier", ttsSettings.voice || "");
            if (input == null) return;
            if (!voiceList.length) {
              (_b = preferences == null ? void 0 : preferences.set) == null ? void 0 : _b.call(preferences, "ttsVoice", String(input || "").trim());
              (_c = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _c.call(preferences);
              core.osd("POLYSCRIPT: Voice set (unverified)", 1500);
              buildMenu();
              return;
            }
            const result = resolveVoiceByName(input, voiceList);
            if (result.voice) {
              (_d = preferences == null ? void 0 : preferences.set) == null ? void 0 : _d.call(preferences, "ttsVoice", result.voice.identifier || result.voice.name);
              (_e = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _e.call(preferences);
              buildMenu();
              return;
            }
            if (result.reason === "multiple") {
              const names = result.matches.slice(0, 6).map((v) => v.name).join(", ");
              core.osd(`POLYSCRIPT: Multiple matches (${names})`, 2500);
            } else {
              core.osd("POLYSCRIPT: Voice not found", 1500);
            }
          })
        );
        globalVoiceRoot.addSubMenuItem(
          menu.item("Clear Global Voice", () => {
            var _a4, _b;
            (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "ttsVoice", "");
            (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
            buildMenu();
          })
        );
        speechRoot.addSubMenuItem(globalVoiceRoot);
      }
      speechRoot.addSubMenuItem(
        menu.item("Refresh Voice List", () => {
          if (ttsSettings.engine === "native") {
            refreshNativeVoices(true);
          } else if (ttsSettings.engine === "cloud") {
            fetchCloudVoices(true).then(() => buildMenu());
          } else {
            refreshVoiceList(true);
          }
        })
      );
      if (ttsSettings.engine === "native") {
        speechRoot.addSubMenuItem(
          menu.item("Use Personal Voice for Current Language", () => {
            var _a4, _b;
            if (!voiceKey) {
              core.osd("POLYSCRIPT: No language key available", 1500);
              return;
            }
            (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "ttsNativeEngine", "nss");
            (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
            const nextMap = getTtsVoiceMap();
            nextMap[voiceKey] = PERSONAL_VOICE_TOKEN;
            saveTtsVoiceMap(nextMap);
            core.osd("POLYSCRIPT: Personal voice enabled", 1800);
            buildMenu();
          })
        );
        speechRoot.addSubMenuItem(
          menu.item(`Prefer Personal Voice (${ttsSettings.preferPersonal ? "On" : "Off"})`, () => {
            var _a4, _b;
            (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "ttsPreferPersonal", !ttsSettings.preferPersonal);
            (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
            buildMenu();
          }, { selected: ttsSettings.preferPersonal })
        );
      }
      speechRoot.addSubMenuItem(
        menu.item("Stop Speaking", () => {
          stopSpeaking();
        })
      );
      speechRoot.addSubMenuItem(
        menu.item(`Debug TTS (${ttsDebugEnabledCache ? "On" : "Off"})`, () => {
          var _a4, _b;
          const next = !ttsDebugEnabledCache;
          ttsDebugEnabledCache = next;
          (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "ttsDebug", next);
          (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
          buildMenu();
        }, { selected: !!ttsDebugEnabledCache })
      );
      menu.addItem(speechRoot);
      menu.addItem(menu.separator());
      const layoutRoot = menu.item("Subtitle Layout");
      const autoArrange = autoArrangeSubsSetting;
      layoutRoot.addSubMenuItem(
        menu.item(`Auto Arrange (${autoArrange ? "On" : "Off"})`, () => {
          var _a4, _b;
          const next = !autoArrange;
          autoArrangeSubsSetting = next;
          (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "autoArrangeSubs", next);
          (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
          applySubtitleLayout();
          buildMenu();
        }, { selected: autoArrange })
      );
      const primaryPos = primarySubPositionSetting;
      const secondaryPos = secondarySubPositionSetting;
      const primaryRoot = menu.item(`Primary Sub Position (${primaryPos})`);
      ["top", "bottom"].forEach((pos) => {
        primaryRoot.addSubMenuItem(
          menu.item(pos, () => {
            var _a4, _b;
            primarySubPositionSetting = pos === "top" ? "top" : "bottom";
            (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "primarySubPosition", pos);
            (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
            applySubtitleLayout();
            buildMenu();
          }, { selected: primaryPos === pos })
        );
      });
      layoutRoot.addSubMenuItem(primaryRoot);
      const secondaryRoot = menu.item(`Secondary Sub Position (${secondaryPos})`);
      ["top", "bottom"].forEach((pos) => {
        secondaryRoot.addSubMenuItem(
          menu.item(pos, () => {
            var _a4, _b;
            secondarySubPositionSetting = pos === "top" ? "top" : "bottom";
            (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "secondarySubPosition", pos);
            (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
            applySubtitleLayout();
            buildMenu();
          }, { selected: secondaryPos === pos })
        );
      });
      layoutRoot.addSubMenuItem(secondaryRoot);
      layoutRoot.addSubMenuItem(
        menu.item("Apply Layout Now", () => {
          applySubtitleLayout();
          core.osd("POLYSCRIPT: Subtitle layout applied", 1500);
        })
      );
      layoutRoot.addSubMenuItem(
        menu.item("Restore IINA Defaults", () => {
          restoreSubPositions();
          core.osd("POLYSCRIPT: Restored IINA subtitle positions", 1500);
        })
      );
      menu.addItem(layoutRoot);
      menu.addItem(menu.separator());
      const langRoot = menu.item(`Target Language (${getLangLabel(targetLang)})`);
      const entries = Object.entries(GOOGLE_TRANSLATE_LANGS).sort((a, b) => {
        const nameA = a[1].toLowerCase();
        const nameB = b[1].toLowerCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
      });
      entries.forEach(([code, name]) => {
        const item = menu.item(`${name} (${code})`, () => setTargetLang(code), {
          selected: code === targetLang
        });
        langRoot.addSubMenuItem(item);
      });
      const recentLangs = Array.isArray(recentLangsCache) ? recentLangsCache : [];
      if (recentLangs.length) {
        langRoot.addSubMenuItem(menu.separator());
        recentLangs.forEach((code) => {
          if (!GOOGLE_TRANSLATE_LANGS[code]) return;
          langRoot.addSubMenuItem(
            menu.item(`Recent: ${getLangLabel(code)} (${code})`, () => setTargetLang(code), {
              selected: code === targetLang
            })
          );
        });
      }
      menu.addItem(langRoot);
      const presetsRoot = menu.item("Presets");
      const presets = getPresets();
      PRESET_SLOTS.forEach((slot) => {
        const preset = presets[slot];
        const label = (preset == null ? void 0 : preset.name) ? `Preset ${slot}: ${preset.name}` : `Preset ${slot}`;
        const slotRoot = menu.item(label);
        slotRoot.addSubMenuItem(menu.item("Apply", () => applyPreset(slot)));
        slotRoot.addSubMenuItem(
          menu.item("Save Current", () => {
            var _a4;
            const name = (_a4 = utils == null ? void 0 : utils.prompt) == null ? void 0 : _a4.call(utils, "Preset name", (preset == null ? void 0 : preset.name) || `Preset ${slot}`);
            savePreset(slot, name || `Preset ${slot}`);
            buildMenu();
          })
        );
        slotRoot.addSubMenuItem(
          menu.item("Rename", () => {
            var _a4;
            const name = (_a4 = utils == null ? void 0 : utils.prompt) == null ? void 0 : _a4.call(utils, "Preset name", (preset == null ? void 0 : preset.name) || `Preset ${slot}`);
            if (!name) return;
            const next = getPresets();
            if (!next[slot]) next[slot] = { settings: getCurrentSettingsSnapshot() };
            next[slot].name = name;
            next[slot].updatedAt = Date.now();
            savePresets(next);
            buildMenu();
          })
        );
        slotRoot.addSubMenuItem(menu.item("Clear", () => {
          clearPreset(slot);
          buildMenu();
        }));
        presetsRoot.addSubMenuItem(slotRoot);
      });
      presetsRoot.addSubMenuItem(
        menu.item("Reset to Defaults", () => {
          var _a4, _b, _c, _d;
          const defaults = {
            targetLang: "en",
            translationProvider: "google",
            llmMode: "translate",
            llmMetaPrompt: "",
            llmCustomPrompt: "",
            llmCustomTarget: "",
            llmModel: "gpt-4o-mini",
            llmTemperature: 0.3,
            llmMaxTokens: 2e3,
            sentenceMode: false,
            appearance: {
              fontSize: "large",
              bgColor: BG_COLORS.Black,
              bgOpacity: 0.85,
              textColor: TEXT_COLORS.White,
              showTranslit: true,
              placement: "auto",
              customOffset: 140,
              overlayDock: "bottom"
            }
          };
          (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "autoArrangeSubs", true);
          (_b = preferences == null ? void 0 : preferences.set) == null ? void 0 : _b.call(preferences, "primarySubPosition", "bottom");
          (_c = preferences == null ? void 0 : preferences.set) == null ? void 0 : _c.call(preferences, "secondarySubPosition", "bottom");
          (_d = preferences == null ? void 0 : preferences.set) == null ? void 0 : _d.call(preferences, "segmentationEnabled", true);
          autoArrangeSubsSetting = true;
          primarySubPositionSetting = "bottom";
          secondarySubPositionSetting = "bottom";
          segmentationEnabledSetting = true;
          applySettingsSnapshot(defaults);
        })
      );
      menu.addItem(presetsRoot);
      menu.addItem(menu.separator());
      const appearance = getAppearanceSettings();
      const appearanceRoot = menu.item("Appearance");
      const dockRoot = menu.item(`Overlay Dock (${appearance.overlayDock === "top" ? "Top" : "Bottom"})`);
      dockRoot.addSubMenuItem(
        menu.item("Bottom", () => {
          setAppearanceSetting("overlayDock", "bottom");
          buildMenu();
        }, { selected: appearance.overlayDock === "bottom" })
      );
      dockRoot.addSubMenuItem(
        menu.item("Top", () => {
          setAppearanceSetting("overlayDock", "top");
          buildMenu();
        }, { selected: appearance.overlayDock === "top" })
      );
      appearanceRoot.addSubMenuItem(dockRoot);
      const sizeRoot = menu.item(`Font Size (${appearance.fontSize})`);
      Object.keys(FONT_SIZE_PRESETS).forEach((sizeKey) => {
        sizeRoot.addSubMenuItem(
          menu.item(sizeKey, () => setAppearanceSetting("overlayFontSize", sizeKey), {
            selected: appearance.fontSize === sizeKey
          })
        );
      });
      appearanceRoot.addSubMenuItem(sizeRoot);
      const bgRoot = menu.item("Background Color");
      Object.entries(BG_COLORS).forEach(([label, value]) => {
        bgRoot.addSubMenuItem(
          menu.item(label, () => setAppearanceSetting("overlayBgColor", value), {
            selected: appearance.bgColor === value
          })
        );
      });
      appearanceRoot.addSubMenuItem(bgRoot);
      const opacityRoot = menu.item("Background Opacity");
      BG_OPACITIES.forEach((op) => {
        const label = `${Math.round(op * 100)}%`;
        opacityRoot.addSubMenuItem(
          menu.item(label, () => setAppearanceSetting("overlayBgOpacity", op), {
            selected: Math.abs(appearance.bgOpacity - op) < 0.01
          })
        );
      });
      appearanceRoot.addSubMenuItem(opacityRoot);
      const textRoot = menu.item("Text Color");
      Object.entries(TEXT_COLORS).forEach(([label, value]) => {
        textRoot.addSubMenuItem(
          menu.item(label, () => setAppearanceSetting("overlayTextColor", value), {
            selected: appearance.textColor === value
          })
        );
      });
      appearanceRoot.addSubMenuItem(textRoot);
      appearanceRoot.addSubMenuItem(
        menu.item(
          `Transliteration (${appearance.showTranslit ? "On" : "Off"})`,
          () => setAppearanceSetting("showTransliteration", !appearance.showTranslit),
          { selected: appearance.showTranslit }
        )
      );
      appearanceRoot.addSubMenuItem(
        menu.item(
          `Segmentation (${isSegmentationEnabled() ? "On" : "Off"})`,
          () => {
            var _a4, _b;
            const next = !isSegmentationEnabled();
            segmentationEnabledSetting = next;
            (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "segmentationEnabled", next);
            (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
            if (lastRenderedText) scheduleRender(lastRenderedText);
          },
          { selected: isSegmentationEnabled() }
        )
      );
      const placementRoot = menu.item(`Subtitle Placement (${OVERLAY_PLACEMENTS[appearance.placement]})`);
      Object.entries(OVERLAY_PLACEMENTS).forEach(([key, label]) => {
        placementRoot.addSubMenuItem(
          menu.item(label, () => {
            setAppearanceSetting("overlayPlacement", key);
            buildMenu();
          }, { selected: appearance.placement === key })
        );
      });
      placementRoot.addSubMenuItem(
        menu.item("Set Custom Offset (px)...", () => {
          var _a4;
          const current = String(appearance.customOffset);
          const next = (_a4 = utils == null ? void 0 : utils.prompt) == null ? void 0 : _a4.call(utils, "Overlay bottom offset (px)", current);
          const num = Number(next);
          if (!Number.isNaN(num)) {
            setAppearanceSetting("overlayCustomOffset", Math.max(0, Math.min(400, num)));
            buildMenu();
          }
        })
      );
      appearanceRoot.addSubMenuItem(placementRoot);
      menu.addItem(appearanceRoot);
      menu.addItem(menu.separator());
      const providerRoot = menu.item(`Translation Provider (${translationProvider})`);
      providerRoot.addSubMenuItem(
        menu.item("Google Translate", () => {
          var _a4;
          translationProvider = "google";
          if (preferences == null ? void 0 : preferences.set) {
            preferences.set("translationProvider", "google");
            (_a4 = preferences.sync) == null ? void 0 : _a4.call(preferences);
          }
          clearTranslationCaches();
          usingFullFileTranslation = false;
          subtitleEntries = null;
          lastSentenceIndex = -1;
          translateCurrentSubtitleFile();
          buildMenu();
        }, { selected: translationProvider === "google" })
      );
      providerRoot.addSubMenuItem(
        menu.item("Polyscript LLM", () => {
          var _a4;
          translationProvider = "polyscript";
          if (preferences == null ? void 0 : preferences.set) {
            preferences.set("translationProvider", "polyscript");
            (_a4 = preferences.sync) == null ? void 0 : _a4.call(preferences);
          }
          clearTranslationCaches();
          usingFullFileTranslation = false;
          subtitleEntries = null;
          lastSentenceIndex = -1;
          translateCurrentSubtitleFile();
          buildMenu();
        }, { selected: translationProvider === "polyscript" })
      );
      providerRoot.addSubMenuItem(
        menu.item("Set Polyscript Token...", () => {
          if (!(utils == null ? void 0 : utils.prompt)) return;
          const token = utils.prompt("Enter Polyscript API token", polyscriptToken || "");
          if (token != null) {
            setPolyscriptToken(token.trim());
            core.osd("POLYSCRIPT: Token saved", 1500);
            buildMenu();
          }
        })
      );
      providerRoot.addSubMenuItem(
        menu.item("Sign In (Email/Password)...", async () => {
          if (!(utils == null ? void 0 : utils.prompt) || !(utils == null ? void 0 : utils.exec)) return;
          const email = utils.prompt("Polyscript email", getSavedLoginEmail() || "");
          if (!email) return;
          saveLoginEmail(email);
          const password = utils.prompt("Polyscript password (not stored)");
          if (!password) return;
          try {
            const url = `${polyscriptBaseUrl}/api/auth/token`;
            const body = `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
            const result = await utils.exec("curl", [
              "-sS",
              "-X",
              "POST",
              url,
              "-H",
              "Content-Type: application/x-www-form-urlencoded",
              "-d",
              body
            ]);
            const output = (result.stdout || result.stderr || "").trim();
            let data = {};
            try {
              data = JSON.parse(output || "{}");
            } catch {
            }
            if (data.access_token) {
              setPolyscriptToken(data.access_token);
              core.osd("POLYSCRIPT: Signed in", 1500);
              buildMenu();
            } else {
              core.osd("POLYSCRIPT: Sign-in failed (try Device Login)", 2500);
            }
          } catch (e) {
            core.osd("POLYSCRIPT: Sign-in failed (try Device Login)", 2500);
          }
        })
      );
      providerRoot.addSubMenuItem(
        menu.item("Device Login (Email)...", async () => {
          await startDeviceLogin();
        })
      );
      providerRoot.addSubMenuItem(
        menu.item("Set Polyscript Base URL...", () => {
          var _a4, _b;
          if (!(utils == null ? void 0 : utils.prompt)) return;
          const base = utils.prompt("Polyscript API base URL", polyscriptBaseUrl);
          if (base != null) {
            polyscriptBaseUrl = normalizeServiceBaseUrl(base, DEFAULT_POLYSCRIPT_BASE_URL);
            (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "polyscriptBaseUrl", polyscriptBaseUrl);
            (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
            core.osd("POLYSCRIPT: Base URL saved", 1500);
          }
        })
      );
      providerRoot.addSubMenuItem(
        menu.item("LLM Status Check", async () => {
          await checkLlmStatus(true);
        })
      );
      menu.addItem(providerRoot);
      if (translationProvider === "polyscript") {
        const llmRoot = menu.item(`LLM Mode (${LLM_MODES[llmMode] || llmMode})`);
        Object.entries(LLM_MODES).forEach(([modeKey, label]) => {
          llmRoot.addSubMenuItem(
            menu.item(label, () => {
              var _a4, _b;
              llmMode = modeKey;
              (_a4 = preferences == null ? void 0 : preferences.set) == null ? void 0 : _a4.call(preferences, "llmMode", llmMode);
              (_b = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _b.call(preferences);
              clearTranslationCaches();
              usingFullFileTranslation = false;
              subtitleEntries = null;
              lastSentenceIndex = -1;
              translateCurrentSubtitleFile();
              buildMenu();
            }, { selected: llmMode === modeKey })
          );
        });
        llmRoot.addSubMenuItem(
          menu.item("Set Meta Prompt...", () => {
            var _a4, _b, _c;
            const prompt = (_a4 = utils == null ? void 0 : utils.prompt) == null ? void 0 : _a4.call(utils, "Additional LLM instructions (optional)", llmMetaPrompt);
            if (prompt != null) {
              llmMetaPrompt = prompt;
              (_b = preferences == null ? void 0 : preferences.set) == null ? void 0 : _b.call(preferences, "llmMetaPrompt", llmMetaPrompt);
              (_c = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _c.call(preferences);
            }
          })
        );
        llmRoot.addSubMenuItem(
          menu.item("Set Custom Prompt...", () => {
            var _a4, _b, _c;
            const prompt = (_a4 = utils == null ? void 0 : utils.prompt) == null ? void 0 : _a4.call(utils, "Custom LLM prompt", llmCustomPrompt);
            if (prompt != null) {
              llmCustomPrompt = prompt;
              (_b = preferences == null ? void 0 : preferences.set) == null ? void 0 : _b.call(preferences, "llmCustomPrompt", llmCustomPrompt);
              (_c = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _c.call(preferences);
            }
          })
        );
        llmRoot.addSubMenuItem(
          menu.item("Set LLM Target Language...", () => {
            promptSetLlmTargetLang();
            buildMenu();
          })
        );
        const llmPresetRoot2 = menu.item("LLM Target Presets");
        LLM_TARGET_PRESETS.forEach((lang) => {
          llmPresetRoot2.addSubMenuItem(
            menu.item(lang, () => {
              setLlmTargetLang(lang);
              buildMenu();
            })
          );
        });
        llmPresetRoot2.addSubMenuItem(
          menu.item("Use Default Target Language", () => {
            setLlmTargetLang("");
            buildMenu();
          })
        );
        llmRoot.addSubMenuItem(llmPresetRoot2);
        llmRoot.addSubMenuItem(
          menu.item("Set LLM Model...", () => {
            var _a4, _b, _c;
            const model = (_a4 = utils == null ? void 0 : utils.prompt) == null ? void 0 : _a4.call(utils, "LLM model", llmModel);
            if (model != null) {
              llmModel = model.trim();
              (_b = preferences == null ? void 0 : preferences.set) == null ? void 0 : _b.call(preferences, "llmModel", llmModel);
              (_c = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _c.call(preferences);
            }
          })
        );
        llmRoot.addSubMenuItem(
          menu.item("Set LLM Temperature...", () => {
            var _a4, _b, _c;
            const temp = (_a4 = utils == null ? void 0 : utils.prompt) == null ? void 0 : _a4.call(utils, "LLM temperature (0-1)", String(llmTemperature));
            const num = Number(temp);
            if (!Number.isNaN(num)) {
              llmTemperature = Math.max(0, Math.min(1, num));
              (_b = preferences == null ? void 0 : preferences.set) == null ? void 0 : _b.call(preferences, "llmTemperature", llmTemperature);
              (_c = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _c.call(preferences);
            }
          })
        );
        llmRoot.addSubMenuItem(
          menu.item("Set LLM Max Tokens...", () => {
            var _a4, _b, _c;
            const mt = (_a4 = utils == null ? void 0 : utils.prompt) == null ? void 0 : _a4.call(utils, "LLM max tokens", String(llmMaxTokens));
            const num = Number(mt);
            if (!Number.isNaN(num)) {
              llmMaxTokens = Math.max(256, num);
              (_b = preferences == null ? void 0 : preferences.set) == null ? void 0 : _b.call(preferences, "llmMaxTokens", llmMaxTokens);
              (_c = preferences == null ? void 0 : preferences.sync) == null ? void 0 : _c.call(preferences);
            }
          })
        );
        menu.addItem(llmRoot);
      }
      requestMenuForceUpdate();
    } catch (e) {
      console.log(`POLYSCRIPT-ERROR: Failed to build menu: ${e.message}`);
    }
  }
  function escapeHtml(text) {
    return String(text != null ? text : "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
  }
  var LOOKAHEAD_COUNT = 5;
  var PREFETCH_INITIAL_COUNT = 10;
  var lastLookaheadIndex = -1;
  function prefetchUpcomingTranslations(currentText) {
    if (!subtitleEntries || !subtitleEntries.length) return;
    if (usingFullFileTranslation) return;
    const timePos = typeof mpv.getNumber === "function" ? mpv.getNumber("time-pos") : null;
    let idx = -1;
    if (typeof timePos === "number") {
      const result = findEntryAtTime(subtitleEntries, timePos * 1e3, lastLookaheadIndex > 0 ? lastLookaheadIndex - 1 : 0);
      idx = result.index;
    }
    if (idx < 0 && currentText) {
      const trimmed = currentText.trim();
      for (let i = Math.max(0, lastLookaheadIndex - 2); i < subtitleEntries.length; i++) {
        if (subtitleEntries[i].content && subtitleEntries[i].content.trim() === trimmed) {
          idx = i;
          break;
        }
      }
    }
    if (idx < 0) return;
    lastLookaheadIndex = idx;
    for (let i = 1; i <= LOOKAHEAD_COUNT; i++) {
      const next = idx + i;
      if (next >= subtitleEntries.length) break;
      const nextText = subtitleEntries[next].content;
      if (nextText && !lineTranslationCache.has(nextText)) {
        translateLine(nextText);
      }
    }
  }
  function prefetchFirstLines() {
    if (!subtitleEntries || !subtitleEntries.length) return;
    if (usingFullFileTranslation) return;
    const count = Math.min(PREFETCH_INITIAL_COUNT, subtitleEntries.length);
    for (let i = 0; i < count; i++) {
      const text = subtitleEntries[i].content;
      if (text && !lineTranslationCache.has(text)) {
        translateLine(text);
      }
    }
  }
  async function translateLine(text) {
    if (!text) return "";
    if (lineTranslationCache.has(text)) return lineTranslationCache.get(text);
    if (lineTranslationPending.has(text) || lineTranslationQueued.has(text)) return null;
    lineTranslationQueue.push(text);
    lineTranslationQueued.add(text);
    pumpLineTranslationQueue();
    return null;
  }
  function getLineTranslationConcurrency() {
    return shouldUseLlmTranslation(getEffectiveTargetLang()) ? 1 : 3;
  }
  function pumpLineTranslationQueue() {
    const maxConcurrency = getLineTranslationConcurrency();
    while (lineTranslationActive < maxConcurrency && lineTranslationQueue.length > 0) {
      const text = lineTranslationQueue.shift();
      if (!text) continue;
      lineTranslationQueued.delete(text);
      if (lineTranslationPending.has(text)) continue;
      const generation = lineTranslationGeneration;
      lineTranslationPending.add(text);
      lineTranslationActive += 1;
      translateLineNow(text, generation).catch(() => {
      }).finally(() => {
        lineTranslationActive = Math.max(0, lineTranslationActive - 1);
        lineTranslationPending.delete(text);
        pumpLineTranslationQueue();
      });
    }
  }
  async function translateLineNow(text, generation) {
    const effectiveTarget = getEffectiveTargetLang();
    const prefersLlmTarget = shouldUseLlmTranslation(effectiveTarget);
    try {
      if (!showedLineTranslateOsd) {
        showedLineTranslateOsd = true;
        core.osd("POLYSCRIPT: Line-by-line translation active", 2e3);
      }
      const translation = await translateText(text, effectiveTarget);
      if (generation !== lineTranslationGeneration) return;
      if (translation) {
        lineTranslationCache.set(text, translation);
      } else if (!prefersLlmTarget) {
        lineTranslationCache.set(text, text);
      }
    } catch (e) {
      if (generation !== lineTranslationGeneration) return;
      if (!prefersLlmTarget) {
        lineTranslationCache.set(text, text);
      } else {
        lineTranslationCache.delete(text);
      }
    } finally {
      if (generation === lineTranslationGeneration && lastOriginalText === text) {
        const translatedLine = lineTranslationCache.get(text);
        if (translatedLine) {
          scheduleRender(translatedLine);
        }
      }
      if (generation === lineTranslationGeneration && liveTranscriptEntries.length) {
        emitLiveTranscriptEntries();
      }
    }
  }
  function cleanWord(word) {
    return word.replace(/[.,!?;:"'()]/g, "").trim();
  }
  function normalizeWord(word) {
    return cleanWord(word).toLowerCase();
  }
  function getSpeakableText(text) {
    const raw = String(text || "");
    try {
      const trimmed = raw.replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "").trim();
      return trimmed || raw.trim();
    } catch {
      return cleanWord(raw) || raw.trim();
    }
  }
  function shouldLookup(word) {
    if (!word || word.length > 24) return false;
    if (/^\s+$/.test(word)) return false;
    return true;
  }
  function parseDictionary(data) {
    if (!data || !data[12]) return [];
    return data[12].map((posEntry) => ({
      pos: posEntry[0],
      definitions: (posEntry[1] || []).map((defEntry) => ({
        def: defEntry[0],
        example: defEntry[2] || null
      }))
    }));
  }
  async function fetchWordInfo(word) {
    const key = normalizeWord(word);
    if (!key || dictCache.has(key) || dictPending.has(key)) return;
    if (!shouldLookup(key)) return;
    dictPending.add(key);
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(DICT_LANG)}&dt=t&dt=rm&dt=md&dt=ex&q=${encodeURIComponent(key)}`;
      const res = await safeHttpGet(url);
      const data = res.data;
      let translation = "";
      if (data && data[0]) {
        data[0].forEach((seg) => {
          if (seg[0]) translation += seg[0];
        });
      }
      let translit = "";
      if (data && data[0] && data[0][data[0].length - 1] && data[0][data[0].length - 1][3]) {
        translit = data[0][data[0].length - 1][3] || "";
      }
      const dictionary = parseDictionary(data);
      dictCache.set(key, { translation, translit, dictionary });
      if (translit) translitCache.set(key, translit);
    } catch (e) {
      dictCache.set(key, { translation: "", translit: "", dictionary: [] });
    } finally {
      dictPending.delete(key);
      scheduleDictionaryOverlayRefresh();
    }
  }
  function segmentText(text, lang) {
    if (!isSegmentationEnabled()) {
      return text.split(/(\s+)/).filter((t) => t.length > 0).map((t) => ({
        text: t,
        isWord: !/^\s+$/.test(t)
      }));
    }
    const needsSegmentation = ["th", "zh", "ja", "lo", "km", "my"].some(
      (l) => lang && lang.startsWith(l)
    );
    if (needsSegmentation && typeof Intl !== "undefined" && Intl.Segmenter) {
      try {
        const segmenter = new Intl.Segmenter(lang, { granularity: "word" });
        return Array.from(segmenter.segment(text)).map((s) => ({
          text: s.segment,
          isWord: !!s.isWordLike
        }));
      } catch (e) {
      }
    }
    return text.split(/(\s+)/).filter((t) => t.length > 0).map((t) => ({
      text: t,
      isWord: !/^\s+$/.test(t)
    }));
  }
  function buildTooltipHtml(wordKey, displayWord) {
    const info = dictCache.get(wordKey);
    if (!info) return "";
    const parts = [];
    const headerWord = String(displayWord || wordKey || "").trim();
    if (headerWord) {
      parts.push(`<div class="ps-dict-word">${escapeHtml(headerWord)}</div>`);
    }
    if (info.translit) {
      parts.push(`<div class="ps-dict-translit">${escapeHtml(info.translit)}</div>`);
    }
    if (info.translation) {
      parts.push(`<div class="ps-dict-translation">${escapeHtml(info.translation)}</div>`);
    }
    if (info.dictionary && info.dictionary.length) {
      const section = [];
      info.dictionary.slice(0, 2).forEach((pos) => {
        section.push(`<div class="ps-dict-pos">${escapeHtml(pos.pos)}</div>`);
        pos.definitions.slice(0, 2).forEach((def) => {
          section.push(`<div class="ps-dict-def">- ${escapeHtml(def.def)}</div>`);
          if (def.example) {
            section.push(`<div class="ps-dict-example">e.g. "${escapeHtml(def.example)}"</div>`);
          }
        });
      });
      if (section.length) {
        parts.push(`<div class="ps-dict-section">${section.join("")}</div>`);
      }
    }
    return parts.join("");
  }
  var LLM_PROMPTS = {
    translate: (text, target, metaPrompt) => ({
      system: `You are a translator. Translate the following numbered subtitle lines to ${target}.
Output each translation on its own line, keeping the same [number] prefix.
Only output the translations, nothing else.
${metaPrompt ? `
Additional instructions: ${metaPrompt}` : ""}`,
      user: text
    }),
    simplify: (text, metaPrompt) => ({
      system: `Simplify the following numbered subtitle lines to make them easier to understand. Use simple words and short sentences.
Output each simplified line with the same [number] prefix.
Only output the simplified text, nothing else.
${metaPrompt ? `
Additional instructions: ${metaPrompt}` : ""}`,
      user: text
    }),
    eli5: (text, metaPrompt) => ({
      system: `Explain the following numbered subtitle lines as if talking to a 5-year-old. Use very simple words and concepts.
Output each line with the same [number] prefix.
Only output the simplified text, nothing else.
${metaPrompt ? `
Additional instructions: ${metaPrompt}` : ""}`,
      user: text
    }),
    beginner: (text, metaPrompt) => ({
      system: `Rewrite the following numbered subtitle lines for language learners. Use simple vocabulary, clear grammar, and avoid idioms.
Output each line with the same [number] prefix.
Only output the simplified text, nothing else.
${metaPrompt ? `
Additional instructions: ${metaPrompt}` : ""}`,
      user: text
    }),
    addEmojis: (text, metaPrompt) => ({
      system: `Add relevant emojis to the following numbered subtitle lines to make them more engaging. Keep the original text intact, just add emojis where appropriate.
Output each line with the same [number] prefix.
Only output the enhanced text, nothing else.
${metaPrompt ? `
Additional instructions: ${metaPrompt}` : ""}`,
      user: text
    }),
    addTimestamps: (text, metaPrompt) => ({
      system: `Add brief context hints in brackets to the following numbered subtitle lines when helpful. These hints should clarify who is speaking, the tone, or situational context.
Output each line with the same [number] prefix.
Only output the enhanced text, nothing else.
${metaPrompt ? `
Additional instructions: ${metaPrompt}` : ""}`,
      user: text
    }),
    addVocab: (text, metaPrompt) => ({
      system: `For the following numbered subtitle lines, identify and mark key vocabulary words by putting them in **bold**. These should be words that are useful for language learners.
Output each line with the same [number] prefix.
Only output the enhanced text, nothing else.
${metaPrompt ? `
Additional instructions: ${metaPrompt}` : ""}`,
      user: text
    }),
    explainCulture: (text, sourceLang, metaPrompt) => ({
      system: `For each numbered subtitle line, add a brief cultural note in parentheses if there are idioms, cultural references, or context that might not be obvious to non-native speakers.
Keep the original text and add explanation in parentheses after it.
Output each line with the same [number] prefix.
${metaPrompt ? `
Additional instructions: ${metaPrompt}` : ""}`,
      user: text
    }),
    formal: (text, metaPrompt) => ({
      system: `Rewrite the following numbered subtitle lines in a formal, professional tone. Use proper grammar and sophisticated vocabulary.
Output each line with the same [number] prefix.
Only output the transformed text, nothing else.
${metaPrompt ? `
Additional instructions: ${metaPrompt}` : ""}`,
      user: text
    }),
    casual: (text, metaPrompt) => ({
      system: `Rewrite the following numbered subtitle lines in a casual, conversational tone. Use relaxed language as if talking to a friend.
Output each line with the same [number] prefix.
Only output the transformed text, nothing else.
${metaPrompt ? `
Additional instructions: ${metaPrompt}` : ""}`,
      user: text
    }),
    poetic: (text, metaPrompt) => ({
      system: `Rewrite the following numbered subtitle lines in a poetic, lyrical style. Use beautiful language, metaphors, and rhythm where appropriate.
Output each line with the same [number] prefix.
Only output the transformed text, nothing else.
${metaPrompt ? `
Additional instructions: ${metaPrompt}` : ""}`,
      user: text
    }),
    humorous: (text, metaPrompt) => ({
      system: `Rewrite the following numbered subtitle lines in a humorous, witty way. Add jokes, puns, or funny observations where appropriate while keeping the meaning.
Output each line with the same [number] prefix.
Only output the transformed text, nothing else.
${metaPrompt ? `
Additional instructions: ${metaPrompt}` : ""}`,
      user: text
    }),
    custom: (text, prompt, metaPrompt) => ({
      system: `${prompt}
${metaPrompt ? `
Additional instructions: ${metaPrompt}` : ""}

The input has numbered lines like [0], [1], etc.
Output each transformed line with the same [number] prefix.
Only output the transformed text, nothing else.`,
      user: text
    })
  };
  async function callPolyscriptLLM(messages, options = {}) {
    var _a4, _b, _c;
    const token = await getValidPolyscriptToken();
    if (!token) {
      const now = Date.now();
      if ((llmMode === "translate" || llmMode === "custom" || llmMode === "explainCulture") && now - lastMissingLoginOsdAt > 3e4) {
        lastMissingLoginOsdAt = now;
        core.osd("POLYSCRIPT: LLM mode requires sign-in. Use Sign In in panel.", 2500);
      }
      void postTelemetryEvent("llm.request_failed", {
        level: "warning",
        feature: "llm",
        outcome: "missing_token"
      });
      throw new Error("Polyscript token not set.");
    }
    void postTelemetryEvent("llm.request_submitted", {
      feature: "llm",
      outcome: "submitted",
      properties: {
        model: options.model || llmModel,
        message_count: Array.isArray(messages) ? messages.length : 0,
        llm_mode: llmMode
      }
    });
    const resp = await authedPost(`${polyscriptBaseUrl}/api/llm/chat`, {
      headers: {
        "Content-Type": "application/json"
      },
      invalidateOnUnauthorized: true,
      data: {
        messages,
        model: options.model || llmModel,
        max_tokens: options.maxTokens || llmMaxTokens,
        temperature: options.temperature || llmTemperature
      }
    });
    if ((resp == null ? void 0 : resp.statusCode) === 401) {
      throw new Error("Session expired. Sign in again.");
    }
    if (resp.statusCode && resp.statusCode >= 400) {
      void postTelemetryEvent("llm.request_failed", {
        level: "error",
        feature: "llm",
        outcome: "http_error",
        properties: { status: resp.statusCode }
      });
      throw new Error(`Polyscript API error: ${resp.statusCode} ${resp.text || ""}`);
    }
    const data = parseJsonPayload(resp.data || resp.text) || {};
    const content = data.content || data.text || data.result || data.translation || data.output_text || ((_c = (_b = (_a4 = data.choices) == null ? void 0 : _a4[0]) == null ? void 0 : _b.message) == null ? void 0 : _c.content) || "";
    void postTelemetryEvent("llm.request_completed", {
      feature: "llm",
      outcome: "success",
      properties: {
        model: options.model || llmModel,
        response_chars: String(content || "").length
      }
    });
    return String(content || "");
  }
  async function translateTextGoogle(text, target) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`;
    const resp = await safeHttpGet(url);
    const data = resp.data;
    let translation = "";
    if (data && data[0]) {
      data[0].forEach((seg) => {
        if (seg[0]) translation += seg[0];
      });
    }
    return translation || text;
  }
  async function translateTextLLM(text, target) {
    const prompt = LLM_PROMPTS.translate(text, target);
    const messages = [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ];
    return callPolyscriptLLM(messages, { temperature: 0.3 });
  }
  function buildNumberedInput(texts, startIndex = 0) {
    return texts.map((t, i) => `[${i + startIndex}] ${t}`).join("\n");
  }
  function parseNumberedOutput(output, count, startIndex = 0) {
    const lines = String(output || "").split("\n");
    const results = new Array(count).fill("");
    lines.forEach((line) => {
      const match = line.match(/^\[(\d+)\]\s*(.*)$/);
      if (!match) return;
      const idx = Number(match[1]) - startIndex;
      if (idx >= 0 && idx < count) {
        results[idx] = match[2].trim();
      }
    });
    return results;
  }
  function getEffectiveTargetLang() {
    if (llmCustomTarget) {
      return llmCustomTarget;
    }
    return targetLang;
  }
  function shouldUseLlmTranslation(target) {
    const resolved = String(target || "").trim();
    if (!resolved) return false;
    if (translationProvider === "polyscript") return true;
    return !Object.prototype.hasOwnProperty.call(GOOGLE_TRANSLATE_LANGS, resolved);
  }
  function getSegmentationLang() {
    const lang = targetLang || "";
    if (/^[a-z]{2,3}(-[A-Za-z]{2})?$/.test(lang)) {
      return lang;
    }
    return "en";
  }
  async function translateTextLLM(text, target) {
    const input = buildNumberedInput([text], 0);
    let prompt;
    if (llmMode === "translate") {
      prompt = LLM_PROMPTS.translate(input, target, llmMetaPrompt);
    } else if (llmMode === "custom") {
      prompt = LLM_PROMPTS.custom(input, llmCustomPrompt || "Transform the text", llmMetaPrompt);
    } else if (llmMode === "explainCulture") {
      prompt = LLM_PROMPTS.explainCulture(input, target, llmMetaPrompt);
    } else {
      prompt = LLM_PROMPTS[llmMode](input, llmMetaPrompt);
    }
    const messages = [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ];
    const result = await callPolyscriptLLM(messages, { temperature: llmTemperature });
    const parsed = parseNumberedOutput(result, 1, 0);
    return parsed[0] || text;
  }
  var lastTranslationFallbackOsdAt = 0;
  function notifyTranslationFallback(message) {
    const now = Date.now();
    if (now - lastTranslationFallbackOsdAt < 3e4) return;
    lastTranslationFallbackOsdAt = now;
    core.osd(message, 2500);
  }
  async function translateTextViaPreferredProvider(text, target) {
    const googleSupported = !!Object.prototype.hasOwnProperty.call(GOOGLE_TRANSLATE_LANGS, String(target || "").trim());
    const preferPolyscript = translationProvider === "polyscript";
    if (preferPolyscript) {
      try {
        return await translateTextLLM(text, target);
      } catch (e) {
        console.log(`POLYSCRIPT-WARN: LLM translation failed, falling back${googleSupported ? " to Google" : ""}: ${e.message || e}`);
        if (googleSupported) {
          notifyTranslationFallback("POLYSCRIPT: LLM unavailable, using Google Translate.");
          return await translateTextGoogle(text, target);
        }
        throw e;
      }
    }
    if (googleSupported) {
      return await translateTextGoogle(text, target);
    }
    notifyTranslationFallback("POLYSCRIPT: Language not supported by Google, using LLM.");
    return await translateTextLLM(text, target);
  }
  async function translateBatchLLM(texts, target) {
    const results = new Array(texts.length).fill("");
    const MAX_LINES = 12;
    const MAX_CHARS = 2e3;
    let start = 0;
    while (start < texts.length) {
      let end = Math.min(texts.length, start + MAX_LINES);
      let chunk = texts.slice(start, end);
      let combined = buildNumberedInput(chunk, start);
      while (combined.length > MAX_CHARS && end - start > 1) {
        end -= 1;
        chunk = texts.slice(start, end);
        combined = buildNumberedInput(chunk, start);
      }
      let prompt;
      if (llmMode === "translate") {
        prompt = LLM_PROMPTS.translate(combined, target, llmMetaPrompt);
      } else if (llmMode === "custom") {
        prompt = LLM_PROMPTS.custom(combined, llmCustomPrompt || "Transform the text", llmMetaPrompt);
      } else if (llmMode === "explainCulture") {
        prompt = LLM_PROMPTS.explainCulture(combined, target, llmMetaPrompt);
      } else {
        prompt = LLM_PROMPTS[llmMode](combined, llmMetaPrompt);
      }
      const messages = [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user }
      ];
      const result = await callPolyscriptLLM(messages, { temperature: llmTemperature });
      const parsed = parseNumberedOutput(result, end - start, start);
      parsed.forEach((line, i) => {
        results[start + i] = line || texts[start + i];
      });
      start = end;
    }
    return results;
  }
  async function translateText(text, target) {
    return await translateTextViaPreferredProvider(text, target);
  }
  function renderSubtitleOverlay(rawText) {
    const text = (rawText || "").replace(/\\n|\\N/g, "\n");
    lastRenderedText = text;
    applySubtitleLayout();
    const lines = text.split("\n");
    const wordsToTranslit = /* @__PURE__ */ new Set();
    const htmlLines = lines.map((line) => {
      const segments = segmentText(line, getSegmentationLang());
      const words = segments.map((seg) => {
        const segText = seg.text || "";
        if (!segText) return "";
        if (!seg.isWord || /^\s+$/.test(segText)) {
          return escapeHtml(segText);
        }
        const key = normalizeWord(segText);
        const cachedTranslit = translitCache.get(key);
        if (shouldLookup(key) && !dictCache.has(key)) {
          wordsToTranslit.add(key);
        }
        const translitHtml = showTransliteration && cachedTranslit ? `<span class="ps-transliteration">${escapeHtml(cachedTranslit)}</span>` : `<span class="ps-transliteration" style="display:none"></span>`;
        const tooltipHtml = buildTooltipHtml(key, segText);
        const tooltip = tooltipHtml ? `<div class="ps-tooltip">${tooltipHtml}</div>` : "";
        const speakWord = getSpeakableText(segText);
        const wordAttrs = `data-clickable data-word="${escapeHtml(segText)}" data-say="${escapeHtml(speakWord)}" onclick="event.stopPropagation(); if (window.iina && window.iina.postMessage){window.iina.postMessage('ps:tts',{kind:'word',text:this.getAttribute('data-say')});} else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.iina){window.webkit.messageHandlers.iina.postMessage({name:'ps:tts',data:{kind:'word',text:this.getAttribute('data-say')}});} " onmouseenter="if (window.iina && window.iina.postMessage){window.iina.postMessage('ps:hover',{kind:'word',text:this.getAttribute('data-word')});} else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.iina){window.webkit.messageHandlers.iina.postMessage({name:'ps:hover',data:{kind:'word',text:this.getAttribute('data-word')}});} "`;
        return `<span class="ps-word-container">${translitHtml}<span class="ps-word" ${wordAttrs}>${escapeHtml(segText)}</span>${tooltip}</span>`;
      }).join("");
      const lineSay = getSpeakableText(line);
      const lineAttrs = `data-clickable data-line="${escapeHtml(line)}" data-say="${escapeHtml(lineSay)}" onclick="if (window.iina && window.iina.postMessage){window.iina.postMessage('ps:tts',{kind:'line',text:this.getAttribute('data-say')});} else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.iina){window.webkit.messageHandlers.iina.postMessage({name:'ps:tts',data:{kind:'line',text:this.getAttribute('data-say')}});} " onmouseenter="if (window.iina && window.iina.postMessage){window.iina.postMessage('ps:hover',{kind:'line',text:this.getAttribute('data-line')});} else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.iina){window.webkit.messageHandlers.iina.postMessage({name:'ps:hover',data:{kind:'line',text:this.getAttribute('data-line')}});} "`;
      return `<div class="ps-line" ${lineAttrs}>${words}</div>`;
    }).join("");
    const positionStyle = getOverlayPositionStyle();
    overlay.setContent(`
    <div class="ps-container" style="${positionStyle}">
      ${htmlLines || '<div class="ps-line ps-muted">Listening for subtitles...</div>'}
    </div>
  `);
    maybeAutoSpeakRenderedText(text);
    if (wordsToTranslit.size > 0) {
      let count = 0;
      wordsToTranslit.forEach((w) => {
        if (count >= DICT_PREFETCH_LIMIT) return;
        enqueueWordInfo(w);
        count += 1;
      });
    }
  }
  function maybeAutoSpeakRenderedText(text) {
    const settings = getTtsSettings();
    if (!settings.enabled || sentenceMode) return;
    if (!pendingAutoSpeakSerial || pendingAutoSpeakSerial === lastAutoSpokenSerial) return;
    const speakable = getSpeakableText(text);
    if (!speakable) return;
    lastAutoSpokenSerial = pendingAutoSpeakSerial;
    void speakText(speakable);
  }
  function clearSubtitleOverlay() {
    lastRenderedText = "";
    pendingRenderText = null;
    pendingAutoSpeakSerial = 0;
    overlay.setContent(`<div class="ps-container"></div>`);
  }
  function ensureOverlayLoaded() {
    if (overlayLoaded || !polyscriptEnabled) return;
    try {
      overlay.simpleMode();
      applyAppearanceSettings();
      if (typeof overlay.setClickable === "function") {
        overlay.setClickable(true);
      }
      if (typeof overlay.onMessage === "function") {
        overlay.onMessage("ps:tts", (payload) => {
          handleOverlaySpeak(payload);
        });
        overlay.onMessage("ps:hover", (payload) => {
          if (!payload || typeof payload !== "object") return;
          lastOverlayInteractionAt = Date.now();
          if (payload.kind === "word") {
            lastHoverWord = payload.text || "";
          } else if (payload.kind === "line") {
            lastHoverLine = payload.text || "";
          }
        });
      }
      overlay.show();
      overlay.setOpacity(1);
      overlayLoaded = true;
    } catch (e) {
      console.log(`POLYSCRIPT-ERROR: Failed to load overlay: ${e.message}`);
    }
  }
  function pollForSubtitleChanges() {
    try {
      if (typeof mpv.getString !== "function" || !polyscriptEnabled) {
        return;
      }
      if (!getSelectedSubTrack()) {
        maybeAutoSelectSourceSubtitleTrack("poll");
      }
      const currentText = mpv.getString("sub-text") || "";
      const timePos = typeof mpv.getNumber === "function" ? mpv.getNumber("time-pos") : null;
      const isPaused = typeof mpv.getFlag === "function" ? mpv.getFlag("pause") : false;
      if (typeof timePos === "number") {
        if (lastTimePos != null && timePos < lastTimePos - 0.5) {
          lastPausedSentenceIndex = -1;
        }
        lastTimePos = timePos;
      }
      if (sentenceMode && subtitleEntries && typeof timePos === "number") {
        const tMs = timePos * 1e3;
        const { entry, index } = findEntryAtTime(subtitleEntries, tMs, lastSentenceIndex);
        if (entry && entry.endMs != null) {
          if (tMs >= entry.endMs - 250 && !isPaused) {
            lastSentenceIndex = index;
            handleSentencePause(entry, index);
          }
        }
      }
      if (sentenceMode && sentenceLiveMode && lastSubtitleText && currentText !== lastSubtitleText) {
        if (sentenceLivePendingAccept && !isPaused) {
          sentenceLivePendingAccept = false;
        } else if (!isPaused) {
          sentenceLiveIndex += 1;
          sentenceLivePendingAccept = true;
          handleSentencePause({ content: lastRenderedText || "" }, sentenceLiveIndex);
          return;
        } else {
          return;
        }
      }
      const now = Date.now();
      const trimmedText = currentText.trim();
      const elapsed = subFirstShownAt ? now - subFirstShownAt : Infinity;
      const needsMinHold = !!subLastDisplayedSub && elapsed < contentAwareMinDisplay(subLastDisplayedText);
      const allowMaxDisplayCap = !sentenceMode;
      if (trimmedText) {
        if (trimmedText === subSuppressedText) {
          if (lastSubtitleText) {
            lastSubtitleText = "";
            lastOriginalText = "";
            pendingAutoSpeakSerial = 0;
            clearSubtitleOverlay();
          }
          return;
        }
        if (currentText !== subLastDisplayedText) {
          subSuppressedText = "";
          if (needsMinHold) {
            return;
          }
          subFirstShownAt = now;
          subLastDisplayedText = currentText;
          lastSubtitleText = currentText;
          lastOriginalText = currentText;
          subtitleChangeSerial += 1;
          pendingAutoSpeakSerial = !sentenceMode && !isPaused ? subtitleChangeSerial : 0;
          console.log(`POLYSCRIPT: New subtitle: ${currentText}`);
          if (typeof timePos === "number" && trimmedText) {
            const tMs = Math.round(timePos * 1e3);
            liveTranscriptEntries.push({
              i: liveTranscriptEntries.length,
              s: tMs,
              e: tMs + contentAwareMinDisplay(trimmedText),
              src: trimmedText,
              t: trimmedText
              // will be replaced with translation below
            });
            emitLiveTranscriptEntries();
          }
          if (overlayLoaded) {
            if (usingFullFileTranslation) {
              subLastDisplayedSub = currentText;
              renderSubtitleOverlay(currentText);
            } else if (usingNativeTargetSubs) {
              subLastDisplayedSub = currentText;
              renderSubtitleOverlay(currentText);
            } else {
              const cached = lineTranslationCache.get(currentText);
              if (cached) {
                subLastDisplayedSub = cached;
                renderSubtitleOverlay(cached);
              } else {
                subLastDisplayedSub = currentText;
                translateLine(currentText);
              }
              prefetchUpcomingTranslations(currentText);
            }
          }
        } else {
          if (allowMaxDisplayCap && elapsed > MAX_SUB_DISPLAY_MS) {
            subSuppressedText = trimmedText;
            subLastDisplayedText = "";
            subFirstShownAt = 0;
            subLastDisplayedSub = null;
            lastSubtitleText = "";
            lastOriginalText = "";
            pendingAutoSpeakSerial = 0;
            clearSubtitleOverlay();
          }
        }
      } else {
        if (needsMinHold) {
          return;
        }
        subLastDisplayedText = "";
        subFirstShownAt = 0;
        subLastDisplayedSub = null;
        if (lastSubtitleText) {
          lastSubtitleText = "";
          lastOriginalText = "";
          pendingAutoSpeakSerial = 0;
          clearSubtitleOverlay();
        }
      }
    } catch (e) {
      console.log(`POLYSCRIPT-ERROR: Polling failed: ${e.message}`);
    }
  }
  function getSelectedSubTrack() {
    try {
      const tracks = mpv.getNative("track-list");
      if (Array.isArray(tracks)) {
        return tracks.find((t) => t.type === "sub" && t.selected);
      }
    } catch {
    }
    return null;
  }
  function isAutoSourceSubtitleSelectionEnabled() {
    return autoPickSourceSubtitlesEnabled;
  }
  function listSubtitleTracks() {
    try {
      const tracks = mpv.getNative("track-list");
      if (!Array.isArray(tracks)) return [];
      return tracks.filter((t) => t && t.type === "sub" && typeof t.id === "number").filter((t) => {
        const title = String(t.title || "").toLowerCase();
        const forced = !!t.forced;
        if (forced) return false;
        if (title.includes("forced")) return false;
        return true;
      });
    } catch {
      return [];
    }
  }
  function normalizeBaseLang(langCode) {
    if (!langCode) return "";
    return String(langCode).trim().toLowerCase().split(/[-_]/)[0];
  }
  function langMatchesTarget(trackLang, target) {
    const a = normalizeBaseLang(trackLang);
    const b = normalizeBaseLang(target);
    return a && b && a === b;
  }
  function findNativeTargetTrack(target) {
    const tracks = listSubtitleTracks();
    for (const track of tracks) {
      const lang = track.lang || track.language || "";
      if (langMatchesTarget(lang, target)) {
        return track;
      }
      const title = String(track.title || "").toLowerCase();
      const targetBase = normalizeBaseLang(target);
      if (targetBase && title.includes(targetBase)) {
        return track;
      }
    }
    return null;
  }
  function tryUseNativeTargetSubtitles() {
    if (!useNativeSubsWhenAvailable || !polyscriptEnabled) return false;
    const effectiveTarget = getEffectiveTargetLang();
    if (!effectiveTarget) return false;
    const nativeTrack = findNativeTargetTrack(effectiveTarget);
    if (!nativeTrack || typeof nativeTrack.id !== "number") return false;
    const current = getSelectedSubTrack();
    if (current && current.id === nativeTrack.id && usingNativeTargetSubs) return true;
    try {
      mpv.set("sid", nativeTrack.id);
      lastNativeSubId = nativeTrack.id;
      usingFullFileTranslation = false;
      usingNativeTargetSubs = true;
      sourceTrackAutoSelectedForFile = true;
      const label = String(nativeTrack.title || nativeTrack.lang || nativeTrack.language || nativeTrack.id);
      core.osd(`POLYSCRIPT: Using native ${label} subtitles`, 2e3);
      console.log(`POLYSCRIPT: Switched to native target-language subtitle track id=${nativeTrack.id} lang=${label}`);
      return true;
    } catch (e) {
      console.log(`POLYSCRIPT-ERROR: Failed to switch to native target subtitle: ${e.message}`);
      return false;
    }
  }
  var LANGUAGE_ROUTING_MATRIX = { "en": ["de", "nl", "no", "sv", "es", "fr", "da", "en"], "es": ["pt", "fr", "it", "en", "gl", "ca", "de"], "fr": ["es", "pt", "it", "en", "de", "ca", "ru"], "de": ["en", "nl", "no", "da", "sv", "ru", "fr"], "it": ["es", "fr", "pt", "en", "de", "ca", "ru"], "pt": ["es", "fr", "it", "en", "gl", "ca", "de"], "ru": ["uk", "pl", "en", "cs", "de", "es", "fr"], "ja": ["en", "de", "zh", "fr", "ko", "es", "ru"], "ko": ["en", "ja", "de", "zh", "ru", "es", "fr"], "zh": ["en", "de", "es", "ru", "fr", "ja", "pt"], "ar": ["he", "en", "es", "fr", "de", "ru", "it"], "hi": ["ur", "en", "de", "es", "ru", "fr", "pt"], "bn": ["en", "de", "ru", "fr", "es", "hi", "nl"], "tr": ["en", "de", "es", "fr", "ja", "ru", "he"], "pl": ["ru", "cs", "uk", "en", "de", "es", "fr"], "nl": ["de", "en", "no", "sv", "es", "da", "fr"], "sv": ["en", "de", "da", "no", "nl", "ru", "es"], "da": ["en", "de", "sv", "no", "nl", "ru", "fr"], "no": ["en", "de", "da", "sv", "nl", "ru", "es"], "fi": ["en", "es", "ru", "de", "fr", "pt", "it"], "cs": ["ru", "pl", "en", "uk", "de", "es", "fr"], "el": ["en", "es", "de", "ru", "fr", "it", "pt"], "he": ["en", "es", "fr", "de", "ru", "pt", "it"], "hu": ["fi", "en", "de", "es", "fr", "ru", "pt"], "ro": ["es", "fr", "it", "pt", "en", "de", "ru"], "th": ["en", "fr", "es", "de", "ru", "he", "pt"], "vi": ["en", "fr", "es", "de", "ru", "he", "pt"], "id": ["ms", "en", "fr", "es", "de", "ru", "he"], "ms": ["id", "en", "fr", "es", "de", "ru", "he"], "uk": ["ru", "pl", "en", "de", "cs", "fr", "es"], "bg": ["ru", "en", "pl", "uk", "es", "de", "cs"], "hr": ["ru", "en", "pl", "uk", "de", "es", "cs"], "sr": ["ru", "en", "pl", "uk", "de", "es", "cs"], "sk": ["ru", "cs", "pl", "en", "uk", "de", "es"], "sl": ["ru", "pl", "en", "uk", "cs", "de", "es"], "et": ["fi", "en", "es", "de", "ru", "fr", "pt"], "lv": ["ru", "en", "de", "pl", "uk", "fr", "cs"], "lt": ["ru", "en", "pl", "cs", "de", "uk", "es"], "ka": ["en", "de", "es", "fr", "ru", "nl", "pt"], "ur": ["hi", "en", "es", "de", "ru", "fr", "pt"], "ta": ["en", "de", "ja", "es", "fr", "ru", "zh"], "te": ["en", "de", "ja", "es", "fr", "ru", "zh"], "ml": ["en", "ja", "de", "zh", "ru", "fr", "es"], "kn": ["en", "ja", "de", "es", "fr", "ru", "zh"], "gu": ["hi", "en", "de", "es", "ru", "fr", "it"], "mr": ["en", "de", "fr", "hi", "ru", "es", "nl"], "pa": ["en", "de", "ru", "es", "fr", "hi", "pl"], "af": ["de", "en", "nl", "no", "fr", "sv", "da"], "ca": ["es", "pt", "fr", "it", "en", "gl", "de"], "eu": ["en", "es", "fr", "de", "ru", "he", "pt"], "gl": ["es", "pt", "fr", "it", "en", "ca", "de"], "la": ["it", "es", "pt", "fr", "en", "de", "ru"], "tl": ["en", "es", "fr", "ru", "ms", "de", "pt"], "iw": ["he", "en", "es", "fr", "de", "ru", "pt"], "jw": ["ms", "en", "id", "fr", "de", "es", "ru"], "lzh": ["zh", "ja", "ko", "en", "de", "es", "ru"] };
  function getOptimalSourceLang(targetLanguage, availableLangs) {
    if (!availableLangs || availableLangs.length === 0) return { lang: null, reason: "no_captions" };
    if (!targetLanguage) return { lang: availableLangs[0], reason: "no_target" };
    let targetCode = normalizeBaseLang(targetLanguage);
    const idealSources = (LANGUAGE_ROUTING_MATRIX[targetCode] || ["en"]).slice();
    if (!idealSources.includes(targetCode)) {
      idealSources.unshift(targetCode);
    }
    for (const preferred of idealSources) {
      for (const avail of availableLangs) {
        const baseAvail = normalizeBaseLang(avail);
        if (baseAvail === preferred) {
          let reason = "routing_matrix";
          if (preferred === targetCode) reason = "direct_match";
          else if (preferred === "en") reason = "fallback_english";
          return { lang: avail, reason, preferred };
        }
      }
    }
    const enTrack = availableLangs.find((l) => normalizeBaseLang(l) === "en");
    if (enTrack) return { lang: enTrack, reason: "absolute_fallback_en" };
    return { lang: availableLangs[0], reason: "last_resort" };
  }
  function pickBestSourceSubtitleTrack(tracks, targetLangOverride) {
    var _a4, _b;
    if (!Array.isArray(tracks) || !tracks.length) return null;
    const availableLangs = tracks.map((t) => t.lang || t.language || "").filter(Boolean);
    const effectiveTarget = targetLangOverride || getEffectiveTargetLang();
    const routing = availableLangs.length > 1 ? getOptimalSourceLang(effectiveTarget, availableLangs) : null;
    const scored = tracks.map((track) => {
      let score = 0;
      if (track.selected) score += 1e4;
      if (track.default) score += 400;
      if (track["external-filename"] || track["external_filename"]) score += 120;
      const title = String(track.title || "").toLowerCase();
      if (title.includes("sdh") || title.includes("hearing") || title.includes("commentary")) {
        score -= 60;
      }
      if (title.includes("sign")) {
        score -= 25;
      }
      if (routing && routing.lang) {
        const trackLang = normalizeBaseLang(track.lang || track.language || "");
        const routedLang = normalizeBaseLang(routing.lang);
        if (trackLang && routedLang && trackLang === routedLang) {
          score += 500;
        }
      }
      return { track, score };
    });
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Number(a.track.id) - Number(b.track.id);
    });
    if (routing) {
      const winner = (_a4 = scored[0]) == null ? void 0 : _a4.track;
      const winnerLang = winner ? winner.lang || winner.language || "?" : "?";
      console.log(`POLYSCRIPT: Source language routing: target=${effectiveTarget}, optimal=${routing.lang} (${routing.reason}), selected=${winnerLang}`);
    }
    return ((_b = scored[0]) == null ? void 0 : _b.track) || null;
  }
  function maybeAutoSelectSourceSubtitleTrack(reason = "unknown") {
    if (!polyscriptEnabled) return false;
    if (!isAutoSourceSubtitleSelectionEnabled()) return false;
    if (tryUseNativeTargetSubtitles()) return true;
    const selected = getSelectedSubTrack();
    if (selected && typeof selected.id === "number") {
      lastNativeSubId = selected.id;
      sourceTrackAutoSelectedForFile = true;
      return false;
    }
    if (sourceTrackAutoSelectedForFile) return false;
    if (sourceTrackSelectionAttempts >= 8) return false;
    const now = Date.now();
    if (now - lastSourceTrackSelectionAttemptAt < 900) return false;
    lastSourceTrackSelectionAttemptAt = now;
    sourceTrackSelectionAttempts += 1;
    const tracks = listSubtitleTracks();
    if (!tracks.length) return false;
    const candidate = pickBestSourceSubtitleTrack(tracks);
    if (!candidate || typeof candidate.id !== "number") return false;
    try {
      mpv.set("sid", candidate.id);
      lastNativeSubId = candidate.id;
      sourceTrackAutoSelectedForFile = true;
      const label = String(candidate.title || candidate.lang || candidate.language || candidate.id);
      core.osd(`POLYSCRIPT: Using subtitles (${label})`, 1400);
      console.log(`POLYSCRIPT: Auto-selected source subtitle track id=${candidate.id} reason=${reason}`);
      return true;
    } catch (e) {
      console.log(`POLYSCRIPT-ERROR: Auto-select subtitle track failed: ${e.message}`);
      return false;
    }
  }
  function getSubtitleFilePath() {
    try {
      const track = getSelectedSubTrack();
      if (!track) return null;
      return track["external-filename"] || track["external_filename"] || null;
    } catch {
      return null;
    }
  }
  function getEmbeddedSubTrackIndex() {
    var _a4;
    try {
      const track = getSelectedSubTrack();
      if (!track) return null;
      const ffIndex = (_a4 = track["ff-index"]) != null ? _a4 : track["ff_index"];
      return typeof ffIndex === "number" ? ffIndex : null;
    } catch {
      return null;
    }
  }
  function getVideoPath() {
    try {
      const path = mpv.getString("path");
      if (!path || path.startsWith("http://") || path.startsWith("https://")) return null;
      return path;
    } catch {
      return null;
    }
  }
  async function extractEmbeddedSubToSrt() {
    if (!utils || typeof utils.fileInPath !== "function" || typeof utils.exec !== "function") {
      return null;
    }
    if (!utils.fileInPath("ffmpeg")) return null;
    const videoPath = getVideoPath();
    const ffIndex = getEmbeddedSubTrackIndex();
    if (!videoPath || ffIndex == null) return null;
    const outPath = `/tmp/polyscript_embedded_${Date.now()}.srt`;
    const args = ["-y", "-i", videoPath, "-map", `0:s:${ffIndex}`, outPath];
    const result = await utils.exec("ffmpeg", args, null, null, null);
    if (result && result.status === 0 && file.exists(outPath)) {
      return outPath;
    }
    return null;
  }
  function parseSrt(text) {
    const blocks = text.replace(/\r/g, "").split(/\n\n+/);
    const entries = [];
    for (const block of blocks) {
      const lines = block.split("\n").filter(Boolean);
      if (lines.length < 2) continue;
      const index = lines[0].trim();
      const time = lines[1].trim();
      const timeMatch = time.match(
        /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
      );
      let startMs = null;
      let endMs = null;
      if (timeMatch) {
        const toMs = (h, m, s, ms) => (Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1e3 + Number(ms);
        startMs = toMs(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
        endMs = toMs(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
      }
      const content = lines.slice(2).join("\n");
      entries.push({ index, time, content, startMs, endMs });
    }
    return entries;
  }
  function msToSrtTimestamp(ms) {
    const h = Math.floor(ms / 36e5);
    const m = Math.floor(ms % 36e5 / 6e4);
    const s = Math.floor(ms % 6e4 / 1e3);
    const f = ms % 1e3;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(f).padStart(3, "0")}`;
  }
  function enforceMinCueDuration(entries) {
    if (!entries || !entries.length) return entries;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.startMs == null || e.endMs == null) continue;
      const minDur = contentAwareMinDisplay(e.content);
      const dur = e.endMs - e.startMs;
      if (dur >= minDur) continue;
      let newEnd = e.startMs + minDur;
      if (i + 1 < entries.length && entries[i + 1].startMs != null) {
        newEnd = Math.min(newEnd, entries[i + 1].startMs);
      }
      if (newEnd > e.endMs) {
        e.endMs = newEnd;
        e.time = `${msToSrtTimestamp(e.startMs)} --> ${msToSrtTimestamp(e.endMs)}`;
      }
    }
    return entries;
  }
  async function ensureSentenceEntries() {
    if (subtitleEntries && subtitleEntries.length) {
      sentenceLiveMode = false;
      sentenceLivePendingAccept = false;
      return true;
    }
    let path = getSubtitleFilePath();
    if (path && !path.toLowerCase().endsWith(".srt")) {
      path = null;
    }
    if (!path) {
      path = await extractEmbeddedSubToSrt();
    }
    if (!path) return false;
    try {
      const raw = file.read(path);
      if (!raw) return false;
      subtitleEntries = parseSrt(raw);
      enforceMinCueDuration(subtitleEntries);
      lastSentenceIndex = -1;
      lastPausedSentenceIndex = -1;
      sentenceLiveMode = false;
      sentenceLivePendingAccept = false;
      return !!subtitleEntries.length;
    } catch {
      return false;
    }
  }
  function buildSrt(entries) {
    return entries.map((e) => `${e.index}
${e.time}
${e.content}
`).join("\n");
  }
  function findEntryAtTime(entries, tMs, lastIndex) {
    if (!entries || !entries.length || tMs == null) return { entry: null, index: -1 };
    let i = Math.max(0, lastIndex || 0);
    if (entries[i] && entries[i].startMs != null && tMs < entries[i].startMs) {
      i = 0;
    }
    while (i < entries.length) {
      const e = entries[i];
      if (e.startMs != null && e.endMs != null) {
        if (tMs >= e.startMs && tMs <= e.endMs) return { entry: e, index: i };
        if (tMs < e.startMs) return { entry: null, index: i };
      }
      i += 1;
    }
    return { entry: null, index: -1 };
  }
  async function translateBatch(texts, targetLang2) {
    if (shouldUseLlmTranslation(targetLang2)) {
      return translateBatchLLM(texts, targetLang2);
    }
    const results = [];
    const MAX_URL_LENGTH = 1800;
    const separator = "\n<|polyscript-sep|>\n";
    let currentChunk = [];
    let currentLength = 0;
    const flushChunk = async () => {
      if (!currentChunk.length) return;
      const combinedText = currentChunk.join(separator);
      const combinedTranslation = await translateText(combinedText, targetLang2);
      const translatedTexts = combinedTranslation.split(/\s*<\|polyscript-sep\|>\s*/);
      results.push(...translatedTexts);
      currentChunk = [];
      currentLength = 0;
    };
    for (const text of texts) {
      const encodedText = encodeURIComponent(text);
      if (currentLength + encodedText.length + separator.length > MAX_URL_LENGTH) {
        await flushChunk();
      }
      currentChunk.push(text);
      currentLength += encodedText.length + separator.length;
    }
    await flushChunk();
    return results;
  }
  async function translateCurrentSubtitleFile() {
    if (translatingFile || !polyscriptEnabled) return;
    if (tryUseNativeTargetSubtitles()) return;
    const jobId = ++currentTranslateJobId;
    let path = getSubtitleFilePath();
    if (path && !path.toLowerCase().endsWith(".srt")) {
      console.log(`POLYSCRIPT: Subtitle file is not SRT, skipping: ${path}`);
      path = null;
    }
    if (!path) {
      const embeddedPath = await extractEmbeddedSubToSrt();
      if (embeddedPath) {
        path = embeddedPath;
      } else {
        console.log("POLYSCRIPT: No subtitle file available for full translation.");
        return;
      }
    }
    translatingFile = true;
    core.osd("POLYSCRIPT: Translating subtitles...", 3e3);
    try {
      const raw = file.read(path);
      if (!raw) throw new Error("Could not read subtitle file.");
      const entries = parseSrt(raw);
      const texts = entries.map((e) => e.content.replace(/\n/g, " <|ps_line|> "));
      const effectiveTarget = getEffectiveTargetLang();
      const translations = await translateBatch(texts, effectiveTarget);
      if (jobId !== currentTranslateJobId) return;
      translations.forEach((t, i) => {
        const restored = (t || "").replace(/\s*<\|ps_line\|>\s*/g, "\n");
        entries[i].content = restored || entries[i].content;
      });
      enforceMinCueDuration(entries);
      const translatedSrt = buildSrt(entries);
      const outPath = `/tmp/polyscript_translated_${Date.now()}.srt`;
      file.write(outPath, translatedSrt);
      const prevTrack = getSelectedSubTrack();
      const prevId = prevTrack && typeof prevTrack.id === "number" ? prevTrack.id : null;
      if (prevId != null) {
        lastNativeSubId = prevId;
      }
      mpv.command("sub-add", [outPath, "select"]);
      setTimeout(() => {
        try {
          const tracks = mpv.getNative("track-list");
          if (!Array.isArray(tracks)) return;
          const newTrack = tracks.find(
            (t) => t.type === "sub" && (t["external-filename"] === outPath || t["external_filename"] === outPath)
          );
          if (newTrack && typeof newTrack.id === "number") {
            mpv.set("sid", newTrack.id);
            if (prevId != null) {
              mpv.set("secondary-sid", prevId);
            }
            lastTranslatedSubPath = outPath;
            usingFullFileTranslation = true;
            subtitleEntries = entries;
            lastSentenceIndex = -1;
          }
        } catch {
        }
      }, 300);
      core.osd("POLYSCRIPT: Translated subtitles loaded.", 3e3);
    } catch (e) {
      console.log(`POLYSCRIPT-ERROR: Subtitle translation failed: ${e.message}`);
      core.osd("POLYSCRIPT: Subtitle translation failed.", 3e3);
    } finally {
      translatingFile = false;
    }
  }
  function transcriptTextForLine(sourceText) {
    if (usingNativeTargetSubs || usingFullFileTranslation) return sourceText;
    const cached = lineTranslationCache.get(sourceText);
    return cached || sourceText;
  }
  function emitTranscriptEntries() {
    if (!subtitleEntries || !subtitleEntries.length) return;
    const lightweight = subtitleEntries.map((e, i) => ({
      i,
      s: e.startMs,
      e: e.endMs,
      t: transcriptTextForLine(e.content),
      src: e.content
    }));
    sendSidebarMessage("ps:transcript", { entries: lightweight });
  }
  function emitLiveTranscriptEntries() {
    if (!liveTranscriptEntries.length) return;
    const mapped = liveTranscriptEntries.map((e) => ({
      ...e,
      t: transcriptTextForLine(e.src || e.t)
    }));
    sendSidebarMessage("ps:transcript", { entries: mapped });
  }
  function emitTranscriptTimePos() {
    try {
      const timePos = typeof mpv.getNumber === "function" ? mpv.getNumber("time-pos") : null;
      if (typeof timePos !== "number") return;
      const tMs = Math.round(timePos * 1e3);
      if (Math.abs(tMs - lastTranscriptTimePos) < 200) return;
      lastTranscriptTimePos = tMs;
      sendSidebarMessage("ps:transcriptTime", { t: tMs });
    } catch {
    }
  }
  function startTranscriptTimePoll() {
    stopTranscriptTimePoll();
    if (!sidebarVisible) return;
    transcriptTimePollTimer = setInterval(emitTranscriptTimePos, 300);
  }
  function stopTranscriptTimePoll() {
    if (transcriptTimePollTimer) {
      clearInterval(transcriptTimePollTimer);
      transcriptTimePollTimer = null;
    }
  }
  function handleTranscriptSeek(timeMs) {
    try {
      const timeSec = Number(timeMs) / 1e3;
      if (!isFinite(timeSec) || timeSec < 0) return;
      mpv.set("time-pos", timeSec);
    } catch (e) {
      console.log(`POLYSCRIPT-ERROR: transcript seek failed: ${e.message}`);
    }
  }
  function exportTranscript() {
    try {
      const entries = subtitleEntries && subtitleEntries.length ? subtitleEntries.map((e) => ({
        startMs: e.startMs,
        endMs: e.endMs,
        source: e.content,
        translated: transcriptTextForLine(e.content)
      })) : liveTranscriptEntries.map((e) => ({
        startMs: e.s,
        endMs: e.e,
        source: e.src || e.t,
        translated: transcriptTextForLine(e.src || e.t)
      }));
      if (!entries.length) {
        core.osd("POLYSCRIPT: No transcript to export.", 2e3);
        return;
      }
      const payload = {
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        targetLang: getEffectiveTargetLang(),
        lineCount: entries.length,
        entries
      };
      const outPath = `/tmp/polyscript_transcript_${Date.now()}.json`;
      file.write(outPath, JSON.stringify(payload, null, 2));
      core.osd(`POLYSCRIPT: Transcript exported to ${outPath}`, 4e3);
      console.log(`POLYSCRIPT: Transcript exported (${entries.length} lines) \u2192 ${outPath}`);
      sendSidebarMessage("ps:transcriptExported", { path: outPath, lineCount: entries.length });
    } catch (e) {
      console.log(`POLYSCRIPT-ERROR: Transcript export failed: ${e.message}`);
      core.osd("POLYSCRIPT: Export failed.", 2e3);
    }
  }
  function loadTranscriptFromCurrentSubs() {
    try {
      if (subtitleEntries && subtitleEntries.length) {
        enforceMinCueDuration(subtitleEntries);
        emitTranscriptEntries();
        return;
      }
      ensureSentenceEntries().then((ok) => {
        if (ok && subtitleEntries && subtitleEntries.length) {
          emitTranscriptEntries();
        } else {
          if (liveTranscriptEntries.length) {
            sendSidebarMessage("ps:transcript", { entries: liveTranscriptEntries });
          }
          console.log("POLYSCRIPT: No subtitle entries for transcript (no SRT found or ffmpeg unavailable).");
        }
      }).catch(() => {
      });
    } catch {
    }
  }
  function initializeSubtitleSystem() {
    core.osd("Polyscript is active.", 5e3);
    if (polyscriptEnabled) {
      ensureOverlayLoaded();
      maybeAutoSelectSourceSubtitleTrack("initialize");
      ensureSentenceEntries().then((ok) => {
        if (ok) {
          prefetchFirstLines();
          loadTranscriptFromCurrentSubs();
        }
      }).catch(() => {
      });
    }
    if (subtitlePollTimer) {
      clearInterval(subtitlePollTimer);
    }
    subtitlePollTimer = setInterval(pollForSubtitleChanges, 100);
    startTranscriptTimePoll();
  }
  event.on("iina.file-loaded", () => {
    usingFullFileTranslation = false;
    usingNativeTargetSubs = false;
    subtitleEntries = null;
    lastSentenceIndex = -1;
    lastPausedSentenceIndex = -1;
    lastTimePos = null;
    sourceTrackAutoSelectedForFile = false;
    sourceTrackSelectionAttempts = 0;
    lastSourceTrackSelectionAttemptAt = 0;
    clearSentenceAutoResume();
    currentTranslateJobId += 1;
    subFirstShownAt = 0;
    subLastDisplayedText = "";
    subLastDisplayedSub = null;
    subSuppressedText = "";
    lastLookaheadIndex = -1;
    liveTranscriptEntries = [];
    setTimeout(() => maybeAutoSelectSourceSubtitleTrack("file-loaded"), 450);
    setTimeout(initializeSubtitleSystem, 1500);
    if (autoLoadSubtitlesEnabled) {
      setTimeout(translateCurrentSubtitleFile, 2e3);
    }
  });
  event.on("iina.window-loaded", () => {
    var _a4;
    buildMenu();
    ensureOverlayLoaded();
    try {
      (_a4 = sidebar == null ? void 0 : sidebar.loadFile) == null ? void 0 : _a4.call(sidebar, "dist/ui/sidebar/index.html");
    } catch (e) {
      console.log(`POLYSCRIPT-ERROR: Failed to load sidebar: ${e.message}`);
    }
    registerSidebarHandlers();
    emitSidebarSettings();
    maybeAutoRefreshAiStatus(true);
  });
  ensureOverlayLoaded();
})();
