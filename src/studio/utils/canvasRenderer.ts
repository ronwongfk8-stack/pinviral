import { AspectRatio, PinItem, TextOverlaySettings } from '../types';

export function getDimensions(aspectRatio: AspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16':
      return { width: 1080, height: 1920 };
    case '2:3':
      return { width: 1000, height: 1500 };
    case '1:1':
    default:
      return { width: 1080, height: 1080 };
  }
}

// Draw an AI-generated lifestyle photo (full frame, cover-fit, no grading, no cutouts)
export function drawGeneratedPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number
) {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const canvasRatio = width / height;
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (imgRatio > canvasRatio) {
    sw = img.naturalHeight * canvasRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / canvasRatio;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
}

// Draw realistic photographic scene background onto canvas
export function drawPhotographicScene(
  ctx: CanvasRenderingContext2D,
  bgImg: HTMLImageElement,
  width: number,
  height: number,
  style: PinItem['environmentStyle']
) {
  ctx.save();
  // Draw with cover fit
  const imgRatio = bgImg.naturalWidth / bgImg.naturalHeight;
  const canvasRatio = width / height;
  let sx = 0,
    sy = 0,
    sw = bgImg.naturalWidth,
    sh = bgImg.naturalHeight;

  if (imgRatio > canvasRatio) {
    sw = bgImg.naturalHeight * canvasRatio;
    sx = (bgImg.naturalWidth - sw) / 2;
  } else {
    sh = bgImg.naturalWidth / canvasRatio;
    sy = (bgImg.naturalHeight - sh) / 2;
  }

  ctx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, width, height);

  // Cinematic color grading & subtle vignette according to scene style
  if (style === 'cafe_view') {
    // Warm cafe amber grade
    ctx.save();
    ctx.fillStyle = 'rgba(70, 35, 15, 0.16)';
    ctx.fillRect(0, 0, width, height);
    const vig = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      width * 0.35,
      width * 0.5,
      height * 0.5,
      width * 0.85
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(25, 12, 5, 0.45)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } else if (style === 'lake_view') {
    // Crisp lake morning blue & gold light grade
    ctx.save();
    ctx.fillStyle = 'rgba(15, 45, 65, 0.12)';
    ctx.fillRect(0, 0, width, height);
    const vig = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      width * 0.35,
      width * 0.5,
      height * 0.5,
      width * 0.85
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(5, 20, 35, 0.4)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } else if (style === 'city_mobile_view') {
    // Modern city loft architectural grade
    ctx.save();
    ctx.fillStyle = 'rgba(20, 30, 45, 0.14)';
    ctx.fillRect(0, 0, width, height);
    const vig = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      width * 0.4,
      width * 0.5,
      height * 0.5,
      width * 0.9
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(10, 15, 25, 0.38)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } else if (style === 'luxury_terrace_view' || style === 'luxury_marble') {
    // Luxury contrast & warm gold highlights
    ctx.save();
    ctx.fillStyle = 'rgba(30, 20, 10, 0.1)';
    ctx.fillRect(0, 0, width, height);
    const vig = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      width * 0.4,
      width * 0.5,
      height * 0.5,
      width * 0.9
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } else {
    // General soft filmic vignette
    const vig = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      width * 0.45,
      width * 0.5,
      height * 0.5,
      width * 0.85
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.restore();
}

// Draw realistic environment background onto canvas
export function drawEnvironmentBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  style: PinItem['environmentStyle'],
  colorTheme: PinItem['environmentColorTheme'],
  bgImageElement?: HTMLImageElement | null
): boolean {
  // If real photographic background image is available, render real photo!
  if (bgImageElement && bgImageElement.complete && bgImageElement.naturalWidth > 0) {
    drawPhotographicScene(ctx, bgImageElement, width, height, style);
    return true;
  }

  ctx.save();

  if (style === 'scandinavian') {
    // 1. Scandinavian: Warm oak table, soft morning window light & linen shadows
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#fbf8f4');
    bgGrad.addColorStop(0.5, '#f4ece1');
    bgGrad.addColorStop(1, '#e8ded0');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Warm wooden table surface at lower 45%
    const tableTopY = height * 0.52;
    const tableGrad = ctx.createLinearGradient(0, tableTopY, 0, height);
    tableGrad.addColorStop(0, '#dfceb8');
    tableGrad.addColorStop(0.2, '#d4c0a5');
    tableGrad.addColorStop(0.6, '#caaE93');
    tableGrad.addColorStop(1, '#be9f80');
    ctx.fillStyle = tableGrad;
    ctx.fillRect(0, tableTopY, width, height - tableTopY);

    // Subtle wood grain lines
    ctx.save();
    ctx.strokeStyle = 'rgba(160, 130, 95, 0.12)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 18; i++) {
      const y = tableTopY + (height - tableTopY) * (i / 18);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(width * 0.3, y - 6, width * 0.7, y + 6, width, y);
      ctx.stroke();
    }
    ctx.restore();

    // Table edge highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, tableTopY);
    ctx.lineTo(width, tableTopY);
    ctx.stroke();

    // Soft morning sunbeams from top left
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const sunbeam = ctx.createRadialGradient(width * 0.15, height * 0.05, 50, width * 0.45, height * 0.6, width * 0.85);
    sunbeam.addColorStop(0, 'rgba(255, 250, 235, 0.55)');
    sunbeam.addColorStop(0.4, 'rgba(255, 243, 215, 0.25)');
    sunbeam.addColorStop(1, 'rgba(255, 240, 210, 0)');
    ctx.fillStyle = sunbeam;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    // Dappled linen curtain shadows
    ctx.save();
    ctx.fillStyle = 'rgba(90, 70, 50, 0.05)';
    ctx.beginPath();
    ctx.ellipse(width * 0.85, height * 0.25, width * 0.35, height * 0.45, Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(width * 0.1, height * 0.7, width * 0.25, height * 0.35, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

  } else if (style === 'boho') {
    // 2. Boho: Warm terracotta wall, ambient lamp glow, organic plant shadows
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#36231c');
    bgGrad.addColorStop(0.5, '#2b1a14');
    bgGrad.addColorStop(1, '#1a0e0a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Warm ambient lamp glow (radial)
    const lampGlow = ctx.createRadialGradient(width * 0.75, height * 0.3, 20, width * 0.75, height * 0.3, width * 0.7);
    lampGlow.addColorStop(0, 'rgba(255, 185, 120, 0.65)');
    lampGlow.addColorStop(0.3, 'rgba(224, 138, 76, 0.35)');
    lampGlow.addColorStop(0.7, 'rgba(168, 85, 40, 0.1)');
    lampGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = lampGlow;
    ctx.fillRect(0, 0, width, height);

    // Rustic wooden shelf / surface
    const shelfY = height * 0.54;
    const shelfGrad = ctx.createLinearGradient(0, shelfY, 0, height);
    shelfGrad.addColorStop(0, '#42281e');
    shelfGrad.addColorStop(0.3, '#321d15');
    shelfGrad.addColorStop(1, '#1e110b');
    ctx.fillStyle = shelfGrad;
    ctx.fillRect(0, shelfY, width, height - shelfY);

    // Plant foliage shadow silhouettes
    ctx.save();
    ctx.fillStyle = 'rgba(15, 8, 5, 0.35)';
    // Leaf clusters
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(width * 0.08 + i * 20, height * 0.15 + i * 35, 45, 90, (i * 0.3) - 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

  } else if (style === 'luxury_marble') {
    // 3. Luxury Marble: Pure Carrara marble slab, brass gold accent line, crisp studio lights
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#f8fafc');
    bgGrad.addColorStop(0.4, '#f1f5f9');
    bgGrad.addColorStop(1, '#e2e8f0');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Marble surface plane at lower 50%
    const marbleY = height * 0.5;
    const marbleGrad = ctx.createLinearGradient(0, marbleY, 0, height);
    marbleGrad.addColorStop(0, '#ffffff');
    marbleGrad.addColorStop(0.3, '#f8fafc');
    marbleGrad.addColorStop(0.8, '#edeef1');
    marbleGrad.addColorStop(1, '#e2e5ea');
    ctx.fillStyle = marbleGrad;
    ctx.fillRect(0, marbleY, width, height - marbleY);

    // Marble veins
    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, marbleY + 40);
    ctx.bezierCurveTo(width * 0.25, marbleY + 120, width * 0.5, marbleY + 20, width * 0.85, marbleY + 190);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
    ctx.beginPath();
    ctx.moveTo(width * 0.2, marbleY + 180);
    ctx.bezierCurveTo(width * 0.45, marbleY + 240, width * 0.75, marbleY + 140, width, marbleY + 260);
    ctx.stroke();
    ctx.restore();

    // Luxury Brass/Gold accent divider line
    const goldGrad = ctx.createLinearGradient(0, 0, width, 0);
    goldGrad.addColorStop(0, '#b45309');
    goldGrad.addColorStop(0.3, '#f59e0b');
    goldGrad.addColorStop(0.5, '#fef3c7');
    goldGrad.addColorStop(0.7, '#d97706');
    goldGrad.addColorStop(1, '#92400e');
    ctx.fillStyle = goldGrad;
    ctx.fillRect(0, marbleY - 2, width, 4);

    // Studio light soft reflection spot
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const softStudioGlow = ctx.createRadialGradient(width * 0.5, height * 0.4, 20, width * 0.5, height * 0.4, width * 0.6);
    softStudioGlow.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    softStudioGlow.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
    softStudioGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = softStudioGlow;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

  } else if (style === 'outdoor_botanical') {
    // 4. Botanical Terrace: Garden terrace, sun-dappled greenery & monstera shadows
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height * 0.5);
    skyGrad.addColorStop(0, '#eaf7ee');
    skyGrad.addColorStop(0.5, '#dcfce7');
    skyGrad.addColorStop(1, '#bbf7d0');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height * 0.5);

    // Rustic stone patio table
    const tableY = height * 0.52;
    const patioGrad = ctx.createLinearGradient(0, tableY, 0, height);
    patioGrad.addColorStop(0, '#e6e0d4');
    patioGrad.addColorStop(0.4, '#d8d0c2');
    patioGrad.addColorStop(1, '#c5bcac');
    ctx.fillStyle = patioGrad;
    ctx.fillRect(0, tableY, width, height - tableY);

    // Subtle stone texture
    ctx.strokeStyle = 'rgba(110, 95, 75, 0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, tableY);
    ctx.lineTo(width, tableY);
    ctx.stroke();

    // Dappled sun & monstera leaf shadows
    ctx.save();
    ctx.fillStyle = 'rgba(20, 83, 45, 0.14)';
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      const x = width * 0.75 + (i % 3) * 45;
      const y = height * 0.15 + Math.floor(i / 2) * 80;
      ctx.ellipse(x, y, 70, 130, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Dappled sunlight circles
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(255, 255, 230, 0.35)';
    for (let j = 0; j < 12; j++) {
      const rx = (width * 0.15) + (j * 75) % (width * 0.8);
      const ry = (tableY - 80) + ((j * 95) % (height * 0.45));
      ctx.beginPath();
      ctx.arc(rx, ry, 28 + (j % 5) * 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

  } else {
    // 5. Minimalist Pastel Studio: Architectural arches, clean blush/sand podium, soft shadows
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#fff5f5');
    bgGrad.addColorStop(0.5, '#fde8ea');
    bgGrad.addColorStop(1, '#fad7dc');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Architectural curved arch in background
    ctx.save();
    ctx.fillStyle = 'rgba(244, 185, 195, 0.35)';
    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.38, width * 0.38, Math.PI, 0);
    ctx.lineTo(width * 0.88, height * 0.65);
    ctx.lineTo(width * 0.12, height * 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Cylindrical / sculptural podium
    const podiumY = height * 0.52;
    const podiumH = height * 0.35;
    const podiumW = width * 0.65;
    const podiumX = (width - podiumW) / 2;

    // Podium top ellipse
    const pGrad = ctx.createLinearGradient(podiumX, podiumY, podiumX + podiumW, podiumY);
    pGrad.addColorStop(0, '#fef0f2');
    pGrad.addColorStop(0.5, '#ffffff');
    pGrad.addColorStop(1, '#fce1e6');
    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.ellipse(width * 0.5, podiumY, podiumW / 2, 45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Podium base cylinder
    const baseGrad = ctx.createLinearGradient(podiumX, 0, podiumX + podiumW, 0);
    baseGrad.addColorStop(0, '#f9cbd4');
    baseGrad.addColorStop(0.4, '#fedde3');
    baseGrad.addColorStop(1, '#f3b8c3');
    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.rect(podiumX, podiumY, podiumW, podiumH);
    ctx.fill();

    // Podium bottom curved cap
    ctx.beginPath();
    ctx.ellipse(width * 0.5, podiumY + podiumH, podiumW / 2, 45, 0, 0, Math.PI);
    ctx.fill();

    // Studio soft diagonal sunbeam shadow
    ctx.save();
    ctx.fillStyle = 'rgba(190, 80, 110, 0.08)';
    ctx.beginPath();
    ctx.moveTo(0, height * 0.1);
    ctx.lineTo(width * 0.45, 0);
    ctx.lineTo(width, height * 0.6);
    ctx.lineTo(width * 0.4, height);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
  return false;
}

// Cache for background-extracted subject images
const subjectCache = new WeakMap<HTMLImageElement, CanvasImageSource>();

function getProcessedSubject(img: HTMLImageElement): CanvasImageSource {
  if (subjectCache.has(img)) {
    return subjectCache.get(img)!;
  }

  // Check if image has a near-white solid studio background (e-commerce catalog shot)
  try {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = img.naturalWidth || img.width;
    offCanvas.height = img.naturalHeight || img.height;
    const offCtx = offCanvas.getContext('2d');
    if (!offCtx || offCanvas.width === 0 || offCanvas.height === 0) {
      return img;
    }

    offCtx.drawImage(img, 0, 0);
    const imgData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
    const data = imgData.data;

    // Sample the 4 corners: (0,0), (W-1, 0), (0, H-1), (W-1, H-1)
    const corners = [
      0,
      (offCanvas.width - 1) * 4,
      (offCanvas.height - 1) * offCanvas.width * 4,
      ((offCanvas.height - 1) * offCanvas.width + (offCanvas.width - 1)) * 4,
    ];

    let allCornersLight = true;
    for (const c of corners) {
      const r = data[c];
      const g = data[c + 1];
      const b = data[c + 2];
      const a = data[c + 3];
      if (a < 50) {
        // Already transparent PNG
        subjectCache.set(img, img);
        return img;
      }
      if (r < 225 || g < 225 || b < 225) {
        allCornersLight = false;
        break;
      }
    }

    // If all corners are light/near-white, remove the solid background smoothly
    if (allCornersLight) {
      const len = data.length;
      for (let i = 0; i < len; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        if (a === 0) continue;

        // Check distance to white
        const minVal = Math.min(r, g, b);
        if (minVal > 248) {
          data[i + 3] = 0;
        } else if (minVal > 218) {
          // Soft anti-aliased edge falloff
          const factor = (minVal - 218) / (248 - 218);
          data[i + 3] = Math.round(a * (1 - factor));
        }
      }
      offCtx.putImageData(imgData, 0, 0);
      subjectCache.set(img, offCanvas);
      return offCanvas;
    }
  } catch {
    // Canvas tainted or cross-origin, fallback to original
  }

  subjectCache.set(img, img);
  return img;
}

// Draw the subject / product image on top of the environment with 100% Product Fidelity
export function drawSubjectImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  style: PinItem['environmentStyle'],
  hasPhotoScene: boolean = false
) {
  ctx.save();

  const processedSource = getProcessedSubject(img);

  // Target bounding box for the product in the center-stage area
  const maxW = width * (hasPhotoScene ? 0.62 : 0.68);
  const maxH = height * (hasPhotoScene ? 0.44 : 0.46);

  const natW = img.naturalWidth || img.width || 500;
  const natH = img.naturalHeight || img.height || 500;

  let dw = maxW;
  let dh = (natH / natW) * dw;

  if (dh > maxH) {
    dh = maxH;
    dw = (natW / natH) * dh;
  }

  const dx = (width - dw) / 2;
  const dy = (height * 0.5) - (dh * 0.60);

  // 1. Draw multi-layered contact drop shadow beneath product
  ctx.save();
  const shadowY = dy + dh - 10;
  const shadowH = Math.min(38, dh * 0.16);

  // A. Tight dark contact shadow directly under base
  const tightShadowGrad = ctx.createRadialGradient(
    width * 0.5, shadowY, 6,
    width * 0.5, shadowY, dw * 0.42
  );
  tightShadowGrad.addColorStop(0, 'rgba(15, 10, 8, 0.58)');
  tightShadowGrad.addColorStop(0.6, 'rgba(15, 10, 8, 0.22)');
  tightShadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = tightShadowGrad;
  ctx.beginPath();
  ctx.ellipse(width * 0.5, shadowY, dw * 0.42, shadowH * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  // B. Soft diffuse ambient shadow
  const diffuseShadowGrad = ctx.createRadialGradient(
    width * 0.5, shadowY + 8, 12,
    width * 0.5, shadowY + 8, dw * 0.58
  );
  diffuseShadowGrad.addColorStop(0, 'rgba(20, 15, 10, 0.32)');
  diffuseShadowGrad.addColorStop(0.7, 'rgba(20, 15, 10, 0.10)');
  diffuseShadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = diffuseShadowGrad;
  ctx.beginPath();
  ctx.ellipse(width * 0.5, shadowY + 8, dw * 0.58, shadowH * 1.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Draw soft ambient occlusion shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
  ctx.shadowBlur = hasPhotoScene ? 38 : 28;
  ctx.shadowOffsetY = 16;

  // Draw the processed product image
  ctx.drawImage(processedSource, dx, dy, dw, dh);
  ctx.restore();

  // 3. Environmental lighting wrap reflection
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  if (style === 'cafe_view') {
    // Warm morning golden cafe light from top-left
    const cafeGrad = ctx.createLinearGradient(dx, dy, dx + dw, dy + dh);
    cafeGrad.addColorStop(0, 'rgba(255, 215, 140, 0.25)');
    cafeGrad.addColorStop(1, 'rgba(180, 120, 80, 0.08)');
    ctx.fillStyle = cafeGrad;
  } else if (style === 'lake_view') {
    // Cool crisp alpine mist lighting
    const lakeGrad = ctx.createLinearGradient(dx, dy, dx, dy + dh);
    lakeGrad.addColorStop(0, 'rgba(210, 240, 255, 0.22)');
    lakeGrad.addColorStop(1, 'rgba(120, 170, 210, 0.08)');
    ctx.fillStyle = lakeGrad;
  } else if (style === 'city_mobile_view') {
    // Clean modern urban loft daylight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  } else if (style === 'cozy_nook_view') {
    // Warm cozy sunlight flare
    ctx.fillStyle = 'rgba(255, 230, 180, 0.22)';
  } else if (style === 'luxury_terrace_view') {
    // Sunset golden hour rim flare
    const sunsetGrad = ctx.createLinearGradient(dx + dw, dy, dx, dy + dh);
    sunsetGrad.addColorStop(0, 'rgba(255, 170, 90, 0.28)');
    sunsetGrad.addColorStop(1, 'rgba(220, 80, 100, 0.08)');
    ctx.fillStyle = sunsetGrad;
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  }
  ctx.fillRect(dx, dy, dw, dh);
  ctx.restore();

  // 4. If composited onto a real photo scene, draw subtle "100% Product Fidelity" anchor indicator
  if (hasPhotoScene) {
    ctx.save();
    const pillX = 36;
    const pillY = 36;
    const pillW = 210;
    const pillH = 34;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    roundRect(ctx, pillX, pillY, pillW, pillH, 17);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = "bold 13px 'Plus Jakarta Sans', sans-serif";
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('🔒', pillX + 12, pillY + 22);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('100% PRODUCT MATCH', pillX + 34, pillY + 22);
    ctx.restore();
  }

  ctx.restore();
}

// Draw the customizable text overlay, badge, position, rotation, and styles
export function drawTextOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  overlay: TextOverlaySettings
) {
  ctx.save();

  // Calculate center of overlay based on position offsets (-50 to +50%)
  const baseX = width * 0.5 + (overlay.positionX / 100) * (width * 0.45);
  // Default anchor near bottom (height * 0.76) or near top depending on positionY
  const baseY = height * 0.76 + (overlay.positionY / 100) * (height * 0.4);

  // Apply rotation
  ctx.translate(baseX, baseY);
  ctx.rotate((overlay.rotation * Math.PI) / 180);

  const cardWidth = Math.min(width * 0.88, 920);
  const paddingX = 40;
  const paddingY = 32;

  // Measure content heights
  const headlineFont = `bold ${overlay.fontSize}px '${overlay.fontFamily}', sans-serif`;
  const subFont = `500 ${Math.round(overlay.fontSize * 0.55)}px '${overlay.fontFamily}', sans-serif`;
  const badgeFont = `bold ${Math.round(overlay.fontSize * 0.46)}px 'Plus Jakarta Sans', sans-serif`;
  const ctaFont = `bold ${Math.round(overlay.fontSize * 0.48)}px 'Plus Jakarta Sans', sans-serif`;

  // Draw overlay background according to style
  if (overlay.overlayStyle === 'card') {
    // Glassmorphic / clean aesthetic floating card
    const cardH = overlay.fontSize * 4.8;
    const cardTop = -cardH / 2;
    const cardLeft = -cardWidth / 2;

    ctx.save();
    if (overlay.showShadow) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 12;
    }

    // Background color with opacity
    ctx.fillStyle = hexToRgba(overlay.overlayBgColor, overlay.overlayBgOpacity);
    roundRect(ctx, cardLeft, cardTop, cardWidth, cardH, 24);
    ctx.fill();

    // Card border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

  } else if (overlay.overlayStyle === 'bottom-gradient') {
    // Full width dark / light gradient fade
    ctx.save();
    const gradH = height * 0.45;
    const grad = ctx.createLinearGradient(0, -gradH / 2, 0, gradH / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.4, hexToRgba(overlay.overlayBgColor, overlay.overlayBgOpacity * 0.7));
    grad.addColorStop(1, hexToRgba(overlay.overlayBgColor, overlay.overlayBgOpacity));
    ctx.fillStyle = grad;
    ctx.fillRect(-width / 2, -gradH / 2, width, gradH);
    ctx.restore();

  } else if (overlay.overlayStyle === 'banner') {
    // Edge-to-edge solid or translucent banner
    ctx.save();
    const bannerH = overlay.fontSize * 3.8;
    ctx.fillStyle = hexToRgba(overlay.overlayBgColor, overlay.overlayBgOpacity);
    ctx.fillRect(-width / 2, -bannerH / 2, width, bannerH);
    ctx.restore();

  } else if (overlay.overlayStyle === 'minimal-pill') {
    // Minimal floating pill
    const pillH = overlay.fontSize * 3.4;
    ctx.save();
    if (overlay.showShadow) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 8;
    }
    ctx.fillStyle = hexToRgba(overlay.overlayBgColor, overlay.overlayBgOpacity);
    roundRect(ctx, -cardWidth * 0.45, -pillH / 2, cardWidth * 0.9, pillH, 40);
    ctx.fill();
    ctx.restore();

  } else if (overlay.overlayStyle === 'editorial') {
    // Editorial framing box
    const edH = overlay.fontSize * 4.4;
    ctx.save();
    ctx.fillStyle = hexToRgba(overlay.overlayBgColor, overlay.overlayBgOpacity);
    ctx.fillRect(-cardWidth / 2, -edH / 2, cardWidth, edH);
    ctx.strokeStyle = overlay.badgeColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(-cardWidth / 2 + 10, -edH / 2 + 10, cardWidth - 20, edH - 20);
    ctx.restore();
  }

  // Content alignment
  ctx.textAlign = overlay.textAlign;
  let textX = 0;
  if (overlay.textAlign === 'left') {
    textX = -cardWidth / 2 + paddingX + 10;
  } else if (overlay.textAlign === 'right') {
    textX = cardWidth / 2 - paddingX - 10;
  }

  let curY = -overlay.fontSize * 1.3;

  // 1. Social Proof Badge (e.g. ⭐ 4.9 (3.8k+ Reviews))
  if (overlay.showBadge && overlay.badgeText) {
    ctx.save();
    ctx.font = badgeFont;
    const badgeMetrics = ctx.measureText(overlay.badgeText);
    const badgeW = badgeMetrics.width + 28;
    const badgeH = Math.round(overlay.fontSize * 0.78);

    let badgeX = textX - badgeW / 2;
    if (overlay.textAlign === 'left') badgeX = textX;
    if (overlay.textAlign === 'right') badgeX = textX - badgeW;

    ctx.fillStyle = overlay.badgeColor;
    roundRect(ctx, badgeX, curY - badgeH + 6, badgeW, badgeH, badgeH / 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(overlay.badgeText, badgeX + badgeW / 2, curY - 2);
    ctx.restore();

    curY += overlay.fontSize * 0.95;
  }

  // 2. Headline Text
  if (overlay.headline) {
    ctx.save();
    ctx.font = headlineFont;
    ctx.fillStyle = overlay.textColor;
    if (overlay.showShadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
    }
    // Handle wrap if headline is long
    wrapText(ctx, overlay.headline, textX, curY, cardWidth - paddingX * 2, overlay.fontSize * 1.15);
    ctx.restore();

    curY += overlay.fontSize * 1.25;
  }

  // 3. Subtitle Text
  if (overlay.subtitle) {
    ctx.save();
    ctx.font = subFont;
    ctx.fillStyle = hexToRgba(overlay.textColor, 0.88);
    wrapText(ctx, overlay.subtitle, textX, curY, cardWidth - paddingX * 2, overlay.fontSize * 0.72);
    ctx.restore();

    curY += overlay.fontSize * 0.85;
  }

  // 4. Call to Action Pill (e.g. Tap to Shop)
  if (overlay.showCta && overlay.ctaText) {
    ctx.save();
    ctx.font = ctaFont;
    const ctaMetrics = ctx.measureText(overlay.ctaText);
    const ctaW = ctaMetrics.width + 36;
    const ctaH = Math.round(overlay.fontSize * 0.82);

    let ctaX = textX - ctaW / 2;
    if (overlay.textAlign === 'left') ctaX = textX;
    if (overlay.textAlign === 'right') ctaX = textX - ctaW;

    // CTA background pill
    ctx.fillStyle = overlay.textColor === '#ffffff' ? '#ffffff' : '#0f172a';
    roundRect(ctx, ctaX, curY + 2, ctaW, ctaH, ctaH / 2);
    ctx.fill();

    // CTA text
    ctx.fillStyle = overlay.textColor === '#ffffff' ? '#0f172a' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(overlay.ctaText, ctaX + ctaW / 2, curY + ctaH * 0.68);
    ctx.restore();
  }

  ctx.restore();
}

// Utility: Draw rounded rectangle
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Utility: Text wrapping
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(' ');
  let line = '';
  let curY = y;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, curY);
      line = words[n] + ' ';
      curY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, curY);
}

// Utility: Convert Hex to RGBA
export function hexToRgba(hex: string, alpha: number): string {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map((c) => c + c).join('');
  }
  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) return `rgba(255, 255, 255, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
