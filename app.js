const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzqMb4D1XPrWO6egLnEpkpHT6EW2B608XVnPD-qCtvJmYhvgu04q7b1ItwdNMrkejfBsw/exec";

let matches = [];
let matchdays = [];
let submitting = false;

const arNames = {
  "South Africa":"جنوب أفريقيا","Canada":"كندا","Brazil":"البرازيل","Japan":"اليابان","Germany":"ألمانيا","Paraguay":"باراغواي",
  "Netherlands":"هولندا","Morocco":"المغرب","Ivory Coast":"ساحل العاج","Norway":"النرويج","France":"فرنسا","Sweden":"السويد",
  "Mexico":"المكسيك","Ecuador":"الإكوادور","England":"إنجلترا","DR Congo":"الكونغو الديمقراطية","Belgium":"بلجيكا","Senegal":"السنغال",
  "United States":"أمريكا","Bosnia and Herzegovina":"البوسنة والهرسك","Spain":"إسبانيا","Austria":"النمسا","Portugal":"البرتغال",
  "Croatia":"كرواتيا","Switzerland":"سويسرا","Algeria":"الجزائر","Egypt":"مصر","Australia":"أستراليا",
  "Argentina":"الأرجنتين","Cape Verde":"الرأس الأخضر","Colombia":"كولومبيا","Ghana":"غانا"
};

const flags = {
  "South Africa":"🇿🇦","Canada":"🇨🇦","Brazil":"🇧🇷","Japan":"🇯🇵","Germany":"🇩🇪","Paraguay":"🇵🇾",
  "Netherlands":"🇳🇱","Morocco":"🇲🇦","Ivory Coast":"🇨🇮","Norway":"🇳🇴","France":"🇫🇷","Sweden":"🇸🇪",
  "Mexico":"🇲🇽","Ecuador":"🇪🇨","England":"🏴","DR Congo":"🇨🇩","Belgium":"🇧🇪","Senegal":"🇸🇳",
  "United States":"🇺🇸","Bosnia and Herzegovina":"🇧🇦","Spain":"🇪🇸","Austria":"🇦🇹","Portugal":"🇵🇹",
  "Croatia":"🇭🇷","Switzerland":"🇨🇭","Algeria":"🇩🇿","Egypt":"🇪🇬","Australia":"🇦🇺",
  "Argentina":"🇦🇷","Cape Verde":"🇨🇻","Colombia":"🇨🇴","Ghana":"🇬🇭"
};

const reasonNames = {
  "Exact 90-minute score":"النتيجة الصحيحة في الوقت الأصلي",
  "Correct 90-minute outcome":"توقع الفائز أو التعادل صحيح",
  "Team 1 goals correct":"أهداف الفريق الأول صحيحة",
  "Team 2 goals correct":"أهداف الفريق الثاني صحيحة",
  "Qualified team correct":"الفريق المتأهل صحيح",
  "Qualification method correct":"طريقة التأهل صحيحة",
  "Wrong prediction":"توقع غير صحيح",
  "Trial mode - points are not counted":"تجريبي — لا تُحتسب النقاط"
};

function teamName(team){ const t = String(team || "").trim(); return arNames[t] || t || "-"; }
function flagOf(team){ return flags[String(team || "").trim()] || "🏳️"; }
function translateReason(reason){ let txt = String(reason || ""); Object.keys(reasonNames).forEach(k => txt = txt.replaceAll(k, reasonNames[k])); return txt || ""; }
function translateMatch(txt){ txt = String(txt || ""); Object.keys(arNames).forEach(en => txt = txt.replaceAll(en, arNames[en])); return txt.replaceAll(" vs ", " × "); }
function showToast(message){ const t=document.getElementById("toast"); t.textContent=message; t.style.display="block"; setTimeout(()=>t.style.display="none",3500); }

/* FIXED TIME SYSTEM:
   Do not parse Google Sheets time as local timezone.
   Build UTC date manually from date + time strings.
*/
function normalizeTime(time){
  const parts = String(time || "00:00").split(":");
  const h = String(parseInt(parts[0] || "0", 10)).padStart(2, "0");
  const m = String(parseInt(parts[1] || "0", 10)).padStart(2, "0");
  return h + ":" + m;
}

function toDateGMT(m){
  const date = String(m.date || "").trim();
  const time = normalizeTime(m.time || "00:00");
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, 0));
}

function displayGMT(m){
  return String(m.date || "") + " · " + normalizeTime(m.time || "") + " GMT";
}

function formatLocal(m, zone){
  return toDateGMT(m).toLocaleString("ar-AE", {
    timeZone: zone,
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function isClosed(m){
  if(m.closed === true) return true;
  const close = new Date(toDateGMT(m).getTime() - 60*60*1000);
  return Date.now() >= close.getTime();
}

function countdownText(m){
  const start = toDateGMT(m);
  const close = new Date(start.getTime() - 60*60*1000);
  const now = new Date();

  if(now >= start) return "🔴 بدأت المباراة";
  if(now >= close) return "🔒 مغلق";

  const diff = close - now;
  const h = Math.floor(diff / 3600000);
  const mn = Math.floor((diff % 3600000) / 60000);
  return "⏳ " + h + "س " + mn + "د";
}

async function loadSettings(){
  try{
    const r = await fetch(GOOGLE_SCRIPT_URL + "?action=settings&v=" + Date.now());
    const s = await r.json();
    document.getElementById("modeChip").textContent = s.trialMode ? "⚠️ وضع تجريبي" : "🟢 النقاط مفعّلة";
  }catch(e){ console.log(e); }
}

async function loadMatchdays(){
  try{
    const r = await fetch(GOOGLE_SCRIPT_URL + "?action=matchdays&v=" + Date.now());
    matchdays = await r.json();
    renderMatchdayBar();
  }catch(e){ console.log(e); }
}

function renderMatchdayBar(){
  const bar = document.getElementById("matchdayBar");
  if(!matchdays || matchdays.length === 0){ bar.innerHTML = ""; return; }

  const active = matches[0] ? matches[0].matchday : "";
  bar.innerHTML = "";

  matchdays.forEach(md => {
    const div = document.createElement("div");
    div.className = "matchday-pill" + (md.matchday === active ? " active" : "");
    div.textContent = md.matchday + " · " + (md.count || 0) + " مباريات";
    div.onclick = () => showToast("يمكن تغيير الجولة من Google Sheets: Settings → ACTIVE_MATCHDAY");
    bar.appendChild(div);
  });
}

async function loadMatches(){
  const box = document.getElementById("matches");
  box.innerHTML = "جاري تحميل المباريات...";
  try{
    const r = await fetch(GOOGLE_SCRIPT_URL + "?v=" + Date.now());
    matches = await r.json();
    renderMatches();
    renderMatchdayBar();
  }catch(e){
    box.innerHTML = "❌ فشل تحميل المباريات. تأكد من رابط Apps Script ومن النشر Web App.";
  }
}

function renderMatches(){
  const box = document.getElementById("matches");
  if(!matches || matches.length === 0){ box.innerHTML = "لا توجد مباريات في هذه الجولة."; return; }

  box.innerHTML = "";

  matches.forEach((m,i) => {
    const closed = isClosed(m);

    box.innerHTML += `
      <article class="match-card">
        <div class="match-top">
          <span>${m.matchday} · ${m.stage || ""}</span>
          <span>${m.id}</span>
        </div>

        <div class="teams">
          <div class="team">
            <span class="flag">${flagOf(m.home)}</span>
            <div class="name">${teamName(m.home)}</div>
          </div>

          <div class="vs">VS</div>

          <div class="team">
            <span class="flag">${flagOf(m.away)}</span>
            <div class="name">${teamName(m.away)}</div>
          </div>
        </div>

        <div class="time-box">
          <b>${displayGMT(m)}</b><br>
          توقيت الإمارات: ${formatLocal(m,"Asia/Dubai")}<br>
          توقيت السعودية: ${formatLocal(m,"Asia/Riyadh")}<br>
          <span class="${closed ? "closed" : "open"}">${countdownText(m)}</span>
        </div>

        ${closed ? `<div class="closed">🔒 التوقع مغلق</div>` : `
          <div class="score-grid">
            <input type="number" min="0" max="30" id="home_${i}" placeholder="أهداف ${teamName(m.home)}">
            <div class="sep">-</div>
            <input type="number" min="0" max="30" id="away_${i}" placeholder="أهداف ${teamName(m.away)}">
          </div>

          <div class="ko-box">
            <div class="ko-title">🏆 توقع خروج المغلوب</div>
            <div class="form-grid">
              <select id="qualified_${i}">
                <option value="">اختر الفريق المتأهل</option>
                <option value="${m.home}">${teamName(m.home)}</option>
                <option value="${m.away}">${teamName(m.away)}</option>
              </select>

              <select id="method_${i}">
                <option value="">اختر طريقة التأهل</option>
                <option value="90">الوقت الأصلي</option>
                <option value="120">الوقت الإضافي</option>
                <option value="PEN">ركلات الترجيح</option>
              </select>
            </div>
          </div>
        `}
      </article>
    `;
  });
}

document.getElementById("predictionForm").addEventListener("submit", async function(e){
  e.preventDefault();
  if(submitting) return;

  const playerName = document.getElementById("playerName").value.trim();
  const whatsapp = document.getElementById("whatsapp").value.trim();
  const btn = document.getElementById("submitBtn");

  if(!playerName){ showToast("اكتب اسمك أولاً."); return; }

  const predictions = [];

  for(let i=0;i<matches.length;i++){
    const m = matches[i];
    if(isClosed(m)) continue;

    const home = document.getElementById("home_" + i);
    const away = document.getElementById("away_" + i);
    const qualified = document.getElementById("qualified_" + i);
    const method = document.getElementById("method_" + i);

    if(!home || !away || !qualified || !method) continue;

    if(home.value === "" || away.value === "" || qualified.value === "" || method.value === ""){
      showToast("أكمل النتيجة والفريق المتأهل وطريقة التأهل لكل مباراة مفتوحة.");
      return;
    }

    predictions.push({
      id:m.id,
      homeGoals:home.value,
      awayGoals:away.value,
      qualified:qualified.value,
      method:method.value
    });
  }

  if(predictions.length === 0){ showToast("لا توجد مباريات مفتوحة للتوقع."); return; }

  submitting = true;
  btn.disabled = true;
  btn.textContent = "جاري الإرسال...";

  try{
    await fetch(GOOGLE_SCRIPT_URL, {
      method:"POST",
      mode:"no-cors",
      body:JSON.stringify({playerName, whatsapp, predictions})
    });

    showToast("✅ تم إرسال التوقع بنجاح.");
    this.reset();
    setTimeout(() => { loadStats(); loadLeaderboard(); loadPredictions(); }, 1500);
  }catch(err){
    showToast("❌ فشل إرسال التوقع.");
  }finally{
    submitting = false;
    btn.disabled = false;
    btn.textContent = "إرسال التوقع";
  }
});

async function loadLeaderboard(){
  try{
    const r = await fetch(GOOGLE_SCRIPT_URL + "?action=leaderboard&v=" + Date.now());
    const data = await r.json();
    const body = document.getElementById("leaderboardBody");
    body.innerHTML = "";

    if(!data || data.length === 0){
      body.innerHTML = `<tr><td colspan="3">سيظهر الترتيب بعد إدخال النتائج</td></tr>`;
      return;
    }

    data.slice(0,20).forEach((p,i) => {
      const medal = i===0 ? "🥇" : i===1 ? "🥈" : i===2 ? "🥉" : p.rank;
      body.innerHTML += `<tr><td>${medal}</td><td>${p.name || "-"}</td><td>${p.points || 0}</td></tr>`;
    });
  }catch(e){ console.log(e); }
}

async function loadResults(){
  try{
    const r = await fetch(GOOGLE_SCRIPT_URL + "?action=results&v=" + Date.now());
    const data = await r.json();
    const body = document.getElementById("resultsBody");
    body.innerHTML = "";

    if(!data || data.length === 0){
      body.innerHTML = `<tr><td colspan="4">لا توجد نتائج بعد</td></tr>`;
      return;
    }

    data.slice(0,30).forEach(item => {
      body.innerHTML += `
        <tr>
          <td>${translateMatch(item.match || item.id)}</td>
          <td>${item.result || "-"}</td>
          <td>${teamName(item.qualified)}</td>
          <td>${item.status || "-"}</td>
        </tr>
      `;
    });
  }catch(e){ console.log(e); }
}

async function loadPredictions(){
  try{
    const r = await fetch(GOOGLE_SCRIPT_URL + "?action=predictions&v=" + Date.now());
    const data = await r.json();
    const body = document.getElementById("predictionsBody");
    body.innerHTML = "";

    if(!data || data.length === 0){
      body.innerHTML = `<tr><td colspan="6">لا توجد توقعات بعد</td></tr>`;
      return;
    }

    data.slice(0,50).forEach(item => {
      body.innerHTML += `
        <tr>
          <td>${item.name || "-"}</td>
          <td>${item.matchday || "-"}</td>
          <td>${translateMatch(item.match || "-")}</td>
          <td>${item.prediction || "-"}</td>
          <td>${teamName(item.qualified)}</td>
          <td><b>${item.points || 0}</b><br><small>${translateReason(item.reason || "")}</small></td>
        </tr>
      `;
    });
  }catch(e){ console.log(e); }
}

async function loadStats(){
  try{
    const r = await fetch(GOOGLE_SCRIPT_URL + "?action=stats&v=" + Date.now());
    const data = await r.json();
    document.getElementById("playersCount").textContent = data.playersCount || 0;
    document.getElementById("predictionsCount").textContent = data.predictionsCount || 0;
  }catch(e){ console.log(e); }
}

loadSettings();
loadMatches();
loadMatchdays();
loadLeaderboard();
loadResults();
loadPredictions();
loadStats();

setInterval(renderMatches,60000);
setInterval(loadLeaderboard,60000);
setInterval(loadResults,60000);
setInterval(loadPredictions,60000);
setInterval(loadStats,60000);
