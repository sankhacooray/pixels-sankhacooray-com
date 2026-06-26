/**
 * square-smart processor.
 *
 * Finds the most visually salient region of a photo (smartcrop.js — pure
 * client-side, no model) and renders it as a square JPEG. Falls back to a
 * center crop if smartcrop is unavailable or the image can't be analysed.
 *
 *   const { blob, dataUrl } = await Pixels.processors["square-smart"](item, { size: 2048 });
 *
 * Pexels' CDN serves `access-control-allow-origin: *`, so the canvas stays
 * untainted and we can export the bytes.
 */
(function () {
  window.Pixels = window.Pixels || {};
  Pixels.processors = Pixels.processors || {};

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("Could not load image: " + url)); };
      img.src = url;
    });
  }

  Pixels.processors["square-smart"] = async function (item, opts) {
    opts = opts || {};
    const size = opts.size || 2048;
    const img = await loadImage(item.downloadUrl || item.full);
    const nw = img.naturalWidth, nh = img.naturalHeight;
    const min = Math.min(nw, nh);

    // Default: dead-center square crop.
    let crop = { x: (nw - min) / 2, y: (nh - min) / 2, width: min, height: min };

    // Upgrade to a saliency-aware crop when smartcrop is present.
    try {
      if (window.smartcrop) {
        const result = await smartcrop.crop(img, { width: min, height: min });
        if (result && result.topCrop) crop = result.topCrop;
      }
    } catch (e) { /* keep center crop */ }

    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, size, size);

    const quality = opts.quality || 0.92;
    const blob = await new Promise(function (res) { canvas.toBlob(res, "image/jpeg", quality); });
    return {
      blob: blob,
      dataUrl: canvas.toDataURL("image/jpeg", quality),
      w: size, h: size, crop: crop
    };
  };
})();
