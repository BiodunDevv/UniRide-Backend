const axios = require("axios");

const TRANSLATOR_KEY = process.env.TRANSLATOR_API_KEY;
const TRANSLATOR_ENDPOINT =
  process.env.TRANSLATOR_ENDPOINT ||
  "https://api.cognitive.microsofttranslator.com";
const TRANSLATOR_REGION = process.env.TRANSLATOR_REGION || "southafricanorth";

/**
 * Translate text to the target language using Microsoft Translator API
 * @param {string|string[]} texts - Text or array of texts to translate
 * @param {string} targetLang - Target language code (e.g. "yo", "ha", "ig")
 * @param {string} [sourceLang] - Source language code (defaults to "en")
 * @returns {Promise<string|string[]>} Translated text(s)
 */
async function translateText(texts, targetLang, sourceLang = "en") {
  // Skip translation if target is same as source or target is English
  if (!targetLang || targetLang === sourceLang || targetLang === "en") {
    return texts;
  }

  if (!TRANSLATOR_KEY) {
    console.warn("Translation API key not configured, returning original text");
    return texts;
  }

  const isArray = Array.isArray(texts);
  const textArray = isArray ? texts : [texts];

  // Filter out empty strings
  const validTexts = textArray.map((t) => ({ text: t || "" }));

  try {
    const response = await axios({
      baseURL: TRANSLATOR_ENDPOINT,
      url: "/translate",
      method: "post",
      headers: {
        "Ocp-Apim-Subscription-Key": TRANSLATOR_KEY,
        "Ocp-Apim-Subscription-Region": TRANSLATOR_REGION,
        "Content-Type": "application/json",
      },
      params: {
        "api-version": "3.0",
        from: sourceLang,
        to: targetLang,
      },
      data: validTexts,
      responseType: "json",
    });

    const translations = response.data.map(
      (item) => item.translations[0]?.text || "",
    );

    return isArray ? translations : translations[0];
  } catch (error) {
    console.error("Translation error:", error.response?.data || error.message);
    // Return original text on failure
    return texts;
  }
}

/**
 * Translate an object's specified fields
 * @param {Object} obj - Object to translate
 * @param {string[]} fields - Fields to translate
 * @param {string} targetLang - Target language code
 * @returns {Promise<Object>} Object with translated fields
 */
async function translateFields(obj, fields, targetLang) {
  if (!targetLang || targetLang === "en") return obj;

  const textsToTranslate = fields
    .map((field) => obj[field])
    .filter((val) => typeof val === "string" && val.trim());

  if (textsToTranslate.length === 0) return obj;

  const translated = await translateText(textsToTranslate, targetLang);

  const result = { ...obj };
  let idx = 0;
  for (const field of fields) {
    if (typeof obj[field] === "string" && obj[field].trim()) {
      result[field] = translated[idx];
      idx++;
    }
  }

  return result;
}

/**
 * Get supported languages from Microsoft Translator
 * @returns {Promise<Object>} Map of language codes to language info
 */
async function getSupportedLanguages() {
  try {
    const response = await axios({
      baseURL: TRANSLATOR_ENDPOINT,
      url: "/languages",
      method: "get",
      params: {
        "api-version": "3.0",
        scope: "translation",
      },
    });
    return response.data.translation || {};
  } catch (error) {
    console.error(
      "Error fetching supported languages:",
      error.response?.data || error.message,
    );
    return {};
  }
}

module.exports = {
  translateText,
  translateFields,
  getSupportedLanguages,
};
