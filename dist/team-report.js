'use strict';

const reportTimeZone = 'Asia/Jakarta';
const reportDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone:reportTimeZone, year:'numeric', month:'2-digit', day:'2-digit'
});
const jakartaDate = (date=new Date()) => reportDateFormatter.format(date);

function shiftReportDay(day, count) {
  const date = new Date(day+'T00:00:00Z');
  date.setUTCDate(date.getUTCDate()+count);
  return date.toISOString().slice(0,10);
}

function reportPeriod(day, mode) {
  const weekday = new Date(day+'T00:00:00Z').getUTCDay();
  const first = mode === 'week' ? shiftReportDay(day,-((weekday+6)%7)) : day;
  const last = mode === 'week' ? shiftReportDay(first,6) : first;
  return {
    first,last,
    start:Date.parse(first+'T00:00:00+07:00'),
    end:Date.parse(shiftReportDay(last,1)+'T00:00:00+07:00')
  };
}

function summarizeTeam(db, people, period, now=Date.now()) {
  const inPeriod = (at) => Date.parse(at)>=period.start && Date.parse(at)<period.end;
  const replies = db.contacts.flatMap((contact)=>contact.messages
    .filter((message)=>message.direction==='out' && inPeriod(message.at))
    .map((message)=>({actor:message.actor,contact:contact.id})));
  const events = (db.workEvents ?? []).filter((event)=>inPeriod(event.at));
  const overdue = db.tasks.filter((task)=>!task.done && Date.parse(task.due)<now);
  const ownerOf = new Map(db.contacts.map((c)=>[c.id,c.owner]));
  const rows = Object.keys(people).map((actor)=>{
    const sent = replies.filter((item)=>item.actor===actor);
    const operations = events.filter((item)=>item.actor===actor);
    const milestones = operations.filter((item)=>item.type==='stage');
    const completed = operations.filter((item)=>item.type==='complete');
    return {
      actor, replies:sent.length, contacts:new Set(sent.map((item)=>item.contact)).size,
      creatorAdvances:new Set(milestones.filter((item)=>item.kind==='creator').map((item)=>item.contact)).size,
      merchantAdvances:new Set(milestones.filter((item)=>item.kind==='merchant').map((item)=>item.contact)).size,
      completed:new Set(completed.map((item)=>item.task)).size,
      overdue:overdue.filter((item)=>ownerOf.get(item.contact)===actor).length
    };
  });
  return {
    rows, knownReplies:replies.filter((item)=>Object.hasOwn(people,item.actor)).length,
    unattributedReplies:replies.filter((item)=>!Object.hasOwn(people,item.actor)).length,
    overdue:overdue.length
  };
}
