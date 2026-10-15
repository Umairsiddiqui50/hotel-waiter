/* Smart Table Service - simulation
   State legend:  W waiters | R requests | A manager alerts | O orders | P primary waiter per table | L audit log | S UI+clock state
   Routing rules (see pick/assign):
     1. A table remembers its PRIMARY waiter (first waiter who accepted for that table).
     2. The primary waiter gets the table's next request first - unless he already carries
        CFG.OVERLOAD more work than the least busy waiter. Then fair share wins.
     3. Fair share = least work today (accepted + waiting) -> least active -> longest idle (round robin).
     4. Strictly one waiter at a time. 1st waiter CFG.FIRST sec, then CFG.NEXT sec each, max CFG.TRIES, then manager. */
const CFG={FIRST:45,NEXT:30,TRIES:3,RESEND:60000,RESEND_MAX:3,CLOSE:600000,TABLES:23,INDOOR:18,OVERLOAD:3,PRIMARY_MISS:2,DUP_ACCEPT:60000};
const TY=[["water","Water Bottle","W"],["salad","Salad / Chutney Refill","S"],["spt","Salt / Pepper / Tissue","T"],["bill","Ask for Bill","B"],["cutlery","Plate / Spoon / Bowl / Glass","P"],["call","Call Waiter","C"],["custom","Custom request","?"]];
const SUB={water:{m:1,o:["Cold","Normal","Hot"]},spt:{m:0,o:["Salt","Pepper","Tissue"]},bill:{m:1,o:["Cash","Online"]},cutlery:{m:0,o:["Plate","Spoon","Bowl","Glass"]}};
const esc=x=>String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const INR=n=>"\u20b9"+Number(n).toLocaleString("en-IN");
const TN=Object.fromEntries(TY.map(t=>[t[0],t[1].split(" (")[0]]));
const MENU=[{n:"Veg Biryani",p:200,a:false},{n:"Tandoori Roti",p:20,a:true},{n:"Butter Naan",p:40,a:true},{n:"Steam Rice",p:100,a:true},{n:"Jeera Rice",p:130,a:true},{n:"Cold Drink",p:40,a:true},{n:"Sweet Lassi",p:70,a:true},{n:"Dal Tadka",p:180,a:true},{n:"Gulab Jamun",p:70,a:true}];
const OS=["PENDING","CONFIRMED","PREPARING","READY","SERVED"];
let W,R,A,O,P,L,S,D=true;
const LB=r=>TN[r.k]+(r.d?" ("+esc(r.d)+")":"");
const fmt=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0")};
const API_BASE = new URLSearchParams(location.search).get("apiBase") || "http://127.0.0.1:8000/api/v1";
function apiUrl(path){return API_BASE.replace(/\/$/, "") + (String(path).startsWith("/") ? path : "/" + path);}
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
  if(!S.net){S.backendRosterError = "Backend is offline in demo mode."; D = true; render(); return;}
  S.backendRosterLoading = true;
  S.backendRosterError = "";
  D = true; render();
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
    if(!waiters || !waiters.length){S.backendRosterError = "No waiters were returned by the backend.";}
  }catch(err){
    S.backendRosterLoaded = false;
    S.backendRosterError = err && err.message ? err.message : "The backend roster is unavailable.";
    toast("Backend roster unavailable. Demo mode remains usable.");
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
  try{S.kpis=await apiGet("/manager/dashboard");}catch(e){S.kpis={error:(e&&e.detail)||"Dashboard unavailable."};}
  try{S.tablesMap=await apiGet("/manager/tables")||[];}catch(e){S.tablesMap=[];S.alertErr=(e&&e.detail)||"Table map unavailable.";}
  try{S.alerts=await apiGet("/manager/alerts?is_open=true")||[];S.alertErr="";}catch(e){S.alerts=[];S.alertErr=(e&&e.detail)||"Alerts unavailable.";}
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
  }catch(e){S.waiterErr=(e&&e.detail)||"Request not found.";}
  D=true;render();
}
async function waiterAct(kind){
  S.waiterMsg="";S.waiterErr="";D=true;render();
  if(!S.waiterReq){S.waiterErr="Look up a request first.";D=true;render();return;}
  if(!S.waiterId){S.waiterErr="Select your waiter identity from the roster first. Real sign-in is pending backend authentication.";D=true;render();return;}
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
  }catch(e){S.waiterErr=(e&&e.detail)||"Action failed.";}
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
function init(){W=["Rahul","Aman","Vikas","Suresh","Mohit"].map((n,i)=>({id:i,n,on:true,push:true,miss:0,streak:0,rej:0,acc:0,last:0}));
R=[];A=[];O=[];P={7:0};L=[];S={t:0,seq:0,lt:performance.now(),sv:[],sp:+(document.getElementById("sp")||{value:3}).value,table:7,cv:"home",cart:{},sel:0,tab:"c1",toast:"",tt:0,rid:500,oid:0,aid:0,tabs:false,queue:null,qt:0,pb:0,open:null,customerSubmitting:false,pick:{},ctext:"",route:"customer",sub:"service",msearch:"",otype:"dine-in",comsg:"",net:true,wl:false,al:false,wbad:false,abadr:"",backendRosterLoading:false,backendRosterLoaded:false,backendRosterError:"",backendRosterCount:0,wn:{},qrbad:false,tsel:null,ac:[],scan:false,say:"To begin, scan your table QR code. Sign-in, ordering, and payment services require backend integration not yet available.",look:"c1",pre:"",plan:null,myReq:[],reqCache:{},reqErr:"",waiterId:"",waiterReqId:"",waiterReq:null,waiterAtt:[],waiterMsg:"",waiterErr:"",adminTab:"overview",afAlert:"all",afType:"all",afTable:"",afWaiter:"all",kpis:null,tablesMap:[],alerts:[],alertErr:"",alertSel:null,alertReq:{},mgrId:"",assignMsg:"",wEmail:"",wPass:"",aEmail:"",aPass:"",loginMsg:""};D=true}
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
  if(r.cur)end(r,"CANCELLED");r.cur=null;r.status="CANCELLED";A.forEach(a=>{if(a.r==r.id)a.open=false});log("#"+id+" cancelled by customer");toast("Request cancelled.");say("Customer cancelled the request. The waiter alert disappeared and any manager alert was closed.","c1");D=true;render();return;
 }
 if(!S.net){toast("No internet. Please try again when the connection is back.");return;}
 try{
  const response=await apiFetch("/service-requests/"+id+"/cancel",{method:"POST",body:{table_id:r.table}});
  r.status=response.status;
  r.cur=null;r.rs=false;
  A.forEach(a=>{if(a.r==r.id)a.open=false});
  if(response.closed_at)r.closedAt=Date.parse(response.closed_at);
  log("#"+id+" cancelled by customer");
  toast("Request cancelled.");
  say("Customer cancelled the request. The backend closed the request and its alerts.","c1");
 }catch(e){
  if(e && e.status===409)toast(e.detail || "Accepted or completed requests cannot be cancelled.");
  else if(e && e.status===404)toast(e.detail || "This request was not found.");
  else toast((e && e.detail)?e.detail:"Request could not be cancelled. Please try again.");
 }
 D=true;render();
}

function placeOrder(){if(!S.net)return toast("No internet. Please try again when the connection is back.");
 const it=MENU.map((m,j)=>S.cart[j]?S.cart[j]+" "+m.n:"").filter(Boolean).join(", ");if(!it)return;
 O.push({id:++S.oid,table:S.table,items:it,s:"PENDING",w:null});S.cart={};S.cv="home";toast("Order sent.");
 say("The order appeared on the Manager dashboard. The manager presses Next to advance its status (Confirmed, Preparing, Ready, Served). When it is READY, the table's waiter is notified.","c3");log(`Order #${S.oid} Table ${S.table}: ${it}`)}
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
  R.push(r);if(!S.myReq.includes(r.id)){S.myReq.push(r.id);saveMyReq();}S.sub="orders";log(`#${r.id} Table ${r.table}: ${LB(r)} request`);toast(LB(r)+" request sent.");say("Request sent and routed by the backend.","c1");refreshMyRequests();
 }catch(e){
  if(e && e.status===409)toast(e.detail || "This request has already been sent.");
  else toast((e && e.detail)?e.detail:"Request could not be sent. Please try again.");
 }
 S.customerSubmitting=false;D=true;render();
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
function custHero(activeCount,cartCount){return `<div class="cust-hero"><div><p class="eyebrow">Grand Bistro &amp; Cafe</p><h2>Dinner, served at your table.</h2><p class="mut">Browse the menu, send a quick service request, and follow its status — all without installing an app.</p></div><div class="table-chip"><span class="tag ACCEPTED">Table ${S.table} · ${S.table<=CFG.INDOOR?"Indoor":"Outdoor"}</span><select data-sel="table" aria-label="Change table">${Array.from({length:CFG.TABLES},(_,i)=>`<option value="${i+1}" ${i+1==S.table?"selected":""}>Table ${i+1}</option>`).join("")}</select></div></div>${S.toast?`<div class="toast" role="status">${S.toast}</div>`:""}${S.net?"":`<div class="st red"><b>Connection lost</b><br>Requests already sent are safe on the server. New requests can be sent once you are back online.</div>`}<div class="otype-row" role="group" aria-label="Order type">${[["dine-in","Dine-in","Pay per restaurant policy"],["car-side","Car-side","Prepay or pay after"],["home-delivery","Home delivery","Paid before dispatch"]].map(o=>`<button class="otype ${S.otype===o[0]?"on":""}" data-act="otype" data-k="${o[0]}" aria-pressed="${S.otype===o[0]}"><b>${o[1]}</b><small>${o[2]}</small></button>`).join("")}</div><nav class="subnav" aria-label="Customer sections">${[["service","Service"],["menu","Menu"],["cart","Cart"+(cartCount?` (${cartCount})`:"")],["orders","My requests"+(activeCount?` (${activeCount})`:"")]].map(t=>`<button class="${S.sub===t[0]?"on":""}" data-act="sub" data-k="${t[0]}">${t[1]}</button>`).join("")}</nav>`}
function tdet(){const n=S.tsel,rs=R.filter(r=>r.table==n&&open(r));return `<div class="st blu" style="margin-top:8px"><b>Table ${n}</b> (${n<=CFG.INDOOR?"Indoor":"Outdoor"})<br>Primary waiter: ${P[n]!=null?W[P[n]].n:"none yet"}<br>Open requests: ${rs.length?rs.map(r=>"#"+r.id+" "+LB(r)+" ("+r.status+")").join(", "):"none"}<br>Session: ${n==S.table&&S.scan?"ACTIVE":"-"}</div>`}
function QS(){return TY.filter(t=>t[0]!="custom").map(t=>{const k=t[0],sb=SUB[k],op=S.open==k;
 const btn=`<button class="svc" data-act="${sb?"grp":"req"}" data-k="${k}" ${sb?`aria-expanded="${op}"`:""}><i>${t[2]}</i><span>${t[1]}</span>${sb?`<span class="mut" style="margin-left:auto">${op?"&#9650;":"&#9662;"}</span>`:""}</button>`;
 if(!sb||!op)return btn;const pk=S.pick[k]||[];
 return btn+(sb.m?`<div class="subs">${sb.o.map(v=>`<button class="b" data-act="opt" data-k="${k}" data-v="${v}">${v}</button>`).join("")}</div>`:`<div class="subs">${sb.o.map(v=>`<button class="b ${pk.includes(v)?"p":""}" data-act="pick" data-k="${k}" data-v="${v}" aria-pressed="${pk.includes(v)}">${v}</button>`).join("")}</div><button class="b p" style="width:100%;margin-bottom:8px" data-act="sendm" data-k="${k}" ${pk.length?"":"disabled"}>Send${pk.length?" ("+pk.join(", ")+")":""}</button>`)}).join("")+`<div class="svc" style="display:block;cursor:default"><b>Need something else?</b><div class="row" style="margin-top:6px;gap:6px"><input id="ctext" maxlength="120" value="${esc(S.ctext)}" placeholder="Type here..." aria-label="Custom request" style="flex:1;min-width:0;border:1.5px solid var(--line);border-radius:8px;padding:8px;background:var(--card);color:var(--ink)"><button class="b p" data-act="sendc">Send</button></div></div>`}
function cust(){if(S.qrbad)return badQR();if(!S.scan)return scanV();
 const cartCount=Object.values(S.cart).reduce((a,b)=>a+(b||0),0);
 const myIds=S.myReq.slice().reverse();
 const hd=custHero(myIds.length,cartCount);
 if(S.sub=="menu"||S.cv=="menu"){const q=String(S.msearch||"").toLowerCase();
 const card=(m,i)=>`<article class="menu-card"><div class="food-image" aria-hidden="true">${m.a?"🍽️":"⏸️"}</div><div class="menu-card-body"><div class="menu-card-title"><h5>${m.n}</h5>${m.a?`<span class="tag ACCEPTED">Available</span>`:`<span class="tag REJECTED">Unavailable</span>`}</div><p class="mut sm">From the restaurant menu · ${INR(m.p)}</p><div class="menu-card-footer"><strong>${INR(m.p)}</strong><span class="qty"><button data-act="q-" data-i="${i}" aria-label="Remove one ${m.n}">−</button><b>${S.cart[i]||0}</b><button data-act="q+" data-i="${i}" aria-label="Add one ${m.n}" ${m.a?"":"disabled"}>+</button></span></div></div></article>`;
 const secs=MENU_CAT.map(c=>{const items=MENU.map((m,i)=>({m,i})).filter(x=>MENU_SECT[x.i]===MENU_CAT.indexOf(c)&&x.m.n.toLowerCase().includes(q));return `<section aria-label="${c[1]}"><div class="menu-toolbar"><h4>${c[1]}</h4><p class="mut sm">${c[2]}</p></div>${items.length?`<div class="menu-grid">${items.map(x=>card(x.m,x.i)).join("")}</div>`:`<p class="mut sm">No dishes match your search in this section.</p>`}</section>`}).join("");
 const n=cartCount,tot=MENU.reduce((s,m,i)=>s+m.p*(S.cart[i]||0),0);
 return hd+`<div class="menu-search"><input id="msearch" maxlength="60" value="${esc(S.msearch)}" placeholder="Search dishes…" aria-label="Search dishes"></div>`+secs+`<div class="cart-card"><h5>Cart summary</h5>${n?`<p>${esc(Object.entries(S.cart).filter(([,qq])=>qq>0).map(([i,qq])=>`${qq} × ${MENU[+i].n}`).join(", "))}</p><p><strong>Subtotal: ${INR(tot)}</strong></p><div class="row"><button class="b p" data-act="checkout">Review &amp; checkout</button></div>`:`<p class="mut">Your cart is empty. Add dishes with the + buttons.</p>`}<p class="sm mut">Menu data is local sample data. Online checkout and payment need backend order and payment APIs.</p></div>`}
 if(S.sub=="cart"||S.sub=="checkout"){const n=cartCount,tot=MENU.reduce((s,m,i)=>s+m.p*(S.cart[i]||0),0);
 const lines=Object.entries(S.cart).filter(([,qq])=>qq>0);
 return hd+`<section aria-label="Checkout"><h4>${S.sub=="checkout"?"Checkout":"Your cart"}</h4>${lines.length?`<div class="cart-card">${lines.map(([i,qq])=>`<div class="row"><span>${qq} × ${MENU[+i].n}</span><span><strong>${INR(MENU[+i].p*qq)}</strong> <span class="qty"><button data-act="q-" data-i="${i}" aria-label="Remove one">−</button><b>${qq}</b><button data-act="q+" data-i="${i}" aria-label="Add one">+</button></span></span></div>`).join("")}<p><strong>Subtotal: ${INR(tot)}</strong></p><p class="mut sm">Order type: <b>${esc(S.otype)}</b> · Table ${S.table}${S.otype==="home-delivery"?" · home-delivery orders are dispatched only after successful payment":""}</p>${S.sub=="checkout"?`<div class="row"><button class="b" data-act="sub" data-k="cart">Back to cart</button><button class="b p" data-act="paynow">Pay ${INR(tot)} (pending API)</button></div>${S.comsg?`<div class="st amb">${S.comsg}</div>`:""}<p class="sm mut">Checkout and payment APIs are not implemented. Nothing is charged and no order is placed on the server.</p>`:`<div class="row"><button class="b p" data-act="checkout" ${n?"":"disabled"}>Continue to checkout</button><button class="b" data-act="draftorder" ${n?"":"disabled"}>Save as local draft</button></div><p class="sm mut">“Save as local draft” keeps the order only in this browser for the demo. It is not sent to the kitchen.</p>`}</div>`:`<p class="mut">Your cart is empty.</p><div class="row"><button class="b p" data-act="sub" data-k="menu">Browse menu</button></div>`}</section>`}
 if(S.sub=="orders"){
 const card=id=>{const c=S.reqCache[id]||{};const r=R.find(x=>x.id===id);
  const st=c.error?`<span class="tag REJECTED">Unknown</span>`:`<span class="tag ${["ACCEPTED","CLOSED"].includes(c.status)?"ACCEPTED":["CANCELLED"].includes(c.status)?"REJECTED":"WAITING"}">${reqStatusLabel(c.status)}</span>`;
  const can=r&&r.rs&&!r.cur&&r.rsn<CFG.RESEND_MAX&&S.net;
  return `<article class="req-card"><div class="req-card-head"><b>#${id} · ${esc(c.key?TN[c.key]||c.key:"service")}${c.details?` (${esc(c.details)})`:""}</b>${st}</div><div class="mut sm">Table ${c.table||S.table}${c.resends?` · resent ${c.resends}×`:""}${c.accepted?` · accepted ${fmtTime(c.accepted)}`:""}${c.closed?` · closed ${fmtTime(c.closed)}`:""}${c.error?` · ${esc(c.error)}`:""}</div>${r?`<div class="row"><button class="b" data-act="cancel" data-id="${r.id}" ${S.net?"":"disabled"}>Cancel request</button><button class="b" data-act="resend" data-id="${r.id}" ${can?"":"disabled"}>Resend</button></div>${(!r.rs&&r.rsn<CFG.RESEND_MAX)?`<div class="sm mut">Resend becomes available 60 seconds after the last activity (max ${CFG.RESEND_MAX}).</div>`:""}${r.rsn>=CFG.RESEND_MAX?`<div class="sm mut">Resend limit reached. The manager has been informed.</div>`:""}`:`<div class="sm mut">Sent from this browser earlier. Cancel and resend controls appear while the request is also tracked locally.</div>`}</article>`;};
 return hd+`<section aria-label="My requests"><div class="menu-toolbar"><h4>My requests</h4><button class="b" data-act="refreshreq">Refresh status</button></div>${S.reqErr?`<div class="st red">${esc(S.reqErr)}</div>`:""}${myIds.length?myIds.map(card).join(""):`<p class="mut">No requests yet from this browser. Use the Service tab to call a waiter.</p><div class="row"><button class="b p" data-act="sub" data-k="service">Request service</button></div>`}<p class="sm mut">Statuses come from the backend API. The router tries the 1st waiter for 45 seconds, then up to two more waiters for 30 seconds each, before alerting the manager.</p></section>`}
 const quick=[["water","Water","Cold, Normal or Hot — served at your table."],["call","Call Waiter","A waiter comes to your table."],["spt","Tissue & Condiments","Salt, pepper or tissue."],["bill","Request Bill","Cash or online, per restaurant policy."]];
 return hd+`<section aria-label="Table service"><div class="menu-toolbar"><h4>How can we help at Table ${S.table}?</h4><p class="mut sm">Requests go to the backend router — no login needed.</p></div><div class="service-grid">${quick.map(q=>`<button class="service-card" data-act="quick" data-k="${q[0]}"><b>${q[1]}</b><small>${q[2]}</small></button>`).join("")}</div><h4>More options</h4>`+QS()+`<div class="row"><button class="b p" data-act="sub" data-k="menu">Browse the menu</button><button class="b" data-act="sub" data-k="orders">Track my requests${myIds.length?` (${myIds.length})`:""}</button></div><p class="sm mut">Duplicate taps within 60 seconds are blocked by the backend. Resend is available after 60 seconds, up to ${CFG.RESEND_MAX} times per request.</p></section>`}
function wlogin(){return `<div class="auth-wrap"><div class="auth-card"><p class="eyebrow">Waiter workspace</p><h3>Waiter sign in</h3><p class="mut sm">Use your assigned staff email and password.</p><div class="pending-box"><b>Pending backend integration.</b> <code>POST /api/v1/auth/login</code> does not exist yet, so real sign-in is unavailable.</div><label class="field">Work email<input id="wemail" maxlength="150" value="${esc(S.wEmail)}" placeholder="rahul.dev@restaurant.local" autocomplete="username"></label><label class="field">Password<input id="wpass" type="password" maxlength="100" placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;" autocomplete="current-password"></label>${S.loginMsg?`<div class="st red" role="alert">${esc(S.loginMsg)}</div>`:""}<button class="b p btn-block" data-act="wtrylogin">Sign in</button><button class="b btn-block" data-act="wpreview">Open local preview (not authenticated)</button><p class="sm mut">The preview is a demonstration aid only. It does not authenticate you and must not be treated as secure access.</p></div></div>`}
function wait(){
 if(!S.wl)return wlogin();
 const me=W.find(w=>w.backendId===S.waiterId);
 const r=S.waiterReq;
 const att=(S.waiterAtt||[]).map(a=>`<div class="attempt"><span class="chip ${a.status}">${a.status}</span><span>${esc(backendWaiterName(a.waiter_id))}</span><span class="mut sm">attempt ${a.attempt_number} · ${a.timeout_seconds}s · assigned ${fmtTime(a.assigned_at)}${a.responded_at?` · responded ${fmtTime(a.responded_at)}`:""}${a.rejection_reason?` · ${esc(a.rejection_reason)}`:""}</span></div>`).join("");
 return `<div class="dash-head"><div><p class="eyebrow">Waiter workspace · local preview</p><h2>${me?esc(me.n):"Shift dashboard"}</h2><p class="mut sm">Preview only — not authenticated. Real sign-in needs backend authentication.</p></div><button class="b" data-act="wexit">Exit preview</button></div>${S.toast?`<div class="toast" role="status">${S.toast}</div>`:""}${S.net?"":`<div class="st red"><b>Connection lost.</b> Actions are disabled until you are back online.</div>`}
 <section class="card" aria-label="My availability"><h4>My availability</h4><div class="row"><select id="wself" aria-label="Select waiter identity">${W.filter(w=>w.backendId).map(w=>`<option value="${w.backendId}" ${w.backendId===S.waiterId?"selected":""}>${esc(w.n)}${w.backendOnline?" · online":" · offline"}</option>`).join("")||`<option value="">No roster loaded</option>`}</select><button class="b" data-act="wrefresh">Refresh roster</button></div>${S.backendRosterError?`<div class="st amb sm">${esc(S.backendRosterError)}</div>`:""}${me?`<div class="row"><span class="mut sm">Accepted ${me.backendAcceptedCount||0} · Missed ${me.backendMissedCount||0} · Rejected ${me.backendRejectedCount||0} · Push ${me.backendPushEnabled?"ON":"OFF"}</span></div><div class="row"><button class="b p" data-act="wonline">Go online</button><button class="b d" data-act="woffline">Go offline</button></div><p class="sm mut">Going offline triggers the backend safeguard: waiting attempts are cancelled and rerouted, open accepted tasks are reassigned.</p>`:`<p class="mut sm">Select your name to enable actions.</p>`}</section>
 <section class="card" aria-label="Request actions"><h4>Request actions</h4><p class="mut sm">There is no waiter task-list endpoint yet (<code>GET /api/v1/waiters/{id}/requests</code> is missing), so look up requests by ID. The router assigns the 1st waiter for 45s, then up to two more waiters for 30s each.</p><div class="row"><input id="wreqid" inputmode="numeric" maxlength="10" value="${esc(S.waiterReqId)}" placeholder="Request ID, e.g. 12" aria-label="Request ID"><button class="b p" data-act="wlookup">Look up</button></div>${S.waiterErr?`<div class="st red" role="alert">${esc(S.waiterErr)}</div>`:""}${S.waiterMsg?`<div class="st acc" role="status">${esc(S.waiterMsg)}</div>`:""}${r?`<article class="req-card"><div class="req-card-head"><b>#${r.id} · Table ${r.table_id} · ${esc(TN[r.service_key]||r.service_key)}${r.details?` (${esc(r.details)})`:""}</b><span class="tag ${r.status==="ACCEPTED"?"ACCEPTED":(r.status==="CANCELLED"||r.status==="CLOSED")?"REJECTED":"WAITING"}">${reqStatusLabel(r.status)}</span></div><div class="mut sm">Created ${fmtTime(r.created_at)}${r.accepted_at?` · accepted ${fmtTime(r.accepted_at)}`:""}${r.closed_at?` · closed ${fmtTime(r.closed_at)}`:""} · resends ${r.resend_count}</div><div class="attempts">${att||'<p class="mut sm">No attempts yet.</p>'}</div><div class="row"><button class="b p" data-act="waccept" ${S.net?"":"disabled"}>Accept</button><select id="rejreason" aria-label="Rejection reason">${["Busy","At another table","On break","Other"].map(x=>`<option>${x}</option>`).join("")}</select><button class="b" data-act="wreject" ${S.net?"":"disabled"}>Reject</button><button class="b" disabled title="Pending backend API">Complete (pending API)</button></div><p class="sm mut">Accept and Reject use the live backend; rejection reroutes immediately. Completing a task needs a completion endpoint that does not exist yet — accepted requests auto-close after 10 minutes on the backend.</p></article>`:""}</section>
 <section class="card" aria-label="Roster"><h4>Roster &amp; workload</h4><div class="sc"><table><tr><th>Waiter</th><th>Status</th><th>Push</th><th>Accepted</th><th>Missed</th><th>Rejected</th></tr>${W.filter(w=>w.backendId).map(w=>`<tr><td><b>${esc(w.n)}</b></td><td>${w.backendOnline?"Online":"Offline"}</td><td>${w.backendPushEnabled?"ON":"OFF"}</td><td>${w.backendAcceptedCount||0}</td><td>${w.backendMissedCount||0}</td><td>${w.backendRejectedCount||0}</td></tr>`).join("")||`<tr><td colspan="6" class="mut">Roster unavailable.</td></tr>`}</table></div><p class="sm mut">Workload ranking on the backend: least accepted + waiting work first, then least active load, then longest idle.</p></section>`}

const chip=(a)=>`<span class="chip ${a.st}" title="${a.st}">${W[a.w].n} ${a.st.toLowerCase()}${a.rs?" ("+a.rs+")":""}${a.st=="WAITING"&&a.dl?` <span data-cd="${a.dl}">${fmt(a.dl-S.t)}</span>`:a.e!=null?` ${Math.round((a.e-a.t)/1000)}s`:""}</span> `;
function adminLogin(){return `<div class="auth-wrap"><div class="auth-card"><p class="eyebrow">Admin workspace</p><h3>Admin sign in</h3><p class="mut sm">Restaurant managers use their authorized admin credentials.</p><div class="pending-box"><b>Pending backend integration.</b> <code>POST /api/v1/auth/login</code> and role-based authorization do not exist yet, so real sign-in is unavailable.</div><label class="field">Admin email<input id="aemail" maxlength="150" value="${esc(S.aEmail)}" placeholder="manager.dev@restaurant.local" autocomplete="username"></label><label class="field">Password<input id="apass" type="password" maxlength="100" placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;" autocomplete="current-password"></label>${S.loginMsg?`<div class="st red" role="alert">${esc(S.loginMsg)}</div>`:""}<button class="b p btn-block" data-act="atrylogin">Sign in</button><button class="b btn-block" data-act="apreview">Open local preview (not authenticated)</button><p class="sm mut">The preview is a demonstration aid only. It does not authenticate you and must not be treated as secure access.</p></div></div>`}
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
 if(!S.al)return adminLogin();
 const tabs=[["overview","Overview"],["requests","Requests & alerts"],["tables","Tables"],["staff","Staff"],["menu","Menu"],["reports","Reports & settings"]];
 let body="";
 if(S.adminTab==="overview"){body=`<div class="row"><button class="b" data-act="arefresh">Refresh live data</button></div>${adminKpis()}<p class="sm mut">Live values come from <code>GET /api/v1/manager/dashboard</code>. “—” means the backend does not expose that split.</p>`;}
 else if(S.adminTab==="requests"){
  const list=S.alerts.filter(a=>{
   if(S.afAlert!=="all"&&a.alert_type!==S.afAlert)return false;
   const d=S.alertReq[a.id];const r=d&&d.request;
   if(S.afTable&&(!r||String(r.table_id)!==String(S.afTable)))return false;
   if(S.afType!=="all"&&(!r||r.service_key!==S.afType))return false;
   if(S.afWaiter!=="all"&&r){const ids=((d.attempts||[]).map(x=>x.waiter_id).concat([r.accepted_by])).filter(Boolean);if(!ids.includes(S.afWaiter))return false;}
   return true;});
  body=`<div class="row"><button class="b" data-act="arefresh">Refresh live data</button><button class="b" data-act="aloadall">Load all request details</button></div>${S.alertErr?`<div class="st red">${esc(S.alertErr)}</div>`:""}<div class="filter-row"><select id="afalert" aria-label="Filter by alert type">${["all","NONE","ALL","LIMIT"].map(x=>`<option value="${x}" ${S.afAlert===x?"selected":""}>${x==="all"?"All alert types":x==="NONE"?"NONE · no waiter online":x==="ALL"?"ALL · 3 attempts failed":"LIMIT · resend limit"}</option>`).join("")}</select><select id="aftype" aria-label="Filter by request type"><option value="all">All request types</option>${TY.map(t=>`<option value="${t[0]}" ${S.afType===t[0]?"selected":""}>${t[1]}</option>`).join("")}</select><input id="aftable" inputmode="numeric" maxlength="2" value="${esc(S.afTable)}" placeholder="Table #" aria-label="Filter by table"><select id="afwaiter" aria-label="Filter by waiter"><option value="all">All waiters</option>${W.filter(w=>w.backendId).map(w=>`<option value="${w.backendId}" ${S.afWaiter===w.backendId?"selected":""}>${esc(w.n)}</option>`).join("")}</select></div><label class="field">Manager ID (required for Assign / Resolve)<input id="mgrid" maxlength="60" value="${esc(S.mgrId)}" placeholder="Paste manager UUID from the backend"></label><p class="sm mut">There is no manager-lookup endpoint yet, so assignment and resolve actions need the manager UUID (see development seed data). ${S.assignMsg?`<div class="st ${/sent|resolved/.test(S.assignMsg)?"acc":"amb"}" role="status">${esc(S.assignMsg)}</div>`:""}</p>${list.length?list.map(adminAlertCard).join(""):`<p class="mut">No open alerts match the filters. Alerts appear here after 3 failed attempts, when no waiter is online, or when a resend limit is reached.</p>`}<p class="sm mut">A full request-list endpoint (<code>GET /api/v1/service-requests</code>) does not exist yet — this tab covers escalated requests via manager alerts.</p>`;}
 else if(S.adminTab==="tables"){
  body=`<div class="row"><button class="b" data-act="arefresh">Refresh live data</button></div>${S.tablesMap.length?`<div class="table-grid">${S.tablesMap.map(t=>`<div class="table-card ${t.status_badge}"><b>${t.table_number}</b><small>${t.section==="INDOOR"?"Indoor":"Outdoor"}</small>${t.status_badge!=="normal"?`<small class="mk">${t.status_badge==="alert"?"!":t.status_badge==="wait"?"…":"✓"}</small>`:""}<small class="mut">${t.open_requests_count} open</small>${t.primary_waiter_name?`<small class="mut">${esc(t.primary_waiter_name)}</small>`:""}</div>`).join("")}</div><p class="sm mut">Badges show live request activity from <code>GET /api/v1/manager/tables</code> — red = failed alert, blue = waiting, green = accepted. This is request activity, not physical table occupancy.</p>`:`<div class="st amb">Table map unavailable. ${esc(S.alertErr||"The backend did not return table data.")}</div>`}`;}
 else if(S.adminTab==="staff"){
  body=`<div class="row"><button class="b" data-act="arefresh">Refresh roster</button></div>${S.backendRosterError?`<div class="st amb sm">${esc(S.backendRosterError)}</div>`:""}<div class="sc"><table><tr><th>Waiter</th><th>Status</th><th>Push</th><th>Accepted</th><th>Missed</th><th>Rejected</th></tr>${W.filter(w=>w.backendId).map(w=>`<tr><td><b>${esc(w.n)}</b></td><td>${w.backendOnline?"Online":"Offline"}</td><td>${w.backendPushEnabled?"ON":"OFF"}</td><td>${w.backendAcceptedCount||0}</td><td>${w.backendMissedCount||0}</td><td>${w.backendRejectedCount||0}</td></tr>`).join("")||`<tr><td colspan="6" class="mut">Roster unavailable.</td></tr>`}</table></div><div class="pending-box"><b>Create staff account — pending backend.</b> <code>POST /api/v1/staff</code> does not exist yet. Intended flow: an admin creates the account, the backend stores a securely hashed password, and role-based authorization protects every endpoint.<div class="row"><input disabled placeholder="Name" aria-label="Staff name (pending)"><input disabled placeholder="Email" aria-label="Staff email (pending)"><button class="b" disabled>Invite (pending API)</button></div></div>`;}
 else if(S.adminTab==="menu"){
  body=`${MENU_CAT.map((c,ci)=>`<section aria-label="${c[1]}"><div class="menu-toolbar"><h4>${c[1]}</h4><p class="mut sm">${c[2]}</p></div><div class="menu-grid">${MENU.map((m,i)=>({m,i})).filter(x=>MENU_SECT[x.i]===ci).map(x=>`<article class="menu-card"><div class="food-image" aria-hidden="true">${x.m.a?"🍽️":"⏸️"}</div><div class="menu-card-body"><div class="menu-card-title"><h5>${x.m.n}</h5>${x.m.a?`<span class="tag ACCEPTED">Available</span>`:`<span class="tag REJECTED">Unavailable</span>`}</div><div class="menu-card-footer"><strong>${INR(x.m.p)}</strong><span class="mut sm">read-only</span></div></div></article>`).join("")}</div></section>`).join("")}<div class="pending-box"><b>Menu editing — pending backend.</b> No menu-management endpoint exists yet, so this catalogue is read-only sample data. Availability shown here matches the current source data.</div>`;}
 else{body=`<div class="pending-box"><b>Operational reports — pending backend.</b> Shift summaries, service-time reports, and export endpoints do not exist yet.</div><div class="pending-box"><b>Billing settings — pending backend.</b> Dine-in payment policy, car-side prepay/pay-later rules, tips, and refund policy are documented product rules without supporting endpoints.</div><div class="pending-box"><b>Restaurant settings — pending backend.</b> Table count, sections, and routing constants (45s / 30s / 3 attempts) are owned by the backend routing engine and must not be edited from the UI.</div>`;}
 return `<div class="dash-head"><div><p class="eyebrow">Admin workspace · local preview</p><h2>Restaurant dashboard</h2><p class="mut sm">Preview only — not authenticated. Live numbers come from existing backend endpoints.</p></div><button class="b" data-act="aexit">Exit preview</button></div>${S.toast?`<div class="toast" role="status">${S.toast}</div>`:""}<nav class="subnav" aria-label="Admin sections">${tabs.map(t=>`<button class="${S.adminTab===t[0]?"on":""}" data-act="atab" data-k="${t[0]}">${t[1]}</button>`).join("")}</nav>${body}`}

function fair(){W.forEach(w=>w.on=true);P={};S.plan=["accept"];S.tab="c3";const ks=[["water","Cold"],["salad",""],["spt","Salt"],["bill","Cash"],["cutlery","Plate"],["call",""]];
 for(let i=1;i<=10;i++){S.table=i;req(ks[i%6][0],ks[i%6][1])}S.table=7;say("10 requests at once, 5 waiters: each request went to the waiter with the least work so far. Check the Staff table on the Manager screen: everyone gets an equal share (2 each).","c3")}
function demo(k){document.getElementById("sp").value="10";init();S.sp=10;S.tab="c1";S.scan=true;S.wl=true;if(k=="f")return fair();if(k=="p"){P={};S.table=1;S.plan=[["accept"],["ignore","accept"]];S.pb=S.rid;S.queue=[()=>{S.table=1;req("salad")}];req("water","Cold");return}if(k=="o")W.forEach(w=>w.on=false);S.plan={n:["accept"],i:["ignore","ignore","ignore"],r:["reject","accept"],o:[]}[k];req("water","Cold")}
function jr(){const r=R[R.length-1];if(!r)return `<b>Request journey</b><div class="mut sm">No requests yet. Here you will see which waiter has the request and how much time is left.</div>`;
 const L={WAITING:"Waiting for response",MISSED:"No response",REJECTED:"Rejected",ACCEPTED:"Accepted",CANCELLED:"Went offline"},ok=["ACCEPTED","CLOSED"].includes(r.status),fl=r.status=="FAILED";
 let h=`<div class="jn ACCEPTED"><b>Customer</b><br>Table ${r.table}: ${LB(r)}</div>`;const n=(ok||fl)?r.at.length:Math.max(3,r.at.length);
 for(let i=0;i<n;i++){const a=r.at[i];h+=`<span class="arrow">&rarr;</span>`+(a?`<div class="jn ${a.st}"><b>${W[a.w].n}</b> <span class="sm">(${a.secs}s${a.mgr?", manager":""})</span><br>${L[a.st]}${a.e!=null?` &middot; ${Math.round((a.e-a.t)/1000)}s`:""}${a.st=="WAITING"&&r.cur?`<br><b data-cd="${r.cur.dl}">${fmt(r.cur.dl-S.t)}</b> left<div class="pb"><i data-pb="${r.cur.dl}|${a.secs}" style="width:${Math.min(100,100-(r.cur.dl-S.t)/(a.secs*10))}%"></i></div>`:""}</div>`:`<div class="jn" style="opacity:.5">Next waiter<br><span class="sm">if needed</span></div>`)}
 h+=`<span class="arrow">&rarr;</span><div class="jn ${ok?"ACCEPTED":fl?"FAILED":""}" style="${ok||fl?"":"opacity:.5"}"><b>${ok?"Work started":fl?"Manager alert":"Manager"}</b><br>${ok?"Waiter at the table":fl?"HIGH PRIORITY":"Alert after 3 failures"}</div>`;
 return `<b>Request #${r.id} journey</b> <span class="mut sm">(Table ${r.table}, ${LB(r)}. one waiter at a time)</span><div class="jr">${h}</div>`}

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
 wtrylogin:()=>{S.loginMsg="Sign-in is unavailable: POST /api/v1/auth/login does not exist yet.";},
 wpreview:()=>{S.wl=true;S.loginMsg="";go("waiter/dashboard");},
 wexit:()=>{S.wl=false;S.waiterId="";go("waiter/login");},
 wrefresh:()=>refreshBackendWaiterRoster(),
 wonline:()=>waiterSetOnline(true),
 woffline:()=>waiterSetOnline(false),
 wlookup:()=>waiterLookup(),
 waccept:()=>waiterAct("accept"),
 wreject:()=>waiterAct("reject"),
 atrylogin:()=>{S.loginMsg="Sign-in is unavailable: POST /api/v1/auth/login does not exist yet.";},
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
document.addEventListener("input",e=>{const id=e.target.id,v=e.target.value;if(id=="ctext")S.ctext=v;else if(id=="msearch")S.msearch=v;else if(id=="wemail")S.wEmail=v;else if(id=="wpass")S.wPass=v;else if(id=="wreqid")S.waiterReqId=v;else if(id=="aemail")S.aEmail=v;else if(id=="apass")S.aPass=v;else if(id=="mgrid")S.mgrId=v;else if(id=="aftable")S.afTable=v;});
document.addEventListener("change",e=>{if(e.target.dataset.sel=="table"){S.table=+e.target.value;D=true;render()}if(e.target.id=="sp")S.sp=+e.target.value;if(e.target.id=="wself"){S.waiterId=e.target.value;D=true;render()}if(e.target.id=="afalert"){S.afAlert=e.target.value;D=true;render()}if(e.target.id=="aftype"){S.afType=e.target.value;D=true;render()}if(e.target.id=="afwaiter"){S.afWaiter=e.target.value;D=true;render()}});
function fit(){const root=document.documentElement;root.classList.remove("tabs");document.body.style.zoom="";root.style.removeProperty("--z");const tb=document.getElementById("tabsb");if(tb)tb.style.display="none"}
addEventListener("resize",fit);fit();init();loadMyReq();addEventListener("hashchange",()=>{D=true;render();});(function(){const qp=new URLSearchParams(location.search);const tbl=Number(qp.get("table"));if(Number.isInteger(tbl)&&tbl>=1&&tbl<=CFG.TABLES){S.table=tbl;S.scan=true;}const ws=qp.get("workspace");if(ws==="dev")go("dev");else if(ws==="waiter")go("waiter/login");else if(ws==="admin")go("admin/login");D=true;render();setTimeout(refreshBackendWaiterRoster,250);setInterval(tick,250);setInterval(()=>{if(document.hidden||!S.net)return;if(S.route==="customer"&&S.myReq.length)refreshMyRequests();else if(S.route==="admin-dash"&&S.al)refreshAdminData();},10000);})();
