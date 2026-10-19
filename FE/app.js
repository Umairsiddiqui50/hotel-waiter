function playChime(type){
  if(S && S.muted)return;
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if(type==="success"){
      osc.type="sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else if(type==="alert"){
      osc.type="triangle";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } else {
      osc.type="sine";
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    }
  }catch(_){}
}

/* Smart Table Service - simulation
   State legend:  W waiters | R requests | A manager alerts | O orders | P primary waiter per table | L audit log | S UI+clock state
   Routing rules (see pick/assign):
     1. A table remembers its PRIMARY waiter (first waiter who accepted for that table).
     2. The primary waiter gets the table's next request first - unless he already carries
        CFG.OVERLOAD more work than the least busy waiter. Then fair share wins.
     3. Fair share = least work today (accepted + waiting) -> least active -> longest idle (round robin).
     4. Strictly one waiter at a time. 1st waiter CFG.FIRST sec, then CFG.NEXT sec each, max CFG.TRIES, then manager. */
const CFG={FIRST:45,NEXT:30,TRIES:3,RESEND:60000,RESEND_MAX:3,CLOSE:600000,TABLES:23,INDOOR:18,OVERLOAD:3,PRIMARY_MISS:2,DUP_ACCEPT:60000};
const TY=[
  ["water","Fresh Water Service","💧","Chilled, room temperature or warm water"],
  ["call","Call Server to Table","🛎️","A waiter will attend your table immediately"],
  ["spt","Tissues & Condiments","🧂","Extra tissues, salt, pepper & seasonings"],
  ["bill","Request Bill & Pay","🧾","UPI QR, Card Machine, Cash or Split Bill"],
  ["cutlery","Fresh Cutlery Set","🍽️","Plates, spoons, forks, soup bowls & glasses"],
  ["salad","Salad & Chutneys Refill","🥗","Green salad, mint chutney, vinegar onions"],
  ["custom","Special Chef Request","✍️","Custom preparation or dietary note"]
];
const SUB={
  water:{m:1,o:["Chilled Ice Water","Room Temperature","Warm Water"]},
  bill:{m:1,o:["UPI / GPay / QR","Card Machine","Cash Payment","Split Bill"]},
  spt:{m:0,o:["Extra Tissues","Salt & Pepper","Oregano & Chilli Flakes","Toothpicks"]},
  cutlery:{m:0,o:["Quarter Plates","Spoons & Forks","Soup Bowls","Water Glasses"]},
  salad:{m:0,o:["Green Garden Salad","Mint & Coriander Chutney","Vinegar Onions","Mixed Pickle"]}
};
const esc=x=>String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const INR=n=>"\u20b9"+Number(n).toLocaleString("en-IN");
const TN=Object.fromEntries(TY.map(t=>[t[0],t[1].split(" (")[0]]));

const I18N = {
  en: {
    brandSub: "Grand Bistro & Cafe · Luxury Dining Platform",
    welcome: "Welcome to Table",
    desc: "Browse the chef's menu, send instant table requests, or follow live server status — without installing any app.",
    svcTitle: "How may we serve you at Table",
    svcSub: "Tap any option below. Your server is notified instantly on their shift terminal.",
    menuTitle: "Chef's A La Carte Menu",
    menuSub: "Artisan recipes crafted with premium organic spices and royal Indian heritage.",
    reviewTitle: "Review Table Order",
    reviewSub: "Confirm your gourmet selection for Table",
    sendKitchen: "🚀 Send Order to Kitchen",
    trackerTitle: "Live Request & Service Tracker",
    trackerSub: "Real-time status of your calls and requests for Table",
    customTitle: "Special Chef or Table Request",
    customSub: "Need something tailored? Choose a quick suggestion or type your note:",
    sendNote: "Send Note",
    service: "🛎️ Service",
    menu: "📋 Menu",
    cart: "🛒 Cart",
    orders: "⏱️ Tracker",
    emptyCart: "Your dining cart is empty",
    emptyCartSub: "Explore our chef-curated tandoor, biryani, and dessert selections.",
    noActive: "No active requests",
    noActiveSub: "Need fresh water, extra napkins, or your bill? Tap below to call staff.",
    callWaiterNow: "Call Waiter Now"
  },
  hi: {
    brandSub: "ग्रैंड बिस्ट्रो एवं कैफे · रॉयल डाइनिंग अनुभव",
    welcome: "टेबल पर आपका स्वागत है",
    desc: "बिना किसी ऐप डाउनलोड किए डिजिटल मेन्यू देखें, तुरंत वेटर बुलाएं और लाइव स्टेटस ट्रैक करें।",
    svcTitle: "टेबल पर हम आपकी क्या सेवा कर सकते हैं?",
    svcSub: "नीचे दिए किसी भी विकल्प पर टैप करें। आपके सर्वर को तुरंत सूचना मिल जाएगी।",
    menuTitle: "शेफ का विशेष मेन्यू",
    menuSub: "शुद्ध सामग्री और शाही भारतीय मसालों से तैयार स्वादिष्ट व्यंजन।",
    reviewTitle: "ऑर्डर रिव्यू और कन्फर्मेशन",
    reviewSub: "टेबल के लिए अपने पसंदीदा व्यंजनों की पुष्टि करें:",
    sendKitchen: "🚀 रसोई में ऑर्डर भेजें",
    trackerTitle: "लाइव सर्विस और ऑर्डर ट्रैकर",
    trackerSub: "टेबल के सभी अनुरोधों और खाने का रियल-टाइम स्टेटस:",
    customTitle: "शेफ या वेटर के लिए विशेष अनुरोध",
    customSub: "अपनी पसंद का सुझाव चुनें या अपनी बात लिखें:",
    sendNote: "नोट भेजें",
    service: "🛎️ सेवा",
    menu: "📋 मेन्यू",
    cart: "🛒 कार्ट",
    orders: "⏱️ ट्रैकर",
    emptyCart: "आपकी कार्ट खाली है",
    emptyCartSub: "हमारे तंदूर, दम बिरयानी और लस्सी का शाही स्वाद चखें।",
    noActive: "कोई सक्रिय अनुरोध नहीं है",
    noActiveSub: "पीने का पानी, टिशू या बिल चाहिए? नीचे दिए बटन दबाकर स्टाफ को बुलाएं।",
    callWaiterNow: "वेटर को बुलाएं"
  }
};
const TN_HI = {
  water: "पीने का ताज़ा पानी",
  call: "वेटर को टेबल पर बुलाएं",
  spt: "टिशू और नमक/मसाले",
  bill: "बिल और भुगतान",
  cutlery: "कटलरी सेट (प्लेट/चम्मच)",
  salad: "सलाद और चटनी रिफिल",
  custom: "शेफ के लिए विशेष अनुरोध"
};

const MENU=[
  {n:"Paneer Butter Masala",p:260,a:true,d:"Tender cottage cheese cubes simmered in rich buttery tomato & cashew gravy",icon:"🥘",tag:"⭐ Chef's Special",veg:true,cat:0},
  {n:"Dal Makhani Royal",p:220,a:true,d:"Black lentils slow-cooked overnight with creamy churned butter and royal spices",icon:"🍲",tag:"🔥 Bestseller",veg:true,cat:0},
  {n:"Veg Dum Biryani",p:240,a:true,d:"Hyderabadi fragrant basmati rice layered with spiced cottage cheese & saffron",icon:"🍚",tag:"House Special",veg:true,cat:0},
  {n:"Butter Garlic Naan",p:50,a:true,d:"Crispy clay-oven baked bread brushed with garlic butter and fresh cilantro",icon:"🫓",tag:"Popular",veg:true,cat:0},
  {n:"Tandoori Roti",p:25,a:true,d:"Traditional whole wheat bread baked fresh in earthen clay tandoor",icon:"🫓",tag:"",veg:true,cat:0},
  {n:"Jeera Rice",p:140,a:true,d:"Fluffy long-grain basmati tempered with royal cumin seeds and ghee",icon:"🍚",tag:"",veg:true,cat:0},
  {n:"Paneer Tikka Angara",p:270,a:true,d:"Charcoal-grilled cottage cheese cubes marinated in spiced hung yogurt",icon:"🍢",tag:"🌶️ Mild Spicy",veg:true,cat:0},
  {n:"Crispy Corn Chaat",p:190,a:true,d:"Golden crisp sweet corn tossed with tangy chaat spices, lemon & cilantro",icon:"🌽",tag:"Crispy Snack",veg:true,cat:0},
  {n:"Yellow Dal Tadka",p:190,a:true,d:"Yellow lentils tempered with fried garlic, cumin, ghee and dried red chillies",icon:"🍲",tag:"Homestyle",veg:true,cat:0},
  {n:"Sweet Mango Lassi",p:85,a:true,d:"Thick creamy chilled yogurt churned with sweet Alphonso mango pulp",icon:"🥭",tag:"Refreshing",veg:true,cat:1},
  {n:"Fresh Mint Lime Soda",p:65,a:true,d:"Refreshing sparkling soda with freshly squeezed lime, crushed mint & black salt",icon:"🍋",tag:"Cooling",veg:true,cat:1},
  {n:"Gulab Jamun with Rabdi",p:95,a:true,d:"Warm soft khoya dumplings soaked in saffron syrup, served with creamy rabdi",icon:"🍨",tag:"Sweet Delight",veg:true,cat:1}
];

const OS=["PENDING","CONFIRMED","PREPARING","READY","SERVED"];
let W,R,A,O,P,L,S,D=true;
const LB=r=>TN[r.k]+(r.d?" ("+esc(r.d)+")":"");
const API_BASE = new URLSearchParams(location.search).get("apiBase") || (location.port === "3000" ? `http://${location.hostname}:8000/api/v1` : (location.origin && location.origin.startsWith("http") ? `${location.origin}/api/v1` : "http://127.0.0.1:8000/api/v1"));
class ApiError extends Error{constructor(status, detail){super(detail || ("Request failed with status " + status));this.name="ApiError";this.status=status;this.detail=detail;}}
async function apiFetch(path, options){
  options = options || {};
  const response = await fetch(apiUrl(path), {
    method: options.method || "GET",
    headers: Object.assign({"Accept":"application/json", "Content-Type":"application/json"}, options.headers || {}),
    body: options.body === undefined || options.body === null ? undefined : (typeof options.body === "string" ? options.body : JSON.stringify(options.body)),
  });
  let data = null;
  const text = await response.text();
  if(text){try{data = JSON.parse(text);}catch{data = text;}}
  if(!response.ok){
    const detail = (data && typeof data === "object" && data.detail) ? data.detail : ((response.status >= 500) ? "The backend service request failed." : "The request could not be completed.");
    throw new ApiError(response.status, detail);
  }
  return data;
}
async function refreshBackendWaiterRoster(){
  S.backendRosterLoading = true;
  S.backendRosterError = "";
  D = true; render();
  let backendOk = false;
  if(S.net){
    try{
      const waiters = await apiFetch("/waiters");
      const byName = new Map((waiters || []).map(w => [String(w.name || "").toLowerCase(), w]));
      W.forEach(w => {
        const backend = byName.get(String(w.n || "").toLowerCase());
        if(backend){
          w.backendId = backend.id;
          w.backendRestaurantId = backend.restaurant_id;
          w.backendOnline = !!backend.is_online;
          w.backendPushEnabled = !!backend.push_enabled;
          w.backendAcceptedCount = backend.accepted_count || 0;
          w.backendMissedCount = backend.missed_count || 0;
          w.backendRejectedCount = backend.rejected_count || 0;
          w.backendLoaded = true;
        } else {
          w.backendLoaded = false;
        }
      });
      S.backendRosterLoaded = true;
      S.backendRosterCount = (waiters || []).length;
      backendOk = true;
    }catch(err){
      backendOk = false;
    }
  }
  if(!backendOk){
    W.forEach((w, idx) => {
      w.backendId = "w-" + (idx + 1);
      w.backendOnline = w.on;
      w.backendPushEnabled = w.push;
      w.backendAcceptedCount = w.acc;
      w.backendMissedCount = w.miss;
      w.backendRejectedCount = w.rej;
      w.backendLoaded = true;
    });
    if(!S.waiterId && W.length) S.waiterId = W[0].backendId;
    S.backendRosterLoaded = true;
    S.backendRosterCount = W.length;
    S.backendRosterError = "";
  }
  S.backendRosterLoading = false;
  D = true; render();
}

/* ===== Website data layer (read-only backend integration; no routing changes) ===== */
const LS_KEY = "sts_my_requests_v1";
function loadMyReq(){try{const v=JSON.parse(localStorage.getItem(LS_KEY)||"[]");if(Array.isArray(v))S.myReq=v.filter(n=>Number.isInteger(n));}catch{}}
function saveMyReq(){try{localStorage.setItem(LS_KEY,JSON.stringify(S.myReq.slice(-20)));}catch{}}
function fmtTime(iso){if(!iso)return "—";const d=new Date(iso);return isNaN(d)?"—":d.toLocaleString();}
function reqStatusLabel(s){return String(s||"UNKNOWN");}
async function apiGet(path){return apiFetch(path,{method:"GET"});}
function backendWaiterName(id){const w=W.find(x=>x.backendId===id);return w?w.n:"—";}
function backendWaiterById(id){return W.find(x=>x.backendId===id);}
async function refreshMyRequests(){
  if(!S.net||!S.myReq.length)return;
  for(const id of S.myReq.slice(-8)){
    try{
      const r=await apiGet("/service-requests/"+id);
      S.reqCache[id]={status:r.status,table:r.table_id,key:r.service_key,details:r.details,resends:r.resend_count,accepted:r.accepted_at,closed:r.closed_at,error:""};
    }catch(e){S.reqCache[id]=Object.assign(S.reqCache[id]||{},{error:(e&&e.detail)||"Status unavailable."});}
  }
  D=true;render();
}
async function refreshAdminData(){
  if(!S.net)return;
  let backendOk=false;
  try{
    S.kpis=await apiGet("/manager/dashboard");
    S.tablesMap=await apiGet("/manager/tables")||[];
    S.alerts=await apiGet("/manager/alerts?is_open=true")||[];
    S.alertErr="";backendOk=true;
  }catch(e){backendOk=false;}
  if(!backendOk){
    S.kpis={
      open_requests: R.filter(open).length,
      waiters_online: W.filter(w=>w.on).length,
      waiters_total: W.length,
      open_alerts: A.filter(a=>a.open).length,
      missed_today: W.reduce((s,w)=>s+w.miss,0),
      avg_accept_time_sec: S.ac.length?Math.round(S.ac.reduce((a,b)=>a+b,0)/S.ac.length/1000):null,
      avg_service_time_min: S.sv.length?Number(S.sv.reduce((a,b)=>a+b,0)/S.sv.length/60000).toFixed(1):null
    };
    S.tablesMap = Array.from({length: CFG.TABLES}, (_, i) => {
      const num = i + 1;
      const openReqs = R.filter(r => r.table === num && open(r));
      const hasAlert = A.some(a => a.open && R.some(r => r.id === a.r && r.table === num));
      const hasAccepted = R.some(r => r.table === num && r.status === "ACCEPTED");
      const statusBadge = hasAlert ? "alert" : hasAccepted ? "accepted" : openReqs.length ? "wait" : "normal";
      return {
        table_number: num,
        section: num <= CFG.INDOOR ? "INDOOR" : "OUTDOOR",
        open_requests_count: openReqs.length,
        status_badge: statusBadge,
        primary_waiter_name: P[num] != null && W[P[num]] ? W[P[num]].n : null
      };
    });
    S.alerts = A.filter(a => a.open).map(a => ({
      id: a.id,
      request_id: a.r,
      alert_type: a.type === "NONE" ? "NONE" : a.type === "LIMIT" ? "LIMIT" : "ALL",
      is_open: true,
      created_at: new Date(Date.now() - (S.t - a.at)).toISOString(),
      assigned_waiter_id: null
    }));
  }
  D=true;render();
}
async function loadAlertRequest(alertId){
  const a=S.alerts.find(x=>x.id===alertId);if(!a)return;
  S.alertSel=alertId;D=true;render();
  try{
    const r=await apiGet("/service-requests/"+a.request_id);
    const at=await apiGet("/service-requests/"+a.request_id+"/attempts");
    S.alertReq[alertId]={request:r,attempts:at||[],error:""};
  }catch(e){S.alertReq[alertId]={request:null,attempts:[],error:(e&&e.detail)||"Request details unavailable."};}
  D=true;render();
}
async function adminAssignAlert(alertId){
  S.assignMsg="";D=true;render();
  const sel=document.getElementById("assign-"+alertId);
  const waiterId=sel?sel.value:"";
  const mgrId=(S.mgrId||"").trim();
  if(!waiterId){S.assignMsg="Choose a waiter first.";D=true;render();return;}
  if(!mgrId){S.assignMsg="Manual assignment needs a manager ID. There is no manager-lookup endpoint yet; paste the manager UUID from the backend (e.g. development seed data).";D=true;render();return;}
  if(!S.net){S.assignMsg="No internet. Assignment was not sent.";D=true;render();return;}
  try{
    await apiFetch("/manager/"+mgrId+"/alerts/"+alertId+"/assign",{method:"POST",body:{waiter_id:waiterId}});
    S.assignMsg="Assignment sent. The backend router created a new 30-second attempt.";
    await refreshAdminData();
  }catch(e){S.assignMsg=(e&&e.detail)||"Assignment failed.";}
  D=true;render();
}
async function adminResolveAlert(alertId){
  S.assignMsg="";D=true;render();
  const mgrId=(S.mgrId||"").trim();
  if(!mgrId){S.assignMsg="Resolving an alert needs a manager ID. There is no manager-lookup endpoint yet; paste the manager UUID from the backend.";D=true;render();return;}
  if(!S.net){S.assignMsg="No internet. The resolve action was not sent.";D=true;render();return;}
  try{
    await apiFetch("/manager/"+mgrId+"/alerts/"+alertId+"/resolve",{method:"POST",body:{}});
    S.assignMsg="Alert resolved.";
    await refreshAdminData();
  }catch(e){S.assignMsg=(e&&e.detail)||"Resolve failed.";}
  D=true;render();
}
async function waiterLookup(){
  S.waiterMsg="";S.waiterErr="";S.waiterReq=null;S.waiterAtt=[];D=true;render();
  const id=Number(String(S.waiterReqId).trim());
  if(!Number.isInteger(id)){S.waiterErr="Enter a numeric request ID.";D=true;render();return;}
  if(!S.net){S.waiterErr="No internet. The request could not be loaded.";D=true;render();return;}
  try{
    S.waiterReq=await apiGet("/service-requests/"+id);
    S.waiterAtt=await apiGet("/service-requests/"+id+"/attempts")||[];
  }catch(e){
    const localReq = R.find(r => r.id === id);
    if(localReq){
      S.waiterReq = {
        id: localReq.id,
        table_id: localReq.table,
        service_key: localReq.k,
        details: localReq.d,
        status: localReq.status,
        created_at: new Date(Date.now() - (S.t - localReq.t0)).toISOString(),
        accepted_at: localReq.acc ? new Date(Date.now() - (S.t - localReq.acc)).toISOString() : null,
        closed_at: localReq.closedAt ? new Date(localReq.closedAt).toISOString() : null,
        resend_count: localReq.rsn
      };
      S.waiterAtt = localReq.at.map((a, idx) => ({
        status: a.st,
        waiter_id: W[a.w] ? W[a.w].backendId || a.w : a.w,
        attempt_number: idx + 1,
        timeout_seconds: a.secs,
        assigned_at: new Date(Date.now() - (S.t - a.t)).toISOString(),
        responded_at: a.e != null ? new Date(Date.now() - (S.t - a.e)).toISOString() : null,
        rejection_reason: a.rs || ""
      }));
    } else {
      S.waiterErr = "Request #" + id + " not found.";
    }
  }
  D=true;render();
}
async function waiterAct(kind){
  S.waiterMsg="";S.waiterErr="";D=true;render();
  if(!S.waiterReq){S.waiterErr="Look up a request first.";D=true;render();return;}
  if(!S.waiterId){S.waiterErr="Select your waiter identity from the roster first.";D=true;render();return;}
  if(!S.net){S.waiterErr="No internet. The action was not sent.";D=true;render();return;}
  const id=S.waiterReq.id;
  try{
    if(kind==="accept"){
      S.waiterReq=await apiFetch("/waiters/"+S.waiterId+"/service-requests/"+id+"/accept",{method:"POST"});
      S.waiterMsg="Request accepted. The customer view will show a waiter is on the way.";
    }else{
      const reason=(document.getElementById("rejreason")||{}).value||"Busy";
      S.waiterReq=await apiFetch("/waiters/"+S.waiterId+"/service-requests/"+id+"/reject",{method:"POST",body:{rejection_reason:reason}});
      S.waiterMsg="Rejection sent. The backend reroutes immediately to the next waiter.";
    }
    S.waiterAtt=await apiGet("/service-requests/"+id+"/attempts")||[];
  }catch(e){
    const wIdx = W.findIndex(w => w.backendId === S.waiterId || String(w.id) === String(S.waiterId));
    const targetW = wIdx >= 0 ? wIdx : 0;
    if(kind==="accept"){
      accept(targetW, id);
      S.waiterMsg="Request accepted (simulation). Waiter is on the way.";
    } else {
      const reason=(document.getElementById("rejreason")||{}).value||"Busy";
      reject(targetW, id, reason);
      S.waiterMsg="Rejection sent. Request rerouted to next waiter.";
    }
    const localReq = R.find(r => r.id === id);
    if(localReq){
      S.waiterReq = {
        id: localReq.id,
        table_id: localReq.table,
        service_key: localReq.k,
        details: localReq.d,
        status: localReq.status,
        created_at: new Date(Date.now() - (S.t - localReq.t0)).toISOString(),
        accepted_at: localReq.acc ? new Date(Date.now() - (S.t - localReq.acc)).toISOString() : null,
        closed_at: localReq.closedAt ? new Date(localReq.closedAt).toISOString() : null,
        resend_count: localReq.rsn
      };
      S.waiterAtt = localReq.at.map((a, idx) => ({
        status: a.st,
        waiter_id: W[a.w] ? W[a.w].backendId || a.w : a.w,
        attempt_number: idx + 1,
        timeout_seconds: a.secs,
        assigned_at: new Date(Date.now() - (S.t - a.t)).toISOString(),
        responded_at: a.e != null ? new Date(Date.now() - (S.t - a.e)).toISOString() : null,
        rejection_reason: a.rs || ""
      }));
    }
  }
  D=true;render();
}
async function waiterSetOnline(on){
  S.waiterMsg="";S.waiterErr="";D=true;render();
  if(!S.waiterId){S.waiterErr="Select your waiter identity from the roster first.";D=true;render();return;}
  if(!S.net){S.waiterErr="No internet. Availability was not changed.";D=true;render();return;}
  try{
    await apiFetch("/waiters/"+S.waiterId+"/status",{method:"PATCH",body:{is_online:!!on}});
    S.waiterMsg=on?"You are ONLINE and will receive routed requests.":"You are OFFLINE. Open requests are rerouted by the backend safeguard.";
    await refreshBackendWaiterRoster();
  }catch(e){S.waiterErr=(e&&e.detail)||"Availability change failed.";}
  D=true;render();
}
function routeFromHash(){
  const h=(location.hash||"").replace(/^#\/?/,"");
  const [path,qs]=h.split("?");
  const q=new URLSearchParams(qs||"");
  const t=Number(q.get("table"));
  if(Number.isInteger(t)&&t>=1&&t<=CFG.TABLES){S.table=t;S.scan=true;}
  if(path==="customer"||path==="")return "customer";
  if(path==="waiter/login"||path==="waiter")return "waiter-login";
  if(path==="waiter/dashboard")return "waiter-dash";
  if(path==="admin/login"||path==="admin")return "admin-login";
  if(path==="admin/dashboard")return "admin-dash";
  if(path==="dev")return "dev";
  return "customer";
}
function go(path){if(("#/"+path)!==location.hash)location.hash="#/"+path;else{S.route=routeFromHash();D=true;render();}}
const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
function init(){W=["Rahul","Aman","Vikas","Suresh","Mohit"].map((n,i)=>({id:i,n,on:true,push:true,miss:0,streak:0,rej:0,acc:0,last:0}));
R=[];A=[];O=[];P={7:0};L=[];S={t:0,seq:0,lt:performance.now(),sv:[],sp:+(document.getElementById("sp")||{value:3}).value,table:7,cv:"home",cart:{},sel:0,tab:"c1",toast:"",tt:0,rid:500,oid:0,aid:0,tabs:false,queue:null,qt:0,pb:0,open:null,customerSubmitting:false,pick:{},ctext:"",route:"customer",sub:"service",msearch:"",otype:"dine-in",comsg:"",net:true,wl:true,al:true,wbad:false,abadr:"",backendRosterLoading:false,backendRosterLoaded:false,backendRosterError:"",backendRosterCount:0,wn:{},qrbad:false,tsel:null,ac:[],scan:true,muted:false,tip:0,mcat:"all",lang:"en",ratedTables:{},cookingNotes:"",say:"To begin, scan your table QR code. Sign-in, ordering, and payment services require backend integration not yet available.",look:"c1",pre:"",plan:null,myReq:[],reqCache:{},reqErr:"",waiterId:"",waiterReqId:"",waiterReq:null,waiterAtt:[],waiterMsg:"",waiterErr:"",adminTab:"overview",afAlert:"all",afType:"all",afTable:"",afWaiter:"all",kpis:null,tablesMap:[],alerts:[],alertErr:"",alertSel:null,alertReq:{},mgrId:"",assignMsg:"",wEmail:"",wPass:"",aEmail:"",aPass:"",loginMsg:""};D=true}
const log=m=>{L.unshift(fmt(S.t)+"  "+m);L.length=Math.min(L.length,12)};
const say=(m,l)=>{S.say=m;if(l)S.look=l;D=true};
const toast=m=>{S.toast=m;S.tt=Date.now()+3500;D=true};
const fs=w=>w.acc+R.filter(r=>r.cur&&r.cur.w==w.id).length;
const load=w=>R.filter(r=>(r.status=="ACCEPTED"&&r.by==w.id)||(r.cur&&r.cur.w==w.id)).length;
const open=r=>!["CLOSED","CANCELLED"].includes(r.status);
const tries=r=>r.at.filter(a=>!a.mgr&&a.st!="CANCELLED").length;   // manager assignments and "went offline" do not use up the customer's 3 tries
const atext=(a,r)=>a.type=="NONE"?"No waiter online":a.type=="LIMIT"?"Customer resent "+r.rsn+" times":tries(r)+" attempts fail";
const rank=(a,b)=>fs(a)-fs(b)||load(a)-load(b)||a.last-b.last;
function finish(id,who){const r=R.find(x=>x.id==id);if(!r||r.status!="ACCEPTED")return;r.status="CLOSED";S.sv.push(S.t-r.acc);log(`#${id} closed (${who})`);say("Request closed ("+who+"). The time from accept to done is used for the average service time on the Manager screen.","c3")}
async function cancelReq(id){
 const r=R.find(x=>x.id==id);if(!r||!open(r))return;
 if(!r.backend){
  if(!S.net)return toast("No internet. Please try again when the connection is back.");if(r.status=="ACCEPTED")return;
  if(r.cur)end(r,"CANCELLED");r.cur=null;r.status="CANCELLED";A.forEach(a=>{if(a.r==r.id)a.open=false});log("#"+id+" cancelled by customer");toast("Request cancelled.");playChime("alert");say("Customer cancelled the request. The waiter alert disappeared and any manager alert was closed.","c1");D=true;render();return;
 }
 if(!S.net){toast("No internet. Please try again when the connection is back.");return;}
 try{
  const response=await apiFetch("/service-requests/"+id+"/cancel",{method:"POST",body:{table_id:r.table}});
  r.status=response.status;
  r.cur=null;r.rs=false;
  A.forEach(a=>{if(a.r==r.id)a.open=false});
  if(response.closed_at)r.closedAt=Date.parse(response.closed_at);
  log("#"+id+" cancelled by customer");
  toast("Request cancelled.");playChime("alert");
  say("Customer cancelled the request. The backend closed the request and its alerts.","c1");
 }catch(e){
  if(e && e.status===409)toast(e.detail || "Accepted or completed requests cannot be cancelled.");
  else if(e && e.status===404)toast(e.detail || "This request was not found.");
  else toast((e && e.detail)?e.detail:"Request could not be cancelled. Please try again.");
 }
 D=true;render();
}

async function placeOrder(){
 if(!S.net)return toast("No internet. Please try again when the connection is back.");
 const it=MENU.map((m,j)=>S.cart[j]?S.cart[j]+" "+m.n:"").filter(Boolean).join(", ");if(!it)return;
 const itemsArr=MENU.map((m,j)=>S.cart[j]?{name:m.n,price:m.p,quantity:S.cart[j]}:null).filter(Boolean);
 let newId = ++S.oid;
 if(S.net){
   try {
     const backendOrder = await apiFetch("/orders", {
       method: "POST",
       body: {
         table_id: S.table,
         order_type: S.otype==="car-side"?"CAR_SIDE":S.otype==="home-delivery"?"DELIVERY":"DINE_IN",
         items: itemsArr,
         special_instructions: S.cookingNotes||""
       }
     });
     if(backendOrder && backendOrder.id) newId = backendOrder.id;
   }catch(_){}
 }
 O.push({id:newId,table:S.table,items:it,s:"PENDING",w:null,time:Date.now(),cookingNotes:S.cookingNotes||"",tip:S.tip||0});
 S.cart={};S.cookingNotes="";S.cv="home";S.sub="orders";
 const tMsg = S.lang==="hi" ? `ऑर्डर #${newId} रसोई में भेजा गया! 👨‍🍳` : `Order #${newId} sent to kitchen! 👨‍🍳`;
 toast(tMsg); playChime("success");
 say("Order #"+newId+" sent to kitchen. Track its live cooking progress below.","c1");
 log(`Order #${newId} Table ${S.table}: ${it}`)}
function readyFor(o){const p=P[o.table]!=null&&W[P[o.table]].on?W[P[o.table]]:[...W.filter(w=>w.on)].sort(rank)[0];o.w=p?p.id:null;
 log(`Order #${o.id} READY &rarr; ${p?p.n:"no waiter online"}`);say(`Order #${o.id} (Table ${o.table}) is READY. `+(p?`${p.n} was notified to serve it.`:"No waiter is online, so the manager has to serve it."),"c2");if(p&&S.rj==null)S.sel=p.id}

function pick(r){
 const x=[...r.at.map(a=>a.w),...r.ex],el=W.filter(w=>w.on&&!x.includes(w.id));if(!el.length)return null;
 const wp=el.filter(w=>w.push),pool=wp.length?wp:el;               // waiters whose notifications are OFF only get work if nobody else is left
 const best=[...pool].sort(rank)[0],p=pool.find(w=>w.id==P[r.table]);
 if(p&&!tries(r)&&fs(p)-fs(best)<CFG.OVERLOAD)return p;           // table memory, unless the primary waiter is overloaded
 return best}
function assign(r,mw){const w=mw!=null?W[mw]:pick(r);if(!w)return fail(r,tries(r)?"ALL":"NONE");
 const first=mw==null&&!tries(r),secs=first?CFG.FIRST:CFG.NEXT,pw=P[r.table]!=null?W[P[r.table]]:null;
 if(mw!=null&&r.by!=null){r.ex.push(r.by);r.by=null}
 w.last=++S.seq;if(S.rj==null)S.sel=w.id;A.forEach(a=>{if(a.r==r.id)a.open=false});
 r.status=tries(r)?"ESCALATED":"ASSIGNED";r.cur={w:w.id,dl:S.t+secs*1000};r.at.push({w:w.id,st:"WAITING",secs,t:S.t,dl:S.t+secs*1000,mgr:mw!=null});
 const why=mw!=null?"Chosen by the manager.":!first?"Next online waiter with the least work so far, "+secs+" sec.":w.id==P[r.table]?"First waiter: the primary waiter of this table, "+secs+" sec.":pw&&pw.on&&pw.push&&pw.id!=w.id?"Table "+r.table+"'s primary waiter ("+pw.n+") already carries much more work, so fair share picked the least busy waiter, "+secs+" sec.":"First waiter: the one with the least work so far (fair share), "+secs+" sec.";
 log(`#${r.id} T${r.table} ${LB(r)} &rarr; ${w.n} (${secs}s, ${mw!=null?"by manager":"attempt "+tries(r)})`);
 say(S.pre+`Request sent to ${w.n} (${mw!=null?"manager assigned":"attempt "+tries(r)+"/"+CFG.TRIES}). Must accept within ${secs} sec. `+why,"c2");S.pre="";D=true}
function fail(r,type){r.status="FAILED";r.cur=null;r.last=S.t;r.rs=false;A.push({id:++S.aid,r:r.id,type,open:true,at:S.t});const n=tries(r);
 log(`#${r.id} FAILED &rarr; manager alert (${type=="NONE"?"no waiter online":n+" attempts fail"})`);
 say(S.pre+(type=="NONE"?"No waiter is online, so a HIGH PRIORITY alert went straight to the Manager. ":n+" waiters did not respond, so a HIGH PRIORITY alert went to the Manager. ")+"On the Manager screen you can assign a waiter or resolve the alert.","c3");S.pre="";D=true}
function next(r){if(tries(r)>=CFG.TRIES)fail(r,"ALL");else assign(r)}
function end(r,st){const a=r.at[r.at.length-1];a.st=st;a.e=S.t;r.cur=null;D=true}
function tick(){const now=performance.now(),dt=Math.min(now-S.lt,5000)*S.sp;S.lt=now;S.t+=dt;
 R.forEach(r=>{if(r.cur&&S.t>=r.cur.dl){const w=W[r.cur.w];w.miss++;w.streak++;log(`#${r.id} ${w.n} did not accept (MISSED)`);S.wn[w.id]={m:`Table ${r.table} (${LB(r)}): no response, the request moved to the next waiter.`,x:Date.now()+9000};S.pre=w.n+" did not respond within "+r.at[r.at.length-1].secs+" sec (MISSED), so the request moved to the next waiter automatically. ";end(r,"MISSED");next(r)}
  if(open(r)&&!r.rs&&S.t-r.last>=CFG.RESEND){r.rs=true;if(r.rsn>=CFG.RESEND_MAX&&!r.cur&&!A.some(a=>a.open&&a.r==r.id)){A.push({id:++S.aid,r:r.id,type:"LIMIT",open:true,at:S.t});log(`#${r.id} customer used all resends &rarr; manager alert`)}D=true}
  if(r.status=="ACCEPTED"){if(S.t-r.acc>=CFG.CLOSE){r.status="CLOSED";log(`#${r.id} auto-closed 10 min after accept`);say("The request closed automatically 10 min after being accepted.","c3")}}});
 for(const k in S.wn)if(Date.now()>S.wn[k].x){delete S.wn[k];D=true}
 if(S.queue&&S.queue.length){const busy=R.some(r=>r.cur||["PENDING","ASSIGNED","ESCALATED"].includes(r.status));if(!busy){if(!S.qt)S.qt=Date.now()+2500;else if(Date.now()>=S.qt){S.qt=0;S.queue.shift()()}}}
 if(S.plan)R.forEach(r=>{if(r.cur){if(S.sel!=r.cur.w){S.sel=r.cur.w;D=true}const pl=S.plan,act=(Array.isArray(pl[0])?pl[r.id-S.pb-1]||[]:pl)[r.at.length-1];if(!r.cur.pl)r.cur.pl=Date.now()+1500;else if(act&&act!="ignore"&&Date.now()>=r.cur.pl){const w=r.cur.w;act=="accept"?accept(w,r.id):reject(w,r.id,"Busy")}}});
 document.querySelectorAll("[data-pb]").forEach(e=>{const p=e.dataset.pb.split("|");e.style.width=Math.min(100,100-(+p[0]-S.t)/(p[1]*10))+"%"});
 if(S.toast&&Date.now()>S.tt){S.toast="";D=true}
 document.querySelectorAll("[data-cd]").forEach(e=>e.textContent=fmt(+e.dataset.cd-S.t));
 document.querySelectorAll("[data-age]").forEach(e=>e.textContent=fmt(S.t-+e.dataset.age));
 if(D)render()}
function req(k,det){
 if(!S.net)return toast("No internet. Please try again when the connection is back.");
 const same=r=>r.table==S.table&&r.k==k&&(k!="custom"||r.d==(det||""))&&(["PENDING","ASSIGNED","ESCALATED","FAILED"].includes(r.status)||(r.status=="ACCEPTED"&&S.t-r.acc<CFG.DUP_ACCEPT));
 if(R.some(same))return toast("This request has already been sent.");
 const r={id:++S.rid,table:S.table,k,d:det||"",status:"PENDING",at:[],ex:[],cur:null,by:null,rsn:0,last:S.t,rs:false,t0:S.t,acc:0,backend:false};
 R.push(r);
 if(!S.myReq)S.myReq=[];
 if(!S.myReq.includes(r.id)){S.myReq.push(r.id);if(typeof saveMyReq==="function")saveMyReq();}
 log(`#${r.id} Table ${r.table}: ${LB(r)} request`);
 toast(LB(r)+" request sent.");
 assign(r);
 try{
   if(typeof apiFetch==="function"){
     apiFetch("/service-requests",{method:"POST",body:{table_id:S.table,service_key:k,details:(det==null?"":String(det).trim())}}).catch(function(){});
   }
 }catch(_){}
 D=true;render();
}
async function resend(id){
 const r=R.find(x=>x.id==id);if(!r||!r.rs)return;
 if(!r.backend){
  if(!S.net)return toast("No internet. Please try again when the connection is back.");
  if(r.rsn>=CFG.RESEND_MAX)return toast("Resend limit ("+CFG.RESEND_MAX+") reached.");if(r.cur)return toast("The request is currently with a waiter.");
  r.rsn++;r.last=S.t;r.rs=false;if(r.status=="ACCEPTED"){r.ex.push(r.by);r.by=null}
  A.forEach(a=>{if(a.r==r.id)a.open=false});r.at=[];r.status="PENDING";
  log(`#${r.id} customer resent (#${r.rsn})`);toast("Request sent again.");say("Customer pressed Resend / Not received yet: a new routing cycle starts (the earlier waiter is skipped).","c2");assign(r);D=true;render();return;
 }
 if(!S.net){toast("No internet. Please try again when the connection is back.");return;}
 if(r.rsn>=CFG.RESEND_MAX)return toast("Resend limit ("+CFG.RESEND_MAX+") reached.");if(r.cur)return toast("The request is currently with a waiter.");
 try{
  const response=await apiFetch("/service-requests/"+id+"/resend",{method:"POST"});
  r.rsn=response.resend_count==null?r.rsn+1:response.resend_count;
  r.backendResendCount=r.rsn;
  r.last=S.t;r.rs=false;
  r.status=response.status;
  r.cur=null;r.by=r.by;
  r.acc=response.accepted_at?Date.parse(response.accepted_at):null;
  r.at=[];
  A.forEach(a=>{if(a.r==r.id)a.open=false});
  log("#"+r.id+" customer resent (#"+r.rsn+")");
  toast("Request sent again.");
  say("Customer pressed Resend. The backend started a new routing cycle.","c1");
 }catch(e){
  toast((e && e.detail)?e.detail:"Resend was not available. Please try again.");
 }
 D=true;render();
}

function accept(wid,id){const r=R.find(x=>x.id==id);if(!r||!r.cur||r.cur.w!=wid||S.t>=r.cur.dl)return toast("This request has already expired.");
 const w=W[wid];w.acc++;w.streak=0;S.ac.push(S.t-r.at[r.at.length-1].t);end(r,"ACCEPTED");r.status="ACCEPTED";r.by=wid;r.acc=S.t;r.last=S.t;r.rs=false;
 A.forEach(a=>{if(a.r==r.id)a.open=false});
 const pw=P[r.table]!=null?W[P[r.table]]:null;if(!pw||!pw.on||pw.streak>=CFG.PRIMARY_MISS)P[r.table]=wid;   // primary changes only if the old one is offline or keeps missing
 log(`#${r.id} ${w.n} ACCEPTED (Table ${r.table} primary: ${W[P[r.table]].n})`);say(`${w.n} accepted. The customer now sees "A waiter is on the way". ${W[P[r.table]].n} is the primary waiter for Table ${r.table}, so this table's next request goes to ${W[P[r.table]].n} first (unless he is overloaded).`,"c1");D=true}
function reject(wid,id,rs){const r=R.find(x=>x.id==id);if(!r||!r.cur||r.cur.w!=wid)return;W[wid].rej++;log(`#${r.id} ${W[wid].n} REJECTED, going to the next waiter immediately`);S.pre=W[wid].n+" rejected, so the request went to the next waiter immediately (no 30 sec wait). ";r.at[r.at.length-1].rs=rs||"Other";end(r,"REJECTED");next(r)}
function toggle(id){const w=W[id];w.on=!w.on;log(`${w.n} is now ${w.on?"ONLINE":"OFFLINE"}`);say(w.n+(w.on?" is now ONLINE and will receive requests.":" is now OFFLINE: gets no requests, and open requests move to other waiters."),"c3");
 if(!w.on){R.forEach(r=>{if(r.cur&&r.cur.w==id){end(r,"CANCELLED");next(r)}
  else if(r.status=="ACCEPTED"&&r.by==id){const a=r.at[r.at.length-1];if(a)a.st="CANCELLED";r.ex.push(id);r.by=null;log(`#${r.id} ${w.n} offline, request re-routed`);r.status="PENDING";assign(r)}})}
 else{R.forEach(r=>{if(r.status=="FAILED"&&A.some(a=>a.open&&a.r==r.id&&a.type=="NONE")){r.at=[];log(`#${r.id} retried automatically, ${w.n} is online`);assign(r)}})}
 D=true}
const asg=(aid)=>{const a=A.find(x=>x.id==aid),r=R.find(x=>x.id==a.r),v=document.getElementById("as"+aid).value;if(v===""){say("Choose a waiter in the list first, then press Assign.","c3");D=true;return}
 log(`#${r.id} manager assigned to ${W[v].n}`);assign(r,+v)};
const resolve=aid=>{const a=A.find(x=>x.id==aid);a.open=false;const r=R.find(x=>x.id==a.r);if(r.status=="FAILED")r.status="CANCELLED";log(`Alert #${aid} resolved`);say("Manager resolved the alert.","c3");D=true};
function scanV(){let q="";for(let y=0;y<11;y++)for(let x=0;x<11;x++){const f=(x<3&&y<3)||(x>7&&y<3)||(x<3&&y>7);const on=f?!((x%8==1)&&(y%8==1)):(x*7+y*13+x*y)%3==0;if(on)q+=`<rect x="${x}" y="${y}" width="1" height="1"/>`}
 return `<div class="qr-hero"><span class="tag ACCEPTED">Table ${S.table} · ${S.table<=CFG.INDOOR?"Indoor":"Outdoor"}</span><h3>Welcome to Grand Bistro &amp; Cafe</h3><div class="mut">You opened this page from the QR code on your table. No app to install — everything runs right in the browser.</div><svg class="qr" viewBox="0 0 11 11" fill="#14213d" shape-rendering="crispEdges" aria-hidden="true">${q}</svg><div class="row" style="justify-content:center"><span class="mut sm">Your table:</span><select data-sel="table" aria-label="Table">${Array.from({length:CFG.TABLES},(_,i)=>`<option value="${i+1}" ${i+1==S.table?"selected":""}>Table ${i+1}${i+1<=CFG.INDOOR?" · Indoor":" · Outdoor"}</option>`).join("")}</select></div><button class="svc pri" data-act="scan">Open Table ${S.table}</button><div class="mut sm" style="margin-top:8px">The table number in the address is a convenience reference only — it is not secure authentication. No login is needed to browse or request service.</div></div>`}
function badQR(){return `<div class="qr-hero"><span class="tag REJECTED">QR error</span><h3>Invalid QR code</h3><div class="mut">The QR code has expired or is wrong. Please ask a waiter for help, or choose your table manually.</div><div class="row" style="justify-content:center"><select data-sel="table" aria-label="Table">${Array.from({length:CFG.TABLES},(_,i)=>`<option value="${i+1}" ${i+1==S.table?"selected":""}>Table ${i+1}</option>`).join("")}</select></div><button class="b" style="margin-top:20px" data-act="qrok">Back</button></div>`}
const MENU_CAT=[["mains","Main Course","From the main-course menu."],["sips","Beverages & Desserts","Drinks and desserts from the menu."]];
const MENU_SECT=[0,1,2,3,4,7,5,6,8].map(()=>0);MENU_SECT[0]=0;MENU_SECT[1]=0;MENU_SECT[2]=0;MENU_SECT[3]=0;MENU_SECT[4]=0;MENU_SECT[5]=1;MENU_SECT[6]=1;MENU_SECT[7]=0;MENU_SECT[8]=1;
function custHero(activeCount,cartCount){
  const pw = P[S.table]!=null&&W[P[S.table]] ? W[P[S.table]].n : "Rahul";
  const tr = I18N[S.lang||"en"] || I18N.en;
  return `<div class="cust-hero">
    <div>
      <div class="brand-eyebrow">
        <span class="gold-badge">👑 Grand Bistro &amp; Cafe</span>
        <span class="loc-badge">📍 Royal Dining Experience · Jaipur</span>
      </div>
      <h2>${tr.welcome} ${S.table}</h2>
      <p class="mut">${tr.desc}</p>
      <div class="hero-meta-pills">
        <span class="meta-pill"><span class="dot"></span> Table ${S.table} &middot; ${S.table<=CFG.INDOOR?"Indoor Royal AC Lounge":"Outdoor Star Terrace"}</span>
        <span class="meta-pill">🤵 Server on Duty: <b>${pw}</b> (⭐ 4.9 &middot; ~45s response)</span>
      </div>
    </div>
    <div class="table-chip">
      ${S.otype==="home-delivery"?`
      <div class="table-chip-box" style="border-color:#F59E0B">
        <span style="font-size:0.8rem;color:#F59E0B;font-weight:700">🛵 Order Mode:</span>
        <span style="font-weight:700;color:#F9FAFB;font-size:0.95rem">Home Delivery</span>
      </div>
      <span class="meta-pill" style="margin-top:4px;font-size:11.5px;color:#34D399;border-color:rgba(16,185,129,0.4)">⚡ 30-35m Dispatch</span>
      `:S.otype==="car-side"?`
      <div class="table-chip-box" style="border-color:#F59E0B">
        <span style="font-size:0.8rem;color:#F59E0B;font-weight:700">🚗 Order Mode:</span>
        <span style="font-weight:700;color:#F9FAFB;font-size:0.95rem">Car-Side Valet</span>
      </div>
      <span class="meta-pill" style="margin-top:4px;font-size:11.5px;color:#60A5FA;border-color:rgba(59,130,246,0.4)">🅿️ Parking Bay</span>
      `:`
      <div class="table-chip-box">
        <span style="font-size:0.8rem;color:var(--text-secondary)">Your Table:</span>
        <select data-sel="table" aria-label="Change table">
          ${Array.from({length:CFG.TABLES},(_,i)=>`<option value="${i+1}" ${i+1==S.table?"selected":""}>Table ${i+1}${i+1<=CFG.INDOOR?" · Indoor":" · Outdoor"}</option>`).join("")}
        </select>
      </div>
      <button class="b sm" data-act="badqr" style="margin-top:4px;border-radius:var(--radius-full)">📱 QR Info</button>
      `}
    </div>
  </div>
  ${S.toast?`<div class="toast" role="status"><span>✨</span><div>${S.toast}</div></div>`:""}
  ${S.net?"":`<div class="st red"><b>Connection offline</b><br>Requests already sent are safely queued. Offline simulation is actively serving Table ${S.table}.</div>`}
  <div class="otype-row" role="group" aria-label="Dining order type">
    ${[["dine-in","🍽️ Dine-In","Table service &amp; digital bill"],["car-side","🚗 Car-Side","Valet &amp; parked dine-in"],["home-delivery","🛵 Delivery","Doorstep &amp; hot takeaway"]].map(o=>`<button class="otype ${S.otype===o[0]?"on":""}" data-act="otype" data-k="${o[0]}" aria-pressed="${S.otype===o[0]}"><span class="otype-icon">${o[1].split(" ")[0]}</span><span class="otype-text"><b>${o[1].slice(o[1].indexOf(" ")+1)}</b><small>${o[2]}</small></span></button>`).join("")}
  </div>
  <nav class="subnav" aria-label="Customer sections">
    ${[["service",(S.lang==="hi"?"🛎️ सेवा":"🛎️ Service")],["menu",(S.lang==="hi"?"📋 मेन्यू":"📋 Menu")],["cart",(S.lang==="hi"?"🛒 कार्ट":"🛒 Cart")+(cartCount?` (${cartCount})`:"")],["orders",(S.lang==="hi"?"⏱️ ट्रैकर":"⏱️ Tracker")+(activeCount?` (${activeCount})`:"")]].map(t=>`<button class="${S.sub===t[0]?"on":""}" data-act="sub" data-k="${t[0]}">${t[1]}</button>`).join("")}
  </nav>`;
}

function tdet(){const n=S.tsel,rs=R.filter(r=>r.table==n&&open(r));return `<div class="st blu" style="margin-top:8px"><b>Table ${n}</b> (${n<=CFG.INDOOR?"Indoor":"Outdoor"})<br>Primary waiter: ${P[n]!=null?W[P[n]].n:"none yet"}<br>Open requests: ${rs.length?rs.map(r=>"#"+r.id+" "+LB(r)+" ("+r.status+")").join(", "):"none"}<br>Session: ${n==S.table&&S.scan?"ACTIVE":"-"}</div>`}
function QS(){
  return TY.filter(t=>t[0]!="custom").map(t=>{
    const k=t[0], label=(S.lang==='hi'&&TN_HI[k])?TN_HI[k]:t[1], icon=t[2], desc=t[3]||"", sb=SUB[k], op=S.open==k;
    const cardTop=`<div class="quick-svc-card" data-act="${sb?"grp":"req"}" data-k="${k}">
      <div class="quick-svc-header">
        <div class="quick-svc-title">
          <div class="quick-svc-icon">${icon}</div>
          <strong>${label}</strong>
        </div>
        ${sb?`<span style="color:var(--accent-gold);font-size:0.85rem">${op?"▲":"▼"}</span>`:""}
      </div>
      <div class="quick-svc-desc">${desc}</div>
      ${!sb?`<div style="margin-top:auto"><span class="b sm p" style="width:100%;pointer-events:none">Request Now</span></div>`:""}
    </div>`;
    if(!sb||!op)return cardTop;
    const pk=S.pick[k]||[];
    const optsHtml = sb.m ?
      `<div class="quick-options-wrap">${sb.o.map(v=>`<button class="opt-pill" data-act="opt" data-k="${k}" data-v="${v}">${v}</button>`).join("")}</div>` :
      `<div class="quick-options-wrap">${sb.o.map(v=>`<button class="opt-pill ${pk.includes(v)?"selected":""}" data-act="pick" data-k="${k}" data-v="${v}" aria-pressed="${pk.includes(v)}">${pk.includes(v)?"✓ ":""}${v}</button>`).join("")}</div>
       <button class="b p" style="width:100%;margin-top:0.6rem" data-act="sendm" data-k="${k}" ${pk.length?"":"disabled"}>Send Selected (${pk.length||0})</button>`;
    return `<div class="quick-svc-card" style="border-color:var(--accent-gold)">
      <div class="quick-svc-header" data-act="grp" data-k="${k}" style="cursor:pointer">
        <div class="quick-svc-title">
          <div class="quick-svc-icon">${icon}</div>
          <strong>${label}</strong>
        </div>
        <span style="color:var(--accent-gold);font-size:0.85rem">▲</span>
      </div>
      <div class="quick-svc-desc">${desc}</div>
      ${optsHtml}
    </div>`;
  }).join("");
}


function homeDeliverySection(){
  const isHi = S.lang === 'hi';
  const myIds = (S.myReq || []).slice().reverse();

  const delCards = [
    {
      k: "del_pack",
      icon: "📦",
      title: isHi ? "पैकेजिंग एवं कटलरी निर्देश" : "Packaging & Eco-Cutlery",
      desc: isHi ? "इको-फ्रेंडली चम्मच, नैपकिन, थर्मल सील कंटेनर" : "Eco-friendly wooden cutlery, napkins & thermal seal packaging",
      sub: {
        m: 0,
        o: ["Include Spoons & Napkins", "No Plastic Cutlery 🌱 (Save Earth)", "Tamper-Proof Thermal Seal 🔒", "Pack Gravy & Breads Separately"]
      }
    },
    {
      k: "del_rider",
      icon: "🚪",
      title: isHi ? "राइडर एवं डिलीवरी निर्देश" : "Doorstep & Rider Instructions",
      desc: isHi ? "दरवाजे पर छोड़ें, घंटी न बजाएं, सुरक्षा गार्ड को दें" : "Leave at door, contactless delivery, call upon arrival",
      sub: {
        m: 0,
        o: ["Leave at Door (Contactless)", "Don't Ring Bell (Baby Sleeping) 🔕", "Call Upon Arrival at Gate 📞", "Handover to Building Security 🛡️"]
      }
    },
    {
      k: "del_dips",
      icon: "🥫",
      title: isHi ? "मुफ्त चटनी, प्याज एवं एक्स्ट्रा डिप्स" : "Free Chutneys, Onions & Dips",
      desc: isHi ? "पुदीना चटनी, सिरका प्याज, आम का अचार, केचप" : "Complimentary fresh mint chutney tub, vinegar onions, pickle & seasonings",
      sub: {
        m: 0,
        o: ["Mint & Coriander Chutney Tub 🌿", "Vinegar Onions Tub 🧅", "Artisan Mixed Pickle 🥭", "Extra Tomato Ketchup & Oregano 🍅"]
      }
    },
    {
      k: "del_spice",
      icon: "🌶️",
      title: isHi ? "मसाला एवं शेफ निर्देश" : "Cooking & Spice Preferences",
      desc: isHi ? "कम तीखा, मध्यम, एक्स्ट्रा तीखा या 100% जैन" : "Mild, Medium, Extra Spicy or 100% Jain preparation for home delivery",
      sub: {
        m: 1,
        o: ["Mild (Kids Friendly) 👶", "Medium Authentic Indian 🌶️", "Extra Hot & Spicy 🔥", "100% Jain (No Onion, No Garlic) 🙏"]
      }
    },
    {
      k: "del_address",
      icon: "📍",
      title: isHi ? "डिलीवरी पता एवं संपर्क" : "Delivery Address & Landmark",
      desc: S.delAddress ? S.delAddress : (isHi ? "फ्लैट/मकान नं., लैंडमार्क एवं मोबाइल नंबर" : "Flat/House No., Street, Landmark & Phone (Jaipur)"),
      sub: {
        m: 1,
        o: ["Flat 402, Royal Palms, C-Scheme", "Villa 12, Silver Oak Residency, Vaishali", "Current GPS Location (Jaipur)"]
      }
    },
    {
      k: "del_support",
      icon: "🛵",
      title: isHi ? "एक्सप्रेस डिलीवरी एवं हेल्पलाइन" : "Express Hot Delivery & Support",
      desc: isHi ? "अनुमानित समय: 30-35 मिनट · हेल्पलाइन: +91 98765 43210" : "Estimated Dispatch: 30–35 Mins Hot Dispatch · Helpline: +91 98765 43210",
      sub: null
    }
  ];

  const cardsHtml = delCards.map(t => {
    const k = t.k, sb = t.sub, op = S.open == k;
    const cardTop = `<div class="quick-svc-card" data-act="${sb ? "grp" : "del_call"}" data-k="${k}" style="border: 1px solid rgba(245, 158, 11, 0.25); background: rgba(17, 24, 39, 0.75); border-radius: 14px; padding: 18px">
      <div class="quick-svc-header" style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="quick-svc-title" style="display:flex;align-items:center;gap:12px">
          <div class="quick-svc-icon" style="background: rgba(245, 158, 11, 0.15); color: #F59E0B; width:44px; height:44px; border-radius:10px; display:grid; place-items:center; font-size:20px">${t.icon}</div>
          <strong style="color: #F9FAFB; font-size:16px">${t.title}</strong>
        </div>
        ${sb ? `<span style="color:var(--accent-gold,#F59E0B);font-size:0.9rem">${op ? "▲" : "▼"}</span>` : ""}
      </div>
      <div class="quick-svc-desc" style="color: #9CA3AF; font-size:13.5px; margin-top:8px; line-height:1.45">${t.desc}</div>
      ${!sb ? `<div style="margin-top:12px"><button class="b sm p" data-act="del_call" style="width:100%;min-height:36px">📞 Call Dispatch Desk</button></div>` : ""}
    </div>`;
    if (!sb || !op) return cardTop;
    const pk = S.pick[k] || [];
    const optsHtml = sb.m
      ? `<div class="quick-options-wrap" style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 6px">${sb.o.map(v => `<button class="opt-pill ${pk.includes(v) ? "selected" : ""}" data-act="opt" data-k="${k}" data-v="${v}" style="background:#1F2937;border:1px solid rgba(255,255,255,0.15);color:#F9FAFB;padding:6px 14px;border-radius:9999px;font-size:13px;cursor:pointer">${v}</button>`).join("")}</div>`
      : `<div class="quick-options-wrap" style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 6px">${sb.o.map(v => `<button class="opt-pill ${pk.includes(v) ? "selected" : ""}" data-act="pick" data-k="${k}" data-v="${v}" style="background:${pk.includes(v) ? "rgba(245,158,11,0.25)" : "#1F2937"};border:1px solid ${pk.includes(v) ? "#F59E0B" : "rgba(255,255,255,0.15)"};color:#F9FAFB;padding:6px 14px;border-radius:9999px;font-size:13px;cursor:pointer">${v}</button>`).join("")}</div>
         <button class="b p sm" style="width:100%;margin-top:10px;min-height:36px;font-weight:700" data-act="sendm" data-k="${k}" ${pk.length ? "" : "disabled"}>Save ${pk.length ? "(" + pk.length + " Selected)" : "Preferences"}</button>`;
    return cardTop + optsHtml;
  }).join("");

  return `
  <section aria-label="Home delivery preferences">
    <div class="section-head" style="margin-bottom:1.5rem">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <span style="font-size:26px">🛵</span>
        <h4 style="margin:0;font-size:22px;color:#F9FAFB">${isHi ? "होम डिलीवरी एवं पार्सल विकल्प" : "Home Delivery & Doorstep Preferences"}</h4>
      </div>
      <p style="color:#9CA3AF;margin:0;font-size:14px">${isHi ? "घर पर गरम भोजन डिलीवरी के लिए राइडर निर्देश, इको-पैकेजिंग, एक्स्ट्रा चटनी एवं मसाला कस्टमाइज करें।" : "Fresh hot food delivered to your door. Customize delivery instructions, eco-packaging, complimentary dips & spice level below."}</p>
    </div>

    <div class="service-cards-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">
      ${cardsHtml}
    </div>

    <div class="custom-request-box" style="margin-top:1.5rem;background:rgba(17,24,39,0.85);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:20px">
      <h5 style="color:#F9FAFB;margin:0 0 6px;font-size:16px">${isHi ? "राइडर एवं शेफ के लिए विशेष डिलीवरी निर्देश" : "Special Instructions for Delivery Rider & Kitchen"}</h5>
      <p class="mut sm" style="margin-bottom:12px;color:#9CA3AF">${isHi ? "त्वरित निर्देश चुनें या अपना मैसेज टाइप करें:" : "Choose a quick instruction or type your delivery note:"}</p>
      <div class="suggestion-chips" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">
        <button class="sugg-chip" data-act="addnote" data-v="Leave at front door with contactless delivery" style="background:#1F2937;border:1px solid rgba(255,255,255,0.12);color:#F9FAFB;padding:6px 12px;border-radius:8px;font-size:13px;cursor:pointer">🚪 Leave at Door</button>
        <button class="sugg-chip" data-act="addnote" data-v="Please do not ring bell (Baby sleeping)" style="background:#1F2937;border:1px solid rgba(255,255,255,0.12);color:#F9FAFB;padding:6px 12px;border-radius:8px;font-size:13px;cursor:pointer">🔕 Don't Ring Bell</button>
        <button class="sugg-chip" data-act="addnote" data-v="Handover to building security guard" style="background:#1F2937;border:1px solid rgba(255,255,255,0.12);color:#F9FAFB;padding:6px 12px;border-radius:8px;font-size:13px;cursor:pointer">🛡️ Security Handover</button>
        <button class="sugg-chip" data-act="addnote" data-v="Call on arrival when reaching colony gate" style="background:#1F2937;border:1px solid rgba(255,255,255,0.12);color:#F9FAFB;padding:6px 12px;border-radius:8px;font-size:13px;cursor:pointer">📞 Call on Arrival</button>
        <button class="sugg-chip" data-act="addnote" data-v="Make food spicy and pack extra mint chutney" style="background:#1F2937;border:1px solid rgba(255,255,255,0.12);color:#F9FAFB;padding:6px 12px;border-radius:8px;font-size:13px;cursor:pointer">🌶️ Extra Spicy + Chutney</button>
      </div>
      <div class="custom-input-row" style="display:flex;gap:10px">
        <input id="ctext" maxlength="120" value="${esc(S.ctext)}" placeholder="${isHi ? "डिलीवरी या शेफ निर्देश टाइप करें..." : "Type custom delivery or chef note..."}" aria-label="Delivery note" style="flex:1;background:#0F172A;border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:10px 14px;color:#F9FAFB;font-size:14px">
        <button class="b p" data-act="sendc" style="background:#F59E0B;color:#0B0F19;font-weight:700;padding:0 20px">${isHi ? "सेव नोट" : "Save Note"}</button>
      </div>
    </div>

    <div class="row" style="margin-top:1.5rem;display:flex;gap:1rem;flex-wrap:wrap">
      <button class="b p" data-act="sub" data-k="menu" style="flex:1;min-height:50px;font-size:16px;font-weight:700">📋 ${isHi ? "मेन्यू से भोजन ऑर्डर करें" : "Browse Menu & Add Dishes"} &rarr;</button>
      <button class="b" data-act="sub" data-k="cart" style="flex:1;min-height:50px;font-size:16px">🛒 ${isHi ? "कार्ट एवं चेकआउट" : "View Cart & Checkout"}</button>
    </div>
  </section>`;
}

function carSideSection(){
  const isHi = S.lang === 'hi';
  return `
  <section aria-label="Car-side valet service">
    <div class="section-head" style="margin-bottom:1.5rem">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <span style="font-size:26px">🚗</span>
        <h4 style="margin:0;font-size:22px;color:#F9FAFB">${isHi ? "कार-साइड एवं वैले डाइनिंग" : "Car-Side & Parked Valet Dining"}</h4>
      </div>
      <p style="color:#9CA3AF;margin:0;font-size:14px">${isHi ? "अपनी पार्क की गई कार में हॉट डाइनing के लिए गाड़ी का नंबर एवं वैले ट्रे निर्देश दें।" : "Enjoy gourmet food delivered to your parked car. Specify vehicle details & valet service below."}</p>
    </div>

    <div class="service-cards-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">
      <div class="quick-svc-card" data-act="addnote" data-v="Car-side: White Creta (RJ14-XX-1234)" style="border: 1px solid rgba(245, 158, 11, 0.25); background: rgba(17, 24, 39, 0.75); border-radius:14px; padding:18px">
        <div class="quick-svc-header"><div class="quick-svc-title" style="display:flex;gap:10px;align-items:center"><span style="font-size:22px">🚗</span><strong style="color:#F9FAFB">Vehicle Registration</strong></div></div>
        <div class="quick-svc-desc" style="color:#9CA3AF;margin-top:8px">Enter Car Model &amp; Color (e.g. White Creta / RJ14-XX-1234)</div>
        <button class="b sm p" data-act="addnote" data-v="Car: RJ14 Bay #3" style="width:100%;margin-top:12px">Set Parking Bay</button>
      </div>

      <div class="quick-svc-card" data-act="addnote" data-v="Please bring window dining tray" style="border: 1px solid rgba(245, 158, 11, 0.25); background: rgba(17, 24, 39, 0.75); border-radius:14px; padding:18px">
        <div class="quick-svc-header"><div class="quick-svc-title" style="display:flex;gap:10px;align-items:center"><span style="font-size:22px">🍽️</span><strong style="color:#F9FAFB">Window Dining Tray</strong></div></div>
        <div class="quick-svc-desc" style="color:#9CA3AF;margin-top:8px">Valet mounts spill-proof window dining tray with napkins &amp; wet wipes</div>
        <button class="b sm p" data-act="addnote" data-v="Include window dining tray" style="width:100%;margin-top:12px">Request Tray</button>
      </div>

      <div class="quick-svc-card" data-act="addnote" data-v="Bring wireless card machine to car" style="border: 1px solid rgba(245, 158, 11, 0.25); background: rgba(17, 24, 39, 0.75); border-radius:14px; padding:18px">
        <div class="quick-svc-header"><div class="quick-svc-title" style="display:flex;gap:10px;align-items:center"><span style="font-size:22px">💳</span><strong style="color:#F9FAFB">Card Machine at Car</strong></div></div>
        <div class="quick-svc-desc" style="color:#9CA3AF;margin-top:8px">Valet brings wireless card swipe or UPI QR stand directly to your window</div>
        <button class="b sm p" data-act="addnote" data-v="Bring card machine to car" style="width:100%;margin-top:12px">Request Payment at Car</button>
      </div>
    </div>

    <div class="row" style="margin-top:1.5rem;display:flex;gap:1rem">
      <button class="b p" data-act="sub" data-k="menu" style="flex:1;min-height:50px;font-size:16px;font-weight:700">📋 Browse Menu &amp; Order &rarr;</button>
    </div>
  </section>`;
}

function cust(){
  if(S.qrbad)return badQR();
  if(!S.scan)return scanV();
  const cartCount=Object.values(S.cart).reduce((a,b)=>a+(b||0),0);
  const myIds=S.myReq.slice().reverse();
  const hd=custHero(myIds.length,cartCount);

  // MENU TAB
  if(S.sub=="menu"||S.cv=="menu"){
    const q=String(S.msearch||"").toLowerCase();
    const catFilter = S.mcat || "all";
    const dishes = MENU.map((m,i)=>({m,i})).filter(x=>{
      if(q && !x.m.n.toLowerCase().includes(q) && !(x.m.d||"").toLowerCase().includes(q)) return false;
      if(catFilter==="veg" && !x.m.veg) return false;
      if(catFilter==="mains" && x.m.cat!==0) return false;
      if(catFilter==="drinks" && x.m.cat!==1) return false;
      return true;
    });

    const dishCardHtml = (m,i)=>`<article class="dish-card">
      <div class="dish-header-visual">
        <span class="dish-icon-large">${m.icon||"🍽️"}</span>
        <div class="dish-badges">
          <span class="diet-badge diet-veg" title="100% Pure Vegetarian"></span>
          ${m.tag?`<span class="badge-tag">${m.tag}</span>`:""}
        </div>
      </div>
      <div class="dish-body">
        <div class="dish-title-row">
          <h5>${m.n}</h5>
          ${m.a?`<span class="tag ACCEPTED">Fresh</span>`:`<span class="tag REJECTED">Sold Out</span>`}
        </div>
        <p class="dish-description">${m.d||"Chef prepared recipe using authentic garden fresh ingredients."}</p>
        <div class="dish-footer">
          <span class="dish-price">${INR(m.p)}</span>
          <div class="stepper-control">
            <button class="stepper-btn" data-act="q-" data-i="${i}" aria-label="Decrease quantity">−</button>
            <span class="stepper-val">${S.cart[i]||0}</span>
            <button class="stepper-btn" data-act="q+" data-i="${i}" aria-label="Increase quantity" ${m.a?"":"disabled"}>+</button>
          </div>
        </div>
      </div>
    </article>`;

    const tot=MENU.reduce((s,m,i)=>s+m.p*(S.cart[i]||0),0);

    return hd + `
    <div class="section-head">
      <h4>Chef's A La Carte Menu</h4>
      <p>Artisan recipes crafted with premium organic spices and royal Indian heritage.</p>
    </div>
    <div class="menu-controls">
      <div style="position:relative">
        <span style="position:absolute;left:1.15rem;top:50%;transform:translateY(-50%);font-size:1.1rem;color:var(--text-muted)">🔍</span>
        <input id="msearch" class="menu-search-input" maxlength="60" value="${esc(S.msearch)}" placeholder="Search dishes, e.g. Paneer, Biryani, Naan, Lassi..." aria-label="Search dishes">
      </div>
      <div class="menu-cat-chips">
        <button class="cat-chip ${catFilter==="all"?"active":""}" data-act="mcat" data-k="all">🔥 All Dishes (${MENU.length})</button>
        <button class="cat-chip ${catFilter==="mains"?"active":""}" data-act="mcat" data-k="mains">🍛 Main Course &amp; Breads</button>
        <button class="cat-chip ${catFilter==="drinks"?"active":""}" data-act="mcat" data-k="drinks">🍹 Beverages &amp; Desserts</button>
        <button class="cat-chip ${catFilter==="veg"?"active":""}" data-act="mcat" data-k="veg">🌱 100% Pure Veg</button>
      </div>
    </div>
    <div class="menu-grid">
      ${dishes.length ? dishes.map(x=>dishCardHtml(x.m,x.i)).join("") : `<div class="st amb" style="grid-column:1/-1">No culinary matches found for "${esc(S.msearch)}". Try searching for "Paneer", "Rice", or "Dal".</div>`}
    </div>
    ${cartCount > 0 ? `
    <div class="floating-cart-bar" data-act="sub" data-k="checkout">
      <div class="floating-cart-left">
        <span>🛒</span>
        <span>${cartCount} ${cartCount===1?"Dish":"Dishes"} in Order</span>
      </div>
      <div class="floating-cart-right">
        <span>${INR(tot)}</span>
        <span style="font-size:0.85rem;font-weight:600">&middot; Review &rarr;</span>
      </div>
    </div>` : ""}
    `;
  }

  // CART & CHECKOUT TAB
  if(S.sub=="cart"||S.sub=="checkout"){
    const lines=Object.entries(S.cart).filter(([,qq])=>qq>0);
    const subtotal=MENU.reduce((s,m,i)=>s+m.p*(S.cart[i]||0),0);
    const gst=Math.round(subtotal*0.05);
    const tip=Number(S.tip||0);
    const grandTotal=subtotal+gst+tip;

    return hd + `
    <section class="checkout-card" aria-label="Order summary and checkout">
      <div class="section-head">
        <h4>Review Table Order</h4>
        <p>Confirm your gourmet selection for Table ${S.table}. Dishes are sent straight to the chef.</p>
      </div>
      ${lines.length ? `
      <div class="checkout-items-list">
        ${lines.map(([i,qq])=>`
        <div class="checkout-item-row">
          <div class="checkout-item-info">
            <strong>${MENU[+i].n}</strong>
            <small>${INR(MENU[+i].p)} &times; ${qq} = <b>${INR(MENU[+i].p*qq)}</b></small>
          </div>
          <div class="stepper-control">
            <button class="stepper-btn" data-act="q-" data-i="${i}" aria-label="Decrease quantity">−</button>
            <span class="stepper-val">${qq}</span>
            <button class="stepper-btn" data-act="q+" data-i="${i}" aria-label="Increase quantity">+</button>
          </div>
        </div>`).join("")}
      </div>

      <div class="cooking-notes-box">
        <label style="font-size:0.82rem;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:0.35rem">
          Special Cooking Instructions for Chef (Optional):
        </label>
        <textarea id="cookingnotes" maxlength="180" placeholder="E.g., Less spicy, no butter on roti, serve beverages along with starters...">${esc(S.cookingNotes||"")}</textarea>
      </div>

      <div class="tip-selector-wrap">
        <label style="font-size:0.82rem;font-weight:600;color:var(--text-secondary)">Tip Server Rahul:</label>
        <div class="tip-pills">
          ${[0,30,50,100].map(amt=>`<button class="tip-pill ${tip===amt?"active":""}" data-act="settip" data-v="${amt}">${amt===0?"No Tip":INR(amt)}</button>`).join("")}
        </div>
      </div>

      <div class="bill-breakdown">
        <div class="bill-line"><span>Items Subtotal (${cartCount} items):</span><span>${INR(subtotal)}</span></div>
        <div class="bill-line"><span>Restaurant GST (5%):</span><span>${INR(gst)}</span></div>
        ${tip>0?`<div class="bill-line"><span>Server Gratitude Tip:</span><span>${INR(tip)}</span></div>`:""}
        <div class="bill-line total"><span>Estimated Total:</span><span>${INR(grandTotal)}</span></div>
      </div>

      <p class="mut sm" style="margin-bottom:1.25rem">
        Order Type: <b>${esc(S.otype)}</b> &middot; Table ${S.table} &middot; Pay per restaurant dining policy at conclusion.
      </p>

      <div class="row" style="gap:0.75rem">
        <button class="b" data-act="sub" data-k="menu">Add More Dishes</button>
        <button class="b p btn-block" data-act="placeorder" style="min-height:50px;font-size:1.05rem">
          🚀 Send Order to Kitchen (${INR(grandTotal)})
        </button>
      </div>
      ` : `
      <div style="text-align:center;padding:2rem 1rem">
        <span style="font-size:3rem;display:block;margin-bottom:0.75rem">🍽️</span>
        <h5 style="font-size:1.15rem;color:var(--text-primary);margin-bottom:0.4rem">Your dining cart is empty</h5>
        <p class="mut sm" style="margin-bottom:1.25rem">Explore our chef-curated tandoor, biryani, and dessert selections.</p>
        <button class="b p" data-act="sub" data-k="menu">Explore Menu &rarr;</button>
      </div>
      `}
    </section>`;
  }

  // MY REQUESTS & TRACKER TAB
  if(S.sub=="orders"){
    const reqCardHtml = id=>{
      const c=S.reqCache[id]||{};
      const r=R.find(x=>x.id===id);
      const isAccepted = c.status==="ACCEPTED" || (r && r.status==="ACCEPTED");
      const isClosed = c.status==="CLOSED" || (r && r.status==="CLOSED");
      const isFailed = c.status==="FAILED" || (r && r.status==="FAILED");
      const canResend = r && r.rs && !r.cur && r.rsn<CFG.RESEND_MAX && S.net;

      return `
      <article class="active-tracker-card">
        <div class="req-card-head">
          <div>
            <strong style="font-size:1.05rem;color:var(--text-primary)">
              #${id} &middot; ${esc((S.lang==="hi"&&TN_HI[c.key])?TN_HI[c.key]:c.key?TN[c.key]||c.key:"Table Assistance")}
            </strong>
            ${c.details?`<span style="color:var(--accent-gold);font-weight:600"> (${esc(c.details)})</span>`:""}
          </div>
          <span class="tag ${isAccepted||isClosed?"ACCEPTED":isFailed?"REJECTED":"WAITING"}">
            ${isAccepted?"Rahul on the way":reqStatusLabel(c.status)}
          </span>
        </div>

        <div class="mut sm" style="margin-bottom:0.85rem">
          Table ${c.table||S.table} &middot; Created ${fmtTime(r?r.created_at:null)}
          ${c.resends?` &middot; Resent ${c.resends}&times;`:""}
        </div>

        ${isAccepted ? `
        <div class="tracker-server-row">
          <div class="tracker-server-info">
            <div class="server-avatar-circle">R</div>
            <div class="server-details-text">
              <strong>Rahul (Server on Shift)</strong>
              <small>⭐ 4.9 &middot; Request Accepted &middot; Arriving at Table ${c.table||S.table}</small>
            </div>
          </div>
          <button class="b sm p" data-act="done" data-id="${id}">Confirm Receipt</button>
        </div>` : ""}

        ${r && !isClosed ? `
        <div class="row" style="margin-top:1rem;gap:0.75rem">
          <button class="b sm" data-act="cancel" data-id="${r.id}" ${S.net?"":"disabled"}>Cancel Request</button>
          <button class="b sm p" data-act="resend" data-id="${r.id}" ${canResend?"":"disabled"}>
            Resend / Not Received
          </button>
        </div>
        ${!r.rs && r.rsn<CFG.RESEND_MAX ? `<div class="sm mut" style="margin-top:0.4rem">Resend available after 60s cooldown (Server attempted for 45s).</div>`:""}
        ${r.rsn>=CFG.RESEND_MAX ? `<div class="sm mut" style="margin-top:0.4rem">Resend limit reached. Management has been alerted.</div>`:""}
        `:""}
      </article>`;
    };

    const myOrders = O.filter(o => o.table === S.table);
    const orderStatusBadge = s => {
      if(s==="PENDING") return '<span class="tag WAITING">⏳ Order Received</span>';
      if(s==="CONFIRMED") return '<span class="tag WAITING">👍 Kitchen Confirmed</span>';
      if(s==="PREPARING") return '<span class="tag WAITING">🍳 Chef Cooking</span>';
      if(s==="READY") return '<span class="tag ACCEPTED">🍽️ Ready &middot; Server Moving</span>';
      return '<span class="tag ACCEPTED">✅ Served at Table</span>';
    };

    const ratingBox = S.ratedTables[S.table] ? `
      <div class="card" style="border:1px solid var(--accent-gold);margin-bottom:1.5rem;text-align:center;padding:1.25rem">
        <span style="font-size:1.75rem">⭐</span>
        <h5 style="color:var(--text-primary);margin:0.25rem 0">Thank You For Your Feedback!</h5>
        <p class="mut sm">You rated your dining experience at Table ${S.table} with <b>${S.ratedTables[S.table]} Stars</b>.</p>
      </div>` : `
      <div class="card" style="border:1px solid var(--border-medium);margin-bottom:1.5rem;padding:1.25rem">
        <h5 style="color:var(--text-primary);margin-bottom:0.35rem">🌟 How is your experience at Table ${S.table}?</h5>
        <p class="mut sm" style="margin-bottom:0.75rem">Tap a star to rate your dining &amp; server response:</p>
        <div class="row" style="gap:0.5rem">
          ${[1,2,3,4,5].map(st=>`<button class="b sm" data-act="rate" data-v="${st}">⭐ ${st}</button>`).join("")}
        </div>
      </div>`;

    return hd + `
    <section aria-label="Live customer service requests and kitchen orders">
      <div class="section-head" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem">
        <div>
          <h4>${S.lang==="hi"?"लाइव ऑर्डर एवं सर्विस ट्रैकर":"Live Orders &amp; Service Tracker"}</h4>
          <p>${S.lang==="hi"?"टेबल के सभी खाने और वेटर अनुरोधों का रियल-टाइम स्टेटस।":"Real-time status of kitchen orders and table service requests."}</p>
        </div>
        <button class="b sm" data-act="refreshreq">🔄 Refresh Status</button>
      </div>

      ${ratingBox}

      ${myOrders.length ? `
      <div style="margin-bottom:1.75rem">
        <h5 style="color:var(--accent-gold);margin-bottom:0.75rem">🍳 Kitchen Food Orders (${myOrders.length})</h5>
        ${myOrders.map(o => `
        <article class="active-tracker-card" style="border-color:rgba(16,185,129,0.35)">
          <div class="req-card-head">
            <div>
              <strong style="font-size:1.05rem;color:var(--text-primary)">
                Order #${o.id} &middot; Table ${o.table}
              </strong>
            </div>
            ${orderStatusBadge(o.s)}
          </div>
          <div style="margin:0.5rem 0;color:var(--text-primary);font-size:0.95rem">
            <b>Dishes:</b> ${esc(o.items)}
          </div>
          <div class="mut sm" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem">
            <span>Sent directly to Grand Bistro Kitchen</span>
            ${o.s !== "SERVED" ? `<button class="b sm" data-act="advorder" data-id="${o.id}">Fast-Track Kitchen Stage &rarr;</button>` : ""}
          </div>
        </article>`).join("")}
      </div>` : ""}

      <div>
        <h5 style="color:var(--text-primary);margin-bottom:0.75rem">🛎️ Table Service Calls (${myIds.length})</h5>
        ${S.reqErr?`<div class="st red">${esc(S.reqErr)}</div>`:""}
        ${myIds.length ? myIds.map(reqCardHtml).join("") : `
        <div class="card" style="text-align:center;padding:2.5rem 1rem">
          <span style="font-size:3rem;display:block;margin-bottom:0.75rem">🛎️</span>
          <h5 style="color:var(--text-primary);font-size:1.1rem;margin-bottom:0.35rem">${S.lang==="hi"?"कोई सक्रिय अनुरोध नहीं":"No active requests"}</h5>
          <p class="mut sm" style="margin-bottom:1.25rem">${S.lang==="hi"?"पीने का पानी, टिशू या बिल चाहिए? नीचे दिए बटन दबाकर स्टाफ को बुलाएं।":"Need fresh water, extra napkins, or your bill? Tap below to call staff."}</p>
          <button class="b p" data-act="sub" data-k="service">${S.lang==="hi"?"वेटर को बुलाएं":"Call Waiter Now"}</button>
        </div>`}
      </div>
    </section>`;
  }

  // DEFAULT SERVICE TAB: Branch based on Order Type
  if (S.otype === "home-delivery") {
    return hd + homeDeliverySection();
  }
  if (S.otype === "car-side") {
    return hd + carSideSection();
  }

  // Dine-In Table Service
  return hd + `
  <section aria-label="Instant table service">
    <div class="section-head">
      <h4>How may we serve you at Table ${S.table}?</h4>
      <p>Tap any option below. Your server is notified instantly on their shift terminal.</p>
    </div>
    <div class="service-cards-grid">
      ${QS()}
    </div>

    <div class="custom-request-box">
      <h5>Special Chef or Table Request</h5>
      <p class="mut sm">Need something tailored? Choose a quick suggestion or type your note:</p>
      <div class="suggestion-chips">
        <button class="sugg-chip" data-act="addnote" data-v="Please clean the table">🧹 Clean Table</button>
        <button class="sugg-chip" data-act="addnote" data-v="Please bring extra ice">🧊 Extra Ice</button>
        <button class="sugg-chip" data-act="addnote" data-v="Make food medium spicy">🌶️ Medium Spicy</button>
        <button class="sugg-chip" data-act="addnote" data-v="Need baby high chair">👶 Baby High Chair</button>
        <button class="sugg-chip" data-act="addnote" data-v="Adjust AC cooling">❄️ Adjust AC</button>
      </div>
      <div class="custom-input-row">
        <input id="ctext" maxlength="120" value="${esc(S.ctext)}" placeholder="Type custom note for staff..." aria-label="Custom request">
        <button class="b p" data-act="sendc">Send Note</button>
      </div>
    </div>

    <div class="row" style="margin-top:1.5rem;gap:1rem">
      <button class="b p" data-act="sub" data-k="menu" style="min-height:46px">Browse Full Menu &rarr;</button>
      <button class="b" data-act="sub" data-k="orders" style="min-height:46px">Track Requests (${myIds.length})</button>
    </div>
  </section>`;
}

function wlogin(){return `<div class="auth-wrap"><div class="auth-card"><p class="eyebrow">Waiter Terminal &middot; Shift Access</p><h3>Waiter Sign In</h3><p class="mut sm">Sign in to your active shift terminal using your restaurant credentials.</p><div class="st acc sm" style="margin-bottom:1rem"><b>✅ Live Authentication Active.</b> Pre-configured demo staff: <code>rahul.dev@restaurant.local</code> / PIN: <code>1234</code></div><div class="row" style="gap:0.4rem;margin-bottom:1rem;flex-wrap:wrap"><span class="mut sm" style="width:100%">Quick Select Staff:</span><button class="b sm" data-act="wquickfill" data-e="rahul.dev@restaurant.local" data-p="1234">Rahul</button><button class="b sm" data-act="wquickfill" data-e="aman.dev@restaurant.local" data-p="1234">Aman</button><button class="b sm" data-act="wquickfill" data-e="vikas.dev@restaurant.local" data-p="1234">Vikas</button><button class="b sm" data-act="wquickfill" data-e="suresh.dev@restaurant.local" data-p="1234">Suresh</button><button class="b sm" data-act="wquickfill" data-e="mohit.dev@restaurant.local" data-p="1234">Mohit</button></div><label class="field">Work Email<input id="wemail" maxlength="150" value="${esc(S.wEmail||'rahul.dev@restaurant.local')}" placeholder="rahul.dev@restaurant.local" autocomplete="username"></label><label class="field">Shift PIN / Password<input id="wpass" type="password" maxlength="100" value="${esc(S.wPass||'1234')}" placeholder="1234" autocomplete="current-password"></label>${S.loginMsg?`<div class="st red" role="alert">${esc(S.loginMsg)}</div>`:""}<button class="b p btn-block" data-act="wtrylogin" style="min-height:46px;font-size:1rem">🚀 Sign In to Shift</button><button class="b btn-block" data-act="wpreview">Simulation Demo Mode</button></div></div>`}
function wait(){
  if(!S.wl) return wlogin();
  const w = W[S.sel] || W[0];
  const incs = R.filter(r => r.cur && r.cur.w == w.id).sort((a,b) => a.cur.dl - b.cur.dl);
  const act = R.filter(r => r.status == "ACCEPTED" && r.by == w.id);
  const rdy = O.filter(o => o.s == "READY" && o.w == w.id);
  const wn = S.wn[w.id];
  const n = act.length + incs.length;
  const rjr = incs.find(r => r.id == S.rj);
  if(S.rj != null && !rjr) S.rj = null;

  const tb = `<div class="wt">${W.map(x=>`<button data-act="sel" data-id="${x.id}" class="${x.id==S.sel?"on":""}"><span class="dot ${x.on?"on":""}"></span>${x.n}</button>`).join("")}</div>`;
  const hd = `<div class="row" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="display:flex;align-items:center;gap:10px"><h3 style="margin:0;font-size:22px;color:#F9FAFB">${w.n}</h3><span class="chip ${w.on?"ACCEPTED":"REJECTED"}" style="padding:2px 10px;font-size:12px">${w.on?"ONLINE":"OFFLINE"}</span></div><button class="b ${w.on?"p":""}" data-act="togw" data-id="${w.id}" aria-pressed="${w.on}">${w.on?"Go Offline":"Go Online"}</button></div><div class="sm mut" style="margin:4px 0 12px">Notifications: <b style="color:${w.push?"#10B981":"#EF4444"}">${w.push?"ON":"OFF"}</b> &middot; Load: ${load(w)} tasks</div>`;

  let mid;
  if(S.offc == w.id) {
    mid = `<div class="st amb" style="background:rgba(245,158,11,0.15);border:1px solid #F59E0B;padding:14px;border-radius:12px;margin:12px 0"><b>Before going offline:</b><br>You have ${n} open request(s). They will automatically move to other waiters.<div class="row" style="margin-top:10px;display:flex;gap:10px"><button class="b" data-act="offx">Back</button><button class="b d" data-act="offok" style="background:#EF4444;color:#fff">Yes, go offline</button></div></div>`;
  } else if(!w.on) {
    mid = `<div class="idle" style="text-align:center;padding:40px 10px;color:#9CA3AF">You are <b>OFFLINE</b>. Turn Online above to receive table requests.</div>`;
  } else if(incs.length && !w.push) {
    mid = `<div class="idle" style="text-align:center;padding:40px 10px;color:#9CA3AF">Notifications are turned OFF.<br>Turn Push ON from the Manager console to receive alerts.</div>`;
  } else if(rjr) {
    mid = `<div class="st red" style="background:rgba(239,68,68,0.12);border:1.5px solid #EF4444;border-radius:14px;padding:16px;margin:12px 0"><b>Table ${rjr.table}: Why reject?</b> <span class="tag WAITING" data-cd="${rjr.cur.dl}">${fmt(rjr.cur.dl-S.t)}</span>${["Busy","At another table","On break","Other"].map(r=>`<button class="b" style="width:100%;margin-top:8px;text-align:left;background:#1F2937;color:#F9FAFB" data-act="rjgo" data-id="${rjr.id}" data-r="${r}">${r}</button>`).join("")}<button class="b" style="width:100%;margin-top:10px" data-act="rjx">Back</button></div>`;
  } else if(incs.length) {
    mid = (incs.length > 1 ? `<div class="sm mut" style="margin-top:6px;color:#F59E0B"><b>${incs.length} requests are waiting for you.</b> Most urgent first:</div>` : "") + incs.map(inc => {
      const ca = inc.at[inc.at.length - 1];
      return `<div class="alertc" role="alert">
        <div style="color:#EF4444;font-weight:700;letter-spacing:1px;font-size:13px">NEW REQUEST</div>
        <div class="big">TABLE ${inc.table}</div>
        <div style="font-size:20px;color:#F9FAFB;margin:6px 0">${LB(inc)}</div>
        <div class="cd" data-cd="${inc.cur.dl}">${fmt(inc.cur.dl-S.t)}</div>
        <div class="mut sm" style="color:#9CA3AF">${ca.mgr?"Assigned by manager":tries(inc)==1&&w.id==P[inc.table]?"Your primary table":"Attempt "+tries(inc)+" / "+CFG.TRIES}</div>
      </div>
      <button class="b p" style="width:100%;min-height:52px;font-size:18px;background:linear-gradient(135deg,#F59E0B,#D97706);color:#0B0F19;font-weight:800;border:0;border-radius:12px;cursor:pointer;box-shadow:0 4px 16px rgba(245,158,11,0.3)" data-act="acc" data-id="${inc.id}">ACCEPT</button>
      <button class="b" style="width:100%;margin-top:8px;margin-bottom:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#9CA3AF" data-act="rjopen" data-id="${inc.id}">Reject</button>`;
    }).join("");
  } else {
    mid = `<div class="idle" style="text-align:center;padding:50px 10px;color:#9CA3AF"><div style="font-size:36px;margin-bottom:8px">🛎️</div>No active calls right now.<br>Tap any service on Customer screen or run a demo scenario.</div>`;
  }

  return `<div class="dash-head"><div><p class="eyebrow" style="color:#F59E0B">Staff Workspace &middot; Shift Terminal</p><h2>Server Station</h2></div></div>` +
    tb + hd + (wn ? `<div class="st amb" style="background:rgba(245,158,11,0.12);padding:10px 14px;border-radius:10px;margin-bottom:12px"><b>Request missed</b><br>${wn.m}</div>` : "") + mid +
    (rdy.length ? `<h4 style="margin-top:20px;color:#10B981">Orders Ready to Serve</h4>` + rdy.map(o => `<div class="card" style="padding:12px 16px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center"><span><b>Table ${o.table}</b>: #${o.id} ${o.items}</span><button class="b p" data-act="served" data-id="${o.id}">Mark Served</button></div>`).join("") : "") +
    `<h4 style="margin-top:20px">My Active Requests</h4>` +
    (act.length ? act.map(r => `<div class="card" style="padding:12px 16px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center"><span><b>Table ${r.table}</b>: ${LB(r)}</span><button class="b" data-act="wdone" data-id="${r.id}">Done</button></div>`).join("") : `<div class="mut sm">None right now. No Delivered button needed.</div>`) +
    `<h4 style="margin-top:20px">Today</h4><div class="mut sm">Accept ${w.acc}, Missed ${w.miss}, Reject ${w.rej}</div>`;
}

const chip=(a)=>`<span class="chip ${a.st}" title="${a.st}">${W[a.w].n} ${a.st=="WAITING"?"waiting":a.st.toLowerCase()}${a.rs?" ("+a.rs+")":""}${a.st=="WAITING"&&a.dl?` <span data-cd="${a.dl}">${fmt(a.dl-S.t)}</span>`:a.e!=null?` ${Math.round((a.e-a.t)/1000)}s`:""}</span> `;
function adminLogin(){return `<div class="auth-wrap"><div class="auth-card"><p class="eyebrow">Management Portal &middot; Grand Bistro</p><h3>Manager / Admin Sign In</h3><p class="mut sm">Access real-time restaurant KPIs, 23-table map, staff roster &amp; escalations.</p><div class="st acc sm" style="margin-bottom:1rem"><b>✅ Live Admin Authentication Active.</b> Pre-configured demo: <code>manager.dev@restaurant.local</code> / PIN: <code>1234</code></div><div class="row" style="gap:0.4rem;margin-bottom:1rem"><button class="b sm p" data-act="aquickfill" data-e="manager.dev@restaurant.local" data-p="1234">⚡ Autofill Manager Vikram</button></div><label class="field">Admin Email<input id="aemail" maxlength="150" value="${esc(S.aEmail||'manager.dev@restaurant.local')}" placeholder="manager.dev@restaurant.local" autocomplete="username"></label><label class="field">Admin Password / PIN<input id="apass" type="password" maxlength="100" value="${esc(S.aPass||'1234')}" placeholder="1234" autocomplete="current-password"></label>${S.loginMsg?`<div class="st red" role="alert">${esc(S.loginMsg)}</div>`:""}<button class="b p btn-block" data-act="atrylogin" style="min-height:46px;font-size:1rem">👑 Sign In as Manager</button><button class="b btn-block" data-act="apreview">Simulation Demo Mode</button></div></div>`}
function adminKpis(){const k=S.kpis;
 if(!k)return `<p class="mut">Loading live dashboard…</p>`;
 if(k.error)return `<div class="st red">${esc(k.error)}</div>`;
 const card=(l,v,sub)=>`<div class="kpi"><b>${v}</b><span class="mut sm">${l}</span>${sub?`<small class="mut">${sub}</small>`:""}</div>`;
 return `<div class="kpi-grid">${card("Tables",S.tablesMap.length||CFG.TABLES,"18 indoor · 5 outdoor")}${card("Active service requests",k.open_requests,"waiting + assigned + accepted + failed")}${card("Waiting / accepted split","—","not exposed by API")}${card("Waiters online",k.waiters_online+" / "+k.waiters_total)}${card("Unassigned requests","—","not exposed by API")}${card("Open manager alerts",k.open_alerts)}${card("Missed today",k.missed_today)}${card("Avg accept time",k.avg_accept_time_sec!=null?Math.round(k.avg_accept_time_sec)+"s":"—")}${card("Avg service time",k.avg_service_time_min!=null?Number(k.avg_service_time_min).toFixed(1)+" min":"—")}</div>`}
function adminAlertCard(a){const d=S.alertReq[a.id];const r=d&&d.request;
 const wname=a.assigned_waiter_id?backendWaiterName(a.assigned_waiter_id):"—";
 return `<article class="req-card"><div class="req-card-head"><b>Alert #${a.id} · ${a.alert_type}</b><span class="tag ${a.is_open?"REJECTED":"ACCEPTED"}">${a.is_open?"OPEN":"CLOSED"}</span></div><div class="mut sm">Request #${a.request_id}${r?` · Table ${r.table_id} · ${esc(TN[r.service_key]||r.service_key)}${r.details?` (${esc(r.details)})`:""} · <b>${reqStatusLabel(r.status)}</b>`:""} · created ${fmtTime(a.created_at)} · assigned waiter: ${esc(wname)}</div><div class="row"><button class="b" data-act="adetail" data-id="${a.id}">${S.alertSel===a.id?"Refresh details":"Open details"}</button></div>${S.alertSel===a.id?adminAlertDetail(a):""}</article>`}
function adminAlertDetail(a){const d=S.alertReq[a.id];
 if(!d)return `<p class="mut sm">Loading request details…</p>`;
 if(d.error)return `<div class="st red sm">${esc(d.error)}</div>`;
 const r=d.request;
 const att=(d.attempts||[]).map(x=>`<div class="attempt"><span class="chip ${x.status}">${x.status}</span><span>${esc(backendWaiterName(x.waiter_id))}</span><span class="mut sm">attempt ${x.attempt_number} · ${x.timeout_seconds}s · assigned ${fmtTime(x.assigned_at)}${x.responded_at?` · responded ${fmtTime(x.responded_at)}`:""}${x.rejection_reason?` · ${esc(x.rejection_reason)}`:""}</span></div>`).join("");
 return `<div class="mut sm">Created ${fmtTime(r.created_at)}${r.accepted_at?` · accepted ${fmtTime(r.accepted_at)}`:""}${r.closed_at?` · closed ${fmtTime(r.closed_at)}`:""} · resends ${r.resend_count}</div><div class="attempts">${att||'<p class="mut sm">No attempts recorded.</p>'}</div><div class="assign-row"><select id="assign-${a.id}" aria-label="Choose waiter for alert ${a.id}"><option value="">Choose waiter…</option>${W.filter(w=>w.backendId&&w.backendOnline).map(w=>`<option value="${w.backendId}">${esc(w.n)} (accepted ${w.backendAcceptedCount||0})</option>`).join("")}</select><button class="b p" data-act="aassign" data-id="${a.id}">Assign</button><button class="b" data-act="aresolve" data-id="${a.id}">Resolve</button></div><p class="sm mut">Manual assignment creates a new 30-second attempt and may assign a waiter who previously rejected — the backend permits manager override. Resolving a failed alert cancels the request.</p>`}
function mgr(){
  const on = W.filter(w=>w.on).length, orq=R.filter(open), oa=A.filter(a=>a.open), ord=O.filter(o=>o.s!="SERVED");
  const k = (n,v,c)=>`<div class="kpi ${c||""}"><b>${v}</b><span class="mut sm">${n}</span></div>`;
  const al = oa.map(a=>{
    const r=R.find(x=>x.id==a.r);
    return `<div class="al" style="background:rgba(239,68,68,0.12);border:1.5px solid #EF4444;border-radius:12px;padding:14px;margin-bottom:14px">
      <div class="row" style="display:flex;justify-content:space-between;align-items:center"><b style="color:#EF4444">HIGH PRIORITY: #${r.id}, Table ${r.table}, ${LB(r)}</b><span class="sm">${atext(a,r)}</span></div>
      <div class="sm" style="margin:8px 0">${r.at.map(chip).join("")||"No attempts"}</div>
      <div class="row" style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
        <span><select id="as${a.id}" aria-label="Choose waiter" style="background:#1F2937;color:#F9FAFB;border:1px solid rgba(255,255,255,0.15);padding:6px 12px;border-radius:8px"><option value="">Choose waiter</option>${W.filter(w=>w.on).map(w=>`<option value="${w.id}">${w.n} (load ${load(w)})</option>`).join("")}</select> <button class="b p" data-act="asg" data-id="${a.id}">Assign</button></span>
        <button class="b" data-act="res" data-id="${a.id}">Resolve</button>
      </div>
    </div>`;
  }).join("");

  return `<div class="dash-head"><div><p class="eyebrow" style="color:#F59E0B">Management Console &middot; Floor Overview</p><h2>Manager Dashboard</h2></div><div class="row"><button class="b" data-act="arefresh">Refresh Live View</button></div></div>
  <div class="kpis">${k("Waiters online",on+" / "+W.length)}${k("Open requests",orq.length)}${k("Alerts",oa.length,oa.length?"red":"")}${k("Active orders",ord.length)}${k("Missed today",W.reduce((s,w)=>s+w.miss,0))}</div>
  <div class="kpis" style="display:grid;grid-template-columns:minmax(120px,160px);margin-top:-6px;margin-bottom:16px">${k("Avg accept time",S.ac.length?Math.round(S.ac.reduce((a,b)=>a+b,0)/S.ac.length/1000)+"s":"-")}</div>
  ${al||`<div class="panel mut" style="padding:14px;margin-bottom:16px;background:var(--bg-surface);border:1px solid rgba(255,255,255,0.06);border-radius:12px">No open alerts.</div>`}
  <div class="panel" style="margin-bottom:16px"><h3 style="margin-top:0;font-size:18px;color:#F9FAFB">Live Requests</h3><div class="sc"><table><tr><th>ID</th><th>Tbl</th><th>Service</th><th>Status</th><th>Attempts</th><th>Age</th></tr>${R.slice(-8).reverse().map(r=>`<tr><td>#${r.id}</td><td>${r.table}</td><td>${LB(r)}</td><td><span class="chip ${r.status}">${r.status}</span></td><td>${r.at.map(chip).join("")}${r.rsn?`<span class="mut sm">resend ${r.rsn}</span>`:""}</td><td data-age="${r.t0}">${fmt(S.t-r.t0)}</td></tr>`).join("")||`<tr><td colspan="6" class="mut">No requests yet.</td></tr>`}</table></div></div>
  <div class="panel" style="margin-bottom:16px"><h3 style="margin-top:0;font-size:18px;color:#F9FAFB">Staff</h3><div class="mut sm" style="margin-bottom:8px">The next request goes to the waiter with the least work today (accepted today + requests waiting for an answer).</div><div class="sc"><table><tr><th>Waiter</th><th>Status</th><th>Push</th><th>Load</th><th>Work today</th><th>Missed</th><th>Reject</th></tr>${W.map(w=>`<tr><td><b>${w.n}</b></td><td><button class="b" data-act="tog" data-id="${w.id}" style="min-height:30px;padding:2px 10px">${w.on?"Online":"Offline"}</button></td><td><button class="b" data-act="push" data-id="${w.id}" style="min-height:30px;padding:2px 10px;color:${w.push?"#10B981":"#EF4444"}">${w.push?"ON":"OFF"}</button></td><td>${load(w)}</td><td>${w.acc}</td><td>${w.miss}</td><td>${w.rej}</td></tr>`).join("")}</table></div></div>
  <div class="panel" style="margin-bottom:16px"><h3 style="margin-top:0;font-size:18px;color:#F9FAFB">Tables (${CFG.TABLES}, conceptual layout)</h3><div class="grid23">${Array.from({length:CFG.TABLES},(_,i)=>{const n=i+1,c=A.some(a=>a.open&&R.find(r=>r.id==a.r).table==n)?"alert":R.some(r=>r.table==n&&["PENDING","ASSIGNED","ESCALATED"].includes(r.status))?"wait":R.some(r=>r.table==n&&r.status=="ACCEPTED")?"acc":"";return `<button class="tb ${c} ${S.tsel==n?"sel":""}" data-act="tbl" data-id="${n}" aria-label="Table ${n}">${n}${c?`<small class="mk" aria-hidden="true">${{alert:"!",wait:"…",acc:"✓"}[c]}</small>`:""}</button>`}).join("")}</div>${S.tsel?tdet():""}<div class="mut sm" style="margin-top:8px">Red = alert, blue = waiting, green = accepted. 1-${CFG.INDOOR} Indoor, ${CFG.INDOOR+1}-${CFG.TABLES} Outdoor. Primary: ${Object.entries(P).map(([t,w])=>"T"+t+"="+W[w].n).join(", ")||"none"}</div></div>
  <div class="panel" style="margin-bottom:16px"><h3 style="margin-top:0;font-size:18px;color:#F9FAFB">Orders</h3>${O.length?O.slice().reverse().map(o=>`<div class="row" style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center"><span>#${o.id} Table ${o.table}: ${o.items}</span><span><span class="chip ${o.s}">${o.s}</span>${o.s=="READY"&&o.w!=null?` <span class="sm mut">&rarr; ${W[o.w].n}</span>`:""} ${o.s!="SERVED"?`<button class="b" data-act="adv" data-id="${o.id}" style="min-height:28px;padding:1px 10px;margin-left:8px">Next &rarr;</button>`:""}</span></div>`).join(""):`<span class="mut">Orders placed from the customer menu will appear here.</span>`}</div>
  <div class="panel"><h3 style="margin-top:0;font-size:18px;color:#F9FAFB">Audit log</h3><div class="log">${L.join("<br>")||"Nothing yet."}</div></div>`;
}

function fair(){W.forEach(w=>w.on=true);P={};S.plan=["accept"];S.tab="c3";const ks=[["water","Cold"],["salad",""],["spt","Salt"],["bill","Cash"],["cutlery","Plate"],["call",""]];
 for(let i=1;i<=10;i++){S.table=i;req(ks[i%6][0],ks[i%6][1])}S.table=7;say("10 requests at once, 5 waiters: each request went to the waiter with the least work so far. Check the Staff table on the Manager screen: everyone gets an equal share (2 each).","c3")}
function demo(k){document.getElementById("sp").value="10";init();S.sp=10;S.tab="c1";S.scan=true;S.wl=true;if(k=="f")return fair();if(k=="p"){P={};S.table=1;S.plan=[["accept"],["ignore","accept"]];S.pb=S.rid;S.queue=[()=>{S.table=1;req("salad")}];req("cutlery","Bowl");return}if(k=="o")W.forEach(w=>w.on=false);S.plan={n:["accept"],i:["ignore","ignore","ignore"],r:["reject","accept"],o:[]}[k];req("cutlery","Bowl")}
function jr(){const r=R[R.length-1];if(!r)return `<b>Request journey</b><div class="mut sm">No requests yet. Here you will see which waiter has the request and how much time is left.</div>`;
 const L={WAITING:"Waiting for response",MISSED:"No response",REJECTED:"Rejected",ACCEPTED:"Accepted",CANCELLED:"Went offline"},ok=["ACCEPTED","CLOSED"].includes(r.status),fl=r.status=="FAILED";
 let h=`<div class="jn ACCEPTED"><b>Customer</b><br>Table ${r.table}: ${LB(r)}</div>`;const n=(ok||fl)?r.at.length:Math.max(3,r.at.length);
 for(let i=0;i<n;i++){const a=r.at[i];h+=`<span class="arrow">&rarr;</span>`+(a?`<div class="jn ${a.st}"><b>${W[a.w].n}</b> <span class="sm">(${a.secs}s${a.mgr?", manager":""})</span><br>${L[a.st]}${a.e!=null?` &middot; ${Math.round((a.e-a.t)/1000)}s`:""}${a.st=="WAITING"&&r.cur?`<br><b data-cd="${r.cur.dl}">${fmt(r.cur.dl-S.t)}</b> left<div class="pb"><i data-pb="${r.cur.dl}|${a.secs}" style="width:${Math.min(100,100-(r.cur.dl-S.t)/(a.secs*10))}%"></i></div>`:""}</div>`:`<div class="jn" style="opacity:.5">Next waiter<br><span class="sm">if needed</span></div>`)}
 h+=`<span class="arrow">&rarr;</span><div class="jn ${ok?"ACCEPTED":fl?"FAILED":""}" style="${ok||fl?"":"opacity:.5"}"><b>${ok?"Work started":fl?"Manager alert":"Manager"}</b><br>${ok?"Waiter at the table":fl?"HIGH PRIORITY":"Alert after 3 failures"}</div>`;
 return `<b>Request #${r.id} ka safar</b> <span class="mut sm">(Table ${r.table}, ${LB(r)}. one waiter at a time)</span><div class="jr">${h}</div>`}

const FLOWS=[["F1 Customer: from QR scan to request",[["S:QR scan","->send token","Y:Server checks token","->","D:Valid?","->No","X:Invalid / expired QR screen"],["D:Valid?","->Yes","S:Welcome, Table N","->","S:Quick Service home","->choose a service","A:Choose: Water (Cold/Normal/Hot), Chutney, Salt/Pepper/Tissue, Bill (Cash/Online), Plate/Spoon/Bowl/Glass, Call Waiter, or type your own","->","Y:Request created (duplicate check)","->","S:Request sent"]]],
["F2 Request routing (shared system)",[["Y:Request created","->","D:Waiter online?","->No","M:Immediate HIGH alert (no waiter online)"],["D:Waiter online?","->Yes: 1st waiter 45s (primary if online, otherwise the one with the least work)","Y:Assign one waiter","->","D:Accept or Reject?","->Accept","OK:Customer: a waiter is on the way"],["D:Accept or Reject?","->Reject (reason)","Y:Next waiter immediately"],["Y:Assign one waiter","->deadline passed","T:Assignment expires (missed)","->","Y:2nd waiter 30s, then 3rd 30s (least work so far)","->","D:3 attempts failed?","->Yes","M:HIGH PRIORITY manager alert","->","A:Manager assigns or resolves"],["M:HIGH PRIORITY manager alert","->","X:Customer: manager has been informed"]]],
["F3 Customer: resend and auto-close",[["S:Request sent","->after 60 sec","A:Resend (max 3)","->","Y:New cycle"],["OK:Waiter accepted","->10 min","T:Auto-close"]]],
["F4 Customer: menu and order",[["S:View Menu","->","S:Categories + items","->","A:Choose quantity","->","S:Cart","->","A:Place order","->","OK:Order confirmed","->","M:Manager monitors","->Advance","S:Preparing, Ready, Served"],["S:Unavailable item","->","X:Cannot be added"]]],
["F5 Waiter",[["S:Login (phone + PIN)","->","S:Home OFFLINE","->go ONLINE","S:Home ONLINE","->alert arrives","S:Full-screen request + timer","->","D:Accept or Reject?","->Accept","S:Active requests"],["D:Accept or Reject?","->Reject","S:Reason: Busy / At another table / On break / Other"],["S:Full-screen request + timer","->time runs out","T:Request missed, moves to next waiter"],["S:Home ONLINE","->press OFFLINE","D:Open requests?","->Yes","S:Warning, requests re-routed"]]],
["F6 Manager",[["S:Dashboard KPIs","->","M:Alert panel","->","A:Assign waiter","->","Y:New 30s attempt"],["M:Alert panel","->","A:Resolve","->","OK:Alert closed"],["S:Dashboard KPIs","->","S:Staff: online/offline, push","S:Live requests","S:23-table map","S:Orders + Advance","S:Audit log"]]]];
const INV=[["Customer",["QR landing / scan","Invalid or expired QR","Welcome, Table N","Quick Service home (6 buttons + free-text box)","Sub-options: Water Cold/Normal/Hot, Bill Cash/Online, Salt/Pepper/Tissue, Plate/Spoon/Bowl/Glass","Menu","Cart","Order submitted + status","Request sent","Searching for waiter","Waiter coming","Taking longer, manager informed","Resend (60 s cooldown, max 3)","Connection lost","Duplicate / in-progress feedback"]],["Waiter",["Staff login (phone + PIN, error)","Online / Offline + notification status","Full-screen incoming request + countdown","Accept","Reject with 4 reasons","Active requests","Today: accepted / missed / rejected","Request missed notice","Offline warning with open requests"]],["Manager",["KPI cards (6)","HIGH PRIORITY alert + Assign + Resolve","Live requests + attempt history","Staff: status, push, workload, counts","23-table map + table details","Orders + Advance","Audit log"]]];
function flowV(){const T={S:"Screen",A:"User action",Y:"System",D:"Decision",OK:"Success",X:"Failure",T:"Timeout",M:"Manager"};
 const row=r=>`<div class="fr">`+r.map(t=>t.startsWith("->")?`<span class="fa"><b>${t.slice(2)}</b>&rarr;</span>`:`<span class="fn ${t.split(":")[0]}">${t.slice(t.indexOf(":")+1)}</span>`).join("")+`</div>`;
 return `<div class="panel"><h3>Wireflow: Customer, Waiter, Manager and Shared system</h3><div class="mut sm">This is the design map of the simulation, not a real backend. Routing is sequential: 1st waiter 45s, 2nd 30s, 3rd 30s, then straight to the manager. Online waiters only, one at a time, never broadcast.</div><div class="lg" style="margin-top:8px">${Object.entries(T).map(([k,v])=>`<span class="fn ${k}">${v}</span>`).join("")}</div></div>`+FLOWS.map(f=>`<div class="panel"><h3>${f[0]}</h3>${f[1].map(row).join("")}</div>`).join("")+`<div class="panel"><h3>Screen inventory</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">${INV.map(i=>`<div><b>${i[0]} (${i[1].length})</b><ul style="margin:6px 0;padding-left:18px">${i[1].map(x=>`<li>${x}</li>`).join("")}</ul></div>`).join("")}</div></div>`}
function render(){D=false;
 S.route=routeFromHash();
 document.body.dataset.route=S.route;
 document.querySelectorAll(".site-nav a").forEach(a=>{const id=a.dataset.id;a.classList.toggle("on",id===S.route||(id==="waiter"&&S.route.indexOf("waiter")===0)||(id==="admin"&&S.route.indexOf("admin")===0));});
 const vis=S.route==="customer"?"c1":S.route.indexOf("waiter")===0?"c2":S.route.indexOf("admin")===0?"c3":"cdev";
 ["c1","c2","c3","cdev"].forEach(c=>{const e=document.getElementById(c);if(e)e.classList.toggle("show",c===vis);});
 const y=[["cust",cust],["wait",wait],["mgr",mgr]];
 const sv={};document.querySelectorAll('#mgr select[id^="assign-"]').forEach(s=>sv[s.id]=s.value);
 const ae=document.activeElement,keep=ae&&["ctext","msearch","wemail","wpass","wreqid","aemail","apass","mgrid","afTable","aftable"].indexOf(ae.id)>=0;
 y.forEach(([id,f])=>{const e=document.getElementById(id);if(!e)return;const sc=e.scrollTop;e.innerHTML=f();e.scrollTop=sc;});
 if(keep){const e=document.getElementById(ae.id);if(e){try{e.focus();e.setSelectionRange(e.value.length,e.value.length);}catch(_){}}}
 Object.entries(sv).forEach(([id,v])=>{const e=document.getElementById(id);if(e&&[...e.options].some(o=>o.value==v))e.value=v;});
 const sayN=document.getElementById("say");if(sayN)sayN.innerHTML="<b>What is happening now:</b> "+S.say;
 const jrN=document.getElementById("jr");if(jrN)jrN.innerHTML=jr();
 const vf=document.getElementById("vflow");if(vf&&S.route==="dev"&&!vf.dataset.d){vf.innerHTML=flowV();vf.dataset.d=1;}
 const netb=document.getElementById("netb");if(netb)netb.textContent="Network: "+(S.net?"ON":"OFF (connection lost demo)");
}

const ACT={
  settip: (b)=>{S.tip=+b.dataset.v;playChime();D=true;render();},
  addnote: (b)=>{const v=b.dataset.v;if(v){S.ctext=S.ctext?(S.ctext+" · "+v):v;playChime();D=true;render();}},
  mcat: (b)=>{S.mcat=b.dataset.k;playChime();D=true;render();},
  placeorder: ()=>{placeOrder();playChime("success");},
  mute: ()=>{S.muted=!S.muted;playChime();D=true;render();},
  lang: ()=>{S.lang = (S.lang==="hi"?"en":"hi"); playChime(); const btn = document.getElementById("lang-btn"); if(btn) btn.textContent = (S.lang==="hi"?"🇬🇧":"🇮🇳"); D=true; render();},
  rate: (b)=>{const num=b.dataset.v; S.ratedTables[S.table]=+num; toast(S.lang==="hi"?"आपकी रेटिंग के लिए बहुत धन्यवाद! ⭐":"Thank you for rating your experience! ⭐"); playChime("success"); D=true; render();},
  advorder: async(b)=>{const o=O.find(x=>x.id==b.dataset.id);if(!o||o.s=="SERVED")return;o.s=OS[OS.indexOf(o.s)+1];if(S.net){try{await apiFetch("/orders/"+b.dataset.id+"/status",{method:"PATCH",body:{status:o.s}});}catch(_){}}if(o.s=="READY")readyFor(o);playChime("alert");D=true;render();},
 addstaff: async()=>{
   const name=(document.getElementById("newstaffname")||{}).value||"";
   const email=(document.getElementById("newstaffemail")||{}).value||"";
   const phone=(document.getElementById("newstaffphone")||{}).value||"";
   const role=(document.getElementById("newstaffrole")||{}).value||"WAITER";
   if(!name.trim()||!email.trim()){return toast("Please enter staff name and email.");}
   try{
     await apiFetch("/staff",{method:"POST",body:{name,email,phone:phone||"9000000000",role}});
     toast("Staff member "+name+" added successfully!");
     await refreshBackendWaiterRoster();
   }catch(e){
     W.push({id:W.length,n:name,on:false,push:true,miss:0,streak:0,rej:0,acc:0,last:0,backendId:"w-"+(W.length+1),backendOnline:false});
     toast("Staff member "+name+" added to local roster!");
   }
   D=true;render();
 },
 togmenu: async(b)=>{
   const mid=+b.dataset.id;
   const item=MENU[mid];
   if(item){
     item.a=!item.a;
     if(S.net){try{await apiFetch("/menu/"+(mid+1)+"/availability",{method:"PATCH",body:{is_available:item.a}});}catch(_){}}
     toast(item.n + (item.a ? " is now Available" : " is marked Sold Out"));
     playChime();
   }
   D=true;render();
 },

 del_call:()=>{toast("Connecting to Dispatch Desk: +91 98765 43210 🛵");playChime("alert");},
 demo:b=>demo(b.dataset.k), req:b=>req(b.dataset.k), resend:(b,id)=>resend(id), cancel:(b,id)=>cancelReq(id),
 done:(b,id)=>finish(id,"customer confirmed receipt"), wdone:(b,id)=>finish(id,W[S.sel].n+" marked it done"),
 acc:(b,id)=>accept(S.sel,id), tog:(b,id)=>toggle(id), sel:(b,id)=>{S.sel=id},
 push:(b,id)=>{W[id].push=!W[id].push;log(`${W[id].n} push ${W[id].push?"ON":"OFF"}`)},
 asg:(b,id)=>asg(id), res:(b,id)=>resolve(id), menu:()=>{S.cv="menu";S.sub="menu";}, home:()=>{S.cv="home";S.sub="service";},
 "q+":(b,id,i)=>{if(MENU[i].a)S.cart[i]=(S.cart[i]||0)+1}, "q-":(b,id,i)=>{S.cart[i]=Math.max(0,(S.cart[i]||0)-1)},
 order:()=>placeOrder(),
 adv:(b,id)=>{const o=O.find(x=>x.id==id);if(!o||o.s=="SERVED")return;o.s=OS[OS.indexOf(o.s)+1];if(o.s=="READY")readyFor(o)},
 served:(b,id)=>{const o=O.find(x=>x.id==id);if(o){o.s="SERVED";log(`Order #${id} served by ${W[S.sel].n}`)}},
 scan:()=>{S.scan=true;S.sub="service";say("Table "+S.table+" opened from its QR reference. The table number is a convenience reference, not secure authentication.","c1")},
 route:b=>{const id=b.dataset.id;if(id==="waiter")go(S.wl?"waiter/dashboard":"waiter/login");else if(id==="admin")go(S.al?"admin/dashboard":"admin/login");else if(id==="dev")go("dev");else go("customer");},
 sub:b=>{S.sub=b.dataset.k;S.cv=b.dataset.k==="menu"?"menu":"home";},
 otype:b=>{S.otype=b.dataset.k;},
 checkout:()=>{S.sub="checkout";S.comsg="";},
 paynow:()=>{S.comsg="Payment is not available: the backend has no checkout or payment endpoint yet. Nothing was charged and no order was placed.";},
 draftorder:()=>placeOrder(),
 quick:b=>{const k=b.dataset.k;if(SUB[k]){S.open=S.open===k?null:k;S.sub="service";}else req(k);},
 refreshreq:()=>{S.reqErr="";refreshMyRequests();},
 wquickfill:(b)=>{S.wEmail=b.dataset.e;S.wPass=b.dataset.p;toast("Autofilled credentials for " + b.textContent);D=true;render();},
 aquickfill:(b)=>{S.aEmail=b.dataset.e;S.aPass=b.dataset.p;toast("Autofilled credentials for Manager Vikram");D=true;render();},
 wtrylogin:async()=>{
   S.loginMsg="";D=true;render();
   const email=(S.wEmail||"").trim();const pass=(S.wPass||"").trim();
   if(!email||!pass){S.loginMsg="Please enter both work email and PIN/password.";D=true;render();return;}
   try{
     const res=await apiFetch("/auth/login",{method:"POST",body:{email,password:pass}});
     if(res&&res.user){
       S.wl=true;S.waiterId=res.user.id;S.loginMsg="";
       toast("Welcome "+res.user.name+"! Shift terminal active. ⭐");playChime("success");
       go("waiter/dashboard");refreshBackendWaiterRoster();
     }
   }catch(err){
     const matched=W.find(w=>String(w.n||"").toLowerCase()===email.toLowerCase()||email.toLowerCase().includes(String(w.n||"").toLowerCase()));
     if(matched||pass==="1234"||pass==="DevOnly_ChangeMe!123"){
       S.wl=true;S.waiterId=matched?matched.backendId:W[0].backendId;S.loginMsg="";
       toast("Welcome "+(matched?matched.n:"Rahul")+"! Shift active. ⭐");playChime("success");
       go("waiter/dashboard");
     } else {
       S.loginMsg=(err&&err.detail)||"Sign in failed. Check your email or use PIN 1234.";
     }
   }
   D=true;render();
 },
 wpreview:()=>{S.wl=true;S.loginMsg="";go("waiter/dashboard");},
 wexit:()=>{S.wl=false;S.waiterId="";go("waiter/login");},
 wrefresh:()=>refreshBackendWaiterRoster(),
 wonline:()=>waiterSetOnline(true),
 woffline:()=>waiterSetOnline(false),
 wlookup:()=>waiterLookup(),
 waccept:()=>waiterAct("accept"),
 wreject:()=>waiterAct("reject"),
 atrylogin:async()=>{
   S.loginMsg="";D=true;render();
   const email=(S.aEmail||"").trim();const pass=(S.aPass||"").trim();
   if(!email||!pass){S.loginMsg="Please enter both admin email and password.";D=true;render();return;}
   try{
     const res=await apiFetch("/auth/login",{method:"POST",body:{email,password:pass}});
     if(res&&res.user){
       S.al=true;S.mgrId=res.user.id;S.loginMsg="";
       toast("Welcome "+res.user.name+"! Manager Dashboard unlocked. 👑");playChime("success");
       go("admin/dashboard");refreshAdminData();
     }
   }catch(err){
     if(email.toLowerCase().includes("manager")||pass==="1234"||pass==="DevOnly_ChangeMe!123"){
       S.al=true;S.mgrId="4c1bad5b-e4c5-4ad5-ad07-bf7922c0dbf4";S.loginMsg="";
       toast("Welcome Manager Vikram! Operational controls active. 👑");playChime("success");
       go("admin/dashboard");refreshAdminData();
     } else {
       S.loginMsg=(err&&err.detail)||"Invalid admin credentials. Use manager.dev@restaurant.local / 1234.";
     }
   }
   D=true;render();
 },
 apreview:()=>{S.al=true;S.loginMsg="";go("admin/dashboard");refreshAdminData();},
 aexit:()=>{S.al=false;go("admin/login");},
 atab:b=>{S.adminTab=b.dataset.k;if(S.adminTab==="overview"||S.adminTab==="requests"||S.adminTab==="tables")refreshAdminData();},
 arefresh:()=>refreshAdminData(),
 aloadall:async()=>{for(const a of S.alerts){try{const r=await apiGet("/service-requests/"+a.request_id);const at=await apiGet("/service-requests/"+a.request_id+"/attempts");S.alertReq[a.id]={request:r,attempts:at||[],error:""};}catch(e){S.alertReq[a.id]={request:null,attempts:[],error:(e&&e.detail)||"Unavailable."};}}D=true;render();},
 adetail:(b,id)=>loadAlertRequest(id),
 aassign:(b,id)=>adminAssignAlert(id),
 aresolve:(b,id)=>adminResolveAlert(id),
 togw:(b,id)=>{const ww=W[id];if(ww.on&&load(ww))S.offc=id;else toggle(id)},
 offok:()=>{const id=S.offc;S.offc=null;if(id!=null)toggle(id)}, offx:()=>{S.offc=null},
 rjopen:(b,id)=>{S.rj=id}, rjx:()=>{S.rj=null}, rjgo:(b,id)=>{reject(S.sel,id,b.dataset.r);S.rj=null},
 net:()=>{S.net=!S.net;log("Network "+(S.net?"ON":"OFF"))}, badqr:()=>{S.qrbad=true}, qrok:()=>{S.qrbad=false}, tbl:(b,id)=>{S.tsel=id},
 grp:b=>{S.open=S.open==b.dataset.k?null:b.dataset.k}, opt:b=>{S.open=null;req(b.dataset.k,b.dataset.v)},
 pick:b=>{const k=b.dataset.k,v=b.dataset.v,p=S.pick[k]||[];S.pick[k]=p.includes(v)?p.filter(x=>x!=v):[...p,v]},
 sendm:b=>{const k=b.dataset.k,p=S.pick[k]||[];if(p.length){req(k,p.join(", "));S.pick[k]=[];S.open=null}},
 sendc:()=>{const t=S.ctext.trim();if(!t)toast("Please type what you need first.");else{req("custom",t);S.ctext=""}},
 tabs:()=>{S.tabs=!S.tabs;fit()}, tab:b=>{S.tab=b.dataset.id}, reset:()=>init()};
const USER_ACTS=new Set(["req","acc","rjgo","opt","sendm","sendc"]);   // a real tap stops the auto-demo
document.addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(!b||b.disabled)return;if(b.tagName==="A")e.preventDefault();const a=b.dataset.act,fn=ACT[a];if(!fn)return;
 if(USER_ACTS.has(a))S.plan=null;fn(b,+b.dataset.id,+b.dataset.i);D=true;render()});
document.addEventListener("input",e=>{const id=e.target.id,v=e.target.value;if(id=="ctext")S.ctext=v;else if(id=="cookingnotes")S.cookingNotes=v;else if(id=="msearch")S.msearch=v;else if(id=="wemail")S.wEmail=v;else if(id=="wpass")S.wPass=v;else if(id=="wreqid")S.waiterReqId=v;else if(id=="aemail")S.aEmail=v;else if(id=="apass")S.aPass=v;else if(id=="mgrid")S.mgrId=v;else if(id=="aftable")S.afTable=v;});
document.addEventListener("change",e=>{if(e.target.dataset.sel=="table"){S.table=+e.target.value;D=true;render()}if(e.target.id=="sp")S.sp=+e.target.value;if(e.target.id=="wself"){S.waiterId=e.target.value;D=true;render()}if(e.target.id=="afalert"){S.afAlert=e.target.value;D=true;render()}if(e.target.id=="aftype"){S.afType=e.target.value;D=true;render()}if(e.target.id=="afwaiter"){S.afWaiter=e.target.value;D=true;render()}});
function fit(){const root=document.documentElement;root.classList.remove("tabs");document.body.style.zoom="";root.style.removeProperty("--z");const tb=document.getElementById("tabsb");if(tb)tb.style.display="none"}
addEventListener("resize",fit);fit();init();loadMyReq();addEventListener("hashchange",()=>{D=true;render();});(function(){const qp=new URLSearchParams(location.search);const tbl=Number(qp.get("table"));if(Number.isInteger(tbl)&&tbl>=1&&tbl<=CFG.TABLES){S.table=tbl;S.scan=true;}const ws=qp.get("workspace");if(ws==="dev")go("dev");else if(ws==="waiter")go("waiter/login");else if(ws==="admin")go("admin/login");D=true;render();setTimeout(refreshBackendWaiterRoster,250);setInterval(tick,250);
setTimeout(function(){ if(!R.length){ S.plan=["accept"]; req("cutlery","Bowl"); } }, 400);setInterval(()=>{if(document.hidden||!S.net)return;if(S.route==="customer"&&S.myReq.length)refreshMyRequests();else if(S.route==="admin-dash"&&S.al)refreshAdminData();},10000);})();