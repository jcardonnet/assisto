const RESULT_VALUES = new Set(["passed", "warning", "failed"]);

export function summarizeResults(items) {
  return {
    total: items.length,
    passed: items.filter((item) => item.result === "passed").length,
    warning: items.filter((item) => item.result === "warning").length,
    failed: items.filter((item) => item.result === "failed").length
  };
}

export function normalizeResult(value) {
  const result = normalizeId(value);
  return RESULT_VALUES.has(result) ? result : "warning";
}

export function normalizeDuration(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function normalizeId(value) {
  let output = "";
  let pendingSeparator = false;

  for (const char of String(value ?? "unknown").trim().toLowerCase()) {
    if (isAsciiAlphaNumeric(char) || char === "-") {
      if (pendingSeparator && output) {
        output += "_";
      }
      output += char;
      pendingSeparator = false;
      continue;
    }

    if (char === "_") {
      pendingSeparator = output.length > 0;
      continue;
    }

    pendingSeparator = output.length > 0;
  }

  return output || "unknown";
}

function isAsciiAlphaNumeric(char) {
  return (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
}
