(function (global) {
  "use strict";

  var IMAGE_EDIT_URL = "https://api.openai.com/v1/images/edits";
  var CHAT_URL = "https://api.openai.com/v1/chat/completions";
  var IMAGE_MODEL = "gpt-image-1";
  var CHAT_MODEL = "gpt-4o-mini";
  var MAX_EDGE = 1280;
  var REQUEST_TIMEOUT_MS = 180000;

  function parseOpenAIError(response, bodyText) {
    var message = "Request failed (" + response.status + ").";
    try {
      var data = JSON.parse(bodyText);
      if (data && data.error && data.error.message) {
        message = data.error.message;
      }
    } catch (err) {
      if (bodyText) message = bodyText.slice(0, 240);
    }

    if (response.status === 401) {
      return "Invalid OpenAI API key. Please change your key and try again.";
    }
    if (response.status === 429) {
      return "Rate limit or quota exceeded. Wait a moment and try again.";
    }
    return message;
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    timeoutMs = timeoutMs || REQUEST_TIMEOUT_MS;
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = null;
    var opts = options || {};

    if (controller) {
      opts.signal = controller.signal;
      timer = setTimeout(function () {
        controller.abort();
      }, timeoutMs);
    }

    return fetch(url, opts)
      .then(function (response) {
        if (timer) clearTimeout(timer);
        return response;
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        if (err && err.name === "AbortError") {
          throw new Error(
            "The request timed out after " +
              Math.round(timeoutMs / 1000) +
              " seconds. Image generation can be slow — please try again."
          );
        }
        throw err;
      });
  }

  function dataUrlToBlob(dataUrl) {
    var parts = dataUrl.split(",");
    var meta = parts[0] || "";
    var base64 = parts[1] || "";
    var mimeMatch = meta.match(/data:([^;]+);/);
    var mime = (mimeMatch && mimeMatch[1]) || "image/png";
    var binary = atob(base64);
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  function loadImage(dataUrl) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error("Could not load image for processing."));
      };
      img.src = dataUrl;
    });
  }

  /** Yield so the browser can paint loading UI before heavy work. */
  function yieldToUI() {
    return new Promise(function (resolve) {
      setTimeout(resolve, 50);
    });
  }

  function resizeImageDataUrl(dataUrl, maxEdge) {
    maxEdge = maxEdge || MAX_EDGE;
    return yieldToUI()
      .then(function () {
        return loadImage(dataUrl);
      })
      .then(function (img) {
        return yieldToUI().then(function () {
          var width = img.naturalWidth || img.width;
          var height = img.naturalHeight || img.height;
          var scale = Math.min(1, maxEdge / Math.max(width, height));
          var targetW = Math.max(1, Math.round(width * scale));
          var targetH = Math.max(1, Math.round(height * scale));

          var canvas = document.createElement("canvas");
          canvas.width = targetW;
          canvas.height = targetH;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, targetW, targetH);

          // JPEG is much faster/smaller than PNG for photo uploads
          return canvas.toDataURL("image/jpeg", 0.85);
        });
      });
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(new Error("Could not read the selected image file."));
      };
      reader.readAsDataURL(file);
    });
  }

  function validateImageFile(file) {
    if (!file) {
      throw new Error("Please choose a site photo.");
    }
    var allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.indexOf(file.type) === -1) {
      throw new Error("Please upload a JPG, PNG, or WebP image.");
    }
    if (file.size > global.PAState.MAX_IMAGE_BYTES) {
      throw new Error("Image must be 10MB or smaller.");
    }
  }

  function editImage(options) {
    var apiKey = options.apiKey;
    var prompt = options.prompt;
    var imageDataUrls = options.imageDataUrls || [];
    var onProgress = options.onProgress;

    if (!apiKey) return Promise.reject(new Error("Missing API key."));
    if (!prompt) return Promise.reject(new Error("Missing image prompt."));
    if (!imageDataUrls.length) {
      return Promise.reject(new Error("Missing image(s) for editing."));
    }

    function notify(msg) {
      if (typeof onProgress === "function") onProgress(msg);
    }

    notify("Preparing your photo…");

    var resizeJobs = imageDataUrls.map(function (url) {
      return resizeImageDataUrl(url, MAX_EDGE);
    });

    function postEdit(resizedUrls, size) {
      var form = new FormData();
      form.append("model", IMAGE_MODEL);
      form.append("prompt", prompt);
      form.append("size", size);
      form.append("quality", "medium");
      form.append("input_fidelity", "high");

      // Single image: "image". Multiple images: "image[]" (OpenAI array syntax)
      var fieldName = resizedUrls.length > 1 ? "image[]" : "image";
      resizedUrls.forEach(function (url, index) {
        var blob = dataUrlToBlob(url);
        var filename = index === 0 ? "original.jpg" : "reference-" + index + ".jpg";
        form.append(fieldName, blob, filename);
      });

      notify(
        "Sending to OpenAI… mockup generation often takes 1–2 minutes. Please keep this tab open."
      );

      return fetchWithTimeout(
        IMAGE_EDIT_URL,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + apiKey,
          },
          body: form,
        },
        REQUEST_TIMEOUT_MS
      ).then(function (response) {
        return response.text().then(function (text) {
          if (!response.ok) {
            var err = new Error(parseOpenAIError(response, text));
            err.status = response.status;
            err.bodyText = text;
            throw err;
          }
          var data;
          try {
            data = JSON.parse(text);
          } catch (parseErr) {
            throw new Error("Unexpected response from image API.");
          }
          var b64 =
            data &&
            data.data &&
            data.data[0] &&
            (data.data[0].b64_json || data.data[0].b64);
          if (!b64) {
            throw new Error("Image API returned no image data.");
          }
          return "data:image/png;base64," + b64;
        });
      });
    }

    return Promise.all(resizeJobs).then(function (resizedUrls) {
      notify("Photo ready. Generating mockup with OpenAI…");
      return postEdit(resizedUrls, "1536x1024").catch(function (err) {
        var msg = (err && err.message) || "";
        // Only retry when the API specifically rejects the size parameter
        if (
          /invalid.*\bsize\b|\bsize\b.*invalid|unsupported.*\bsize\b|must be one of.*1024/i.test(
            msg
          )
        ) {
          notify("Retrying with a different image size…");
          return postEdit(resizedUrls, "1024x1024");
        }
        throw err;
      });
    });
  }

  function chatCompletion(apiKey, messages, options) {
    options = options || {};
    var body = {
      model: CHAT_MODEL,
      messages: messages,
      temperature: options.temperature != null ? options.temperature : 0.4,
    };
    if (options.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    return fetchWithTimeout(
      CHAT_URL,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      45000
    ).then(function (response) {
      return response.text().then(function (text) {
        if (!response.ok) {
          throw new Error(parseOpenAIError(response, text));
        }
        var data;
        try {
          data = JSON.parse(text);
        } catch (err) {
          throw new Error("Unexpected response from chat API.");
        }
        var content =
          data &&
          data.choices &&
          data.choices[0] &&
          data.choices[0].message &&
          data.choices[0].message.content;
        if (!content) {
          throw new Error("Chat API returned an empty response.");
        }
        return content;
      });
    });
  }

  function generateCaption(apiKey, originalDescription, feedback, isFirst) {
    var messages = global.PAPrompts.buildCaptionMessages(
      originalDescription,
      feedback,
      isFirst
    );
    return chatCompletion(apiKey, messages, { temperature: 0.3 });
  }

  function generateReport(apiKey, originalDescription, mockupDescription) {
    var messages = global.PAPrompts.buildReportMessages(
      originalDescription,
      mockupDescription
    );
    return chatCompletion(apiKey, messages, {
      temperature: 0.35,
      jsonMode: true,
    }).then(function (content) {
      var parsed;
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        throw new Error("Could not parse the project report. Please try accepting again.");
      }
      return normalizeReport(parsed);
    });
  }

  function normalizeReport(raw) {
    raw = raw || {};
    return {
      summary: raw.summary || "No summary provided.",
      materials: Array.isArray(raw.materials) ? raw.materials : [],
      tools: Array.isArray(raw.tools) ? raw.tools : [],
      tips: Array.isArray(raw.tips) ? raw.tips : [],
      warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
      timeEstimate: raw.timeEstimate || { range: "N/A", notes: "" },
      costEstimate: raw.costEstimate || { rangeUSD: "N/A", notes: "" },
    };
  }

  global.PAApi = {
    validateImageFile: validateImageFile,
    readFileAsDataUrl: readFileAsDataUrl,
    resizeImageDataUrl: resizeImageDataUrl,
    editImage: editImage,
    generateCaption: generateCaption,
    generateReport: generateReport,
  };
})(window);
