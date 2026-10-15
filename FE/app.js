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

/* Smart Table Service - Core Simulation & Backend Bridge */
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
const esc=x=>String(x==null?"":x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const INR=n=>"\u20b9"+Number(n||0).toLocaleString("en-IN");
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
  {id:1,n:"Veg Dum Biryani",p:200,a:true,d:"Hyderabadi fragrant basmati rice layered with spiced cottage cheese & saffron",icon:"🍚",tag:"House Special",veg:true,cat:0},
  {id:2,n:"Tandoori Roti",p:20,a:true,d:"Traditional whole wheat bread baked fresh in earthen clay tandoor",icon:"🫓",tag:"",veg:true,cat:0},
  {id:3,n:"Butter Garlic Naan",p:40,a:true,d:"Crispy clay-oven baked bread brushed with garlic butter and fresh cilantro",icon:"🫓",tag:"Popular",veg:true,cat:0},
  {id:4,n:"Steam Basmati Rice",p:100,a:true,d:"Fluffy long-grain basmati steamed to perfection",icon:"🍚",tag:"",veg:true,cat:0},
  {id:5,n:"Jeera Rice",p:130,a:true,d:"Long-grain basmati tempered with royal cumin seeds and organic ghee",icon:"🍚",tag:"",veg:true,cat:0},
  {id:6,n:"Yellow Dal Tadka",p:180,a:true,d:"Yellow lentils tempered with fried garlic, cumin, ghee and dried red chillies",icon:"🍲",tag:"Homestyle",veg:true,cat:0},
  {id:7,n:"Fresh Mint Lime Soda",p:40,a:true,d:"Refreshing sparkling soda with freshly squeezed lime, crushed mint & black salt",icon:"🍋",tag:"Cooling",veg:true,cat:1},
  {id:8,n:"Sweet Mango Lassi",p:70,a:true,d:"Thick creamy chilled yogurt churned with sweet Alphonso mango pulp",icon:"🥭",tag:"Refreshing",veg:true,cat:1},
  {id:9,n:"Gulab Jamun with Rabdi",p:70,a:true,d:"Warm soft khoya dumplings soaked in saffron syrup, served with creamy rabdi",icon:"🍨",tag:"Sweet Delight",veg:true,cat:1}
];

const OS=["PENDING","CONFIRMED","PREPARING","READY","SERVED"];
let W=[],R=[],A=[],O=[],P={7:0},L=[],S={},D=true;
const LB=r=>TN[r.k]+(r.d?" ("+esc(r.d)+")":"");
const fmt=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0")};
const API_BASE = new URLSearchParams(location.search).get("apiBase") || "http://127.0.0.1:8000/api/v1";
function apiUrl(path){return API_BASE.replace(/\/$/, "") + (String(path).startsWith("/") ? path : "/" + path);}
class ApiError extends Error{constructor(status, detail){super(detail || ("Request failed with status " + status));this.name="ApiError";this.status=status;this.detail=detail;}}

async function apiFetch(path, options){
  options = options || {};
  const headers = Object.assign({"Accept":"application/json", "Content-Type":"application/json"}, options.headers || {});
  if(S && S.token) headers["Authorization"] = "Bearer " + S.token;
  const response = await fetch(apiUrl(path), {
    method: options.method || "GET",
    headers: headers,
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

async function apiGet(path){return apiFetch(path,{method:"GET"});}

/* State Initialization */
function init(){
  W=["Rahul","Aman","Vikas","Suresh","Mohit"].map((n,i)=>({id:i,n,on:true,push:true,miss:0,streak:0,rej:0,acc:0,last:0}));
  R=[];A=[];O=[];P={7:0};L=[];
  S={
    t:0,seq:0,lt:performance.now(),sv:[],sp:3,table:7,cv:"home",cart:{},sel:0,tab:"c1",
    toast:"",tt:0,rid:500,oid:0,aid:0,tabs:false,queue:null,qt:0,pb:0,open:null,
    customerSubmitting:false,pick:{},ctext:"",route:"customer",sub:"service",msearch:"",
    otype:"dine-in",comsg:"",net:true,backendConnected:false,wl:false,al:false,
    backendRosterLoading:false,backendRosterLoaded:false,backendRosterError:"",backendRosterCount:0,
    wn:{},qrbad:false,tsel:null,ac:[],scan:true,muted:false,tip:0,mcat:"all",lang:"en",
    ratedTables:{},cookingNotes:"",say:"Welcome to Grand Bistro & Cafe.",look:"c1",pre:"",
    myReq:[],reqCache:{},reqErr:"",waiterId:"",waiterReqId:"",waiterReq:null,waiterAtt:[],
    waiterTasks:{incoming:[],in_progress:[]},waiterMsg:"",waiterErr:"",
    adminTab:"overview",afAlert:"all",afType:"all",afTable:"",afWaiter:"all",
    kpis:null,tablesMap:[],alerts:[],alertErr:"",alertSel:null,alertReq:{},
    mgrId:"",assignMsg:"",wEmail:"rahul.dev@restaurant.local",wPass:"DevOnly_ChangeMe!123",
    aEmail:"manager.dev@restaurant.local",aPass:"DevOnly_ChangeMe!123",loginMsg:"",token:null,
    receiptModalOrder:null,payModalOrder:null,showStandeesModal:false,kdsFilter:"ALL"
  };
  D=true;
}

const log=m=>{L.unshift(fmt(S.t)+"  "+m);L.length=Math.min(L.length,12);};
const say=(m,l)=>{S.say=m;if(l)S.look=l;D=true;};
const toast=m=>{S.toast=m;S.tt=Date.now()+3500;D=true;};
const fs=w=>w.acc+R.filter(r=>r.cur&&r.cur.w==w.id).length;
const load=w=>R.filter(r=>(r.status=="ACCEPTED"&&r.by==w.id)||(r.cur&&r.cur.w==w.id)).length;
const open=r=>!["CLOSED","CANCELLED"].includes(r.status);
const tries=r=>r.at.filter(a=>!a.mgr&&a.st!="CANCELLED").length;
const rank=(a,b)=>fs(a)-fs(b)||load(a)-load(b)||a.last-b.last;

/* Backend Live Sync Layer */
const LS_KEY = "sts_my_requests_v1";
function loadMyReq(){try{const v=JSON.parse(localStorage.getItem(LS_KEY)||"[]");if(Array.isArray(v))S.myReq=v.filter(n=>Number.isInteger(n));}catch{}}
function saveMyReq(){try{localStorage.setItem(LS_KEY,JSON.stringify(S.myReq.slice(-20)));}catch{}}
function fmtTime(iso){if(!iso)return "—";const d=new Date(iso);return isNaN(d)?"—":d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}
function reqStatusLabel(s){return String(s||"UNKNOWN");}
function backendWaiterName(id){const w=W.find(x=>x.backendId===id);return w?w.n:"—";}

async function checkBackendHealth(){
  try{
    const h = await apiGet("/health");
    if(h && h.status === "healthy"){
      S.backendConnected = true;
      S.net = true;
    }
  }catch(_){
    S.backendConnected = false;
  }
}

async function refreshBackendWaiterRoster(){
  S.backendRosterLoading = true;
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
        }
      });
      S.backendRosterLoaded = true;
      S.backendRosterCount = (waiters || []).length;
      if(!S.waiterId && waiters && waiters.length) S.waiterId = waiters[0].id;
      backendOk = true;
      S.backendConnected = true;
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
  }
  S.backendRosterLoading = false;
  D = true; render();
}

async function refreshMyRequests(){
  if(!S.myReq.length)return;
  for(const id of S.myReq.slice(-8)){
    try{
      const r=await apiGet("/service-requests/"+id);
      S.reqCache[id]={status:r.status,table:r.table_id,key:r.service_key,details:r.details,resends:r.resend_count,accepted:r.accepted_at,closed:r.closed_at,error:""};
    }catch(e){
      S.reqCache[id]=Object.assign(S.reqCache[id]||{},{error:(e&&e.detail)||"Status unavailable."});
    }
  }
  D=true;render();
}

async function refreshTableOrders(){
  if(!S.table)return;
  try{
    const orders = await apiGet("/orders?table_id=" + S.table);
    if(Array.isArray(orders)){
      // Merge with O
      orders.forEach(backendOrder => {
        const existing = O.find(o => o.id === backendOrder.id);
        const itStr = (backendOrder.items || []).map(it => it.quantity + "x " + it.item_name).join(", ");
        if(existing){
          existing.s = backendOrder.status;
          existing.total = backendOrder.total_amount;
          existing.items = itStr || existing.items;
          existing.backend = true;
        } else {
          O.push({
            id: backendOrder.id,
            table: backendOrder.table_id,
            items: itStr || "Table Gourmet Order",
            s: backendOrder.status,
            w: null,
            time: Date.parse(backendOrder.created_at) || Date.now(),
            total: backendOrder.total_amount,
            backend: true
          });
        }
      });
      D=true;render();
    }
  }catch(_){}
}

async function refreshKitchenOrders(){
  try{
    const orders = await apiGet("/orders?limit=50");
    if(Array.isArray(orders)){
      orders.forEach(bo => {
        const existing = O.find(o => o.id === bo.id);
        const itStr = (bo.items || []).map(it => it.quantity + "x " + it.item_name).join(", ");
        if(existing){
          existing.s = bo.status;
          existing.total = bo.total_amount;
          existing.items = itStr || existing.items;
          existing.backend = true;
          existing.notes = bo.special_instructions || "";
        } else {
          O.push({
            id: bo.id,
            table: bo.table_id,
            items: itStr || "Table Order",
            s: bo.status,
            w: null,
            time: Date.parse(bo.created_at) || Date.now(),
            total: bo.total_amount,
            notes: bo.special_instructions || "",
            backend: true
          });
        }
      });
      D=true;render();
    }
  }catch(_){}
}

async function refreshWaiterTasks(){
  if(!S.waiterId)return;
  try{
    const res = await apiGet("/waiters/" + S.waiterId + "/tasks");
    if(res && res.incoming){
      S.waiterTasks = res;
      D=true;render();
    }
  }catch(_){}
}

async function refreshAdminData(){
  if(!S.net)return;
  let backendOk=false;
  try{
    S.kpis=await apiGet("/manager/dashboard");
    S.tablesMap=await apiGet("/manager/tables")||[];
    S.alerts=await apiGet("/manager/alerts?is_open=true")||[];
    S.alertErr="";backendOk=true;S.backendConnected=true;
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

/* Realtime Event Stream (WebSocket & SSE fallback) */
let realtimeSocket = null;
function initRealtimeEvents(){
  try{
    const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + (new URL(apiUrl("/")).host) + "/api/v1/ws";
    realtimeSocket = new WebSocket(wsUrl);
    realtimeSocket.onopen = () => {
      S.backendConnected = true;
      D=true;render();
    };
    realtimeSocket.onmessage = (event) => {
      try{
        const msg = JSON.parse(event.data);
        if(msg.event === "ORDER_CREATED" || msg.event === "ORDER_UPDATED"){
          refreshTableOrders();
          refreshKitchenOrders();
          playChime("alert");
        } else if(msg.event === "REQUEST_CREATED" || msg.event === "REQUEST_UPDATED"){
          refreshMyRequests();
          refreshWaiterTasks();
          refreshAdminData();
          playChime("alert");
        } else if(msg.event === "WAITER_UPDATED"){
          refreshBackendWaiterRoster();
        }
      }catch(_){}
    };
    realtimeSocket.onerror = () => {
      initSseFallback();
    };
  }catch(_){
    initSseFallback();
  }
}

function initSseFallback(){
  try{
    const sse = new EventSource(apiUrl("/events/stream"));
    sse.addEventListener("ORDER_CREATED", () => { refreshTableOrders(); refreshKitchenOrders(); });
    sse.addEventListener("ORDER_UPDATED", () => { refreshTableOrders(); refreshKitchenOrders(); });
    sse.addEventListener("REQUEST_CREATED", () => { refreshMyRequests(); refreshWaiterTasks(); refreshAdminData(); });
    sse.addEventListener("REQUEST_UPDATED", () => { refreshMyRequests(); refreshWaiterTasks(); refreshAdminData(); });
  }catch(_){}
}

/* Routing Logic */
function pick(r){
 const x=[...r.at.map(a=>a.w),...r.ex],el=W.filter(w=>w.on&&!x.includes(w.id));if(!el.length)return null;
 const wp=el.filter(w=>w.push),pool=wp.length?wp:el;
 const best=[...pool].sort(rank)[0],p=pool.find(w=>w.id==P[r.table]);
 if(p&&!tries(r)&&fs(p)-fs(best)<CFG.OVERLOAD)return p;
 return best;
}

function assign(r,mw){
 const w=mw!=null?W[mw]:pick(r);if(!w)return fail(r,tries(r)?"ALL":"NONE");
 const first=mw==null&&!tries(r),secs=first?CFG.FIRST:CFG.NEXT,pw=P[r.table]!=null?W[P[r.table]]:null;
 if(mw!=null&&r.by!=null){r.ex.push(r.by);r.by=null;}
 w.last=++S.seq;if(S.rj==null)S.sel=w.id;A.forEach(a=>{if(a.r==r.id)a.open=false;});
 r.status=tries(r)?"ESCALATED":"ASSIGNED";r.cur={w:w.id,dl:S.t+secs*1000};r.at.push({w:w.id,st:"WAITING",secs,t:S.t,dl:S.t+secs*1000,mgr:mw!=null});
 const why=mw!=null?"Chosen by the manager.":!first?"Next online waiter with the least work so far, "+secs+" sec.":w.id==P[r.table]?"First waiter: the primary waiter of this table, "+secs+" sec.":pw&&pw.on&&pw.push&&pw.id!=w.id?"Table "+r.table+"'s primary waiter ("+pw.n+") already carries much more work, so fair share picked the least busy waiter, "+secs+" sec.":"First waiter: the one with the least work so far (fair share), "+secs+" sec.";
 log(`#${r.id} T${r.table} ${LB(r)} &rarr; ${w.n} (${secs}s, ${mw!=null?"by manager":"attempt "+tries(r)})`);
 say(S.pre+`Request sent to ${w.n} (${mw!=null?"manager assigned":"attempt "+tries(r)+"/"+CFG.TRIES}). Must accept within ${secs} sec. `+why,"c2");S.pre="";D=true;
}

function fail(r,type){
 r.status="FAILED";r.cur=null;r.last=S.t;r.rs=false;A.push({id:++S.aid,r:r.id,type,open:true,at:S.t});const n=tries(r);
 log(`#${r.id} FAILED &rarr; manager alert (${type=="NONE"?"no waiter online":n+" attempts fail"})`);
 say(S.pre+(type=="NONE"?"No waiter is online, so a HIGH PRIORITY alert went straight to the Manager. ":n+" waiters did not respond, so a HIGH PRIORITY alert went to the Manager. ")+"On the Manager screen you can assign a waiter or resolve the alert.","c3");S.pre="";D=true;
}

function next(r){if(tries(r)>=CFG.TRIES)fail(r,"ALL");else assign(r);}
function end(r,st){const a=r.at[r.at.length-1];a.st=st;a.e=S.t;r.cur=null;D=true;}

function tick(){
 const now=performance.now(),dt=Math.min(now-S.lt,5000)*S.sp;S.lt=now;S.t+=dt;
 R.forEach(r=>{
  if(r.cur&&S.t>=r.cur.dl){
   const w=W[r.cur.w];w.miss++;w.streak++;log(`#${r.id} ${w.n} did not accept (MISSED)`);
   S.wn[w.id]={m:`Table ${r.table} (${LB(r)}): no response, the request moved to the next waiter.`,x:Date.now()+9000};
   S.pre=w.n+" did not respond within "+r.at[r.at.length-1].secs+" sec (MISSED), so the request moved to the next waiter automatically. ";end(r,"MISSED");next(r);
  }
  if(open(r)&&!r.rs&&S.t-r.last>=CFG.RESEND){
   r.rs=true;
   if(r.rsn>=CFG.RESEND_MAX&&!r.cur&&!A.some(a=>a.open&&a.r==r.id)){
    A.push({id:++S.aid,r:r.id,type:"LIMIT",open:true,at:S.t});log(`#${r.id} customer used all resends &rarr; manager alert`);
   }
   D=true;
  }
  if(r.status=="ACCEPTED"){if(S.t-r.acc>=CFG.CLOSE){r.status="CLOSED";log(`#${r.id} auto-closed 10 min after accept`);say("The request closed automatically 10 min after being accepted.","c3");}}
 });
 for(const k in S.wn)if(Date.now()>S.wn[k].x){delete S.wn[k];D=true;}
 if(S.queue&&S.queue.length){const busy=R.some(r=>r.cur||["PENDING","ASSIGNED","ESCALATED"].includes(r.status));if(!busy){if(!S.qt)S.qt=Date.now()+2500;else if(Date.now()>=S.qt){S.qt=0;S.queue.shift()();}}}
 if(S.plan)R.forEach(r=>{if(r.cur){if(S.sel!=r.cur.w){S.sel=r.cur.w;D=true;}const pl=S.plan,act=(Array.isArray(pl[0])?pl[r.id-S.pb-1]||[]:pl)[r.at.length-1];if(!r.cur.pl)r.cur.pl=Date.now()+1500;else if(act&&act!="ignore"&&Date.now()>=r.cur.pl){const w=r.cur.w;act=="accept"?accept(w,r.id):reject(w,r.id,"Busy");}}});
 document.querySelectorAll("[data-pb]").forEach(e=>{const p=e.dataset.pb.split("|");e.style.width=Math.min(100,100-(+p[0]-S.t)/(p[1]*10))+"%"});
 if(S.toast&&Date.now()>S.tt){S.toast="";D=true;}
 document.querySelectorAll("[data-cd]").forEach(e=>e.textContent=fmt(+e.dataset.cd-S.t));
 document.querySelectorAll("[data-age]").forEach(e=>e.textContent=fmt(S.t-+e.dataset.age));
 if(D)render();
}

/* Customer Request Placement */
async function req(k,det){
 if(!S.net)return toast("No internet. Please try again when the connection is back.");
 if(S.plan){
  const same=r=>r.table==S.table&&r.k==k&&(k!="custom"||r.d==(det||""))&&(["PENDING","ASSIGNED","ESCALATED","FAILED"].includes(r.status)||(r.status=="ACCEPTED"&&S.t-r.acc<CFG.DUP_ACCEPT));
  if(R.some(same))return toast("This request has already been sent.");
  const r={id:++S.rid,table:S.table,k,d:det||"",status:"PENDING",at:[],ex:[],cur:null,by:null,rsn:0,last:S.t,rs:false,t0:S.t,acc:0,backend:false};R.push(r);
  log(`#${r.id} Table ${r.table}: ${LB(r)} request`);toast(LB(r)+" request sent.");assign(r);D=true;render();return;
 }
 if(S.customerSubmitting)return toast("Request is already being sent.");
 S.customerSubmitting=true;D=true;render();
 try{
  const response=await apiFetch("/service-requests",{method:"POST",body:{table_id:S.table,service_key:k,details:(det==null?"":String(det).trim())}});
  const r={id:response.id,table:response.table_id,k:response.service_key,d:response.details==null?"":response.details,status:response.status,backend:true,backendAcceptedBy:response.accepted_by||null,backendResendCount:response.resend_count==null?0:response.resend_count,rsn:response.resend_count==null?0:response.resend_count,acc:response.accepted_at?Date.parse(response.accepted_at):null,closedAt:response.closed_at?Date.parse(response.closed_at):null,cur:null,by:null,at:[],ex:[],rs:false,last:S.t,t0:S.t};
  R.push(r);if(!S.myReq.includes(r.id)){S.myReq.push(r.id);saveMyReq();}
  S.sub="orders";log(`#${r.id} Table ${r.table}: ${LB(r)} request`);
  toast(LB(r)+" request sent to live backend.");
  playChime("success");
  say("Request sent and routed by the backend database.","c1");
  refreshMyRequests();
 }catch(e){
  if(e && e.status===409){toast(e.detail || "This request has already been sent.");}
  else {
    const r={id:++S.rid,table:S.table,k,d:det||"",status:"PENDING",at:[],ex:[],cur:null,by:null,rsn:0,last:S.t,rs:false,t0:S.t,acc:0,backend:false};
    R.push(r);if(!S.myReq.includes(r.id)){S.myReq.push(r.id);saveMyReq();}
    S.reqCache[r.id]={status:"PENDING",table:r.table,key:r.k,details:r.d,resends:0,accepted:null,closed:null,error:""};
    log(`#${r.id} Table ${r.table}: ${LB(r)} request`);toast(LB(r)+" request sent (simulation).");
    assign(r);
  }
 }
 S.customerSubmitting=false;D=true;render();
}

async function resend(id){
 const r=R.find(x=>x.id==id);if(!r||!r.rs)return;
 if(r.rsn>=CFG.RESEND_MAX)return toast("Resend limit ("+CFG.RESEND_MAX+") reached.");if(r.cur)return toast("The request is currently with a waiter.");
 try{
  const response=await apiFetch("/service-requests/"+id+"/resend",{method:"POST"});
  r.rsn=response.resend_count==null?r.rsn+1:response.resend_count;
  r.backendResendCount=r.rsn;r.last=S.t;r.rs=false;r.status=response.status;
  A.forEach(a=>{if(a.r==r.id)a.open=false});
  log("#"+r.id+" customer resent (#"+r.rsn+")");
  toast("Request sent again to next waiter.");
  playChime("alert");
 }catch(e){
  r.rsn++;r.last=S.t;r.rs=false;
  if(r.status=="ACCEPTED"){r.ex.push(r.by);r.by=null;}
  A.forEach(a=>{if(a.r==r.id)a.open=false;});r.at=[];r.status="PENDING";
  log(`#${r.id} customer resent (#${r.rsn})`);toast("Request sent again.");assign(r);
 }
 D=true;render();
}

async function cancelReq(id){
 const r=R.find(x=>x.id==id);if(!r||!open(r))return;
 try{
  const response=await apiFetch("/service-requests/"+id+"/cancel",{method:"POST",body:{table_id:r.table}});
  r.status=response.status;r.cur=null;r.rs=false;
  A.forEach(a=>{if(a.r==r.id)a.open=false;});
  toast("Request cancelled.");playChime("alert");
 }catch(e){
  if(r.cur)end(r,"CANCELLED");r.cur=null;r.status="CANCELLED";
  A.forEach(a=>{if(a.r==r.id)a.open=false;});
  toast("Request cancelled.");playChime("alert");
 }
 D=true;render();
}

/* Customer Food Order Submission with Backend DB Persistence */
async function placeOrder(){
 if(!S.net)return toast("No internet. Please try again when the connection is back.");
 const orderItems = [];
 const itStr = [];
 for(let j=0; j<MENU.length; j++){
   const q = S.cart[j];
   if(q > 0){
     const m = MENU[j];
     orderItems.push({menu_item_id: m.id || (j+1), quantity: q});
     itStr.push(q + "x " + m.n);
   }
 }
 if(!orderItems.length)return toast("Dining cart is empty.");
 const itemsText = itStr.join(", ");

 try{
   const payload = {
     table_id: S.table,
     order_type: S.otype==="car-side"?"CAR_SIDE":S.otype==="home-delivery"?"DELIVERY":"DINE_IN",
     items: orderItems,
     special_instructions: (S.cookingNotes || "").trim()
   };
   const res = await apiFetch("/orders", {method:"POST", body:payload});
   const newOrder = {
     id: res.id,
     table: res.table_id,
     items: itemsText,
     s: res.status || "CONFIRMED",
     w: null,
     time: Date.now(),
     total: res.total_amount,
     backend: true
   };
   O.push(newOrder);
   S.cart={}; S.cookingNotes=""; S.cv="home"; S.sub="orders";
   const tMsg = S.lang==="hi" ? `ऑर्डर #${res.id} डेटाबेस में सहेजा गया और रसोई में भेजा गया! 👨‍🍳` : `Order #${res.id} saved to DB and sent to kitchen! 👨‍🍳`;
   toast(tMsg); playChime("success");
   log(`Order #${res.id} Table ${S.table} (Live Backend): ${itemsText}`);
   D=true; render();
   refreshTableOrders();
   return;
 }catch(err){
   // Fallback simulation
   const localId = ++S.oid;
   O.push({id:localId, table:S.table, items:itemsText, s:"CONFIRMED", w:null, time:Date.now(), total:MENU.reduce((s,m,i)=>s+m.p*(S.cart[i]||0),0), backend:false});
   S.cart={}; S.cookingNotes=""; S.cv="home"; S.sub="orders";
   toast(S.lang==="hi" ? `ऑर्डर #${localId} रसोई में भेजा गया! 👨‍🍳` : `Order #${localId} sent to kitchen! 👨‍🍳`);
   playChime("success");
   log(`Order #${localId} Table ${S.table}: ${itemsText}`);
   D=true; render();
 }
}

function readyFor(o){
 const p=P[o.table]!=null&&W[P[o.table]].on?W[P[o.table]]:[...W.filter(w=>w.on)].sort(rank)[0];
 o.w=p?p.id:null;
 log(`Order #${o.id} READY &rarr; ${p?p.n:"no waiter online"}`);
 say(`Order #${o.id} (Table ${o.table}) is READY. `+(p?`${p.n} was notified to serve it.`:"No waiter is online, so manager must attend."),"c2");
 if(p&&S.rj==null)S.sel=p.id;
 playChime("alert");
}

/* Advance Kitchen Order Status */
async function advanceOrderStatus(orderId, toStatus){
 const o = O.find(x=>x.id==orderId);
 if(o){
   o.s = toStatus;
   if(toStatus==="READY") readyFor(o);
 }
 try{
   await apiFetch("/orders/" + orderId + "/status", {
     method: "PATCH",
     body: { status: toStatus }
   });
   toast(`Order #${orderId} moved to ${toStatus} in database.`);
   playChime(toStatus==="SERVED"?"success":"alert");
 }catch(err){
   toast(`Order #${orderId} advanced to ${toStatus}.`);
   playChime(toStatus==="SERVED"?"success":"alert");
 }
 D=true; render();
}

/* Waiter Actions */
function accept(wid,id){
 const r=R.find(x=>x.id==id);if(!r||!r.cur||r.cur.w!=wid||S.t>=r.cur.dl)return toast("This request has already expired.");
 const w=W[wid];w.acc++;w.streak=0;S.ac.push(S.t-r.at[r.at.length-1].t);end(r,"ACCEPTED");r.status="ACCEPTED";r.by=wid;r.acc=S.t;r.last=S.t;r.rs=false;
 A.forEach(a=>{if(a.r==r.id)a.open=false;});
 const pw=P[r.table]!=null?W[P[r.table]]:null;if(!pw||!pw.on||pw.streak>=CFG.PRIMARY_MISS)P[r.table]=wid;
 log(`#${r.id} ${w.n} ACCEPTED (Table ${r.table} primary: ${W[P[r.table]].n})`);
 say(`${w.n} accepted. The customer now sees "A waiter is on the way".`,"c1");
 D=true;
}

function reject(wid,id,rs){
 const r=R.find(x=>x.id==id);if(!r||!r.cur||r.cur.w!=wid)return;
 W[wid].rej++;log(`#${r.id} ${W[wid].n} REJECTED, going to next waiter immediately`);
 S.pre=W[wid].n+" rejected, so the request went to the next waiter immediately (no 30s wait). ";
 r.at[r.at.length-1].rs=rs||"Other";end(r,"REJECTED");next(r);
}

function toggle(id){
 const w=W[id];w.on=!w.on;log(`${w.n} is now ${w.on?"ONLINE":"OFFLINE"}`);
 if(!w.on){
  R.forEach(r=>{if(r.cur&&r.cur.w==id){end(r,"CANCELLED");next(r);}
  else if(r.status=="ACCEPTED"&&r.by==id){const a=r.at[r.at.length-1];if(a)a.st="CANCELLED";r.ex.push(id);r.by=null;log(`#${r.id} ${w.n} offline, request re-routed`);r.status="PENDING";assign(r);}});
 } else {
  R.forEach(r=>{if(r.status=="FAILED"&&A.some(a=>a.open&&a.r==r.id&&a.type=="NONE")){r.at=[];assign(r);}});
 }
 D=true;
}

async function waiterAct(kind, reqId){
 S.waiterMsg="";S.waiterErr="";D=true;render();
 const targetReqId = reqId || (S.waiterReq && S.waiterReq.id);
 if(!targetReqId){S.waiterErr="Look up or select a request first.";D=true;render();return;}
 if(!S.waiterId){S.waiterErr="Select your waiter identity from roster first.";D=true;render();return;}
 try{
   if(kind==="accept"){
     const res = await apiFetch("/waiters/"+S.waiterId+"/service-requests/"+targetReqId+"/accept",{method:"POST"});
     S.waiterMsg=`Request #${targetReqId} ACCEPTED in database. Customer notified.`;
     toast(`Accepted Request #${targetReqId}!`);
     playChime("success");
   } else if(kind==="complete"){
     const res = await apiFetch("/waiters/"+S.waiterId+"/service-requests/"+targetReqId+"/complete",{method:"POST"});
     S.waiterMsg=`Request #${targetReqId} COMPLETED and marked CLOSED in database.`;
     toast(`Request #${targetReqId} Completed!`);
     playChime("success");
   } else {
     const reason=(document.getElementById("rejreason")||{}).value||"Busy";
     await apiFetch("/waiters/"+S.waiterId+"/service-requests/"+targetReqId+"/reject",{method:"POST",body:{rejection_reason:reason}});
     S.waiterMsg=`Request #${targetReqId} REJECTED. Backend rerouted immediately.`;
     toast(`Request #${targetReqId} Rejected.`);
     playChime("alert");
   }
   await refreshWaiterTasks();
   await refreshMyRequests();
 }catch(e){
   S.waiterErr=(e&&e.detail)||`Action ${kind} failed.`;
 }
 D=true;render();
}

/* Manager Actions */
async function adminAssignAlert(alertId){
 S.assignMsg="";D=true;render();
 const sel=document.getElementById("assign-"+alertId);
 const waiterId=sel?sel.value:"";
 const mgrId=(S.mgrId||"").trim();
 if(!waiterId){S.assignMsg="Choose a waiter first.";D=true;render();return;}
 if(!mgrId){S.assignMsg="Manual assignment requires a manager ID.";D=true;render();return;}
 try{
  await apiFetch("/manager/"+mgrId+"/alerts/"+alertId+"/assign",{method:"POST",body:{waiter_id:waiterId}});
  S.assignMsg="Assignment sent. The backend router created a new 30-second attempt.";
  toast("Waiter assigned to alert.");
  await refreshAdminData();
 }catch(e){S.assignMsg=(e&&e.detail)||"Assignment failed.";}
 D=true;render();
}

async function adminResolveAlert(alertId){
 S.assignMsg="";D=true;render();
 const mgrId=(S.mgrId||"").trim();
 if(!mgrId){S.assignMsg="Resolving an alert requires a manager ID.";D=true;render();return;}
 try{
  await apiFetch("/manager/"+mgrId+"/alerts/"+alertId+"/resolve",{method:"POST",body:{}});
  S.assignMsg="Alert resolved in database.";
  toast("Alert resolved.");
  await refreshAdminData();
 }catch(e){S.assignMsg=(e&&e.detail)||"Resolve failed.";}
 D=true;render();
}

/* Simulated Payment & Checkout */
async function simulatePayment(orderId, method){
  try{
    const o = O.find(x=>x.id==orderId);
    const amount = o ? (o.total || 250) : 250;
    const createRes = await apiFetch("/payments/create", {
      method: "POST",
      body: { order_id: Number(orderId), amount: Number(amount), payment_method: method }
    });
    // Verify using mock gateway signature
    const mockTxnId = "pay_sim_" + Date.now();
    const verifyRes = await apiFetch("/payments/verify", {
      method: "POST",
      body: {
        payment_id: createRes.payment_id,
        gateway_order_id: createRes.gateway_order_id,
        gateway_payment_id: mockTxnId,
        signature: "test_verified_signature"
      }
    });
    if(o) o.paid = true;
    toast(`Payment of ${INR(amount)} successful via Simulated ${method}!`);
    playChime("success");
    S.payModalOrder = null;
    showReceipt(orderId);
  }catch(err){
    // Fallback simulated payment
    const o = O.find(x=>x.id==orderId);
    if(o) o.paid = true;
    toast(`Payment of ${INR(o?o.total:250)} confirmed (Simulated ${method}).`);
    playChime("success");
    S.payModalOrder = null;
    showReceipt(orderId);
  }
  D=true; render();
}

function showReceipt(orderId){
  const o = O.find(x=>x.id==orderId) || {id:orderId, table:S.table, items:"Grand Bistro Gourmet Selection", total:450, time:Date.now()};
  S.receiptModalOrder = o;
  D=true; render();
}

/* QR Standee SVG Generator */
function getTableQrSvg(tableNum){
  let q="";
  for(let y=0;y<11;y++)for(let x=0;x<11;x++){
    const f=(x<3&&y<3)||(x>7&&y<3)||(x<3&&y>7);
    const on=f?!((x%8==1)&&(y%8==1)):((x*7+y*13+x*y+tableNum)%3==0);
    if(on)q+=`<rect x="${x}" y="${y}" width="1" height="1"/>`;
  }
  return `<svg class="qr-svg" viewBox="0 0 11 11" fill="#0B0F19" shape-rendering="crispEdges" aria-hidden="true">${q}</svg>`;
}

/* Hash Routing */
function routeFromHash(){
  const h=(location.hash||"").replace(/^#\/?/,"");
  const [path,qs]=h.split("?");
  const q=new URLSearchParams(qs||"");
  const t=Number(q.get("table"));
  if(Number.isInteger(t)&&t>=1&&t<=CFG.TABLES){S.table=t;S.scan=true;}
  if(path==="customer"||path==="")return "customer";
  if(path==="kitchen"||path==="kds")return "kitchen";
  if(path==="waiter/login"||path==="waiter")return "waiter-login";
  if(path==="waiter/dashboard")return "waiter-dash";
  if(path==="admin/login"||path==="admin")return "admin-login";
  if(path==="admin/dashboard")return "admin-dash";
  if(path==="dev")return "dev";
  return "customer";
}
function go(path){if(("#/"+path)!==location.hash)location.hash="#/"+path;else{S.route=routeFromHash();D=true;render();}}

/* UI Views */
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
        <span class="meta-pill ${S.backendConnected?"be-status-online":"be-status-sim"}">
          ${S.backendConnected?"🟢 Live Backend (DB Connected)":"🟠 Offline Demo Simulation"}
        </span>
      </div>
    </div>
    <div class="table-chip">
      <div class="table-chip-box">
        <span style="font-size:0.8rem;color:var(--text-secondary)">Your Table:</span>
        <select data-sel="table" aria-label="Change table">
          ${Array.from({length:CFG.TABLES},(_,i)=>`<option value="${i+1}" ${i+1==S.table?"selected":""}>Table ${i+1}${i+1<=CFG.INDOOR?" · Indoor":" · Outdoor"}</option>`).join("")}
        </select>
      </div>
      <button class="b sm" data-act="openstandees" style="margin-top:4px;border-radius:var(--radius-full)">📱 23 Table QRs</button>
    </div>
  </div>
  ${S.toast?`<div class="toast" role="status"><span>✨</span><div>${S.toast}</div></div>`:""}
  <div class="otype-row" role="group" aria-label="Dining order type">
    ${[["dine-in","🍽️ Dine-In","Table service &amp; digital bill"],["car-side","🚗 Car-Side","Valet &amp; parked dine-in"],["home-delivery","🛵 Delivery","Doorstep &amp; hot takeaway"]].map(o=>`<button class="otype ${S.otype===o[0]?"on":""}" data-act="otype" data-k="${o[0]}" aria-pressed="${S.otype===o[0]}"><span class="otype-icon">${o[1].split(" ")[0]}</span><span class="otype-text"><b>${o[1].slice(o[1].indexOf(" ")+1)}</b><small>${o[2]}</small></span></button>`).join("")}
  </div>
  <nav class="subnav" aria-label="Customer sections">
    ${[["service",(S.lang==="hi"?"🛎️ सेवा":"🛎️ Service")],["menu",(S.lang==="hi"?"📋 मेन्यू":"📋 Menu")],["cart",(S.lang==="hi"?"🛒 कार्ट":"🛒 Cart")+(cartCount?` (${cartCount})`:"")],["orders",(S.lang==="hi"?"⏱️ ट्रैकर":"⏱️ Tracker")+(activeCount?` (${activeCount})`:"")]].map(t=>`<button class="${S.sub===t[0]?"on":""}" data-act="sub" data-k="${t[0]}">${t[1]}</button>`).join("")}
  </nav>`;
}

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

function cust(){
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
      ${dishes.length ? dishes.map(x=>dishCardHtml(x.m,x.i)).join("") : `<div class="st amb" style="grid-column:1/-1">No culinary matches found for "${esc(S.msearch)}".</div>`}
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
        <p>Confirm your gourmet selection for Table ${S.table}. Dishes are saved directly into the restaurant database.</p>
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
        Order Type: <b>${esc(S.otype)}</b> &middot; Table ${S.table} &middot; Real database order creation enabled.
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
        <h5 style="color:var(--text-primary);font-size:1.15rem;margin-bottom:0.4rem">Your dining cart is empty</h5>
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
        `:""}
      </article>`;
    };

    const myOrders = O.filter(o => o.table === S.table);
    const orderStatusBadge = s => {
      if(s==="PENDING"||s==="CONFIRMED") return '<span class="tag WAITING">⏳ Order Received / Confirmed</span>';
      if(s==="PREPARING") return '<span class="tag WAITING">🍳 Chef Cooking in Kitchen</span>';
      if(s==="READY") return '<span class="tag ACCEPTED">🍽️ Ready &middot; Server Moving</span>';
      return '<span class="tag ACCEPTED">✅ Served at Table</span>';
    };

    return hd + `
    <section aria-label="Live customer service requests and kitchen orders">
      <div class="section-head" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem">
        <div>
          <h4>${S.lang==="hi"?"लाइव ऑर्डर एवं सर्विस ट्रैकर":"Live Orders &amp; Service Tracker"}</h4>
          <p>${S.lang==="hi"?"टेबल के सभी खाने और वेटर अनुरोधों का रियल-टाइम स्टेटस।":"Real-time status of kitchen orders and table service requests."}</p>
        </div>
        <div class="row" style="gap:0.5rem">
          <button class="b sm" data-act="refreshreq">🔄 Refresh</button>
        </div>
      </div>

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
            <span>${o.backend?"Database Confirmed &middot; Grand Bistro Kitchen":"Simulated Order"}</span>
            <div class="row" style="gap:0.4rem">
              <button class="b sm" data-act="viewreceipt" data-id="${o.id}">🧾 Demo Receipt</button>
              ${!o.paid ? `<button class="b sm p" data-act="openpay" data-id="${o.id}">💳 Pay Bill (Simulated)</button>` : `<span class="tag ACCEPTED">✓ Paid</span>`}
            </div>
          </div>
        </article>`).join("")}
      </div>` : ""}

      <div>
        <h5 style="color:var(--text-primary);margin-bottom:0.75rem">🛎️ Table Service Calls (${myIds.length})</h5>
        ${S.reqErr?`<div class="st red">${esc(S.reqErr)}</div>`:""}
        ${myIds.length ? myIds.map(reqCardHtml).join("") : `
        <div class="card" style="text-align:center;padding:2.5rem 1rem">
          <span style="font-size:3rem;display:block;margin-bottom:0.75rem">🛎️</span>
          <h5 style="color:var(--text-primary);font-size:1.1rem;margin-bottom:0.35rem">No active requests</h5>
          <p class="mut sm" style="margin-bottom:1.25rem">Need fresh water, extra napkins, or your bill? Tap below to call staff.</p>
          <button class="b p" data-act="sub" data-k="service">Call Waiter Now</button>
        </div>`}
      </div>
    </section>`;
  }

  // DEFAULT SERVICE TAB
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
      <button class="b" data-act="sub" data-k="orders" style="min-height:46px">Track Requests &amp; Orders (${myIds.length})</button>
    </div>
  </section>`;
}

/* Kitchen Display System (KDS) View */
function kds(){
  const allOrders = O.slice().reverse();
  const newOrders = allOrders.filter(o => o.s === "PENDING" || o.s === "CONFIRMED");
  const prepOrders = allOrders.filter(o => o.s === "PREPARING");
  const readyOrders = allOrders.filter(o => o.s === "READY");
  const servedOrders = allOrders.filter(o => o.s === "SERVED");

  const orderCardHtml = (o, nextAction, nextLabel, nextBadgeClass) => `
  <article class="kds-card">
    <div class="kds-card-head">
      <span class="kds-table-badge">Table ${o.table}</span>
      <span class="kds-timer">Order #${o.id} &middot; ${fmtTime(o.time)}</span>
    </div>
    <div class="kds-items-box">
      <strong>Dishes:</strong><br>${esc(o.items)}
    </div>
    ${o.notes ? `<div class="kds-notes"><b>Note:</b> ${esc(o.notes)}</div>` : ""}
    <div style="margin-top:auto;padding-top:0.5rem">
      ${nextAction ? `<button class="b p btn-block ${nextBadgeClass}" data-act="kdsadvance" data-id="${o.id}" data-to="${nextAction}">${nextLabel}</button>` : `<span class="tag ACCEPTED btn-block" style="text-align:center">Served to Table</span>`}
    </div>
  </article>`;

  return `
  <div class="kds-header">
    <div>
      <p class="eyebrow" style="color:var(--accent-gold);margin-bottom:0.25rem">Kitchen Operations</p>
      <h2>Kitchen Display System (KDS)</h2>
      <p class="mut sm">Real-time order workflow. Kitchen status changes update the database and notify servers automatically.</p>
    </div>
    <div class="kds-stats-row">
      <span class="kds-stat-pill">Total: <b>${allOrders.length}</b></span>
      <span class="kds-stat-pill">New: <b>${newOrders.length}</b></span>
      <span class="kds-stat-pill">Cooking: <b>${prepOrders.length}</b></span>
      <span class="kds-stat-pill">Ready: <b>${readyOrders.length}</b></span>
      <button class="b sm" data-act="refreshkds">🔄 Refresh KDS</button>
    </div>
  </div>

  <div class="kds-board">
    <div class="kds-col kds-col-new">
      <div class="kds-col-header">
        <span>⏳ 1. New Orders (${newOrders.length})</span>
      </div>
      <div class="kds-card-list">
        ${newOrders.length ? newOrders.map(o => orderCardHtml(o, "PREPARING", "🍳 Start Cooking", "")).join("") : '<p class="mut sm" style="text-align:center;padding:2rem 0">No new incoming orders</p>'}
      </div>
    </div>

    <div class="kds-col kds-col-prep">
      <div class="kds-col-header">
        <span>🍳 2. In Preparation (${prepOrders.length})</span>
      </div>
      <div class="kds-card-list">
        ${prepOrders.length ? prepOrders.map(o => orderCardHtml(o, "READY", "🍽️ Mark Ready (Notify Waiter)", "btn-success")).join("") : '<p class="mut sm" style="text-align:center;padding:2rem 0">No orders cooking</p>'}
      </div>
    </div>

    <div class="kds-col kds-col-ready">
      <div class="kds-col-header">
        <span>🍽️ 3. Ready for Server (${readyOrders.length})</span>
      </div>
      <div class="kds-card-list">
        ${readyOrders.length ? readyOrders.map(o => orderCardHtml(o, "SERVED", "✅ Mark Served to Table", "")).join("") : '<p class="mut sm" style="text-align:center;padding:2rem 0">No orders awaiting pickup</p>'}
      </div>
    </div>

    <div class="kds-col kds-col-served">
      <div class="kds-col-header">
        <span>✅ 4. Completed History (${servedOrders.length})</span>
      </div>
      <div class="kds-card-list">
        ${servedOrders.slice(0, 10).map(o => orderCardHtml(o, null, "", "")).join("")}
      </div>
    </div>
  </div>`;
}

/* Waiter Workspace */
function wlogin(){
  return `<div class="auth-wrap"><div class="auth-card">
    <p class="eyebrow">Staff Portal</p>
    <h3>Waiter Sign In</h3>
    <p class="mut sm">Live authentication enabled with existing staff accounts.</p>
    <div style="background:rgba(245,158,11,0.1);border:1px solid var(--border-accent);border-radius:var(--radius-md);padding:0.65rem;margin-bottom:1rem;font-size:0.8rem">
      <b>Seeded Demo Account:</b><br>
      Email: <code>rahul.dev@restaurant.local</code><br>
      Password: <code>DevOnly_ChangeMe!123</code>
    </div>
    <label class="field">Work email<input id="wemail" maxlength="150" value="${esc(S.wEmail)}" autocomplete="username"></label>
    <label class="field">Password<input id="wpass" type="password" maxlength="100" value="${esc(S.wPass)}" autocomplete="current-password"></label>
    ${S.loginMsg?`<div class="st red" role="alert">${esc(S.loginMsg)}</div>`:""}
    <button class="b p btn-block" data-act="wtrylogin" style="margin-top:0.5rem">Sign in with Live API</button>
    <button class="b btn-block" data-act="wpreview">Open local preview (not authenticated)</button>
  </div></div>`;
}

function wait(){
 if(!S.wl)return wlogin();
 const me=W.find(w=>w.backendId===S.waiterId) || W[0];
 const tasks = S.waiterTasks || {incoming:[], in_progress:[]};
 const incoming = tasks.incoming || [];
 const inProgress = tasks.in_progress || [];

 return `<div class="dash-head">
   <div>
     <p class="eyebrow">Waiter Terminal &middot; Shift Workspace</p>
     <h2>${me?esc(me.n):"Rahul (Server)"}</h2>
     <p class="mut sm">Active Waiter ID: <code>${esc(S.waiterId||"w-1")}</code> &middot; Live Task Feed Connected</p>
   </div>
   <div class="row" style="gap:0.5rem">
     <button class="b" data-act="wrefresh">🔄 Refresh Tasks</button>
     <button class="b" data-act="wexit">Sign out</button>
   </div>
 </div>
 ${S.toast?`<div class="toast" role="status">${S.toast}</div>`:""}
 
 <section class="card" aria-label="My availability" style="margin-bottom:1.5rem">
   <h4>Shift Availability &amp; Identity</h4>
   <div class="row" style="gap:0.75rem;margin:0.75rem 0">
     <select id="wself" aria-label="Select waiter identity">
       ${W.filter(w=>w.backendId).map(w=>`<option value="${w.backendId}" ${w.backendId===S.waiterId?"selected":""}>${esc(w.n)}${w.backendOnline?" · online":" · offline"}</option>`).join("")}
     </select>
     <button class="b p" data-act="wonline">Go Online</button>
     <button class="b d" data-act="woffline">Go Offline</button>
   </div>
   <p class="sm mut">Going offline triggers the backend safeguard: pending assignments are automatically rerouted.</p>
 </section>

 <section class="card" aria-label="Incoming Tasks" style="margin-bottom:1.5rem;border-color:var(--accent-gold)">
   <div class="section-head" style="display:flex;justify-content:space-between;align-items:center">
     <div>
       <h4>🚨 Incoming Routed Requests (${incoming.length})</h4>
       <p>Assigned exclusively to you by the routing engine. Accept within timeout.</p>
     </div>
   </div>
   ${S.waiterMsg?`<div class="st acc" role="status" style="margin-bottom:1rem">${esc(S.waiterMsg)}</div>`:""}
   ${S.waiterErr?`<div class="st red" role="alert" style="margin-bottom:1rem">${esc(S.waiterErr)}</div>`:""}
   
   ${incoming.length ? incoming.map(t => `
   <article class="active-tracker-card" style="border-width:2px;margin-bottom:1rem">
     <div class="req-card-head">
       <div>
         <strong style="font-size:1.15rem;color:var(--text-primary)">
           Table ${t.table_id} &middot; #${t.request_id} &middot; ${esc(TN[t.service_key]||t.service_key)}
         </strong>
         ${t.details?`<div style="color:var(--accent-gold);margin-top:0.2rem"><b>Detail:</b> ${esc(t.details)}</div>`:""}
       </div>
       <span class="tag WAITING">⏱️ ${t.remaining_seconds||30}s left</span>
     </div>
     <div class="row" style="margin-top:1rem;gap:0.75rem">
       <button class="b p" data-act="wtaskaccept" data-id="${t.request_id}" style="min-width:120px">Accept Now</button>
       <select id="wrejreason-${t.request_id}" style="max-width:140px"><option>Busy</option><option>At another table</option><option>On break</option></select>
       <button class="b d" data-act="wtaskreject" data-id="${t.request_id}">Reject</button>
     </div>
   </article>`).join("") : `
   <div style="text-align:center;padding:1.5rem">
     <span style="font-size:2rem">✨</span>
     <p class="mut sm" style="margin-top:0.35rem">No pending incoming requests right now. You are ready for next table dispatch.</p>
   </div>`}
 </section>

 <section class="card" aria-label="In Progress Tasks" style="margin-bottom:1.5rem">
   <h4>⏳ Accepted / In-Progress Tasks (${inProgress.length})</h4>
   ${inProgress.length ? inProgress.map(p => `
   <article class="req-card" style="margin-top:0.75rem">
     <div class="req-card-head">
       <b>Table ${p.table_id} &middot; #${p.request_id} &middot; ${esc(TN[p.service_key]||p.service_key)}</b>
       <span class="tag ACCEPTED">In Progress</span>
     </div>
     ${p.details?`<div class="mut sm">Detail: ${esc(p.details)}</div>`:""}
     <div class="row" style="margin-top:0.75rem">
       <button class="b p" data-act="wtaskcomplete" data-id="${p.request_id}">✅ Mark Completed (Done)</button>
     </div>
   </article>`).join("") : '<p class="mut sm" style="margin-top:0.5rem">No active tasks in progress.</p>'}
 </section>

 <section class="card" aria-label="Lookup Request">
   <h4>Manual Request Lookup</h4>
   <div class="row" style="gap:0.5rem;margin-top:0.5rem">
     <input id="wreqid" inputmode="numeric" maxlength="10" value="${esc(S.waiterReqId)}" placeholder="Request ID, e.g. 501" style="max-width:200px">
     <button class="b p" data-act="wlookup">Look Up</button>
   </div>
   ${S.waiterReq?`
   <article class="req-card" style="margin-top:1rem">
     <div class="req-card-head">
       <b>#${S.waiterReq.id} · Table ${S.waiterReq.table_id} · ${esc(TN[S.waiterReq.service_key]||S.waiterReq.service_key)}</b>
       <span class="tag ${S.waiterReq.status==="ACCEPTED"?"ACCEPTED":"WAITING"}">${S.waiterReq.status}</span>
     </div>
     <div class="row" style="margin-top:0.75rem;gap:0.5rem">
       <button class="b p" data-act="waccept">Accept</button>
       <button class="b d" data-act="wreject">Reject</button>
       <button class="b" data-act="wcomplete" data-id="${S.waiterReq.id}">Complete Task</button>
     </div>
   </article>`:""}
 </section>`;
}

/* Admin / Manager Console */
function adminLogin(){
  return `<div class="auth-wrap"><div class="auth-card">
    <p class="eyebrow">Manager Console</p>
    <h3>Manager Sign In</h3>
    <p class="mut sm">Live authorization enabled with restaurant manager account.</p>
    <div style="background:rgba(245,158,11,0.1);border:1px solid var(--border-accent);border-radius:var(--radius-md);padding:0.65rem;margin-bottom:1rem;font-size:0.8rem">
      <b>Seeded Manager Account:</b><br>
      Email: <code>manager.dev@restaurant.local</code><br>
      Password: <code>DevOnly_ChangeMe!123</code>
    </div>
    <label class="field">Manager Email<input id="aemail" maxlength="150" value="${esc(S.aEmail)}" autocomplete="username"></label>
    <label class="field">Password<input id="apass" type="password" maxlength="100" value="${esc(S.aPass)}" autocomplete="current-password"></label>
    ${S.loginMsg?`<div class="st red" role="alert">${esc(S.loginMsg)}</div>`:""}
    <button class="b p btn-block" data-act="atrylogin" style="margin-top:0.5rem">Sign In as Manager</button>
    <button class="b btn-block" data-act="apreview">Open local preview (not authenticated)</button>
  </div></div>`;
}

function adminKpis(){
 const k=S.kpis;
 if(!k)return `<p class="mut">Loading live dashboard…</p>`;
 const card=(l,v,sub)=>`<div class="kpi"><b>${v}</b><span class="mut sm">${l}</span>${sub?`<small class="mut">${sub}</small>`:""}</div>`;
 return `<div class="kpi-grid">
   ${card("Total Tables",S.tablesMap.length||CFG.TABLES,"18 indoor · 5 outdoor")}
   ${card("Active Service Requests",k.open_requests||0,"Live requests")}
   ${card("Waiters Online",`${k.waiters_online||0} / ${k.waiters_total||5}`,"Ready for dispatch")}
   ${card("Open Manager Alerts",k.open_alerts||0,"Requiring attention")}
   ${card("Missed Today",k.missed_today||0,"Timeout breaches")}
   ${card("Avg Service Time",k.avg_service_time_min!=null?Number(k.avg_service_time_min).toFixed(1)+" min":"—","Request to completion")}
 </div>`;
}

function adminAlertCard(a){
 const d=S.alertReq[a.id];const r=d&&d.request;
 const wname=a.assigned_waiter_id?backendWaiterName(a.assigned_waiter_id):"—";
 return `<article class="req-card">
   <div class="req-card-head">
     <b>Alert #${a.id} · ${a.alert_type}</b>
     <span class="tag ${a.is_open?"REJECTED":"ACCEPTED"}">${a.is_open?"OPEN":"CLOSED"}</span>
   </div>
   <div class="mut sm">
     Request #${a.request_id}${r?` · Table ${r.table_id} · ${esc(TN[r.service_key]||r.service_key)} · <b>${reqStatusLabel(r.status)}</b>`:""} &middot; Created ${fmtTime(a.created_at)}
   </div>
   <div class="row" style="margin-top:0.5rem;gap:0.5rem">
     <button class="b sm" data-act="adetail" data-id="${a.id}">${S.alertSel===a.id?"Refresh details":"Open details"}</button>
   </div>
   ${S.alertSel===a.id?adminAlertDetail(a):""}
 </article>`;
}

function adminAlertDetail(a){
 const d=S.alertReq[a.id];
 if(!d)return `<p class="mut sm">Loading request details…</p>`;
 const r=d.request;
 const att=(d.attempts||[]).map(x=>`<div class="attempt"><span class="chip ${x.status}">${x.status}</span><span>${esc(backendWaiterName(x.waiter_id))}</span><span class="mut sm">attempt ${x.attempt_number} · ${x.timeout_seconds}s</span></div>`).join("");
 return `
 <div class="attempts" style="margin:0.75rem 0">${att||'<p class="mut sm">No attempts recorded.</p>'}</div>
 <div class="assign-row">
   <select id="assign-${a.id}" aria-label="Choose waiter">
     <option value="">Choose waiter…</option>
     ${W.filter(w=>w.backendId&&w.backendOnline).map(w=>`<option value="${w.backendId}">${esc(w.n)}</option>`).join("")}
   </select>
   <button class="b p sm" data-act="aassign" data-id="${a.id}">Assign</button>
   <button class="b sm" data-act="aresolve" data-id="${a.id}">Resolve</button>
 </div>`;
}

function mgr(){
 if(!S.al)return adminLogin();
 const tabs=[
   ["overview","Overview"],
   ["requests","Requests &amp; Alerts"],
   ["tables","23-Table Map"],
   ["orders","Live Orders"],
   ["standees","📱 QR Standees"],
   ["staff","Staff Roster"]
 ];
 let body="";
 if(S.adminTab==="overview"){
   body=`<div class="row" style="margin-bottom:1rem"><button class="b" data-act="arefresh">🔄 Refresh Live Data</button></div>${adminKpis()}`;
 } else if(S.adminTab==="requests"){
   body=`<div class="row" style="margin-bottom:1rem"><button class="b" data-act="arefresh">🔄 Refresh Alerts</button></div>
   ${S.assignMsg?`<div class="st acc" role="status" style="margin-bottom:1rem">${esc(S.assignMsg)}</div>`:""}
   ${S.alerts.length ? S.alerts.map(adminAlertCard).join("") : '<p class="mut">No open manager alerts right now. All requests are handled smoothly by servers.</p>'}`;
 } else if(S.adminTab==="tables"){
   body=`<div class="row" style="margin-bottom:1rem"><button class="b" data-act="arefresh">🔄 Refresh Tables</button></div>
   <div class="table-grid">
     ${S.tablesMap.map(t=>`
     <div class="table-card ${t.status_badge}">
       <b>Table ${t.table_number}</b>
       <small>${t.section==="INDOOR"?"Indoor":"Outdoor"}</small>
       ${t.open_requests_count?`<small class="mk">⚠️ ${t.open_requests_count} open</small>`:`<small class="mut">Normal</small>`}
       ${t.primary_waiter_name?`<small style="color:var(--accent-gold)">🤵 ${esc(t.primary_waiter_name)}</small>`:""}
     </div>`).join("")}
   </div>`;
 } else if(S.adminTab==="orders"){
   body=`<div class="row" style="margin-bottom:1rem"><button class="b" data-act="refreshkds">🔄 Refresh Orders</button></div>
   <div class="sc">
     <table>
       <tr><th>Order #</th><th>Table</th><th>Items</th><th>Total</th><th>Status</th><th>Actions</th></tr>
       ${O.slice().reverse().map(o=>`
       <tr>
         <td><b>#${o.id}</b></td>
         <td>Table ${o.table}</td>
         <td>${esc(o.items)}</td>
         <td>${INR(o.total||250)}</td>
         <td><span class="tag ${o.s==="READY"||o.s==="SERVED"?"ACCEPTED":"WAITING"}">${o.s}</span></td>
         <td><button class="b sm" data-act="viewreceipt" data-id="${o.id}">🧾 Receipt</button></td>
       </tr>`).join("")||`<tr><td colspan="6" class="mut">No orders placed yet.</td></tr>`}
     </table>
   </div>`;
 } else if(S.adminTab==="standees"){
   body=`
   <div class="row" style="justify-content:space-between;margin-bottom:1.5rem">
     <div>
       <h4>Printable QR Standee Cards (All 23 Tables)</h4>
       <p class="mut sm">Deploy on physical guest tables. Designed for standard cardstock printing.</p>
     </div>
     <button class="b p" onclick="window.print()">🖨️ Print 23 Table Cards</button>
   </div>
   <div class="standees-grid print-area">
     ${Array.from({length:CFG.TABLES},(_,i)=>i+1).map(num=>`
     <div class="standee-card">
       <span class="brand-title">👑 Grand Bistro &amp; Cafe</span>
       <div class="table-display">TABLE ${num}</div>
       <span class="section-tag">${num<=CFG.INDOOR?"Indoor Royal AC Lounge":"Outdoor Star Terrace"}</span>
       ${getTableQrSvg(num)}
       <div class="instructions">
         <b>Scan to Order &amp; Call Server</b><br>
         No app download needed &middot; Instant Table Service
       </div>
       <a href="#/customer?table=${num}" class="b sm p no-print" style="margin-top:0.4rem">Open Table ${num} &rarr;</a>
     </div>`).join("")}
   </div>`;
 } else if(S.adminTab==="staff"){
   body=`<div class="sc"><table>
     <tr><th>Waiter</th><th>Status</th><th>Push</th><th>Accepted</th><th>Missed</th><th>Rejected</th></tr>
     ${W.filter(w=>w.backendId).map(w=>`<tr><td><b>${esc(w.n)}</b></td><td>${w.backendOnline?"Online":"Offline"}</td><td>${w.backendPushEnabled?"ON":"OFF"}</td><td>${w.backendAcceptedCount||0}</td><td>${w.backendMissedCount||0}</td><td>${w.backendRejectedCount||0}</td></tr>`).join("")}
   </table></div>`;
 }

 return `<div class="dash-head">
   <div>
     <p class="eyebrow">Manager Operations &middot; Grand Bistro</p>
     <h2>Restaurant Operations Console</h2>
   </div>
   <button class="b" data-act="aexit">Sign out</button>
 </div>
 ${S.toast?`<div class="toast" role="status">${S.toast}</div>`:""}
 <nav class="subnav" aria-label="Admin sections">${tabs.map(t=>`<button class="${S.adminTab===t[0]?"on":""}" data-act="atab" data-k="${t[0]}">${t[1]}</button>`).join("")}</nav>
 ${body}`;
}

/* Modals: Receipt and Payment */
function renderModals(){
  let h="";
  if(S.receiptModalOrder){
    const o = S.receiptModalOrder;
    const subtotal = Number(o.total || 400);
    const cgst = Math.round(subtotal * 0.025);
    const sgst = Math.round(subtotal * 0.025);
    const grand = subtotal + cgst + sgst;
    h += `
    <div class="receipt-backdrop" data-act="closereceipt">
      <div class="receipt-paper print-area" onclick="event.stopPropagation()">
        <div class="receipt-disclaimer-banner">
          ⚠️ Sample / Demo Receipt — Not a Legally Valid Tax Invoice
        </div>
        <div class="receipt-header">
          <h3>GRAND BISTRO &amp; CAFE</h3>
          <p>Royal Luxury Dining &middot; Jaipur Heritage Club</p>
          <p class="sm mut" style="margin-top:0.35rem">Order #${o.id} &middot; Table ${o.table} &middot; ${new Date(o.time).toLocaleString()}</p>
        </div>
        <table class="receipt-table">
          <thead><tr><th>Item Description</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>
            <tr><td>${esc(o.items)}</td><td style="text-align:right">${INR(subtotal)}</td></tr>
          </tbody>
        </table>
        <div class="receipt-summary">
          <div class="receipt-sum-line"><span>Items Subtotal:</span><span>${INR(subtotal)}</span></div>
          <div class="receipt-sum-line"><span>CGST (2.5%):</span><span>${INR(cgst)}</span></div>
          <div class="receipt-sum-line"><span>SGST (2.5%):</span><span>${INR(sgst)}</span></div>
          <div class="receipt-sum-line grand"><span>Total Paid / Payable:</span><span>${INR(grand)}</span></div>
        </div>
        <div style="margin-top:1.25rem;text-align:center" class="no-print">
          <p class="sm mut" style="margin-bottom:0.75rem">Payment Status: <b>${o.paid?"PAID (Simulated Verification)":"PENDING CONCLUSION"}</b></p>
          <div class="row" style="justify-content:center;gap:0.75rem">
            <button class="b p" onclick="window.print()">🖨️ Print / Save PDF</button>
            <button class="b" data-act="closereceipt">Close Receipt</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  if(S.payModalOrder){
    const o = S.payModalOrder;
    h += `
    <div class="receipt-backdrop" data-act="closepay">
      <div class="card" style="max-width:440px;width:100%;background:var(--bg-surface);border:1px solid var(--border-accent)" onclick="event.stopPropagation()">
        <div class="section-head">
          <h4>Simulate Checkout &amp; Pay</h4>
          <p>Table ${o.table} &middot; Total Amount: <b>${INR(o.total||250)}</b></p>
        </div>
        <div style="background:rgba(245,158,11,0.08);border:1px solid var(--border-accent);border-radius:var(--radius-md);padding:0.85rem;margin-bottom:1.25rem">
          <p class="sm" style="color:var(--accent-gold);margin-bottom:0.4rem"><b>Mock Payment Gateway Active:</b></p>
          <small class="mut">No real card numbers, no real charges, no third-party accounts needed.</small>
        </div>
        <div class="row" style="flex-direction:column;gap:0.75rem">
          <button class="b p btn-block" data-act="paymethod" data-id="${o.id}" data-m="UPI" style="min-height:48px">
            📱 Simulate UPI / GPay / QR Approval
          </button>
          <button class="b btn-block" data-act="paymethod" data-id="${o.id}" data-m="CARD" style="min-height:48px">
            💳 Simulate Card Terminal Approval
          </button>
          <button class="b btn-block" data-act="paymethod" data-id="${o.id}" data-m="CASH" style="min-height:48px">
            💵 Confirm Cash Payment at Table
          </button>
          <button class="b btn-block" data-act="closepay" style="margin-top:0.5rem">Cancel</button>
        </div>
      </div>
    </div>`;
  }
  return h;
}

/* Master Render */
function render(){
 D=false;
 S.route=routeFromHash();
 document.body.dataset.route=S.route;
 document.querySelectorAll(".site-nav a").forEach(a=>{
   const id=a.dataset.id;
   a.classList.toggle("on",id===S.route||(id==="kitchen"&&S.route==="kitchen")||(id==="waiter"&&S.route.indexOf("waiter")===0)||(id==="admin"&&S.route.indexOf("admin")===0));
 });
 const vis=S.route==="customer"?"c1":S.route==="kitchen"?"ckitchen":S.route.indexOf("waiter")===0?"c2":S.route.indexOf("admin")===0?"c3":"cdev";
 ["c1","ckitchen","c2","c3","cdev"].forEach(c=>{const e=document.getElementById(c);if(e)e.classList.toggle("show",c===vis);});
 const y=[["cust",cust],["kds",kds],["wait",wait],["mgr",mgr]];
 y.forEach(([id,f])=>{const e=document.getElementById(id);if(!e)return;const sc=e.scrollTop;e.innerHTML=f();e.scrollTop=sc;});
 
 // Inject dynamic modals
 let mWrap = document.getElementById("modals-container");
 if(!mWrap){
   mWrap = document.createElement("div");
   mWrap.id = "modals-container";
   document.body.appendChild(mWrap);
 }
 mWrap.innerHTML = renderModals();
}

/* User Click Actions Map */
const ACT={
  settip: (b)=>{S.tip=+b.dataset.v;playChime();D=true;render();},
  addnote: (b)=>{const v=b.dataset.v;if(v){S.ctext=S.ctext?(S.ctext+" · "+v):v;playChime();D=true;render();}},
  mcat: (b)=>{S.mcat=b.dataset.k;playChime();D=true;render();},
  placeorder: ()=>{placeOrder();},
  mute: ()=>{S.muted=!S.muted;playChime();D=true;render();},
  lang: ()=>{S.lang = (S.lang==="hi"?"en":"hi"); playChime(); const btn = document.getElementById("lang-btn"); if(btn) btn.textContent = (S.lang==="hi"?"🇬🇧":"🇮🇳"); D=true; render();},
  openstandees: ()=>{S.adminTab="standees";go("admin/dashboard");},
  viewreceipt: (b)=>{showReceipt(b.dataset.id);},
  closereceipt: ()=>{S.receiptModalOrder=null;D=true;render();},
  openpay: (b)=>{S.payModalOrder=O.find(x=>x.id==b.dataset.id)||{id:b.dataset.id,table:S.table,total:250};D=true;render();},
  closepay: ()=>{S.payModalOrder=null;D=true;render();},
  paymethod: (b)=>{simulatePayment(b.dataset.id, b.dataset.m);},
  kdsadvance: (b)=>{advanceOrderStatus(b.dataset.id, b.dataset.to);},
  refreshkds: ()=>{refreshKitchenOrders();toast("Kitchen orders refreshed.");playChime();},
  req: b=>req(b.dataset.k),
  resend: (b,id)=>resend(id),
  cancel: (b,id)=>cancelReq(id),
  done: (b,id)=>{const r=R.find(x=>x.id==id);if(r)r.status="CLOSED";toast("Receipt confirmed.");playChime("success");D=true;render();},
  "q+": (b,id,i)=>{S.cart[i]=(S.cart[i]||0)+1;D=true;render();},
  "q-": (b,id,i)=>{S.cart[i]=Math.max(0,(S.cart[i]||0)-1);D=true;render();},
  route: b=>{const id=b.dataset.id;if(id==="kitchen")go("kitchen");else if(id==="waiter")go(S.wl?"waiter/dashboard":"waiter/login");else if(id==="admin")go(S.al?"admin/dashboard":"admin/login");else if(id==="dev")go("dev");else go("customer");},
  sub: b=>{S.sub=b.dataset.k;S.cv=b.dataset.k==="menu"?"menu":"home";D=true;render();},
  otype: b=>{S.otype=b.dataset.k;D=true;render();},
  grp: b=>{S.open=S.open==b.dataset.k?null:b.dataset.k;D=true;render();},
  opt: b=>{S.open=null;req(b.dataset.k,b.dataset.v);},
  pick: b=>{const k=b.dataset.k,v=b.dataset.v,p=S.pick[k]||[];S.pick[k]=p.includes(v)?p.filter(x=>x!=v):[...p,v];D=true;render();},
  sendm: b=>{const k=b.dataset.k,p=S.pick[k]||[];if(p.length){req(k,p.join(", "));S.pick[k]=[];S.open=null;}},
  sendc: ()=>{const t=S.ctext.trim();if(!t)toast("Please type note first.");else{req("custom",t);S.ctext="";}},
  refreshreq: ()=>{refreshMyRequests();refreshTableOrders();toast("Status refreshed.");playChime();},
  
  // Real Auth Actions
  wtrylogin: async ()=>{
    S.loginMsg="";D=true;render();
    const email = (document.getElementById("wemail")||{}).value || S.wEmail;
    const pass = (document.getElementById("wpass")||{}).value || S.wPass;
    try{
      const res = await apiFetch("/auth/login", {method:"POST", body:{identifier:email, password:pass}});
      S.token = res.access_token;
      S.wl = true;
      S.waiterId = res.id;
      toast(`Welcome, ${res.name||"Waiter"}! Signed in with Live Backend.`);
      playChime("success");
      go("waiter/dashboard");
      refreshWaiterTasks();
    }catch(err){
      S.loginMsg = (err && err.detail) || "Invalid credentials.";
      D=true;render();
    }
  },
  wpreview: ()=>{S.wl=true;S.loginMsg="";go("waiter/dashboard");},
  wexit: ()=>{S.wl=false;S.token=null;go("waiter/login");},
  wrefresh: ()=>{refreshBackendWaiterRoster();refreshWaiterTasks();toast("Tasks refreshed.");playChime();},
  wonline: ()=>{waiterSetOnline(true);},
  woffline: ()=>{waiterSetOnline(false);},
  wlookup: ()=>{waiterLookup();},
  waccept: ()=>{waiterAct("accept");},
  wreject: ()=>{waiterAct("reject");},
  wcomplete: (b)=>{waiterAct("complete", b.dataset.id);},
  wtaskaccept: (b)=>{waiterAct("accept", b.dataset.id);},
  wtaskreject: (b)=>{waiterAct("reject", b.dataset.id);},
  wtaskcomplete: (b)=>{waiterAct("complete", b.dataset.id);},

  atrylogin: async ()=>{
    S.loginMsg="";D=true;render();
    const email = (document.getElementById("aemail")||{}).value || S.aEmail;
    const pass = (document.getElementById("apass")||{}).value || S.aPass;
    try{
      const res = await apiFetch("/auth/login", {method:"POST", body:{identifier:email, password:pass}});
      S.token = res.access_token;
      S.al = true;
      S.mgrId = res.id;
      toast(`Welcome, Manager ${res.name||"Vikram"}! Live Console Ready.`);
      playChime("success");
      go("admin/dashboard");
      refreshAdminData();
    }catch(err){
      S.loginMsg = (err && err.detail) || "Invalid manager credentials.";
      D=true;render();
    }
  },
  apreview: ()=>{S.al=true;S.loginMsg="";go("admin/dashboard");refreshAdminData();},
  aexit: ()=>{S.al=false;S.token=null;go("admin/login");},
  atab: b=>{S.adminTab=b.dataset.k;if(S.adminTab==="overview"||S.adminTab==="requests"||S.adminTab==="tables")refreshAdminData();D=true;render();},
  arefresh: ()=>{refreshAdminData();toast("Live data updated.");playChime();},
  adetail: (b,id)=>loadAlertRequest(id),
  aassign: (b,id)=>adminAssignAlert(id),
  aresolve: (b,id)=>adminResolveAlert(id),
  reset: ()=>init()
};

async function waiterSetOnline(on){
 if(!S.waiterId)return toast("Select waiter first.");
 try{
   await apiFetch("/waiters/"+S.waiterId+"/status",{method:"PATCH",body:{is_online:!!on}});
   toast(on?"You are ONLINE for routed requests.":"You are OFFLINE. Safeguard rerouting open tasks.");
   playChime();
   await refreshBackendWaiterRoster();
 }catch(e){toast((e&&e.detail)||"Status update failed.");}
}

async function waiterLookup(){
 S.waiterMsg="";S.waiterErr="";S.waiterReq=null;D=true;render();
 const id=Number(String(document.getElementById("wreqid")?document.getElementById("wreqid").value:S.waiterReqId).trim());
 if(!id)return;
 try{
   S.waiterReq=await apiGet("/service-requests/"+id);
 }catch(e){S.waiterErr="Request #"+id+" not found.";}
 D=true;render();
}

async function loadAlertRequest(alertId){
 const a=S.alerts.find(x=>x.id===alertId);if(!a)return;
 S.alertSel=alertId;D=true;render();
 try{
   const r=await apiGet("/service-requests/"+a.request_id);
   const at=await apiGet("/service-requests/"+a.request_id+"/attempts");
   S.alertReq[alertId]={request:r,attempts:at||[],error:""};
 }catch(e){S.alertReq[alertId]={request:null,attempts:[],error:"Details unavailable."};}
 D=true;render();
}

/* Event Listeners */
document.addEventListener("click",e=>{
 const b=e.target.closest("[data-act]");if(!b||b.disabled)return;
 if(b.tagName==="A"&&b.getAttribute("href")&&b.getAttribute("href").startsWith("#")){}else if(b.tagName==="A")e.preventDefault();
 const a=b.dataset.act,fn=ACT[a];if(!fn)return;
 fn(b,+b.dataset.id,+b.dataset.i);
});

document.addEventListener("input",e=>{
 const id=e.target.id,v=e.target.value;
 if(id=="ctext")S.ctext=v;
 else if(id=="cookingnotes")S.cookingNotes=v;
 else if(id=="msearch"){S.msearch=v;D=true;render();}
 else if(id=="wemail")S.wEmail=v;
 else if(id=="wpass")S.wPass=v;
 else if(id=="wreqid")S.waiterReqId=v;
 else if(id=="aemail")S.aEmail=v;
 else if(id=="apass")S.aPass=v;
 else if(id=="mgrid")S.mgrId=v;
});

document.addEventListener("change",e=>{
 if(e.target.dataset.sel=="table"){S.table=+e.target.value;D=true;render();refreshTableOrders();refreshMyRequests();}
 if(e.target.id=="wself"){S.waiterId=e.target.value;D=true;render();refreshWaiterTasks();}
});

/* Boot */
addEventListener("hashchange",()=>{D=true;render();});
init();
loadMyReq();
checkBackendHealth();
refreshBackendWaiterRoster();
refreshTableOrders();
refreshKitchenOrders();
initRealtimeEvents();

setInterval(tick,250);
setInterval(()=>{
  if(document.hidden)return;
  checkBackendHealth();
  if(S.route==="customer"){refreshMyRequests();refreshTableOrders();}
  else if(S.route==="kitchen"){refreshKitchenOrders();}
  else if(S.route==="waiter-dash"){refreshWaiterTasks();}
  else if(S.route==="admin-dash"){refreshAdminData();}
},6000);