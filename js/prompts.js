(function (global) {
  "use strict";

  var OUTDOOR_SYSTEM =
    "You are Project Assistant, a practical helper for outdoor and yard construction projects " +
    "(driveways, concrete pads, decks, fencing, landscaping, grading, outdoor structures). " +
    "Stay focused on outdoor/yard work. Be concrete, specific, and contractor-readable. " +
    "Never invent indoor redesigns. When uncertain, note assumptions clearly.";

  function buildEditPrompt(originalDescription, selectedVersion, feedback) {
    var parts = [];

    parts.push(
      "Create a photorealistic outdoor/yard project mockup based on the provided site photo(s)."
    );
    parts.push(
      "CRITICAL: Preserve the original camera angle, perspective, house edges, trees, fencing, " +
        "driveway layout, and overall site geometry from the ORIGINAL site photo. " +
        "Do not replace the scene with a different property. Apply only the requested outdoor project changes."
    );
    parts.push("Original project description:\n" + originalDescription);

    if (selectedVersion) {
      parts.push(
        "A previous mockup image is also provided as reference for the current preferred direction. " +
          "That mockup currently shows:\n" +
          selectedVersion.description
      );
      parts.push("User feedback for this new iteration:\n" + (feedback || "").trim());
      parts.push(
        "Apply the feedback while keeping the real site from the original photo as the base. " +
          "Refine realistically; do not invent unrelated redesigns."
      );
    } else {
      parts.push(
        "Generate the first finished-looking mockup that fulfills the project description on this exact site."
      );
    }

    parts.push(
      "Style: realistic photo edit suitable for a contractor proposal. Natural daylight. Outdoor setting only."
    );

    return parts.join("\n\n");
  }

  function buildCaptionMessages(originalDescription, feedback, isFirst) {
    var userParts = [
      "Write a short contractor-readable description (2–4 sentences) of what the generated outdoor mockup shows.",
      "Call out materials, approximate placement/size if evident, and surrounding site context.",
      "Do not mention AI. Do not invent indoor details.",
      "",
      "Original project description:",
      originalDescription,
    ];

    if (!isFirst && feedback) {
      userParts.push("", "Feedback that led to this iteration:", feedback);
    }

    return [
      { role: "system", content: OUTDOOR_SYSTEM },
      { role: "user", content: userParts.join("\n") },
    ];
  }

  function buildReportMessages(originalDescription, mockupDescription) {
    var schemaHint =
      "Return ONLY valid JSON (no markdown) matching this schema:\n" +
      "{\n" +
      '  "summary": "string",\n' +
      '  "materials": [{ "item": "string", "quantity": "string", "notes": "string" }],\n' +
      '  "tools": [{ "item": "string", "notes": "string" }],\n' +
      '  "tips": ["string"],\n' +
      '  "warnings": ["string"],\n' +
      '  "timeEstimate": { "range": "string", "notes": "string" },\n' +
      '  "costEstimate": { "rangeUSD": "string", "notes": "string" }\n' +
      "}";

    var user =
      "Create a practical outdoor/yard project report for a contractor or homeowner.\n\n" +
      "Priorities:\n" +
      "1) Materials list with rough quantities (help avoid extra store trips)\n" +
      "2) Tools required\n" +
      "3) Tips and site-specific warnings (roots, drainage, grade, frost line, curing, access, permits caveats)\n" +
      "4) Rough time and cost ranges for US Midwest / Ohio ballpark pricing — clearly approximate\n\n" +
      "Original project description:\n" +
      originalDescription +
      "\n\nAccepted mockup description:\n" +
      mockupDescription +
      "\n\n" +
      schemaHint;

    return [
      { role: "system", content: OUTDOOR_SYSTEM },
      { role: "user", content: user },
    ];
  }

  global.PAPrompts = {
    OUTDOOR_SYSTEM: OUTDOOR_SYSTEM,
    buildEditPrompt: buildEditPrompt,
    buildCaptionMessages: buildCaptionMessages,
    buildReportMessages: buildReportMessages,
  };
})(window);
