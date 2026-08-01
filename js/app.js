(function (global) {
  "use strict";

  var stateApi = global.PAState;
  var api = global.PAApi;
  var prompts = global.PAPrompts;
  var ui = global.PAUI;
  var reportApi = global.PAReport;

  function refresh() {
    ui.render();
  }

  function showStatusNow(message) {
    stateApi.setStatus(message);
    refresh();
    var banner = document.getElementById("status-banner");
    if (banner && !banner.hidden) {
      banner.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function withErrorHandling(promise) {
    return promise.catch(function (err) {
      var s = stateApi.getState();
      var message = err && err.message ? err.message : "Something went wrong.";

      stateApi.setLoading(false);
      stateApi.setStatus(null);
      stateApi.setPendingMockup(null);

      // First generate failed before any version — reopen input so they can retry
      if (s.versions.length === 0 && s.descriptionLocked) {
        stateApi.recoverFromFailedFirstGenerate();
        message =
          message +
          " You can adjust the photo/description and try Generate again.";
      }

      stateApi.setError(message);
      refresh();
    });
  }

  function onSubmitKey(key) {
    try {
      stateApi.setApiKey(key);
      stateApi.setError(null);
      stateApi.setStatus(null);
      refresh();
    } catch (err) {
      stateApi.setError(err.message);
      refresh();
    }
  }

  function onChangeKey() {
    stateApi.clearApiKey();
    stateApi.setError(null);
    stateApi.setStatus(null);
    ui.focusKeyInput();
    refresh();
  }

  function onNewProject() {
    var confirmed = window.confirm(
      "Start a new project? Current mockups and report will be cleared. Your API key stays for this session."
    );
    if (!confirmed) return;
    stateApi.resetProject();
    stateApi.setError(null);
    stateApi.setStatus(null);
    ui.resetInputForm();
    refresh();
  }

  function onImageSelected(file) {
    stateApi.setError(null);
    if (!file) {
      stateApi.setPendingPreview(null);
      refresh();
      return;
    }
    try {
      api.validateImageFile(file);
    } catch (err) {
      stateApi.setPendingPreview(null);
      stateApi.setError(err.message);
      refresh();
      return;
    }

    withErrorHandling(
      api.readFileAsDataUrl(file).then(function (dataUrl) {
        stateApi.setPendingPreview(dataUrl);
        refresh();
      })
    );
  }

  function runGenerate(options) {
    var s = stateApi.getState();
    var isFirst = s.versions.length === 0;
    var selected = stateApi.getSelectedVersion();
    var feedback = (options.feedback || "").trim();

    stateApi.beginGenerating(
      isFirst
        ? "Preparing your first mockup… please keep this tab open."
        : "Preparing the next mockup from the selected version…"
    );
    refresh();

    var mockupSection = document.getElementById("section-mockup");
    if (mockupSection) {
      mockupSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // Let the browser paint loading UI before heavy resize / network work
    return new Promise(function (resolve) {
      setTimeout(resolve, 80);
    }).then(function () {
      s = stateApi.getState();
      var imageDataUrls = [s.originalImageDataUrl];
      selected = stateApi.getSelectedVersion();
      if (!isFirst && selected) {
        imageDataUrls.push(selected.imageDataUrl);
      }

      var editPrompt = prompts.buildEditPrompt(
        s.originalDescription,
        isFirst ? null : selected,
        feedback
      );

      return api
        .editImage({
          apiKey: s.apiKey,
          prompt: editPrompt,
          imageDataUrls: imageDataUrls,
          onProgress: function (msg) {
            showStatusNow(msg);
          },
        })
        .then(function (mockupDataUrl) {
          // Show the image immediately so it never looks like generation restarted
          stateApi.setPendingMockup(mockupDataUrl);
          showStatusNow("Mockup image ready. Writing a short description…");

          var fallbackCaption =
            "Outdoor project mockup based on your description: " +
            (s.originalDescription || "").trim();

          var captionPromise = api
            .generateCaption(s.apiKey, s.originalDescription, feedback, isFirst)
            .then(function (caption) {
              return (caption || "").trim() || fallbackCaption;
            })
            .catch(function () {
              return fallbackCaption;
            });

          // Don't leave users stuck if caption API is slow/fails
          var timedCaption = new Promise(function (resolve) {
            var settled = false;
            var timer = setTimeout(function () {
              if (!settled) {
                settled = true;
                resolve(fallbackCaption);
              }
            }, 20000);

            captionPromise.then(function (caption) {
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve(caption);
              }
            });
          });

          return timedCaption.then(function (caption) {
            return { mockupDataUrl: mockupDataUrl, caption: caption };
          });
        })
        .then(function (result) {
          stateApi.appendVersion({
            imageDataUrl: result.mockupDataUrl,
            description: (result.caption || "").trim(),
            feedbackFromParent: isFirst ? null : feedback,
            parentId: selected ? selected.id : null,
          });
          stateApi.setLoading(false);
          stateApi.setStatus(null);
          ui.clearFeedback();
          refresh();

          if (mockupSection) {
            mockupSection.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
    });
  }

  function onGenerateFirst(payload) {
    var file = payload.file;
    var description = (payload.description || "").trim();
    var s = stateApi.getState();

    stateApi.setError(null);

    if (!s.apiKey) {
      stateApi.setError("Please enter your OpenAI API key first.");
      refresh();
      return;
    }
    if (!description) {
      stateApi.setError("Please enter a project description.");
      refresh();
      return;
    }
    if (s.isLoading) return;

    // Immediate feedback before any async work
    stateApi.setLoading(true);
    stateApi.setStatus("Starting… preparing your photo and description.");
    refresh();

    var prepare;
    if (s.pendingPreviewDataUrl && file) {
      try {
        api.validateImageFile(file);
      } catch (err) {
        stateApi.setLoading(false);
        stateApi.setStatus(null);
        stateApi.setError(err.message);
        refresh();
        return;
      }
      prepare = Promise.resolve(s.pendingPreviewDataUrl).then(function (dataUrl) {
        stateApi.setProjectInput(dataUrl, file.type, description);
        stateApi.lockDescription();
      });
    } else if (s.pendingPreviewDataUrl) {
      stateApi.setProjectInput(
        s.pendingPreviewDataUrl,
        "image/png",
        description
      );
      stateApi.lockDescription();
      prepare = Promise.resolve();
    } else if (file) {
      try {
        api.validateImageFile(file);
      } catch (err) {
        stateApi.setLoading(false);
        stateApi.setStatus(null);
        stateApi.setError(err.message);
        refresh();
        return;
      }
      prepare = api.readFileAsDataUrl(file).then(function (dataUrl) {
        stateApi.setProjectInput(dataUrl, file.type, description);
        stateApi.lockDescription();
      });
    } else {
      stateApi.setLoading(false);
      stateApi.setStatus(null);
      stateApi.setError("Please upload a site photo.");
      refresh();
      return;
    }

    withErrorHandling(
      prepare.then(function () {
        return runGenerate({ feedback: "" });
      })
    );
  }

  function onGenerateNext(feedbackText) {
    var s = stateApi.getState();
    var feedback = (feedbackText || "").trim();

    stateApi.setError(null);

    if (s.versions.length >= 1 && !feedback) {
      stateApi.setError("Enter feedback describing what should change in the next mockup.");
      refresh();
      return;
    }
    if (s.isLoading) return;

    withErrorHandling(runGenerate({ feedback: feedback }));
  }

  function onPrevVersion() {
    stateApi.selectPrev();
    stateApi.setError(null);
    refresh();
  }

  function onNextVersion() {
    stateApi.selectNext();
    stateApi.setError(null);
    refresh();
  }

  function onAccept() {
    var s = stateApi.getState();
    if (s.isLoading) return;

    var selected;
    try {
      selected = stateApi.acceptSelectedVersion();
    } catch (err) {
      stateApi.setError(err.message);
      refresh();
      return;
    }

    stateApi.setError(null);
    stateApi.setLoading(true);
    stateApi.setStatus("Building project report…");
    stateApi.setReport(null);
    refresh();

    var reportSection = document.getElementById("section-report");
    if (reportSection) {
      reportSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    withErrorHandling(
      api
        .generateReport(
          s.apiKey,
          s.originalDescription,
          selected.description
        )
        .then(function (report) {
          stateApi.setReport(report);
          stateApi.setLoading(false);
          stateApi.setStatus(null);
          refresh();
        })
    );
  }

  function onDownloadPdf() {
    var s = stateApi.getState();
    var accepted = null;
    for (var i = 0; i < s.versions.length; i++) {
      if (s.versions[i].id === s.acceptedVersionId) {
        accepted = s.versions[i];
        break;
      }
    }
    if (!accepted) accepted = stateApi.getSelectedVersion();

    if (!s.report || !accepted) {
      stateApi.setError("Accept a mockup and wait for the report before downloading a PDF.");
      refresh();
      return;
    }

    stateApi.setError(null);
    stateApi.setStatus("Preparing PDF…");
    refresh();

    withErrorHandling(
      reportApi
        .downloadPdf({
          report: s.report,
          originalDescription: s.originalDescription,
          mockupDescription: accepted.description,
          mockupImageDataUrl: accepted.imageDataUrl,
        })
        .then(function () {
          stateApi.setStatus("PDF downloaded.");
          refresh();
          setTimeout(function () {
            stateApi.setStatus(null);
            refresh();
          }, 2500);
        })
    );
  }

  function init() {
    stateApi.loadApiKeyFromSession();
    ui.bindHandlers({
      onSubmitKey: onSubmitKey,
      onChangeKey: onChangeKey,
      onNewProject: onNewProject,
      onImageSelected: onImageSelected,
      onGenerateFirst: onGenerateFirst,
      onGenerateNext: onGenerateNext,
      onPrevVersion: onPrevVersion,
      onNextVersion: onNextVersion,
      onAccept: onAccept,
      onDownloadPdf: onDownloadPdf,
    });
    ui.wireEvents();
    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
