(function (global) {
  "use strict";

  var handlers = {};

  function $(id) {
    return document.getElementById(id);
  }

  function setHidden(el, hidden) {
    if (!el) return;
    el.hidden = !!hidden;
  }

  function bindHandlers(h) {
    handlers = h || {};
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Keep status/error banners directly above the active section. */
  function relocateBanners(state) {
    var errorEl = $("error-banner");
    var statusEl = $("status-banner");
    if (!errorEl || !statusEl) return;

    var anchor = null;
    if (state.uiPhase === "report") {
      anchor = $("section-report");
    } else if (
      state.versions.length > 0 ||
      (state.isLoading && state.descriptionLocked)
    ) {
      anchor = $("section-mockup");
    } else if (state.apiKey && state.uiPhase !== "needsKey") {
      anchor = $("section-input");
    } else {
      anchor = $("section-key");
    }

    if (!anchor || !anchor.parentNode) return;
    anchor.parentNode.insertBefore(errorEl, anchor);
    anchor.parentNode.insertBefore(statusEl, anchor);
  }

  function renderBanners(state) {
    var errorEl = $("error-banner");
    var statusEl = $("status-banner");

    relocateBanners(state);

    if (state.errorMessage) {
      errorEl.textContent = state.errorMessage;
      setHidden(errorEl, false);
    } else {
      errorEl.textContent = "";
      setHidden(errorEl, true);
    }

    // Green status bar is redundant when Mockup/Report already show the same loading text.
    var mockupGenerating =
      state.isLoading &&
      state.uiPhase !== "report" &&
      (state.versions.length > 0 || state.descriptionLocked);
    var reportLoading = state.uiPhase === "report" && state.isLoading;

    if (state.statusMessage && !mockupGenerating && !reportLoading) {
      statusEl.innerHTML =
        (state.isLoading
          ? '<span class="spinner spinner--inline" aria-hidden="true"></span> '
          : "") + escapeHtml(state.statusMessage);
      setHidden(statusEl, false);
    } else {
      statusEl.textContent = "";
      setHidden(statusEl, true);
    }
  }

  function renderHeader(state) {
    var hasKey = !!state.apiKey;
    setHidden($("btn-change-key"), !hasKey);
    setHidden($("btn-new-project"), !hasKey);
  }

  function renderKeySection(state) {
    var showKey = state.uiPhase === "needsKey" || !state.apiKey;
    setHidden($("section-key"), !showKey);
  }

  function renderInputSection(state) {
    var showInput =
      !!state.apiKey &&
      !state.descriptionLocked &&
      state.uiPhase !== "needsKey" &&
      state.uiPhase !== "report";
    setHidden($("section-input"), !showInput);

    var previewWrap = $("image-preview-wrap");
    var previewImg = $("image-preview");
    if (state.pendingPreviewDataUrl) {
      previewImg.src = state.pendingPreviewDataUrl;
      setHidden(previewWrap, false);
    } else {
      previewImg.removeAttribute("src");
      setHidden(previewWrap, true);
    }

    // Keep typed description after a failed first generate
    var descInput = $("input-description");
    if (
      showInput &&
      state.originalDescription &&
      !descInput.value.trim()
    ) {
      descInput.value = state.originalDescription;
    }

    var firstBtn = $("btn-generate-first");
    firstBtn.disabled = state.isLoading;
    firstBtn.textContent = state.isLoading
      ? "Generating…"
      : "Generate first mockup";
    firstBtn.classList.toggle("is-busy", state.isLoading);
    descInput.disabled = state.isLoading || state.descriptionLocked;
    $("input-image").disabled = state.isLoading || state.descriptionLocked;
  }

  function renderOriginalSection(state) {
    var show =
      !!state.apiKey &&
      state.descriptionLocked &&
      !!state.originalImageDataUrl;
    setHidden($("section-original"), !show);
    if (!show) return;

    $("original-image").src = state.originalImageDataUrl;
    $("original-description").textContent = state.originalDescription;
  }

  function renderMockupSection(state) {
    var generatingMockup =
      state.isLoading && state.uiPhase !== "report";
    var show =
      !!state.apiKey &&
      (state.versions.length > 0 ||
        (generatingMockup && state.descriptionLocked));
    setHidden($("section-mockup"), !show);
    if (!show) return;

    var selected = global.PAState.getSelectedVersion();
    var total = state.versions.length;
    var hasVersions = total > 0;
    var current = hasVersions ? state.selectedIndex + 1 : 0;

    $("version-label").textContent = hasVersions
      ? "Version " + current + " of " + total
      : "Generating…";
    $("btn-prev-version").disabled =
      generatingMockup || !hasVersions || state.selectedIndex <= 0;
    $("btn-next-version").disabled =
      generatingMockup || !hasVersions || state.selectedIndex >= total - 1;

    var mockupImg = $("mockup-image");
    var placeholder = $("mockup-placeholder");
    var loadingOverlay = $("mockup-loading");
    var pendingImage = state.pendingMockupDataUrl;
    // Prefer the newly arrived image while caption finishes
    var imageToShow =
      pendingImage || (selected ? selected.imageDataUrl : null);

    if (imageToShow) {
      mockupImg.src = imageToShow;
      mockupImg.alt = "Generated project mockup";
      setHidden(mockupImg, false);
      setHidden(placeholder, true);
    } else {
      mockupImg.removeAttribute("src");
      mockupImg.alt = "";
      setHidden(mockupImg, true);
      setHidden(placeholder, true);
    }

    if (selected && !pendingImage) {
      $("mockup-description").textContent = selected.description;
    } else if (pendingImage && generatingMockup) {
      $("mockup-description").textContent = "Writing mockup description…";
    } else if (generatingMockup) {
      $("mockup-description").textContent = "Working on your mockup…";
    } else if (selected) {
      $("mockup-description").textContent = selected.description;
    } else {
      $("mockup-description").textContent = "";
    }

    // Overlay for the whole image API wait (first + next). Hide once the
    // new image is in hand and only the caption remains.
    var showOverlay = generatingMockup && !pendingImage;
    setHidden(loadingOverlay, !showOverlay);
    loadingOverlay.classList.toggle("loading-overlay--dim", showOverlay && !!imageToShow);
    var loadingText = $("mockup-loading-text");
    if (loadingText) {
      loadingText.textContent =
        state.statusMessage ||
        "Generating mockup… this can take 1–2 minutes. Please keep this tab open.";
    }

    var feedbackArea = $("feedback-area");
    setHidden(feedbackArea, !hasVersions);

    var feedback = $("input-feedback");
    feedback.disabled =
      generatingMockup || state.uiPhase === "report" || !hasVersions;
    var nextBtn = $("btn-generate-next");
    nextBtn.disabled =
      generatingMockup || state.uiPhase === "report" || !hasVersions;
    nextBtn.textContent =
      generatingMockup && hasVersions
        ? "Generating…"
        : "Generate next mockup";
    $("btn-accept").disabled =
      generatingMockup || state.uiPhase === "report" || !hasVersions;
  }

  function renderReportSection(state) {
    var show = !!state.apiKey && state.uiPhase === "report";
    setHidden($("section-report"), !show);
    if (!show) return;

    var loading = state.isLoading && !state.report;
    setHidden($("report-loading"), !loading);

    var content = $("report-content");
    if (state.report) {
      content.innerHTML = global.PAReport.renderReportHtml(state.report);
    } else if (!loading) {
      content.innerHTML = "";
    }

    $("btn-download-pdf").disabled = state.isLoading || !state.report;
  }

  function render() {
    var state = global.PAState.getState();
    renderBanners(state);
    renderHeader(state);
    renderKeySection(state);
    renderInputSection(state);
    renderOriginalSection(state);
    renderMockupSection(state);
    renderReportSection(state);
  }

  function wireEvents() {
    $("form-key").addEventListener("submit", function (e) {
      e.preventDefault();
      if (handlers.onSubmitKey) handlers.onSubmitKey($("input-api-key").value);
    });

    $("btn-change-key").addEventListener("click", function () {
      if (handlers.onChangeKey) handlers.onChangeKey();
    });

    $("btn-new-project").addEventListener("click", function () {
      if (handlers.onNewProject) handlers.onNewProject();
    });

    $("input-image").addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      if (handlers.onImageSelected) handlers.onImageSelected(file);
    });

    $("form-project").addEventListener("submit", function (e) {
      e.preventDefault();
      if (handlers.onGenerateFirst) {
        handlers.onGenerateFirst({
          file: $("input-image").files && $("input-image").files[0],
          description: $("input-description").value,
        });
      }
    });

    $("btn-prev-version").addEventListener("click", function () {
      if (handlers.onPrevVersion) handlers.onPrevVersion();
    });

    $("btn-next-version").addEventListener("click", function () {
      if (handlers.onNextVersion) handlers.onNextVersion();
    });

    $("btn-generate-next").addEventListener("click", function () {
      if (handlers.onGenerateNext) {
        handlers.onGenerateNext($("input-feedback").value);
      }
    });

    $("btn-accept").addEventListener("click", function () {
      if (handlers.onAccept) handlers.onAccept();
    });

    $("btn-download-pdf").addEventListener("click", function () {
      if (handlers.onDownloadPdf) handlers.onDownloadPdf();
    });
  }

  function clearFeedback() {
    $("input-feedback").value = "";
  }

  function focusKeyInput() {
    var el = $("input-api-key");
    if (el) {
      el.value = "";
      el.focus();
    }
  }

  function resetInputForm() {
    $("form-project").reset();
    $("image-preview").removeAttribute("src");
    setHidden($("image-preview-wrap"), true);
    clearFeedback();
  }

  global.PAUI = {
    bindHandlers: bindHandlers,
    wireEvents: wireEvents,
    render: render,
    clearFeedback: clearFeedback,
    focusKeyInput: focusKeyInput,
    resetInputForm: resetInputForm,
  };
})(window);
