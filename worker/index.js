const SYSTEM_PROMPT = `You transcribe a photographed, handwritten Serbian staff rota. Return only a JSON object with month (1-12), year (4 digits), and people. Each person has number (the left-side row number), name, and shifts: exactly one element per calendar day in the month, in date order. Valid shifts: "1" for 7/15 or 7-15, "2" for 13/21 or 13-21, "D" for day, "N" for night, "-" for slash, sl, blank or explicit day off, and "?" for any cell you cannot read with confidence. Do not guess unreadable cells. Read every row and every day column carefully. Crossed-out day numbers are still dates. Ignore totals at the right and notes outside the grid. Preserve Cyrillic or Latin names as legibly written. If a row has no person name, skip it. Output no explanations. Example shape: {"month":12,"year":2026,"people":[{"number":1,"name":"Ime Prezime","shifts":["1","D","N"]}]}. The shifts array must cover every day, even if uncertain. A blank cell is free only when visibly blank, not when obscured.`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const userId = request.headers.get('oai-authenticated-user-id');
      if (!userId) return json({ error: 'Potrebno je da se prijaviš u privatnu aplikaciju.' }, 401);
      if (url.pathname === '/api/schedules' && request.method === 'GET') {
        if (!env?.BUCKET) return json({ error: 'Zajedničko čuvanje trenutno nije dostupno.' }, 503);
        try {
          const listed = await env.BUCKET.list({ prefix: 'schedules/' });
          const schedules = {};
          for (const item of listed.objects) {
            const object = await env.BUCKET.get(item.key);
            if (object) {
              const schedule = await object.json();
              schedules[schedule.year + '-' + String(schedule.month).padStart(2, '0')] = schedule;
            }
          }
          const ownerObject = await env.BUCKET.get('owner.json');
          const owner = ownerObject ? await ownerObject.json() : null;
          return json({ schedules, canEdit: !owner || owner.userId === userId });
        } catch { return json({ error: 'Zajednički rasporedi nisu mogli da se učitaju.' }, 503); }
      }
      if (url.pathname === '/api/schedules' && request.method === 'POST') {
        if (!env?.BUCKET) return json({ error: 'Zajedničko čuvanje trenutno nije dostupno.' }, 503);
        let schedule;
        try { schedule = await request.json(); } catch { return json({ error: 'Neispravan raspored.' }, 400); }
        const problem = validateSchedule(schedule);
        if (problem) return json({ error: problem }, 400);
        try {
          const ownerObject = await env.BUCKET.get('owner.json');
          const owner = ownerObject ? await ownerObject.json() : null;
          if (owner && owner.userId !== userId) return json({ error: 'Samo osoba koja je postavila raspored može da ga usvoji.' }, 403);
          if (!owner) await env.BUCKET.put('owner.json', JSON.stringify({ userId }));
          const key = 'schedules/' + schedule.year + '-' + String(schedule.month).padStart(2, '0') + '.json';
          await env.BUCKET.put(key, JSON.stringify(schedule), { httpMetadata: { contentType: 'application/json' } });
          return json({ ok: true });
        } catch { return json({ error: 'Raspored nije mogao da se sačuva. Pokušaj ponovo.' }, 503); }
      }
    }
    if (url.pathname === "/api/parse" && request.method === "POST") {
      const key = request.headers.get("x-openai-key")?.trim();
      if (!key) return json({ error: "Unesi API ključ za prepoznavanje rukopisa." }, 400);
      let body;
      try { body = await request.json(); } catch { return json({ error: "Neispravan zahtev." }, 400); }
      if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(body.image || "") || body.image.length > 13_000_000) {
        return json({ error: "Pošalji JPG, PNG ili WebP sliku do 10 MB." }, 400);
      }
      const model = typeof body.model === "string" && /^[a-zA-Z0-9._-]{3,60}$/.test(body.model) ? body.model : "gpt-5.4-mini";
      try {
        const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            max_completion_tokens: 12000,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: [{ type: "text", text: "Transcribe the complete monthly schedule from this photo. It is vital to mark uncertainty as ?." }, { type: "image_url", image_url: { url: body.image, detail: "high" } }] }
            ]
          })
        });
        const payload = await upstream.json();
        if (!upstream.ok) return json({ error: payload.error?.message || "Prepoznavanje nije uspelo." }, upstream.status);
        const raw = payload.choices?.[0]?.message?.content;
        if (!raw) return json({ error: "Servis nije vratio raspored. Pokušaj ponovo." }, 502);
        return json({ result: JSON.parse(raw) });
      } catch {
        return json({ error: "Slika nije mogla da se obradi. Proveri mrežu i pokušaj ponovo." }, 502);
      }
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(__PAGE__, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    }
    return new Response("Not found", { status: 404 });
  }
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

function validateSchedule(schedule) {
  const month = Number(schedule?.month), year = Number(schedule?.year);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) return 'Mesec i godina nisu ispravni.';
  if (!Array.isArray(schedule.people) || !schedule.people.length || schedule.people.length > 100) return 'Raspored mora imati bar jednu osobu.';
  const days = new Date(year, month, 0).getDate();
  const numbers = new Set();
  for (const person of schedule.people) {
    if (!Number.isInteger(person.number) || person.number < 1 || numbers.has(person.number) || typeof person.name !== 'string' || !person.name.trim() || person.name.length > 120) return 'Proveri imena i redne brojeve.';
    numbers.add(person.number);
    if (!Array.isArray(person.shifts) || person.shifts.length !== days || person.shifts.some((code) => !['1','2','D','N','-'].includes(code))) return 'Proveri sve dnevne smene.';
  }
  return '';
}
