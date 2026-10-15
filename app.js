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
function init(){W=["Rahul","Aman","Vikas","Suresh","Mohit"].map((n,i)=>({id:i,n,on:true,push:true,miss:0,streak:0,rej:0,acc:0,last:0}));
R=[];A=[];O=[];P={7:0};L=[];S={t:0,seq:0,lt:performance.now(),sv:[],sp:+(document.getElementById("sp")||{value:3}).value,table:7,cv:"home",cart:{},sel:0,tab:"c1",toast:"",tt:0,rid:500,oid:0,aid:0,tabs:false,queue:null,qt:0,pb:0,open:null,customerSubmitting:false,pick:{},ctext:"",route:"customer",net:true,wl:false,al:false,wbad:false,abadr:"",backendRosterLoading:false,backendRosterLoaded:false,backendRosterError:"",backendRosterCount:0,wn:{},qrbad:false,tsel:null,ac:[],scan:false,say:"To begin, scan your table QR code. Sign-in, ordering, and payment services require backend integration not yet available.",look:"c1",pre:"",plan:null};D=true}
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
  R.push(r);log(`#${r.id} Table ${r.table}: ${LB(r)} request`);toast(LB(r)+" request sent.");say("Request sent and routed by the backend.","c1");
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
 return `<div style="text-align:center;padding-top:34px"><span class="tag ACCEPTED">Table ${S.table}</span><h3 style="font-size:22px;margin:16px 0 4px">Scan the QR code on your table</h3><div class="mut">No app to install. It opens right in the browser.</div><svg class="qr" viewBox="0 0 11 11" fill="#14213d" shape-rendering="crispEdges" aria-hidden="true">${q}</svg><button class="svc pri" data-act="scan">Scan</button><button class="b" style="margin-top:6px" data-act="badqr">Demo: show invalid QR</button><div class="mut sm" style="margin-top:8px">The table number is detected automatically.</div></div>`}
function badQR(){return `<div style="text-align:center;padding-top:60px"><span class="tag REJECTED">QR error</span><h3 style="font-size:22px">Invalid QR code</h3><div class="mut">The QR code has expired or is wrong. Please ask a waiter for help.</div><button class="b" style="margin-top:20px" data-act="qrok">Back</button></div>`}
function tdet(){const n=S.tsel,rs=R.filter(r=>r.table==n&&open(r));return `<div class="st blu" style="margin-top:8px"><b>Table ${n}</b> (${n<=CFG.INDOOR?"Indoor":"Outdoor"})<br>Primary waiter: ${P[n]!=null?W[P[n]].n:"none yet"}<br>Open requests: ${rs.length?rs.map(r=>"#"+r.id+" "+LB(r)+" ("+r.status+")").join(", "):"none"}<br>Session: ${n==S.table&&S.scan?"ACTIVE":"-"}</div>`}
function QS(){return TY.filter(t=>t[0]!="custom").map(t=>{const k=t[0],sb=SUB[k],op=S.open==k;
 const btn=`<button class="svc" data-act="${sb?"grp":"req"}" data-k="${k}" ${sb?`aria-expanded="${op}"`:""}><i>${t[2]}</i><span>${t[1]}</span>${sb?`<span class="mut" style="margin-left:auto">${op?"&#9650;":"&#9662;"}</span>`:""}</button>`;
 if(!sb||!op)return btn;const pk=S.pick[k]||[];
 return btn+(sb.m?`<div class="subs">${sb.o.map(v=>`<button class="b" data-act="opt" data-k="${k}" data-v="${v}">${v}</button>`).join("")}</div>`:`<div class="subs">${sb.o.map(v=>`<button class="b ${pk.includes(v)?"p":""}" data-act="pick" data-k="${k}" data-v="${v}" aria-pressed="${pk.includes(v)}">${v}</button>`).join("")}</div><button class="b p" style="width:100%;margin-bottom:8px" data-act="sendm" data-k="${k}" ${pk.length?"":"disabled"}>Send${pk.length?" ("+pk.join(", ")+")":""}</button>`)}).join("")+`<div class="svc" style="display:block;cursor:default"><b>Need something else?</b><div class="row" style="margin-top:6px;gap:6px"><input id="ctext" maxlength="120" value="${esc(S.ctext)}" placeholder="Type here..." aria-label="Custom request" style="flex:1;min-width:0;border:1.5px solid var(--line);border-radius:8px;padding:8px;background:var(--card);color:var(--ink)"><button class="b p" data-act="sendc">Send</button></div></div>`}
function cust(){if(S.qrbad)return badQR();if(!S.scan)return scanV();const my=R.filter(r=>r.table==S.table&&open(r)),mo=O.filter(o=>o.table==S.table);
 const hd=`<div class="row"><b>Restaurant Name</b><span class="tag ACCEPTED">Table <select data-sel="table" aria-label="Table">${Array.from({length:CFG.TABLES},(_,i)=>`<option ${i+1==S.table?"selected":""}>${i+1}</option>`).join("")}</select></span></div>${S.toast?`<div class="toast" role="status">${S.toast}</div>`:""}`;
 if(S.cv=="menu"){const n=Object.values(S.cart).reduce((a,b)=>a+b,0),tot=MENU.reduce((s,m,i)=>s+m.p*(S.cart[i]||0),0);
  return hd+`<h4>Menu</h4>`+MENU.map((m,i)=>`<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${m.n}${!m.a?` <span class="tag REJECTED">Unavailable</span>`:""}<br><span class="mut sm">${INR(m.p)}</span></span><span class="qty"><button data-act="q-" data-i="${i}" aria-label="decrease">-</button><b>${S.cart[i]||0}</b><button data-act="q+" data-i="${i}" aria-label="increase" ${!m.a?"disabled":""}>+</button></span></div>`).join("")+
  `<div class="row" style="margin-top:12px"><button class="b" data-act="home">Back</button><button class="b p" data-act="order" ${n?"":"disabled"}>Place order (${INR(tot)})</button></div>`}
 const cs=r=>{const ac=r.status=="ACCEPTED",wt=["PENDING","ASSIGNED","ESCALATED"].includes(r.status),
  m=wt?["blu","Request sent, looking for a waiter..."]:ac?["acc","A waiter is on the way"]:["amb","This is taking longer than usual. The manager has been informed."],
  can=r.rs&&!r.cur&&r.rsn<CFG.RESEND_MAX&&S.net,secs=CFG.RESEND/1000,
  left=ac?`<button class="b p" data-act="done" data-id="${r.id}">Received</button>`:`<button class="b" data-act="cancel" data-id="${r.id}" ${S.net?"":"disabled"}>Cancel request</button>`,
  right=`<button class="b" data-act="resend" data-id="${r.id}" ${can?"":"disabled"}>${ac?"Not received yet":"Resend Request"}</button>`,
  hint=r.rsn>=CFG.RESEND_MAX?'<div class="sm mut">Resend limit reached. The manager has been informed.</div>':r.rs?"":`<div class="sm mut">${ac?'"Not received yet"':"Resend"} becomes available after ${secs} sec</div>`;
  return `<div class="st ${m[0]}"><b>${LB(r)}</b><br>${m[1]}<div class="row" style="margin-top:6px">${left}${right}</div>${hint}</div>`};
 return hd+(S.net?"":`<div class="st red"><b>Connection lost</b><br>Requests already sent are safe on the server. New requests and orders can be sent once you are back online.</div>`)+`<h4>Quick Service</h4>`+QS()+
 `<h4>Order More</h4><button class="svc pri" data-act="menu">View Menu</button>`+(my.length?`<h4>Your requests</h4>`+my.map(cs).join(""):"")+
 (mo.length?`<h4>Your orders</h4>`+mo.map(o=>`<div class="row sm" style="padding:4px 0"><span>#${o.id}: ${o.items}</span><span class="chip ${o.s}">${o.s}</span></div>`).join(""):"")}
function wlogin(){return `<div style="padding-top:30px"><h3 style="font-size:22px;margin:0 0 4px">Staff Login</h3><div class="mut">Enter your phone number and PIN</div><div class="sm mut" style="margin-top:16px">Phone</div><div class="inp">9000000001</div><div class="sm mut" style="margin-top:12px">PIN</div><div class="inp">&bull; &bull; &bull; &bull;</div>${S.wbad?`<div class="st red">Wrong phone or PIN. Please try again.</div>`:""}<button class="b p" style="width:100%;min-height:50px;margin-top:16px" data-act="wlogin">Login</button><button class="b" style="width:100%;margin-top:8px" data-act="wbad">Demo: wrong PIN</button></div>`}
function wait(){if(!S.wl)return wlogin();
 const w=W[S.sel],incs=R.filter(r=>r.cur&&r.cur.w==w.id).sort((a,b)=>a.cur.dl-b.cur.dl),act=R.filter(r=>r.status=="ACCEPTED"&&r.by==w.id),
  rdy=O.filter(o=>o.s=="READY"&&o.w==w.id),wn=S.wn[w.id],n=act.length+incs.length,rjr=incs.find(r=>r.id==S.rj);if(S.rj!=null&&!rjr)S.rj=null;
 const tb=`<div class="wt">${W.map(x=>`<button data-act="sel" data-id="${x.id}" class="${x.id==S.sel?"on":""}"><span class="dot ${x.on?"on":""}"></span>${x.n}</button>`).join("")}</div>`;
 const hd=`<div class="row"><b>${w.n}</b><button class="b ${w.on?"p":""}" data-act="togw" data-id="${w.id}" aria-pressed="${w.on}">${w.on?"ONLINE":"OFFLINE"}</button></div><div class="sm mut" style="margin:4px 0 8px">Notifications: <b style="color:${w.push?"var(--ok)":"var(--red)"}">${w.push?"ON":"OFF"}</b></div>`;
 let mid;
 if(S.offc==w.id)mid=`<div class="st amb"><b>Before going offline</b><br>You have ${n} open request(s). If you go offline, they will move to other waiters.<div class="row" style="margin-top:8px"><button class="b" data-act="offx">Back</button><button class="b d" data-act="offok">Yes, go offline</button></div></div>`;
 else if(!w.on)mid=`<div class="idle">You are OFFLINE. You will not receive requests.</div>`;
 else if(incs.length&&!w.push)mid=`<div class="idle">Notifications are off, so ${incs.length} alert(s) did not arrive.<br>Turn Push ON from the Manager screen.</div>`;
 else if(rjr)mid=`<div class="st red"><b>Table ${rjr.table}: Why reject?</b> <span class="tag WAITING" data-cd="${rjr.cur.dl}">${fmt(rjr.cur.dl-S.t)}</span>${["Busy","At another table","On break","Other"].map(r=>`<button class="b" style="width:100%;margin-top:6px;text-align:left" data-act="rjgo" data-id="${rjr.id}" data-r="${r}">${r}</button>`).join("")}<button class="b" style="width:100%;margin-top:6px" data-act="rjx">Back</button></div>`;
 else if(incs.length)mid=(incs.length>1?`<div class="sm mut" style="margin-top:6px"><b>${incs.length} requests are waiting for you.</b> The most urgent is first.</div>`:"")+incs.map(inc=>{const ca=inc.at[inc.at.length-1];
  return `<div class="alertc" role="alert"><div style="color:var(--red);font-weight:700">NEW REQUEST</div><div class="big">TABLE ${inc.table}</div><div style="font-size:20px">${LB(inc)}</div><div class="cd" data-cd="${inc.cur.dl}">${fmt(inc.cur.dl-S.t)}</div><div class="mut sm">${ca.mgr?"Assigned by the manager":tries(inc)==1&&w.id==P[inc.table]?"Your primary table":"Attempt "+tries(inc)+" / "+CFG.TRIES}</div></div><button class="b p" style="width:100%;min-height:54px;font-size:18px" data-act="acc" data-id="${inc.id}">ACCEPT (Table ${inc.table})</button><button class="b" style="width:100%;margin-top:8px;margin-bottom:10px" data-act="rjopen" data-id="${inc.id}">Reject</button>`}).join("");
 else mid=`<div class="idle">No new requests.<br>Send a request from the Customer screen.</div>`;
 return tb+hd+(wn?`<div class="st amb"><b>Request missed</b><br>${wn.m}</div>`:"")+mid
  +(rdy.length?`<h4>Orders ready to serve</h4>`+rdy.map(o=>`<div class="st acc"><div class="row"><span><b>Table ${o.table}</b>: #${o.id} ${o.items}</span><button class="b p" data-act="served" data-id="${o.id}">Served</button></div></div>`).join(""):"")
  +`<h4>My active requests</h4>`+(act.length?act.map(r=>`<div class="st acc"><div class="row"><span><b>Table ${r.table}</b>: ${LB(r)}</span><button class="b" data-act="wdone" data-id="${r.id}">Done</button></div></div>`).join(""):`<div class="mut sm">None right now. Tapping Done is optional, it only measures service time.</div>`)
  +`<h4>Today</h4><div class="mut sm">Accept ${w.acc}, Missed ${w.miss}, Reject ${w.rej}</div>`}
const chip=(a)=>`<span class="chip ${a.st}" title="${a.st}">${W[a.w].n} ${a.st.toLowerCase()}${a.rs?" ("+a.rs+")":""}${a.st=="WAITING"&&a.dl?` <span data-cd="${a.dl}">${fmt(a.dl-S.t)}</span>`:a.e!=null?` ${Math.round((a.e-a.t)/1000)}s`:""}</span> `;
function adminLogin(){return `<div style="padding-top:30px"><h3 style="font-size:22px;margin:0 0 4px">Admin Login</h3><div class="mut">Local development only. Real authentication and admin account management are not connected yet.</div><div class="sm mut" style="margin-top:16px">Demo username</div><div class="inp">admin@restaurant.local</div><div class="sm mut" style="margin-top:12px">Demo password</div><div class="inp">&bull; &bull; &bull; &bull; &bull; &bull; &bull; &bull;</div>${S.abadr?`<div class="st red">${S.abadr}</div>`:""}<button class="b p" style="width:100%;min-height:50px;margin-top:16px" data-act="alogin">Login (demo)</button><button class="b" style="width:100%;margin-top:8px" data-act="abad">Demo: wrong credentials</button><p class="mut sm" style="margin-top:12px">Read-only preview of service requests, waiter availability, and table-map routing state. Operational administration requires secure backend APIs.</p></div>`}
function mgr(){if(!S.al)return adminLogin();const on=W.filter(w=>w.on).length,orq=R.filter(open),oa=A.filter(a=>a.open),ord=O.filter(o=>o.s!="SERVED");
 const k=(n,v,c)=>`<div class="kpi ${c||""}"><b>${v}</b><span class="mut sm">${n}</span></div>`;
 const al=oa.map(a=>{const r=R.find(x=>x.id==a.r);return `<div class="al"><div class="row"><b style="color:var(--red)">HIGH PRIORITY: #${r.id}, Table ${r.table}, ${LB(r)}</b><span class="sm">${atext(a,r)}</span></div><div class="sm" style="margin:6px 0">${r.at.map(chip).join("")||"No attempts"}</div>
 <div class="row"><span><select id="as${a.id}" aria-label="Choose waiter"><option value="">Choose waiter</option>${W.filter(w=>w.on).map(w=>`<option value="${w.id}">${w.n} (load ${load(w)})</option>`).join("")}</select> <button class="b p" data-act="asg" data-id="${a.id}">Assign</button></span><button class="b" data-act="res" data-id="${a.id}">Resolve</button></div></div>`}).join("");
 return `<div class="kpis">${k("Waiters online",on+" / "+W.length)}${k("Open requests",orq.length)}${k("Alerts",oa.length,oa.length?"red":"")}${k("Active orders",ord.length)}${k("Missed today",W.reduce((s,w)=>s+w.miss,0))}${k("Avg accept time",S.ac.length?Math.round(S.ac.reduce((a,b)=>a+b,0)/S.ac.length/1000)+"s":"-")}${k("Avg service time",S.sv.length?(S.sv.reduce((a,b)=>a+b,0)/S.sv.length/60000).toFixed(1)+" min":"-")}</div>
 ${al||`<div class="panel mut">No open alerts.</div>`}
 <div class="panel"><h3 style="margin-top:0">Live Requests</h3><div class="sc"><table><tr><th>ID</th><th>Tbl</th><th>Service</th><th>Status</th><th>Attempts</th><th>Age</th></tr>${R.slice(-8).reverse().map(r=>`<tr><td>#${r.id}</td><td>${r.table}</td><td>${LB(r)}</td><td><span class="chip ${r.status}">${r.status}</span></td><td>${r.at.map(chip).join("")}${r.rsn?`<span class="mut sm">resend ${r.rsn}</span>`:""}</td><td data-age="${r.t0}">${fmt(S.t-r.t0)}</td></tr>`).join("")||`<tr><td colspan="6" class="mut">No requests yet.</td></tr>`}</table></div></div>
 <div class="panel"><h3 style="margin-top:0">Staff</h3><div class="mut sm" style="margin-bottom:6px">Rule: a table's own (primary) waiter gets its next request first, unless he carries ${CFG.OVERLOAD} more than the least busy waiter. Everything else goes to the waiter with the least work today (accepted + waiting), so everybody gets an equal share.</div><div class="sc"><table><tr><th>Waiter</th><th>Status</th><th>Push</th><th>Load</th><th>Tables</th><th>Work today</th><th>Missed</th><th>Reject</th></tr>${W.map(w=>`<tr><td><b>${w.n}</b></td><td><button class="b" data-act="tog" data-id="${w.id}" style="min-height:30px;padding:2px 9px">${w.on?"Online":"Offline"}</button></td><td><button class="b" data-act="push" data-id="${w.id}" style="min-height:30px;padding:2px 9px;color:${w.push?"var(--acc)":"var(--red)"}">${w.push?"ON":"OFF"}</button></td><td>${load(w)}</td><td>${Object.values(P).filter(x=>x==w.id).length}</td><td>${w.acc}</td><td>${w.miss}</td><td>${w.rej}</td></tr>`).join("")}</table></div></div>
 <div class="panel"><h3 style="margin-top:0">Tables (${CFG.TABLES}, conceptual layout)</h3><div class="grid23">${Array.from({length:CFG.TABLES},(_,i)=>{const n=i+1,c=A.some(a=>a.open&&R.find(r=>r.id==a.r).table==n)?"alert":R.some(r=>r.table==n&&["PENDING","ASSIGNED","ESCALATED"].includes(r.status))?"wait":R.some(r=>r.table==n&&r.status=="ACCEPTED")?"acc":"";return `<button class="tb ${c} ${S.tsel==n?"sel":""}" data-act="tbl" data-id="${n}" aria-label="Table ${n}${c?", "+({alert:"alert",wait:"waiting for a waiter",acc:"waiter on the way"})[c]:""}">${n}${c?`<small class="mk" aria-hidden="true">${{alert:"!",wait:"\u2026",acc:"\u2713"}[c]}</small>`:""}</button>`}).join("")}</div>${S.tsel?tdet():""}<div class="mut sm" style="margin-top:6px">Red = alert, blue = waiting, green = accepted. 1-${CFG.INDOOR} Indoor, ${CFG.INDOOR+1}-${CFG.TABLES} Outdoor. Primary: ${Object.entries(P).map(([t,w])=>"T"+t+"="+W[w].n).join(", ")||"none"}</div></div>
 <div class="panel"><h3 style="margin-top:0">Orders</h3>${O.length?O.slice().reverse().map(o=>`<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line)"><span>#${o.id} Table ${o.table}: ${o.items}</span><span><span class="chip ${o.s}">${o.s}</span>${o.s=="READY"&&o.w!=null?` <span class="sm mut">&rarr; ${W[o.w].n}</span>`:""} ${o.s!="SERVED"?`<button class="b" data-act="adv" data-id="${o.id}" style="min-height:28px;padding:1px 8px">Next &rarr;</button>`:""}</span></div>`).join(""):`<span class="mut">Orders placed from the customer menu will appear here.</span>`}</div>
 <div class="panel"><h3 style="margin-top:0">Audit log</h3><div class="log">${L.join("<br>")||"Nothing yet."}</div></div>`}
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
function render(){D=false;document.body.dataset.route=S.route;const shell=document.getElementById("app-shell");if(shell)shell.style.display=S.route=="wireflow"?"none":"";
 const devPanel=document.getElementById("demo-panel");if(devPanel)devPanel.style.display=S.route=="dev"?"":"none";
 const tools=document.querySelector(".header-tools");if(tools)tools.style.display=(S.route=="dev"||S.route=="wireflow")?"flex":"none";
 const vf=document.getElementById("vflow");if(vf){vf.style.display=S.route=="wireflow"?"":"none";if(S.route=="wireflow"&&!vf.dataset.d){vf.innerHTML=flowV();vf.dataset.d=1}}
 document.querySelectorAll(".main-nav button").forEach(b=>{const id=b.dataset.id;if(b.dataset.act=="route") b.classList.toggle("on",S.route==id);});document.getElementById("netb").textContent="Network: "+(S.net?"ON":"OFF (connection lost demo)");
const y=[["cust",cust],["wait",wait],["mgr",mgr]];
 const sv={};document.querySelectorAll('#mgr select[id^="as"]').forEach(s=>sv[s.id]=s.value);const ae=document.activeElement,keep=ae&&ae.id=="ctext";y.forEach(([id,f])=>{const e=document.getElementById(id),sc=e.scrollTop;e.innerHTML=f();e.scrollTop=sc});if(keep){const e=document.getElementById("ctext");if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length)}}
 Object.entries(sv).forEach(([id,v])=>{const e=document.getElementById(id);if(e&&[...e.options].some(o=>o.value==v))e.value=v});
 const visiblePanel=S.route=="customer"?"c1":S.route=="waiter"?"c2":S.route=="admin"?"c3":S.tab;["c1","c2","c3"].forEach(c=>{const e=document.getElementById(c);e.classList.toggle("show",c==visiblePanel);});document.getElementById("say").innerHTML="<b>What is happening now:</b> "+S.say;document.getElementById("jr").innerHTML=jr();
 document.getElementById("tabs").innerHTML=[["c1","Customer"],["c2","Waiter"],["c3","Manager"]].map(t=>`<button data-act="tab" data-id="${t[0]}" class="${S.tab==t[0]?"on":""}">${t[1]}${S.look==t[0]?" \u25cf":""}</button>`).join("")}
const ACT={
 demo:b=>demo(b.dataset.k), req:b=>req(b.dataset.k), resend:(b,id)=>resend(id), cancel:(b,id)=>cancelReq(id),
 done:(b,id)=>finish(id,"customer confirmed receipt"), wdone:(b,id)=>finish(id,W[S.sel].n+" marked it done"),
 acc:(b,id)=>accept(S.sel,id), tog:(b,id)=>toggle(id), sel:(b,id)=>{S.sel=id},
 push:(b,id)=>{W[id].push=!W[id].push;log(`${W[id].n} push ${W[id].push?"ON":"OFF"}`)},
 asg:(b,id)=>asg(id), res:(b,id)=>resolve(id), menu:()=>{S.cv="menu"}, home:()=>{S.cv="home"},
 "q+":(b,id,i)=>{if(MENU[i].a)S.cart[i]=(S.cart[i]||0)+1}, "q-":(b,id,i)=>{S.cart[i]=Math.max(0,(S.cart[i]||0)-1)},
 order:()=>placeOrder(),
 adv:(b,id)=>{const o=O.find(x=>x.id==id);if(!o||o.s=="SERVED")return;o.s=OS[OS.indexOf(o.s)+1];if(o.s=="READY")readyFor(o)},
 served:(b,id)=>{const o=O.find(x=>x.id==id);if(o){o.s="SERVED";log(`Order #${id} served by ${W[S.sel].n}`)}},
 scan:()=>{S.scan=true;say("The customer scanned the QR code. The table was detected automatically and a session was created.","c1")},
 route:b=>{S.route=b.dataset.id;if(S.route=="customer")S.tab="c1";if(S.route=="waiter")S.tab="c2";if(S.route=="admin")S.tab="c3";if(S.route=="dev"&&["c1","c2","c3"].indexOf(S.tab)<0)S.tab="c1";},
  wlogin:()=>{S.wl=true;S.wbad=false}, wbad:()=>{S.wbad=true},
  alogin:()=>{S.al=true;S.abadr="";S.look="c3";S.say="Admin preview session started. This is not real authentication."; D=true},
  abad:()=>{S.abadr="Demo credentials did not match the values shown. No real authentication is available.";S.al=false},
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
document.addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(!b||b.disabled)return;const a=b.dataset.act,fn=ACT[a];if(!fn)return;
 if(USER_ACTS.has(a))S.plan=null;fn(b,+b.dataset.id,+b.dataset.i);D=true;render()});
document.addEventListener("input",e=>{if(e.target.id=="ctext")S.ctext=e.target.value});
document.addEventListener("change",e=>{if(e.target.dataset.sel=="table"){S.table=+e.target.value;D=true;render()}if(e.target.id=="sp")S.sp=+e.target.value});
function fit(){const root=document.documentElement;root.classList.remove("tabs");document.body.style.zoom="";root.style.removeProperty("--z");const tb=document.getElementById("tabsb");if(tb)tb.style.display="none"}
addEventListener("resize",fit);fit();init();const __qp=new URLSearchParams(location.search);const __tbl=Number(__qp.get("table"));if(Number.isInteger(__tbl)&&__tbl>=1&&__tbl<=CFG.TABLES){S.table=__tbl;S.scan=true;}const __workspace=__qp.get("workspace");if(__workspace&&["customer","waiter","admin","dev","wireflow"].includes(__workspace))S.route=__workspace;render();setTimeout(refreshBackendWaiterRoster,250);setInterval(tick,250);
