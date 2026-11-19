'use strict';

const analysisTopics = [
  {label:'交稿期限', pattern:/deadline|due date|kapan.{0,30}video|tenggat|交稿|截止|提交时间|视频.{0,24}(?:时候|几点|哪天).{0,8}交/i},
  {label:'到店或拍摄安排', pattern:/shoot(?:ing)?|jadwal|datang|kunjung|appointment|filming|到店|拍摄|探店/i},
  {label:'报价或推广套餐', pattern:/paket|harga|biaya|budget|pricing|package|报价|套餐|费用|预算/i},
  {label:'合作方案或案例', pattern:/proposal|brief|contoh kampanye|case stud|方案|案例|简报/i},
  {label:'合作方式', pattern:/kerja sama|kerjasama|collaboration|how.{0,20}work|合作方式|怎么合作/i},
  {label:'发布或视频要求', pattern:/video|posting|deliverable|视频|发布|成片/i}
];
const dayPattern = /(?:\b(?:senin|selasa|rabu|kamis|jumat|sabtu|minggu|besok|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow)\b|(?:周|星期)[一二三四五六日天]|明天|后天)/i;
const clockPattern = /(?:\b(?:jam|pukul)\s*\d{1,2}(?:[.:]\d{2})?(?:\s*(?:pagi|siang|sore|malam))?|\b(?:pagi|siang|sore|malam|morning|afternoon|evening)\b|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b(?:[01]?\d|2[0-3]):[0-5]\d\b|(?:上午|中午|下午|晚上)?\s*[零一二两三四五六七八九十\d]{1,3}[点时](?:半|[零一二两三四五六七八九十\d]{1,3}分)?)/i;
const schedulingPattern = /shoot(?:ing)?|jadwal|datang|kunjung|appointment|filming|available|到店|拍摄|探店|有空/i;
const questionPattern = /[?？]|\b(?:apakah|kapan|can we|could we|is it)\b|可以吗|能不能|几点/i;
const tentativePattern = /\b(?:mungkin|tentatif|belum|kalau|jika|maybe|tentative|might|if)\b|可能|暂定|还没|如果|待定/i;
const declinePattern = /\b(?:tidak|nggak|gak|kurang)\s+tertarik\b|\bnot interested\b|不感兴趣|暂不合作|不考虑合作/i;
const interestPattern = /\btertarik\b|\binterested\b|有意向|感兴趣|愿意合作/i;
const blockedPattern = /\b(?:tidak|belum|nggak|gak)\s+(?:bisa|dapat|jadi|konfirmasi|tersedia)\b|\b(?:batal|cancel(?:led|ed)?|cannot|can.t|unavailable|reschedule)\b|取消|改期|不能到|不行|没空/i;

function signedIntent(sentences, kind) {
  for (const text of sentences.toReversed()) {
    if (declinePattern.test(text)) return {value:'明确拒绝', evidence:text};
    if (interestPattern.test(text) && !questionPattern.test(text) && !tentativePattern.test(text)) {
      return {value:'明确表达兴趣', evidence:text};
    }
    if (kind === 'merchant' && (analysisTopics[2].pattern.test(text) || analysisTopics[3].pattern.test(text))) {
      return {value:'正在了解报价或方案', evidence:text};
    }
  }
  return {value:'暂未识别出明确意向'};
}

function visitSchedule(entries) {
  let context = false;
  let result;
  for (const {text, direction} of entries) {
    if (direction !== 'in') {
      if (schedulingPattern.test(text)) context = true;
      continue;
    }
    const mentionsVisit = schedulingPattern.test(text);
    const day = text.match(dayPattern)?.[0];
    const clock = text.replace(dayPattern,' ').match(clockPattern)?.[0]?.trim();
    const mentionsDelivery = analysisTopics[0].pattern.test(text);
    const blocked = blockedPattern.test(text);
    if (mentionsVisit) context = true;
    if (!context || (mentionsDelivery && !mentionsVisit)) continue;
    if (blocked) {
      result = {value:'到店安排需重新确认', evidence:text};
    } else if (day || clock) {
      const proposed = questionPattern.test(text) || tentativePattern.test(text);
      const confirmed = /\b(?:konfirmasi|pasti|saya akan datang|i will|confirmed|works for me|bisa)\b|可以|确认|准时|没问题/i.test(text);
      const status = proposed ? '客户提议' : confirmed ? '客户表示可到店' : '客户提及时间';
      const timing = [day,clock].filter(Boolean).join(' · ');
      const hasExactTime = /[\d零一二两三四五六七八九十]/.test(clock ?? '');
      const detail = day && !hasExactTime ? '（具体时刻待确认）' : clock && !day ? '（日期待确认）' : '';
      result = {value:`${status}：${timing}${detail}`, evidence:text, needsConfirmation:proposed || !confirmed || !day || !hasExactTime};
    }
  }
  return result ?? {value:'未识别出到店时间'};
}

function analyzeConversation(messages, kind) {
  const customerMessages=messages.filter((message)=>message.direction==='in');
  if (!customerMessages.length) return {count:messages.length, empty:true};
  const entries=messages.flatMap(({text, direction}) =>
    text.split(/(?<=[!?。！？])|(?<=\.)\s+|\n+|[,，]\s*(?=(?:视频|交稿|deadline\b|kapan\b|but when\b))/iu)
      .map((sentence)=>({text:sentence.trim(),direction}))
      .filter((entry)=>entry.text)
  );
  const sentences=entries.filter((entry)=>entry.direction==='in').map((entry)=>entry.text);
  const needs=analysisTopics.flatMap(({label, pattern})=>{
    const evidence=sentences.findLast((text)=>pattern.test(text));
    return evidence ? [{label,evidence}] : [];
  });
  const intent=signedIntent(sentences,kind);
  const schedule=kind==='creator' ? visitSchedule(entries) : null;
  const next=[];
  if (intent.value==='明确拒绝') {
    next.push('记录客户意向，暂停该合作的主动跟进。');
  } else if (kind==='merchant') {
    next.push(needs.some(({label})=>['报价或推广套餐','合作方案或案例'].includes(label))
      ? '确认门店位置和推广目标，核对后提供报价或案例。'
      : '询问经营需求和合作目标，并确认下一次沟通。');
  } else {
    if (!schedule.evidence || schedule.needsConfirmation || schedule.value==='到店安排需重新确认') {
      next.push('核对门店与完整到店时间，请达人确认。');
    } else next.push('核对内部档期，将到店安排记录为跟进。');
    if (needs.some(({label})=>label==='交稿期限')) next.push('查看员工是否已回复交稿期限，并核对活动要求。');
  }
  return {count:messages.length, inbound:customerMessages.length, needs, intent, schedule, next};
}
