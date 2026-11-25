(() => {
  const CDN = 'https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm';
  const WASM = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/';
  let enginePromise;

  function readGrid() {
    const value = (id) => Number(document.getElementById(id).value);
    return { rows: value('rowCount'), dayStart: value('gridDayStart'), right: value('gridRight'), top: value('gridTop'), bottom: value('gridBottom'), tilt: value('gridTilt') };
  }

  function validGrid(grid) {
    return Number.isInteger(grid.rows) && grid.rows >= 1 && grid.rows <= 40 && grid.dayStart >= 12 && grid.right <= 99 && grid.right - grid.dayStart >= 35 && grid.top >= 5 && grid.bottom <= 90 && grid.bottom - grid.top >= 15 && Math.abs(grid.tilt) <= 3;
  }

  function renderGrid() {
    const grid = readGrid(), svg = document.getElementById('gridOverlay');
    if (!validGrid(grid)) { svg.replaceChildren(); return; }
    const create = (tag, attrs) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
      svg.append(node);
    };
    svg.replaceChildren();
    const y = (base, x) => (base + grid.tilt * x / 100) * 10;
    for (let r = 0; r <= grid.rows; r++) {
      const base = grid.top + (grid.bottom - grid.top) * r / grid.rows;
      create('line', { x1: 25, y1: y(base, 2.5), x2: grid.right * 10, y2: y(base, grid.right), stroke: '#c54842', 'stroke-width': r === 0 || r === grid.rows ? 4 : 1.5, opacity: r === 0 || r === grid.rows ? .85 : .45 });
    }
    for (let d = 0; d <= 31; d++) {
      const x = grid.dayStart + (grid.right - grid.dayStart) * d / 31;
      create('line', { x1: x * 10, y1: y(grid.top, x), x2: x * 10, y2: y(grid.bottom, x), stroke: '#c54842', 'stroke-width': d === 0 || d === 31 ? 4 : 1, opacity: d === 0 || d === 31 ? .85 : .32 });
    }
  }

  function crop(source, x, y, w, h, outWidth, outHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = outWidth; canvas.height = outHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, outWidth, outHeight);
    ctx.drawImage(source, x, y, w, h, 0, 0, outWidth, outHeight);
    return canvas;
  }

  function makeCrops(image, grid, dayCount) {
    const source = document.createElement('canvas');
    source.width = image.naturalWidth; source.height = image.naturalHeight;
    source.getContext('2d').drawImage(image, 0, 0);
    const w = source.width, h = source.height;
    const rowHeight = h * (grid.bottom - grid.top) / (100 * grid.rows);
    const cellWidth = w * (grid.right - grid.dayStart) / 3100;
    const names = [], cells = [];
    for (let row = 0; row < grid.rows; row++) {
      const nameX = w * .03;
      const nameY = h * (grid.top + grid.tilt * .03) / 100 + row * rowHeight;
      names.push(crop(source, nameX + 3, nameY + 2, w * grid.dayStart / 100 - nameX - 5, rowHeight - 4, 840, 120));
      for (let day = 0; day < dayCount; day++) {
        const x = w * grid.dayStart / 100 + day * cellWidth;
        const y = h * (grid.top + grid.tilt * x / w) / 100 + row * rowHeight;
        const insetX = Math.max(2, cellWidth * .06), insetY = Math.max(2, rowHeight * .06);
        cells.push(crop(source, x + insetX, y + insetY, cellWidth - 2 * insetX, rowHeight - 2 * insetY, 180, 170));
      }
    }
    return { names, cells };
  }

  function previewCell(image, row, day) {
    const grid = readGrid(), w = image.naturalWidth, h = image.naturalHeight;
    const rowHeight = h * (grid.bottom - grid.top) / (100 * grid.rows);
    const cellWidth = w * (grid.right - grid.dayStart) / 3100;
    const x = w * grid.dayStart / 100 + day * cellWidth;
    const y = h * (grid.top + grid.tilt * x / w) / 100 + row * rowHeight;
    return crop(image, x + 1, y + 1, cellWidth - 2, rowHeight - 2, 260, 230);
  }

  function previewRow(image, row) {
    const grid = readGrid(), w = image.naturalWidth, h = image.naturalHeight;
    const rowHeight = h * (grid.bottom - grid.top) / (100 * grid.rows);
    const x = w * .025;
    const y = h * (grid.top + grid.tilt * .025) / 100 + row * rowHeight;
    return crop(image, x, y, w * grid.right / 100 - x, rowHeight, 1900, 100);
  }

  function enhanceCell(source) {
    const canvas = document.createElement('canvas');
    canvas.width = source.width * 2; canvas.height = source.height * 2;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < image.data.length; i += 4) {
      const r = image.data[i], g = image.data[i + 1], b = image.data[i + 2];
      const ink = (r * .3 + g * .59 + b * .11 < 173) || (r - g > 27 && r - b > 18);
      const value = ink ? 20 : 255;
      image.data[i] = value; image.data[i + 1] = value; image.data[i + 2] = value;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  function cleanName(result, row) {
    const words = result.items.flatMap((item) => item.text.split(/[\s-]+/).map((text) => ({ text: text.replace(/[^\p{L}]/gu, ''), score: item.score })))
      .filter((item) => item.text.length >= 2 && item.score >= .5);
    return words.length >= 2 ? words.slice(0, 2).map((item) => item.text[0].toLocaleUpperCase('sr') + '.').join(' ') : 'Red ' + (row + 1);
  }

  function visualFeatures(canvas) {
    const { width, height } = canvas;
    const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data;
    const points = [];
    let red = 0;
    for (let y = 26; y < height - 26; y += 2) for (let x = 30; x < width - 30; x += 2) {
      const i = (y * width + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > g * 1.3 && r > b * 1.2 && r - g > 35) red++;
      if ((r + g + b) / 3 < 115) points.push([x, y]);
    }
    const area = ((width - 60) / 2) * ((height - 52) / 2);
    if (points.length < 8) return { blank: true, slash: false, red: red / area };
    let sumX = 0, sumY = 0, sumXX = 0, sumYY = 0, sumXY = 0;
    let minX = width, maxX = 0, minY = height, maxY = 0;
    for (const [x, y] of points) {
      sumX += x; sumY += y; sumXX += x * x; sumYY += y * y; sumXY += x * y;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const n = points.length, cov = sumXY - sumX * sumY / n;
    const vx = sumXX - sumX * sumX / n, vy = sumYY - sumY * sumY / n;
    const slope = cov / (vx || 1), r2 = cov * cov / ((vx || 1) * (vy || 1));
    const slash = n / area < .23 && maxX - minX > width * .17 && maxY - minY > height * .17 && slope < -.35 && slope > -2.5 && r2 > .8;
    return { blank: n / area < .008, slash, red: red / area };
  }

  function classify(result, canvas) {
    const raw = result.items.map((item) => item.text).join(' ').trim().toUpperCase().replace(/\s+/g, '').replace(/[ОO]/g, 'O').replace(/[НH]/g, 'H');
    const score = result.items.length ? Math.max(...result.items.map((item) => item.score)) : 0;
    const visual = visualFeatures(canvas);
    const finish = (code, suggestion = code) => ({ code, suggestion, raw });
    if (/S[LЛ1I]|SLOB|SLO[B8]/.test(raw) && score >= .35) return finish('-');
    if (visual.slash || ['/', '-', '—', '一', 'SL'].includes(raw) || visual.blank) return finish('-');
    const second = /(?:13|21)/.test(raw), first = /(?:0?7|15)/.test(raw);
    if (second && !first && score >= .36) return finish('2');
    if (first && !second && score >= .36) return finish('1');
    if (/^[DДO0Q][.,:;!?]*$/.test(raw) && score >= .35) return finish('D');
    if (/^[HNИ][.,:;!?]*$/.test(raw) && score >= .35) return finish('N');
    if (raw === '2' && score >= .65) return finish('2');
    if (raw === '1' && score >= .65) return finish('1');
    if (visual.red > .035) return finish('N');
    const suggestion = second ? '2' : first ? '1' : /^[DДO0Q]/.test(raw) ? 'D' : /^[HNИ]/.test(raw) || visual.red > .025 ? 'N' : '-';
    return finish('?', suggestion);
  }

  async function getEngine(onProgress) {
    if (!enginePromise) {
      enginePromise = (async () => {
        onProgress('Preuzimam otvoreni OCR model. Prvi put može potrajati malo duže…');
        const { PaddleOCR } = await import(CDN);
        return PaddleOCR.create({
          textDetectionModelName: 'PP-OCRv6_tiny_det',
          textRecognitionModelName: 'PP-OCRv6_tiny_rec',
          ortOptions: { backend: 'wasm', wasmPaths: WASM, numThreads: 1, simd: true }
        });
      })().catch((error) => { enginePromise = undefined; throw error; });
    }
    return enginePromise;
  }

  async function recognize(image, month, year, onProgress) {
    const grid = readGrid();
    if (!validGrid(grid)) throw new Error('Podesi mrežu tako da obuhvati sve redove i dane.');
    const dayCount = new Date(year, month, 0).getDate();
    const engine = await getEngine(onProgress);
    onProgress('Izdvajam imena i dnevne ćelije sa fotografije…');
    const { names, cells } = makeCrops(image, grid, dayCount);
    const nameResults = await engine.predict(names, { textDetLimitSideLen: 840, textDetLimitType: 'max' });
    const results = [];
    for (let start = 0; start < cells.length; start += 64) {
      results.push(...await engine.predict(cells.slice(start, start + 64), { textDetLimitSideLen: 180, textDetLimitType: 'max' }));
      onProgress('Čitam polja: ' + Math.min(start + 64, cells.length) + ' / ' + cells.length + '…');
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const classified = results.map((result, index) => classify(result, cells[index]));
    const uncertain = classified.flatMap((item, index) => item.code === '?' ? [index] : []);
    if (uncertain.length) {
      onProgress('Pokušavam dodatno čitanje ' + uncertain.length + ' nejasnih polja…');
      for (let start = 0; start < uncertain.length; start += 64) {
        const indices = uncertain.slice(start, start + 64);
        const enhanced = indices.map((index) => enhanceCell(cells[index]));
        const retry = await engine.predict(enhanced, { textDetLimitSideLen: 360, textDetLimitType: 'max' });
        retry.forEach((result, offset) => {
          const index = indices[offset], newer = classify(result, cells[index]);
          if (newer.code !== '?') classified[index] = newer;
          else if (classified[index].suggestion === '-' && newer.suggestion !== '-') classified[index] = newer;
        });
        onProgress('Dodatno čitanje: ' + Math.min(start + 64, uncertain.length) + ' / ' + uncertain.length + '…');
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    const people = [];
    for (let row = 0; row < grid.rows; row++) {
      const shifts = [], suggestions = [];
      for (let day = 0; day < dayCount; day++) {
        const index = row * dayCount + day;
        const value = classified[index];
        shifts.push(value.code);
        suggestions.push(value.code === '?' ? value.suggestion : null);
      }
      people.push({ number: row + 1, name: cleanName(nameResults[row], row), shifts, suggestions });
    }
    const unknown = people.reduce((sum, person) => sum + person.shifts.filter((code) => code === '?').length, 0);
    return { month, year, people, unknown };
  }

  window.RasporedOCR = { readGrid, renderGrid, recognize, previewCell, previewRow };
})();
