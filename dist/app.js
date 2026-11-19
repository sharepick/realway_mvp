'use strict';

const q = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);
const options = (pairs, value) => pairs.map(([key, label]) =>
  `<option value="${esc(key)}"${key === value ? ' selected' : ''}>${esc(label)}</option>`
).join('');
const id = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
const dateFmt = new Intl.DateTimeFormat('zh-CN', {dateStyle:'short',timeStyle:'short',timeZone:'Asia/Jakarta'});
const key = 'realway-demo-v1';
const staff = {admin:'管理员', lead:'印尼主管', ayu:'Ayu · 达人运营', rafi:'Rafi · 商户招商'};
const owners = [['ayu',staff.ayu],['rafi',staff.rafi]];
const kinds = {creator:'达人',merchant:'商户'};
const stages = {creator:['待邀约','已邀约','已确认到店','已交稿'],merchant:['新线索','有意向','方案沟通','已签约']};
const inboxes = {creator:'ID · Creator Desk',merchant:'ID · Merchant Desk'};
const pages = {
  inbox:['▤','统一收件箱','处理印尼达人和商户的 WhatsApp 对话'],
  crm:['▦','客户管理','查看联系人、负责人和合作阶段'],
  tasks:['✓','跟进任务','管理邀约、到店、交稿和商户跟进'],
  dashboard:['◫','管理看板','根据当前演示记录汇总，统计范围为印尼工作区'],
  team:['♙','团队权限','查看演示角色、当前分工和交接记录']
};
const offset = (hours) => new Date(Date.now() + hours * 3600000).toISOString();
function seed() {
  const rows = [
    ['nadi','Nadira Putri','creator','ayu','Jakarta',1,'美食探店','Halo Kak! Saya tertarik. Untuk jadwal shooting di Kemang, apakah boleh hari Jumat sore?',true,'id'],
    ['kopi','Kopi Senja Kemang','merchant','rafi','Jakarta',1,'餐饮 SMB','Halo tim Realway, bisa jelaskan paket promosi TikTok untuk kedai kami?',true,'id'],
    ['dewi','Dewi Lestari','creator','ayu','Bandung',2,'生活方式','Halo Kak, saya sudah konfirmasi datang besok. Kapan deadline video?',true,'id'],
    ['roti','Roti Pagi Bandung','merchant','rafi','Bandung',2,'烘焙 SMB','Boleh kirimkan proposal dan contoh kampanye sebelumnya?',false,'id'],
    ['arya','Arya Mahendra','creator','ayu','Surabaya',0,'美食探店','Hi! Could you share the brief for this campaign?',false,'en'],
    ['sate','Sate Jalan Malioboro','merchant','rafi','Yogyakarta',0,'餐饮 SMB','Halo, saya ingin tahu cara kerja sama dengan Realway.',false,'id']
  ];
  return {contacts:rows.map(([id,name,kind,owner,city,stage,tag,message,unread,language],i) => ({
    id,name,kind,owner,city,stage:stages[kind][stage],tag,language,unread,status:'待处理',
    messages:[...(i === 0 ? [{direction:'out',text:'Halo Kak Nadira! Kami punya undangan kolaborasi kuliner di Kemang. Apakah Kakak tertarik?',at:offset(-2)}] : []),
      {direction:'in',text:message,at:offset(-0.4-i*0.18)}]
  })),tasks:[
    {id:'t1',contact:'nadi',title:'确认周五到店时间',due:offset(5),done:false},
    {id:'t2',contact:'kopi',title:'收集门店目标并安排方案沟通',due:offset(-2),done:false},
    {id:'t3',contact:'dewi',title:'核对交稿时间',due:offset(24),done:false}
  ],audit:[]};
}
let db;
try { const stored = localStorage.getItem(key); db = stored ? JSON.parse(stored) : seed(); }
catch { db = seed(); }
db.employees ??= [];
for (const employee of db.employees) {
  staff[employee.id] = employee.name;
  owners.push([employee.id,employee.name]);
}
const normalizePhone = (value) => String(value ?? '').replace(/[\s()-]/g,'');
function validPhone(value) { return /^\+[1-9]\d{6,14}$/.test(value); }
let role = 'admin', page = 'inbox', current = 'nadi', filter = 'all', search = '';
let drafts = {}, toastTimer, submitDialog;
let reportMode = 'day', reportDay = jakartaDate();
const analysisResults = new Map();
const manage = () => role === 'admin' || role === 'lead';
const canSee = (contact) => Boolean(contact && (manage() || contact.owner === role));
const contacts = () => db.contacts.filter(canSee);
const visibleTasks = () => db.tasks.filter((task) => canSee(findContact(task.contact)));
const findContact = (key) => db.contacts.find((contact) => contact.id === key);
const log = (text) => db.audit.unshift({text,actor:staff[role],at:new Date().toISOString()});
function logWork(type, fields) {
  (db.workEvents ??= []).push({type,actor:role,at:new Date().toISOString(),...fields});
}
function updateStage(contact, stage) {
  const steps = stages[contact.kind];
  if (steps.indexOf(stage) > steps.indexOf(contact.stage)) {
    logWork('stage',{contact:contact.id,kind:contact.kind});
  }
  contact.stage = stage;
}
function toast(text) {
  q('#toast').textContent = text;
  q('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => q('#toast').classList.remove('show'),2800);
}
function save() {
  try { localStorage.setItem(key,JSON.stringify(db)); }
  catch { return false; }
  return true;
}
function commit(message) {
  const persisted = save();
  render();
  toast(persisted ? message : `${message}（仅本次页面有效，浏览器存储不可用）`);
}
const badge = (value) => `<span class="pill">${esc(value)}</span>`;
const avatar = (c) => `<span class="avatar ${c.kind}">${esc(c.name.split(' ').slice(0,2).map((word)=>word[0]).join('').toUpperCase())}</span>`;
const time = (iso) => dateFmt.format(new Date(iso));
const latest = (c) => c.messages.at(-1);
const isOverdue = (t) => !t.done && Date.parse(t.due) < Date.now();
const taskStatus = (t) => t.done ? '已完成' : isOverdue(t) ? '已逾期' : '待跟进';
const btn = (label, data, value='', style='secondary') => `<button type="button" class="${style}" data-${data}="${esc(value)}">${esc(label)}</button>`;
const empty = (label) => `<div class="empty">${esc(label)}</div>`;
const table = (headers, rows, placeholder) => rows.length
  ? `<div class="table-wrap"><table><thead><tr>${headers.map((h)=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r)=>`<tr>${r.map((v)=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
  : `<div class="card">${empty(placeholder)}</div>`;

function render() {
  if (!manage() && ['dashboard','team'].includes(page)) page = 'inbox';
  q('#role').innerHTML=options(Object.entries(staff),role);
  const [,label,description] = pages[page];
  q('#title').textContent = label;
  q('#crumb').textContent = label;
  q('#subtitle').textContent = description;
  q('#nav').innerHTML = Object.entries(pages).filter(([key]) => manage() || !['dashboard','team'].includes(key))
    .map(([key,[icon,name]]) => `<button data-page="${key}" class="${page===key?'active':''}"${page===key?' aria-current="page"':''}><b aria-hidden="true">${icon}</b>${name}</button>`).join('');
  const action = q('#action');
  action.hidden = !['crm','tasks','team'].includes(page);
  action.textContent = page === 'team' ? '+ 新增员工' : page === 'crm' ? '+ 新建联系人' : '+ 新建跟进';
  action.disabled = page === 'tasks' && !contacts().length;
  q('#view').innerHTML = ({inbox,crm,tasks,dashboard,team})[page]();
  const feed = q('.messages');
  if (feed) feed.scrollTop = feed.scrollHeight;
}

function inbox() {
  const list = contacts().filter((c) => (filter === 'all' || (filter === 'unread' ? c.unread : c.kind === filter))
    && `${c.name} ${c.city} ${c.tag} ${latest(c)?.text ?? ''}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=> (latest(b)?.at ?? '').localeCompare(latest(a)?.at ?? ''));
  const c = list.find((item)=>item.id===current) ?? list[0];
  current = c?.id;
  const filters = [['all','全部'],['unread','未读'],['creator','达人'],['merchant','商户']];
  return `<div class="inbox"><div class="threads"><div class="thread-tools">
    <form id="search"><input name="search" aria-label="搜索对话" placeholder="姓名、城市或消息" value="${esc(search)}"><button class="secondary">搜索</button></form>
    <div class="filters">${filters.map(([k,v])=>btn(v,'filter',k,`secondary ${filter===k?'active':''}`)).join('')}</div></div>
    ${list.map((item)=>`<button type="button" class="thread ${item.id===current?'active':''}" data-open="${item.id}">
    ${avatar(item)}<span class="thread-text"><strong>${esc(item.name)}</strong><small>${esc(inboxes[item.kind])}</small><small>${esc(latest(item)?.text ?? '暂无消息')}</small></span>
    ${item.unread?'<span class="dot" aria-label="未读"></span>':''}</button>`).join('') || empty('没有匹配的会话')}</div>
    ${c ? chat(c)+profile(c) : empty('选择一个可见会话以继续')}</div>`;
}
function chat(c) {
  const draft = drafts[c.id];
  return `<div class="chat"><div class="chat-head"><div class="identity">${avatar(c)}<div><strong>${esc(c.name)}</strong><small>${esc(inboxes[c.kind])} · ${esc(staff[c.owner])}</small></div></div>${badge(c.status)}</div>
    <div class="messages" aria-label="消息记录">${c.messages.map((m)=>`<div class="bubble ${m.direction}">${esc(m.text)}<small>${time(m.at)}${m.direction==='out'?' · 模拟发送':''}</small></div>`).join('') || empty('暂无消息')}</div>
    <form class="composer" id="compose"><textarea aria-label="回复内容" name="text" required maxlength="2000" rows="3" placeholder="输入回复，或生成辅助草稿…">${esc(draft?.text)}</textarea>
    <p class="draft-note">${draft?.assisted?'规则生成的草稿 · 请核对并编辑后发送':'消息仅记录在演示中'}</p>
    ${c.messages.length ? '' : '<p class="draft-note">首次联系需先确认客户同意。接通 API 后使用获批模板发起；当前仅模拟发送。</p>'}
    <div class="actions"><div class="compose-tools">${btn('✦ AI 回复建议','suggest',c.id,'assist')}${btn('分析对话','analyze',c.id)}</div><button class="primary">模拟发送 ↗</button></div></form></div>`;
}
function profile(c) {
  const tasks = visibleTasks().filter((t)=>t.contact===c.id && !t.done);
  return `<aside class="panel"><section><h2>会话资料</h2>${badge(kinds[c.kind])}
    <p>WhatsApp　${esc(c.phone||'待补充号码')}</p>
    <p style="margin-top:8px">${esc(c.city)} · ${esc(c.tag||'无标签')}</p>
    <label>合作阶段<select data-change="stage">${options(stages[c.kind].map((v)=>[v,v]),c.stage)}</select></label>
    <label>处理状态<select data-change="status">${options(['待处理','待客户回复','已解决'].map((v)=>[v,v]),c.status)}</select></label>
    ${manage()? `<label>负责人<select data-change="owner">${options(owners,c.owner)}</select></label>` : `<p>负责人　${esc(staff[c.owner])}</p>`}
    ${btn(c.unread?'标记已读':'标记未读','read',c.id,'textbtn')}</section>
    <section><h3>跟进任务</h3>${tasks.map((t)=>`<div class="task"><strong>${esc(t.title)}</strong><p>${time(t.due)} · ${taskStatus(t)}</p>${btn('完成','toggle-task',t.id,'textbtn')}</div>`).join('') || '<p>暂无待跟进任务</p>'}
    <div style="margin-top:9px">${btn('+ 添加跟进','new-task',c.id)}</div></section>${analysisPanel(c)}</aside>`;
}
function analysisPanel(c) {
  const result = analysisResults.get(c.id);
  if (!result) return '';
  const evidence = (value) => value ? `<blockquote>${esc(value)}</blockquote>` : '';
  const data = result.count !== c.messages.length
    ? '<p>有新消息，点击「分析对话」更新结果。</p>'
    : result.empty
      ? '<p>暂无客户来信可分析。对话有客户消息后可再次分析。</p>'
      : `<p class="analysis-meta">共 ${result.count} 条消息 · ${result.inbound} 条客户来信</p>
      <dl>
        <dt>客户关注点</dt><dd>${result.needs.length ? result.needs.map(({label,evidence:source}) =>
          `<div>${esc(label)}${evidence(source)}</div>`).join('') : '未识别出明确关注点'}</dd>
        <dt>合作意向</dt><dd>${esc(result.intent.value)}${evidence(result.intent.evidence)}</dd>
        ${result.schedule ? `<dt>到店安排</dt><dd>${esc(result.schedule.value)}${evidence(result.schedule.evidence)}</dd>` : ''}
        <dt>建议下一步</dt><dd><ul>${result.next.map((item)=>`<li>${esc(item)}</li>`).join('')}</ul></dd>
      </dl>`;
  return `<section aria-labelledby="analysis-title" class="analysis-result">
    <div class="analysis-header"><h3 id="analysis-title" tabindex="-1">对话分析</h3>${badge('规则分析')}</div>
    ${data}</section>`;
}
function crm() {
  return table(['联系人','WhatsApp 号码','类型','城市 / 标签','合作阶段','负责人','操作'],contacts().map((c)=>[
    `<strong>${esc(c.name)}</strong>`,esc(c.phone||'待补充'),badge(kinds[c.kind]),esc([c.city,c.tag].filter(Boolean).join(' · ')),esc(c.stage),esc(staff[c.owner]),
    `${btn('打开会话','open',c.id,'textbtn')}　${btn('编辑','edit',c.id,'textbtn')}`
  ]),'暂无联系人');
}
function tasks() {
  return `<p class="notice">到期时间为雅加达时间（UTC+7）。负责人随联系人交接。</p>`+
    table(['任务','联系人','负责人','到期时间','状态','操作'],visibleTasks().sort((a,b)=>Number(a.done)-Number(b.done)||a.due.localeCompare(b.due)).map((t)=>{
      const c=findContact(t.contact);
      return [esc(t.title),btn(c.name,'open',c.id,'textbtn'),esc(staff[c.owner]),time(t.due),badge(taskStatus(t)),
        `${btn(t.done?'重新打开':'完成','toggle-task',t.id,'textbtn')}　${btn('编辑','edit-task',t.id,'textbtn')}`];
    }),'暂无跟进任务');
}
function dashboard() {
  const items = contacts();
  const outbound = items.flatMap((c)=>c.messages.filter((m)=>m.direction==='out'));
  const counts = [['未读会话',items.filter((c)=>c.unread).length],['待跟进',visibleTasks().filter((t)=>!t.done).length],
    ['已逾期',visibleTasks().filter(isOverdue).length],['使用 AI 草稿发送',outbound.filter((m)=>m.assisted).length]];
  return `<div class="cards">${counts.map(([k,v])=>`<div class="card stat"><p>${k}</p><b>${v}</b></div>`).join('')}</div>
    <div class="chart-grid">${Object.entries(stages).map(([kind,values])=>{
      const group=items.filter((c)=>c.kind===kind);
      return `<section class="card"><h2>${kinds[kind]}合作阶段</h2><p>当前联系人分布 · 共 ${group.length} 位</p>${values.map((stage)=>{
        const n=group.filter((c)=>c.stage===stage).length;
        return `<div class="bar"><strong>${stage}</strong><span><i style="width:${group.length?100*n/group.length:0}%"></i></span><b>${n}</b></div>`;
      }).join('')}</section>`;
    }).join('')}</div>${workReport()}`;
}
function workReport() {
  const period = reportPeriod(reportDay,reportMode);
  const report = summarizeTeam(db,staff,period);
  const {rows,knownReplies,unattributedReplies,overdue}=report;
  const total = (field) => rows.reduce((sum,row)=>sum+row[field],0);
  const overdueOwners = rows.filter((row)=>row.overdue)
    .map((row)=>`${staff[row.actor]} ${row.overdue} 项`).join('，');
  const days = period.first===period.last ? period.first : `${period.first} 至 ${period.last}`;
  const modes = [['day','日报'],['week','周报']].map(([mode,label]) =>
    `<button type="button" class="secondary ${mode===reportMode?'active':''}" data-report-mode="${mode}" aria-pressed="${mode===reportMode}">${label}</button>`).join('');
  return `<section class="card work-report" aria-labelledby="report-heading">
    <div class="report-header"><div><h2 id="report-heading">员工工作报表</h2><p>${days} · 雅加达时间${reportMode==='week'?' · 周一至周日':''}</p></div>
    <div class="report-tools" aria-label="报表设置">${modes}<label for="report-date">选择日期</label><input type="date" id="report-date" value="${esc(reportDay)}"></div></div>
    <div class="report-summary" role="status"><p><strong>期间小结</strong>　${knownReplies} 条可归属的发送，${total('creatorAdvances')} 位达人和 ${total('merchantAdvances')} 位商户被推进，${total('completed')} 项跟进完成（按操作人汇总）。</p>
    <p>${overdue ? `优先处理当前 ${overdue} 项逾期待办。${esc(overdueOwners)}。` : '当前无逾期待办。'}</p></div>
    ${table(['操作人','发送消息','联系客户','推进达人','推进商户','完成跟进','当前逾期'],rows.map((row)=>[
      esc(staff[row.actor]),row.replies,row.contacts,row.creatorAdvances,row.merchantAdvances,row.completed,row.overdue
    ]),'暂无员工')}
    <p class="report-notes">发送、推进、完成按操作时的身份归属，同一人同一期间的联系人和完成任务分别去重。当前逾期按现负责人统计。${unattributedReplies ? ` 本期另有 ${unattributedReplies} 条历史发送缺少操作人。` : ''}</p>
    <p class="report-notes">模拟数据 · 汇总自动更新。可切换员工身份，在收件箱发送消息或完成跟进，然后切回主管查看。</p></section>`;
}
function team() {
  return '<p class="notice">新增员工用于当前浏览器的身份、分配和报表演示。独立登录与跨设备同步待正式后端接入。</p>'+table(['身份','邮箱','可见范围','权限','当前负责'],Object.entries(staff).map(([key,name])=>[
    esc(name),esc(db.employees.find((employee)=>employee.id===key)?.email||'演示身份'),['admin','lead'].includes(key)?'印尼工作区':'本人负责的记录',
    ['admin','lead'].includes(key)?'查看看板、处理会话、分配及交接':'处理本人会话、CRM 及任务',
    ['admin','lead'].includes(key)?'—':contacts().filter((c)=>c.owner===key).length
  ]),'暂无员工')+`<section class="card" style="margin-top:16px"><h2>交接记录</h2>${db.audit.length
    ? db.audit.map((a)=>`<p>${time(a.at)} · ${esc(a.actor)} · ${esc(a.text)}</p>`).join('')
    : '<p>在会话资料中更换负责人，即可查看交接记录。</p>'}</section>`;
}
function suggest(c) {
  const message = c.messages.findLast((m)=>m.direction==='in')?.text.toLowerCase() ?? '';
  if (c.language === 'en') return 'Hi! Thanks for your interest. Could you share your city and availability? I’ll confirm the campaign brief and next steps with our team.';
  if (c.kind === 'merchant') return 'Halo, terima kasih sudah menghubungi Realway. Boleh kami tahu lokasi usaha dan tujuan promosi Anda? Tim kami akan menyiapkan opsi yang sesuai dan mengatur waktu diskusi.';
  if (/deadline|video/.test(message)) return 'Halo Kak! Terima kasih sudah konfirmasi. Kami akan mengecek tenggat pengiriman video dan mengirimkan detailnya setelah terverifikasi.';
  return 'Halo Kak! Terima kasih sudah tertarik. Boleh kirimkan jam yang paling nyaman? Kami akan cek ketersediaan lokasi dan mengonfirmasi jadwalnya.';
}
function showDialog(title, fields, submit) {
  q('#dialogTitle').textContent = title;
  q('#fields').innerHTML = fields;
  submitDialog = submit;
  q('#dialog').showModal();
}
function addEmployee() {
  if (!manage()) return;
  showDialog('新增员工',`
    <label>员工姓名<input name="name" required maxlength="50"></label>
    <label>员工邮箱<input name="email" type="email" required maxlength="120"></label>
    <label>业务岗位<select name="job">${options([['creator','达人运营'],['merchant','商户招商']],'creator')}</select></label>
    <p>保存后可分配联系人、切换演示身份并查看该员工报表。</p>
  `,(form)=>{
    const name=form.get('name').trim(), email=form.get('email').trim().toLowerCase(), job=form.get('job');
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '请填写姓名和有效邮箱';
    if (db.employees.some((employee)=>employee.email===email)) return '该邮箱已存在';
    if (!Object.hasOwn(kinds,job)) return '请选择有效岗位';
    const employee={id:'employee-'+id(),name:name+' · '+(job==='creator'?'达人运营':'商户招商'),email,job};
    db.employees.push(employee);
    staff[employee.id]=employee.name;
    owners.push([employee.id,employee.name]);
    log('新增员工：'+employee.name);
    return '';
  });
}
function editContact(c) {
  if (c && !canSee(c)) return;
  const kind = c?.kind ?? (role === 'rafi' ? 'merchant' : 'creator');
  showDialog(c?'编辑联系人':'新建联系人',`
    <label>名称<input name="name" maxlength="70" required value="${esc(c?.name)}"></label>
    <label>WhatsApp 号码（含国家区号）<input name="phone" type="tel" maxlength="32" placeholder="+6281234567890" required value="${esc(c?.phone)}"></label>
    <p>请填写客户的 WhatsApp 注册号码。保存后可打开会话演示，真实收发待 API 接入。</p>
    ${manage()? `<label>负责人<select name="owner">${options(owners,c?.owner ?? (kind==='merchant'?'rafi':'ayu'))}</select></label>`:''}
    <label>类型<select name="kind" ${c?'disabled':''}>${options(Object.entries(kinds),kind)}</select></label>
    <label>城市<input name="city" maxlength="45" required value="${esc(c?.city)}"></label>
    <label>标签<input name="tag" maxlength="50" value="${esc(c?.tag)}"></label>
    <label>沟通语言<select name="language">${options([['id','Bahasa Indonesia'],['en','English']],c?.language ?? 'id')}</select></label>
    ${c?`<label>合作阶段<select name="stage">${options(stages[kind].map((s)=>[s,s]),c.stage)}</select></label>`:''}
  `,(form)=>{
    const name=form.get('name').trim(), city=form.get('city').trim();
    if (!name || !city) return '请输入名称和城市';
    const phone=normalizePhone(form.get('phone'));
    if (!validPhone(phone)) return '请输入含国家区号的号码，例如 +6281234567890';
    if (db.contacts.some((item)=>item.id!==c?.id && normalizePhone(item.phone)===phone)) return '该 WhatsApp 号码已存在，请查看现有联系人或联系主管';
    const owner=manage()?form.get('owner'):role;
    if (!owners.some(([key])=>key===owner)) return '请选择有效负责人';
    const fields={name,city,phone,owner,tag:form.get('tag').trim(),language:form.get('language')};
    if (c) {
      Object.assign(c,fields);
      updateStage(c,form.get('stage'));
    }
    else {
      const type=form.get('kind');
      db.contacts.push({...fields,id:id(),kind:type,owner,
        stage:stages[type][0],status:'待处理',messages:[],unread:false});
    }
    return '';
  });
}
function editTask(t, contactId) {
  if (t && !canSee(findContact(t.contact))) return;
  const choices=contacts().map((c)=>[c.id,c.name]);
  if (!choices.length) return;
  const jakartaLocal = t ? new Date(Date.parse(t.due)+7*3600000).toISOString().slice(0,16) : '';
  showDialog(t?'编辑跟进':'新建跟进',`
    <label>联系人<select name="contact">${options(choices,t?.contact ?? contactId)}</select></label>
    <label>任务<input name="title" maxlength="90" required value="${esc(t?.title)}"></label>
    <label>到期时间（雅加达）<input name="due" type="datetime-local" required value="${jakartaLocal}"></label>
  `,(form)=>{
    const title=form.get('title').trim(), contact=form.get('contact');
    const due = Date.parse(form.get('due')+'+07:00');
    if (!title || !Number.isFinite(due) || !canSee(findContact(contact))) return '请填写有效的联系人、任务和时间';
    const fields={title,contact,due:new Date(due).toISOString()};
    if (t) Object.assign(t,fields);
    else db.tasks.push({...fields,id:id(),done:false});
    return '';
  });
}
function openContact(c) {
  if (!canSee(c)) return;
  current=c.id; page='inbox'; search='';
  if (filter !== 'all' && filter !== c.kind && !(filter==='unread' && c.unread)) filter='all';
  render();
}
q('#role').innerHTML=options(Object.entries(staff),role);
q('#role').addEventListener('change',(e)=>{
  role=e.target.value; filter='all'; search=''; drafts={}; analysisResults.clear(); current=undefined; render();
});
q('#nav').addEventListener('click',(e)=>{
  const button=e.target.closest('[data-page]');
  if (!button) return;
  page=button.dataset.page;
  render();
});
q('#action').addEventListener('click',()=>page==='team'?addEmployee():page==='crm'?editContact():editTask());
q('#cancel').addEventListener('click',()=>q('#dialog').close());
q('#form').addEventListener('submit',(e)=>{
  e.preventDefault();
  const error=submitDialog(new FormData(e.target));
  if (error) return toast(error);
  q('#dialog').close();
  commit('已保存');
});
q('#view').addEventListener('input',(e)=>{
  if (e.target.name !== 'text') return;
  const c=findContact(current);
  if (canSee(c)) drafts[c.id]={...drafts[c.id],text:e.target.value};
});
q('#view').addEventListener('submit',(e)=>{
  e.preventDefault();
  const form=new FormData(e.target);
  if (e.target.id==='search') {search=form.get('search').trim(); render(); return;}
  const c=findContact(current);
  const message=form.get('text')?.trim();
  if (!canSee(c) || !message) return;
  c.messages.push({text:message,direction:'out',at:new Date().toISOString(),actor:role,assisted:Boolean(drafts[c.id]?.assisted)});
  c.status='待客户回复';
  c.unread=false;
  delete drafts[c.id];
  commit('消息已记录为模拟发送');
});
q('#view').addEventListener('change',(e)=>{
  if (e.target.id==='report-date' && page==='dashboard' && manage()) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && Number.isFinite(e.target.valueAsNumber)) {
      reportDay=e.target.value;
    }
    render();
    q('#report-date').focus();
    return;
  }
  const field=e.target.dataset.change, c=findContact(current);
  if (!field || !canSee(c)) return;
  const value=e.target.value;
  if (field==='owner' && manage() && owners.some(([key])=>key===value) && c.owner!==value) {
    log(`${c.name}：${staff[c.owner]} → ${staff[value]}`);
    c.owner=value;
  } else if (field==='stage' && stages[c.kind].includes(value)) updateStage(c,value);
  else if (field==='status' && ['待处理','待客户回复','已解决'].includes(value)) c.status=value;
  else return;
  commit('会话资料已更新');
});
q('#view').addEventListener('click',(e)=>{
  const button=e.target.closest('button');
  if (!button) return;
  const d=button.dataset;
  if (d.reportMode && page==='dashboard' && manage()) {
    reportMode=d.reportMode;
    render();
    q('[data-report-mode="'+reportMode+'"]').focus();
    return;
  }
  if (d.filter) {filter=d.filter; render(); return;}
  if (d.open) return openContact(findContact(d.open));
  if (d.edit) return editContact(findContact(d.edit));
  if (d.newTask) return editTask(null,d.newTask);
  if (d.toggleTask || d.editTask) {
    const t=db.tasks.find((item)=>item.id===(d.toggleTask ?? d.editTask));
    if (!t || !canSee(findContact(t.contact))) return;
    if (d.editTask) return editTask(t);
    t.done=!t.done;
    if (t.done) logWork('complete',{task:t.id});
    return commit(t.done?'跟进已完成':'跟进已重新打开');
  }
  const c=findContact(d.read ?? d.suggest ?? d.analyze);
  if (!canSee(c)) return;
  if (d.read) {c.unread=!c.unread; return commit(c.unread?'会话已标记未读':'会话已标记已读');}
  if (d.analyze) {
    analysisResults.set(c.id,analyzeConversation(c.messages,c.kind));
    render();
    q('#analysis-title').focus();
    return;
  }
  if (drafts[c.id]?.text.trim()) return toast('已有草稿。清空输入框后可生成新建议。');
  drafts[c.id]={text:suggest(c),assisted:true};
  render();
  q('#compose textarea').focus();
});
render();
