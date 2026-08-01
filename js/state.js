(function (global) {
  "use strict";

  var KEY_STORAGE = "projectAssistant.apiKey";
  var MAX_IMAGE_BYTES = 10 * 1024 * 1024;

  var state = {
    apiKey: null,
    originalImageDataUrl: null,
    originalImageMime: null,
    originalDescription: "",
    descriptionLocked: false,
    versions: [],
    selectedIndex: -1,
    acceptedVersionId: null,
    report: null,
    uiPhase: "needsKey",
    isLoading: false,
    errorMessage: null,
    statusMessage: null,
    pendingPreviewDataUrl: null,
    pendingMockupDataUrl: null,
  };

  function createInitialState() {
    return {
      apiKey: null,
      originalImageDataUrl: null,
      originalImageMime: null,
      originalDescription: "",
      descriptionLocked: false,
      versions: [],
      selectedIndex: -1,
      acceptedVersionId: null,
      report: null,
      uiPhase: "needsKey",
      isLoading: false,
      errorMessage: null,
      statusMessage: null,
      pendingPreviewDataUrl: null,
      pendingMockupDataUrl: null,
    };
  }

  function getState() {
    return state;
  }

  function loadApiKeyFromSession() {
    try {
      var stored = sessionStorage.getItem(KEY_STORAGE);
      if (stored) {
        state.apiKey = stored;
        if (state.uiPhase === "needsKey") {
          state.uiPhase = "input";
        }
      }
    } catch (err) {
      // sessionStorage unavailable — ignore
    }
    return state.apiKey;
  }

  function setApiKey(key) {
    var trimmed = (key || "").trim();
    if (!trimmed) {
      throw new Error("Please enter an OpenAI API key.");
    }
    state.apiKey = trimmed;
    try {
      sessionStorage.setItem(KEY_STORAGE, trimmed);
    } catch (err) {
      // continue with in-memory key
    }
    if (state.uiPhase === "needsKey") {
      state.uiPhase = "input";
    }
    state.errorMessage = null;
  }

  function clearApiKey() {
    state.apiKey = null;
    try {
      sessionStorage.removeItem(KEY_STORAGE);
    } catch (err) {
      // ignore
    }
    state.uiPhase = "needsKey";
  }

  function setError(message) {
    state.errorMessage = message || null;
  }

  function setStatus(message) {
    state.statusMessage = message || null;
  }

  function setLoading(isLoading) {
    state.isLoading = !!isLoading;
  }

  function setPendingPreview(dataUrl) {
    state.pendingPreviewDataUrl = dataUrl || null;
  }

  function setProjectInput(imageDataUrl, mimeType, description) {
    state.originalImageDataUrl = imageDataUrl;
    state.originalImageMime = mimeType || "image/png";
    state.originalDescription = (description || "").trim();
    state.pendingPreviewDataUrl = imageDataUrl;
  }

  function lockDescription() {
    state.descriptionLocked = true;
  }

  function unlockDescription() {
    state.descriptionLocked = false;
  }

  /**
   * If the first mockup never landed, reopen the input form so the user can
   * retry without starting a brand-new project.
   */
  function recoverFromFailedFirstGenerate() {
    if (state.versions.length > 0) return false;
    state.descriptionLocked = false;
    state.uiPhase = state.apiKey ? "input" : "needsKey";
    state.pendingMockupDataUrl = null;
    state.isLoading = false;
    state.statusMessage = null;
    if (state.originalImageDataUrl) {
      state.pendingPreviewDataUrl = state.originalImageDataUrl;
    }
    return true;
  }

  function beginGenerating(statusMessage) {
    state.isLoading = true;
    state.errorMessage = null;
    state.pendingMockupDataUrl = null;
    state.statusMessage =
      statusMessage ||
      "Generating mockup… this can take 1–2 minutes. Please keep this tab open.";
    if (state.originalImageDataUrl && state.originalDescription) {
      state.descriptionLocked = true;
      if (state.uiPhase === "input") {
        state.uiPhase = "iterating";
      }
    }
  }

  function setPendingMockup(dataUrl) {
    state.pendingMockupDataUrl = dataUrl || null;
  }

  function appendVersion(version) {
    var next = {
      id: version.id || "v" + (state.versions.length + 1),
      index: state.versions.length,
      imageDataUrl: version.imageDataUrl,
      description: version.description || "",
      feedbackFromParent: version.feedbackFromParent || null,
      parentId: version.parentId || null,
      createdAt: version.createdAt || Date.now(),
    };
    state.versions.push(next);
    state.selectedIndex = state.versions.length - 1;
    state.uiPhase = "iterating";
    state.descriptionLocked = true;
    state.pendingMockupDataUrl = null;
    return next;
  }

  function selectVersion(index) {
    if (index < 0 || index >= state.versions.length) return;
    state.selectedIndex = index;
  }

  function selectPrev() {
    if (state.selectedIndex > 0) {
      state.selectedIndex -= 1;
    }
  }

  function selectNext() {
    if (state.selectedIndex < state.versions.length - 1) {
      state.selectedIndex += 1;
    }
  }

  function getSelectedVersion() {
    if (state.selectedIndex < 0 || state.selectedIndex >= state.versions.length) {
      return null;
    }
    return state.versions[state.selectedIndex];
  }

  function acceptSelectedVersion() {
    var selected = getSelectedVersion();
    if (!selected) {
      throw new Error("No mockup selected to accept.");
    }
    state.acceptedVersionId = selected.id;
    state.uiPhase = "report";
    return selected;
  }

  function setReport(report) {
    state.report = report;
  }

  function resetProject() {
    var key = state.apiKey;
    var next = createInitialState();
    next.apiKey = key;
    next.uiPhase = key ? "input" : "needsKey";
    state = next;
  }

  global.PAState = {
    MAX_IMAGE_BYTES: MAX_IMAGE_BYTES,
    getState: getState,
    loadApiKeyFromSession: loadApiKeyFromSession,
    setApiKey: setApiKey,
    clearApiKey: clearApiKey,
    setError: setError,
    setStatus: setStatus,
    setLoading: setLoading,
    setPendingPreview: setPendingPreview,
    setProjectInput: setProjectInput,
    lockDescription: lockDescription,
    unlockDescription: unlockDescription,
    recoverFromFailedFirstGenerate: recoverFromFailedFirstGenerate,
    beginGenerating: beginGenerating,
    setPendingMockup: setPendingMockup,
    appendVersion: appendVersion,
    selectVersion: selectVersion,
    selectPrev: selectPrev,
    selectNext: selectNext,
    getSelectedVersion: getSelectedVersion,
    acceptSelectedVersion: acceptSelectedVersion,
    setReport: setReport,
    resetProject: resetProject,
  };
})(window);
