(function (global) {
  "use strict";

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderMaterialsTable(materials) {
    if (!materials.length) {
      return "<p>No materials listed.</p>";
    }
    var rows = materials
      .map(function (m) {
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(m.item || "") +
          "</td>" +
          "<td>" +
          escapeHtml(m.quantity || "") +
          "</td>" +
          "<td>" +
          escapeHtml(m.notes || "") +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    return (
      '<table class="report-table">' +
      "<thead><tr><th>Item</th><th>Quantity</th><th>Notes</th></tr></thead>" +
      "<tbody>" +
      rows +
      "</tbody></table>"
    );
  }

  function renderToolsTable(tools) {
    if (!tools.length) {
      return "<p>No tools listed.</p>";
    }
    var rows = tools
      .map(function (t) {
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(t.item || "") +
          "</td>" +
          "<td>" +
          escapeHtml(t.notes || "") +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    return (
      '<table class="report-table">' +
      "<thead><tr><th>Tool</th><th>Notes</th></tr></thead>" +
      "<tbody>" +
      rows +
      "</tbody></table>"
    );
  }

  function renderList(items, className) {
    if (!items || !items.length) {
      return "<p>None listed.</p>";
    }
    var lis = items
      .map(function (item) {
        return "<li>" + escapeHtml(item) + "</li>";
      })
      .join("");
    return '<ul class="' + (className || "") + '">' + lis + "</ul>";
  }

  function renderReportHtml(report) {
    var time = report.timeEstimate || {};
    var cost = report.costEstimate || {};

    return (
      '<div class="report">' +
      '<p class="report__disclaimer">' +
      "AI visualization and estimates are approximate and intended for planning only. " +
      "This is not engineering, building-code, or permit advice. Verify materials, quantities, " +
      "and costs locally (US Midwest / Ohio ballpark pricing)." +
      "</p>" +
      "<div>" +
      "<h3>Summary</h3>" +
      '<p class="report__summary">' +
      escapeHtml(report.summary || "") +
      "</p>" +
      "</div>" +
      "<div>" +
      "<h3>Materials</h3>" +
      renderMaterialsTable(report.materials || []) +
      "</div>" +
      "<div>" +
      "<h3>Tools</h3>" +
      renderToolsTable(report.tools || []) +
      "</div>" +
      "<div>" +
      "<h3>Tips</h3>" +
      renderList(report.tips || []) +
      "</div>" +
      "<div>" +
      "<h3>Warnings &amp; site cautions</h3>" +
      renderList(report.warnings || [], "report__warnings") +
      "</div>" +
      '<div class="report__grid">' +
      '<div class="report__card">' +
      "<h3>Time estimate</h3>" +
      "<strong>" +
      escapeHtml(time.range || "N/A") +
      "</strong>" +
      "<p>" +
      escapeHtml(time.notes || "") +
      "</p>" +
      "</div>" +
      '<div class="report__card">' +
      "<h3>Cost estimate (USD)</h3>" +
      "<strong>" +
      escapeHtml(cost.rangeUSD || "N/A") +
      "</strong>" +
      "<p>" +
      escapeHtml(cost.notes || "") +
      "</p>" +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function getJsPdfConstructor() {
    if (global.jspdf && global.jspdf.jsPDF) return global.jspdf.jsPDF;
    if (typeof global.jsPDF === "function") return global.jsPDF;
    return null;
  }

  function loadImage(dataUrl) {
    return new Promise(function (resolve, reject) {
      if (!dataUrl) {
        resolve(null);
        return;
      }
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error("Could not load mockup image for PDF."));
      };
      img.src = dataUrl;
    });
  }

  function shrinkImageForPdf(dataUrl, maxWidth) {
    maxWidth = maxWidth || 700;
    if (!dataUrl) return Promise.resolve("");

    return loadImage(dataUrl).then(function (img) {
      if (!img) return "";
      var scale = Math.min(1, maxWidth / (img.naturalWidth || img.width || maxWidth));
      var w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
      var h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
      var canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return {
        dataUrl: canvas.toDataURL("image/jpeg", 0.84),
        width: w,
        height: h,
      };
    });
  }

  function ensurePageSpace(doc, y, needed, margin, pageHeight) {
    if (y + needed <= pageHeight - margin) return y;
    doc.addPage();
    return margin;
  }

  function writeWrappedText(doc, text, x, y, maxWidth, lineHeight) {
    var lines = doc.splitTextToSize(String(text || ""), maxWidth);
    doc.text(lines, x, y);
    return y + lines.length * lineHeight;
  }

  function downloadPdf(options) {
    var JsPDF = getJsPdfConstructor();
    if (!JsPDF) {
      return Promise.reject(
        new Error("PDF library failed to load. Check your network connection and refresh the page.")
      );
    }

    var report = options.report || {};
    var margin = 48;
    var pageWidth = 612; // letter pt
    var pageHeight = 792;
    var contentWidth = pageWidth - margin * 2;
    var lineHeight = 14;

    return shrinkImageForPdf(options.mockupImageDataUrl, 520)
      .catch(function () {
        return null;
      })
      .then(function (imageInfo) {
        var doc = new JsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
        var y = margin;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(20);
        doc.text("Project Assistant", margin, y);
        y += 22;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(80);
        y = writeWrappedText(
          doc,
          "Outdoor / yard project report",
          margin,
          y,
          contentWidth,
          lineHeight
        );
        y += 10;
        doc.setTextColor(0);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        y = ensurePageSpace(doc, y, 24, margin, pageHeight);
        doc.text("Accepted mockup", margin, y);
        y += 16;

        if (imageInfo && imageInfo.dataUrl) {
          var drawW = Math.min(contentWidth, imageInfo.width);
          var drawH = (imageInfo.height / imageInfo.width) * drawW;
          // Cap height so one image doesn't blow past the page awkwardly
          if (drawH > 280) {
            drawH = 280;
            drawW = (imageInfo.width / imageInfo.height) * drawH;
          }
          y = ensurePageSpace(doc, y, drawH + 12, margin, pageHeight);
          doc.addImage(imageInfo.dataUrl, "JPEG", margin, y, drawW, drawH);
          y += drawH + 12;
        }

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        y = ensurePageSpace(doc, y, 40, margin, pageHeight);
        y = writeWrappedText(
          doc,
          options.mockupDescription || "",
          margin,
          y,
          contentWidth,
          lineHeight
        );
        y += 14;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        y = ensurePageSpace(doc, y, 24, margin, pageHeight);
        doc.text("Original project description", margin, y);
        y += 16;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        y = writeWrappedText(
          doc,
          options.originalDescription || "",
          margin,
          y,
          contentWidth,
          lineHeight
        );
        y += 14;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        y = ensurePageSpace(doc, y, 24, margin, pageHeight);
        doc.text("Summary", margin, y);
        y += 16;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        y = writeWrappedText(doc, report.summary || "", margin, y, contentWidth, lineHeight);
        y += 14;

        function writeSectionTitle(title) {
          y = ensurePageSpace(doc, y, 28, margin, pageHeight);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(13);
          doc.text(title, margin, y);
          y += 16;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
        }

        writeSectionTitle("Materials");
        var materials = Array.isArray(report.materials) ? report.materials : [];
        if (!materials.length) {
          y = writeWrappedText(doc, "None listed.", margin, y, contentWidth, lineHeight);
        } else {
          materials.forEach(function (m, idx) {
            var line =
              idx +
              1 +
              ". " +
              (m.item || "Item") +
              (m.quantity ? " - " + m.quantity : "") +
              (m.notes ? " (" + m.notes + ")" : "");
            y = ensurePageSpace(doc, y, 20, margin, pageHeight);
            y = writeWrappedText(doc, line, margin, y, contentWidth, lineHeight);
            y += 4;
          });
        }
        y += 10;

        writeSectionTitle("Tools");
        var tools = Array.isArray(report.tools) ? report.tools : [];
        if (!tools.length) {
          y = writeWrappedText(doc, "None listed.", margin, y, contentWidth, lineHeight);
        } else {
          tools.forEach(function (t, idx) {
            var line =
              idx +
              1 +
              ". " +
              (t.item || "Tool") +
              (t.notes ? " - " + t.notes : "");
            y = ensurePageSpace(doc, y, 20, margin, pageHeight);
            y = writeWrappedText(doc, line, margin, y, contentWidth, lineHeight);
            y += 4;
          });
        }
        y += 10;

        writeSectionTitle("Tips");
        var tips = Array.isArray(report.tips) ? report.tips : [];
        if (!tips.length) {
          y = writeWrappedText(doc, "None listed.", margin, y, contentWidth, lineHeight);
        } else {
          tips.forEach(function (tip) {
            y = ensurePageSpace(doc, y, 20, margin, pageHeight);
            y = writeWrappedText(doc, "- " + tip, margin, y, contentWidth, lineHeight);
            y += 4;
          });
        }
        y += 10;

        writeSectionTitle("Warnings & site cautions");
        var warnings = Array.isArray(report.warnings) ? report.warnings : [];
        if (!warnings.length) {
          y = writeWrappedText(doc, "None listed.", margin, y, contentWidth, lineHeight);
        } else {
          warnings.forEach(function (warning) {
            y = ensurePageSpace(doc, y, 20, margin, pageHeight);
            y = writeWrappedText(doc, "- " + warning, margin, y, contentWidth, lineHeight);
            y += 4;
          });
        }
        y += 12;

        var time = report.timeEstimate || {};
        var cost = report.costEstimate || {};
        writeSectionTitle("Estimates");
        y = writeWrappedText(
          doc,
          "Time: " + (time.range || "N/A") + (time.notes ? " - " + time.notes : ""),
          margin,
          y,
          contentWidth,
          lineHeight
        );
        y += 4;
        y = writeWrappedText(
          doc,
          "Cost (USD): " +
            (cost.rangeUSD || "N/A") +
            (cost.notes ? " - " + cost.notes : ""),
          margin,
          y,
          contentWidth,
          lineHeight
        );
        y += 16;

        doc.setFontSize(9);
        doc.setTextColor(90);
        y = ensurePageSpace(doc, y, 40, margin, pageHeight);
        y = writeWrappedText(
          doc,
          "Disclaimer: AI visualization and estimates are approximate and intended for planning only. Not engineering, building-code, or permit advice. Verify materials, quantities, and costs locally (US Midwest / Ohio ballpark pricing).",
          margin,
          y,
          contentWidth,
          12
        );

        var byteLength = doc.output("arraybuffer").byteLength;
        if (!byteLength || byteLength < 500) {
          throw new Error("PDF generation produced an empty file.");
        }
        doc.save("project-assistant-report.pdf");
        return { byteLength: byteLength, filename: "project-assistant-report.pdf" };
      });
  }

  global.PAReport = {
    renderReportHtml: renderReportHtml,
    downloadPdf: downloadPdf,
    escapeHtml: escapeHtml,
  };
})(window);
