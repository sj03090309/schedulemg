import { DAY, HOUR, dateKey, kstParts, shiftDateKey, startOfDay } from "./time";

// 메일이 챙길 만한지 규칙으로 판단한다. AI를 쓰지 않아서 비용이 들지 않고 결과가 늘 같다.
// 보낸 사람, 대량 발송 표시, 제목·미리보기의 낱말로 점수를 매기고 THRESHOLD 이상이면 '할 일'에 올린다.

export interface MailFlag {
  important: boolean;
  /** 고른 이유 중 가장 센 것 (화면에 짧게 보여 준다) */
  reason: string | null;
  /** 메일에서 찾은 마감 시각 (ISO). '까지', '마감' 같은 말과 함께 나온 날짜만 쓴다. */
  due: string | null;
}

export interface MailFacts {
  account: string;
  fromAddress: string;
  subject: string;
  snippet: string;
  /** 받은 시각 (ISO) */
  date: string;
  starred: boolean;
  /** Gmail의 중요 표시 */
  important: boolean;
  category: string;
  /** 수신 거부 링크가 있는 대량 발송 메일 */
  bulk: boolean;
}

const THRESHOLD = 3;

const POSITIVE: { label: string; weight: number; re: RegExp }[] = [
  { label: "과제", weight: 3, re: /과제|레포트|리포트|보고서\s*제출|assignment|homework/i },
  { label: "시험", weight: 3, re: /시험|중간고사|기말고사|퀴즈|quiz|exam|midterm/i },
  { label: "면접", weight: 3, re: /면접|합격|불합격|서류\s*전형|interview/i },
  { label: "결제", weight: 3, re: /결제\s*(실패|오류|불가)|결제가\s*(실패|거절)|승인\s*거절|미납|연체|체납|납부\s*(요청|기한|안내)|청구서|자동\s*이체\s*실패|잔액\s*부족|payment\s+(failed|declined)|past\s+due|overdue/i },
  { label: "보안", weight: 4, re: /의심스러운|비정상적인|해외\s*로그인|계정이?\s*(잠|정지|차단)|무단\s*(접속|사용)|suspicious|unusual\s+(sign|activity)|compromised/i },
  { label: "수업", weight: 2, re: /휴강|보강|결강|강의실\s*변경|수업\s*변경|출석|대면\s*수업|비대면\s*수업/ },
  { label: "학사", weight: 2, re: /수강\s*(신청|정정|철회)|등록금|장학|성적|학점|졸업|휴학|복학|계절\s*학기/ },
  { label: "마감", weight: 2, re: /마감|기한|deadline|due\s+(date|by|on)/i },
  { label: "요청", weight: 2, re: /회신|답장|답변\s*(부탁|주세요|바랍니다)|확인\s*(부탁|요청|바랍니다)|요청드립니다|부탁드립니다|검토\s*부탁|참석\s*여부|서명\s*(부탁|요청)|please\s+(reply|respond|confirm)|rsvp|action\s+required/i },
  { label: "중요", weight: 2, re: /긴급|필독|\[중요\]|【중요】|중요\s*공지|urgent/i },
  { label: "배송", weight: 1, re: /배송\s*(지연|실패|불가)|반송|주소\s*(오류|확인\s*필요)/ },
];

const NEGATIVE: { weight: number; re: RegExp }[] = [
  // 광고성 메일은 제목에 (광고)를 붙이도록 법으로 정해져 있어서 믿을 만하다.
  { weight: -6, re: /[(\[【]\s*광고\s*[)\]】]|광고성\s*정보|수신\s*거부|뉴스\s*레터|newsletter|webinar|unsubscribe/i },
  { weight: -3, re: /할인|쿠폰|특가|세일|프로모션|적립|%\s*off|\bsale\b|promotion/i },
  { weight: -3, re: /영수증|결제\s*(완료|내역)|결제가\s*완료|주문\s*(완료|확인|접수)|주문이\s*(완료|접수)|구매\s*(완료|확정)|입금\s*(완료|확인)|이용\s*대금\s*안내|receipt|order\s+(confirmed|confirmation|received)|your\s+order/i },
  { weight: -3, re: /deploy(ment)?\s|build\s+(failed|succeeded|passed)|pull\s+request|\bmerged\b|workflow\s+run|\[github\]|dependabot/i },
  { weight: -2, re: /새로운?\s*(기기|로그인)|로그인\s*알림|로그인했습니다|new\s+sign-?in|signed\s+in\s+to|앱에\s*(액세스|권한)|비밀번호가?\s*변경(되었|했)/i },
];

// 사람이 아니라 시스템이 보낸 주소 (주소 앞부분의 낱말로 본다)
const AUTOMATED_LOCAL =
  /(^|[._+-])(no-?reply|noreply|do-?not-?reply|donotreply|notifications?|notify|alerts?|news(letter)?|mailer|marketing|promo(tions?)?|info|support|help|service|cs|contact|hello|team|admin|system|accounts?|billing|orders?|receipts?|updates?|digest|bounces?|postmaster|webmaster|events?|security|verify|welcome|ads?|mkt|edm|campaign|calendar)([._+-]|$)/i;
const SERVICE_DOMAIN =
  /(^|\.)(google\.com|github\.com|vercel\.com|netlify\.com|gitlab\.com|sentry\.io|npmjs\.com|figma\.com|notion\.so|slack\.com|discord\.com|linkedin\.com|facebookmail\.com|instagram\.com|youtube\.com|apple\.com|coupang\.com|toss\.im|tossbank\.com|kakaobank\.com|kakaocorp\.com|baemin\.com|amazon\.com|aliexpress\.com|temu\.com|spotify\.com|netflix\.com|openai\.com|anthropic\.com|substack\.com|medium\.com|mailchimpapp\.com|stibee\.com)$/i;
const SCHOOL_DOMAIN = /(^|\.)(ac\.kr|edu|edu\.[a-z]{2})$/i;
const CLASSROOM_DOMAIN = /(^|\.)classroom\.google\.com$/i;
const LMS = /(^|[._-])(lms|eclass|e-class|smartlead|canvas|moodle|blackboard|cyber)([._-]|$)/i;

export function triageMail(m: MailFacts, now: Date = new Date()): MailFlag {
  const [local = "", domain = ""] = m.fromAddress.toLowerCase().split("@");
  let score = 0;
  let best: { label: string; weight: number } | null = null;
  const add = (label: string, weight: number) => {
    score += weight;
    if (!best || weight > best.weight) best = { label, weight };
  };

  const classroom = CLASSROOM_DOMAIN.test(domain);
  const automated = AUTOMATED_LOCAL.test(local) || SERVICE_DOMAIN.test(domain);
  const school = SCHOOL_DOMAIN.test(domain);
  const self = m.fromAddress.toLowerCase() === m.account.toLowerCase();

  if (classroom) add("클래스룸", 4);
  else if (LMS.test(domain) || LMS.test(local)) add("수업", 3);
  if (school) add("학교", m.bulk ? 1 : 2);
  // 사람이 직접 보낸 메일 (교수님, 친구, 동아리)
  if (!automated && !m.bulk && !self && !classroom) add(school ? "학교" : "직접 보낸 메일", school ? 1 : 3);
  if (m.starred) add("별표", 4);
  if (m.important) score += 1;

  for (const r of POSITIVE) {
    if (r.re.test(m.subject)) add(r.label, r.weight);
    else if (r.re.test(m.snippet)) add(r.label, Math.ceil(r.weight / 2));
  }
  const text = `${m.subject}\n${m.snippet}`;
  for (const r of NEGATIVE) if (r.re.test(text)) score += r.weight;
  if (m.bulk) score -= 2;
  if (m.category === "updates" || m.category === "forums") score -= 1;

  const due = findDue(text, new Date(m.date));
  const dueMs = due?.getTime() ?? NaN;
  if (dueMs > now.getTime() - DAY && dueMs < now.getTime() + 14 * DAY) add("마감", 4);

  return {
    important: score >= THRESHOLD,
    reason: (best as { label: string } | null)?.label ?? null,
    due: due ? due.toISOString() : null,
  };
}

// ── 마감 찾기 ──────────────────────────────────────────────

const WEEKDAYS = "일월화수목금토";
const DEADLINE_AFTER = /^[^\n]{0,14}?(까지|마감|기한|제출|반납|due|deadline|until)/i;
const DEADLINE_BEFORE = /(마감|기한|제출|반납|due|deadline|until|by|~|〜)[^\n]{0,10}$/i;
const DEADLINE_ANY = /까지|마감|기한|deadline|due\s/i;

interface Candidate {
  day: string; // YYYY-MM-DD (KST)
  index: number;
  end: number;
}

/** 받은 날짜 기준으로 월·일만 있는 날짜의 연도를 정한다 (12월에 받은 "1월 5일"은 다음 해). */
function yearFor(month: number, day: number, received: Date): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const r = kstParts(received);
  let year = r.year;
  if (month < r.month - 4) year += 1;
  else if (month > r.month + 7) year -= 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function candidates(text: string, received: Date): Candidate[] {
  const out: Candidate[] = [];
  const base = dateKey(received);
  const push = (day: string | null, index: number, length: number) => {
    if (day && !Number.isNaN(startOfDay(day).getTime())) out.push({ day, index, end: index + length });
  };

  for (const m of text.matchAll(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/g)) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) push(`${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`, m.index, m[0].length);
  }
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)) {
    push(yearFor(Number(m[1]), Number(m[2]), received), m.index, m[0].length);
  }
  // 9/30(수), 10.2(금) 처럼 숫자로 쓴 날짜는 요일이 붙었거나 바로 뒤에 '까지·마감'이 있을 때만 믿는다 (3.5점 같은 수와 헷갈리지 않게).
  for (const m of text.matchAll(/(?<![\d.])(\d{1,2})[./](\d{1,2})(?![\d.])(\s*\(\s*[일월화수목금토]\s*\))?/g)) {
    if (!m[3] && !/^\s*(까지|마감)/.test(text.slice(m.index + m[0].length, m.index + m[0].length + 6))) continue;
    push(yearFor(Number(m[1]), Number(m[2]), received), m.index, m[0].length);
  }
  for (const m of text.matchAll(/오늘|금일|내일|명일|모레/g)) {
    const offset = m[0] === "모레" ? 2 : m[0] === "내일" || m[0] === "명일" ? 1 : 0;
    push(shiftDateKey(base, offset), m.index, m[0].length);
  }
  // 이번 주 금요일, 다음 주 월요일, 금요일까지
  const weekday = kstParts(received).weekday; // 0 = 일요일
  const monday = shiftDateKey(base, -((weekday + 6) % 7));
  for (const m of text.matchAll(/(이번\s*주|금주|다음\s*주|차주)?\s*([일월화수목금토])요일/g)) {
    const w = WEEKDAYS.indexOf(m[2]);
    const fromMonday = (w + 6) % 7;
    let day: string;
    if (m[1]) day = shiftDateKey(monday, fromMonday + (/다음|차주/.test(m[1]) ? 7 : 0));
    else day = shiftDateKey(base, (w - weekday + 7) % 7);
    push(day, m.index, m[0].length);
  }
  return out.sort((a, b) => a.index - b.index);
}

/** 날짜 바로 뒤의 시각. 없으면 그날 23:59로 본다. */
function timeAfter(text: string, from: number): { hour: number; minute: number; length: number } | null {
  const rest = text.slice(from, from + 18);
  let m = rest.match(/^\s*(?:\(\s*[일월화수목금토]\s*\))?\s*(자정|밤\s*12\s*시)/);
  if (m) return { hour: 23, minute: 59, length: m[0].length };
  m = rest.match(/^\s*(?:\(\s*[일월화수목금토]\s*\))?\s*(정오|낮\s*12\s*시)/);
  if (m) return { hour: 12, minute: 0, length: m[0].length };
  m = rest.match(/^\s*(?:\(\s*[일월화수목금토]\s*\))?\s*(오전|오후|아침|낮|저녁|밤|새벽)?\s*(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분|(반))?/);
  if (m) {
    let hour = Number(m[2]);
    const minute = m[4] ? 30 : Number(m[3] ?? 0);
    if (hour > 24 || minute > 59) return null;
    const part = m[1];
    if ((part === "오후" || part === "저녁" || part === "밤" || part === "낮") && hour < 12) hour += 12;
    else if ((part === "오전" || part === "아침" || part === "새벽") && hour === 12) hour = 0;
    else if (!part && hour >= 1 && hour <= 7) hour += 12; // '6시까지'는 보통 저녁 6시
    if (hour >= 24) return { hour: 23, minute: 59, length: m[0].length };
    return { hour, minute, length: m[0].length };
  }
  m = rest.match(/^\s*(?:\(\s*[일월화수목금토]\s*\))?\s*(\d{1,2}):(\d{2})/);
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) {
    return { hour: Number(m[1]), minute: Number(m[2]), length: m[0].length };
  }
  return null;
}

/** 텍스트에서 마감 시각을 찾는다. 받은 날짜보다 너무 이르거나 늦은 날짜는 참고용 날짜로 보고 버린다. */
export function findDue(text: string, received: Date): Date | null {
  const list = candidates(text, received);
  const plausible = (d: Date) =>
    d.getTime() > received.getTime() - DAY && d.getTime() < received.getTime() + 120 * DAY;
  const resolve = (c: Candidate) => {
    const t = timeAfter(text, c.end);
    const at = new Date(startOfDay(c.day).getTime() + (t ? t.hour * HOUR + t.minute * 60_000 : 23 * HOUR + 59 * 60_000));
    return { at, end: c.end + (t?.length ?? 0) };
  };

  // 1) 날짜 바로 앞뒤에 '까지·마감·제출' 같은 말이 있는 것
  for (const c of list) {
    const { at, end } = resolve(c);
    if (!plausible(at)) continue;
    if (DEADLINE_AFTER.test(text.slice(end, end + 20)) || DEADLINE_BEFORE.test(text.slice(Math.max(0, c.index - 14), c.index))) {
      return at;
    }
  }
  // 2) 메일 어딘가에 '마감·까지'가 있으면 앞으로 2주 안의 가장 가까운 날짜
  if (DEADLINE_ANY.test(text)) {
    const soon = list
      .map((c) => resolve(c).at)
      .filter((d) => plausible(d) && d.getTime() >= received.getTime() - HOUR && d.getTime() < received.getTime() + 14 * DAY)
      .sort((a, b) => a.getTime() - b.getTime());
    if (soon.length) return soon[0];
  }
  return null;
}
