// ?demo=1 로 열면 쓰는 예시 데이터. 실제 계정을 연결하기 전에 화면 구성을 확인하는 용도다.
import type { AccountTag } from "./google/accounts";
import type { CalEvent } from "./google/calendar";
import type { Announcement, Assignment, ClassroomData } from "./google/classroom";
import type { MailItem } from "./google/gmail";
import type { Memo } from "./memos";
import type { NotificationItem } from "./notifications";
import { HOUR, MINUTE, dateKey, shiftDateKey } from "./time";
import type { StoredUsageReport, UsageRow } from "./usage/types";

export const DEMO_ACCOUNTS: AccountTag[] = [
  { email: "me@example.com", label: "개인", slot: 0 },
  { email: "student@school.example", label: "학교", slot: 1 },
  { email: "club@example.org", label: "동아리", slot: 2 },
];
const [PERSONAL, SCHOOL, CLUB] = DEMO_ACCOUNTS.map((a) => a.email);

const pad = (n: number) => String(n).padStart(2, "0");

function at(now: Date, dayOffset: number, hour: number, minute = 0): string {
  return new Date(`${shiftDateKey(dateKey(now), dayOffset)}T${pad(hour)}:${pad(minute)}:00+09:00`).toISOString();
}

function ev(
  now: Date,
  id: string,
  account: string,
  title: string,
  day: number,
  from: [number, number],
  to: [number, number],
  extra: Partial<CalEvent> = {},
): CalEvent {
  return {
    id: `demo:${id}`,
    uid: id,
    account,
    calendar: "캘린더",
    color: "#4f7fd9",
    title,
    start: at(now, day, from[0], from[1]),
    end: at(now, day, to[0], to[1]),
    allDay: false,
    ...extra,
  };
}

export function demoEvents(now: Date): CalEvent[] {
  const today = dateKey(now);
  return [
    {
      id: "demo:exam-week",
      uid: "exam-week",
      account: SCHOOL,
      calendar: "학사 일정",
      color: "#8e24aa",
      title: "중간고사 대비 주간",
      start: new Date(`${today}T00:00:00+09:00`).toISOString(),
      end: new Date(`${shiftDateKey(today, 3)}T00:00:00+09:00`).toISOString(),
      allDay: true,
    },
    ev(now, "eng", PERSONAL, "영어 회화 스터디", 0, [8, 30], [9, 30], { calendar: "개인", color: "#3f51b5" }),
    ev(now, "ds", SCHOOL, "자료구조 수업", 0, [10, 0], [11, 50], { calendar: "시간표", color: "#0b8043", location: "공학관 301호" }),
    ev(now, "lunch", PERSONAL, "민지랑 점심", 0, [12, 30], [13, 30], { calendar: "개인", color: "#3f51b5" }),
    ev(now, "club", CLUB, "동아리 정기 회의", 0, [17, 0], [18, 0], { calendar: "동아리", color: "#e67c73", location: "학생회관 204호" }),
    ev(now, "gym", PERSONAL, "헬스", 0, [20, 0], [21, 0], { calendar: "개인", color: "#3f51b5" }),
    ev(now, "algo", SCHOOL, "알고리즘 수업", 1, [9, 0], [10, 50], { calendar: "시간표", color: "#0b8043" }),
    ev(now, "dentist", PERSONAL, "치과 예약", 1, [15, 0], [15, 30], { calendar: "개인", color: "#3f51b5" }),
  ];
}

export function demoClassroom(now: Date): ClassroomData {
  const a = (
    id: string,
    course: string,
    title: string,
    due: string | null,
    submitted = false,
    account = SCHOOL,
  ): Assignment => ({
    id: `demo-${id}`,
    account,
    courseId: course,
    course,
    title,
    due,
    dueHasTime: true,
    submitted,
    late: false,
    link: "https://classroom.google.com/",
    createdAt: new Date(now.getTime() - 3 * 24 * HOUR).toISOString(),
  });
  const announcements: Announcement[] = [
    {
      id: "demo-ann-1",
      account: SCHOOL,
      course: "일반물리실험",
      text: "내일 실험은 3층 실험실에서 진행합니다. 실험복을 꼭 챙겨 오세요.",
      createdAt: new Date(now.getTime() - 3 * HOUR).toISOString(),
      link: "https://classroom.google.com/",
    },
  ];
  return {
    assignments: [
      a("essay", "대학영어", "영어 에세이 초안", at(now, -1, 23, 59)),
      a("hash", "자료구조", "과제 3: 해시 테이블 구현", at(now, 0, 23, 59)),
      a("lab", "일반물리실험", "실험 보고서 4", at(now, 1, 18, 0)),
      a("review", "글쓰기", "독서 감상문", at(now, 3, 23, 59)),
      a("poster", "창업 동아리", "홍보 포스터 시안", at(now, 5, 21, 0), false, CLUB),
      a("quiz", "선형대수", "퀴즈 2", at(now, -2, 13, 0), true),
    ],
    announcements,
    courseCount: 6,
  };
}

export function demoMail(now: Date): MailItem[] {
  const m = (
    id: string,
    account: string,
    from: string,
    subject: string,
    snippet: string,
    minutesAgo: number,
    flags: Partial<MailItem> = {},
  ): MailItem => ({
    id: `demo-${id}`,
    threadId: `demo-${id}`,
    account,
    from,
    fromAddress: `${id}@example.com`,
    subject,
    snippet,
    date: new Date(now.getTime() - minutesAgo * MINUTE).toISOString(),
    unread: true,
    important: false,
    starred: false,
    category: "personal",
    link: "https://mail.google.com/",
    ...flags,
  });
  // 이번 주 금요일 오후 6시 (오늘이 금요일이면 오늘)
  const friday = at(now, (5 - new Date(now.getTime() + 9 * HOUR).getUTCDay() + 7) % 7, 18, 0);
  return [
    m("prof", SCHOOL, "김지훈 교수", "과제 3 제출 형식 안내", "코드와 보고서를 하나의 zip 파일로 묶어 제출하세요.", 40, {
      important: true,
      insight: { important: true, summary: "과제 3은 코드와 보고서를 zip 하나로 묶어 클래스룸에 내야 해요.", action: "zip으로 묶어 제출", due: friday },
    }),
    m("office", SCHOOL, "학사지원팀", "[필독] 2학기 수강 정정 기간 안내", "수강 정정은 이번 주 금요일 오후 6시까지 가능합니다.", 130, {
      important: true,
      insight: { important: true, summary: "수강 정정은 이번 주 금요일 오후 6시에 마감돼요.", action: "수강 정정 확인", due: friday },
    }),
    m("club", CLUB, "동아리 회장", "오늘 회의 안건 공유", "회의 전에 안건 문서를 한 번 읽어 와 주세요.", 200, {
      insight: { important: true, summary: "오늘 5시 회의 전에 안건 문서를 읽어 오라는 부탁이에요.", action: "안건 문서 읽기", due: at(now, 0, 17, 0) },
    }),
    m("shop", PERSONAL, "쿠팡", "주문하신 상품이 오늘 도착해요", "배송 기사님이 오후 2시에서 4시 사이에 방문합니다.", 75, {
      insight: { important: false, summary: "주문한 상품이 오늘 오후 2~4시에 도착해요.", action: null, due: null },
    }),
    m("vercel", PERSONAL, "Vercel", "Deployment ready", "Your deployment is ready.", 320, { unread: false, category: "updates" }),
    m("bank", PERSONAL, "토스뱅크", "9월 카드 이용대금 안내", "이번 달 결제 예정 금액을 확인하세요.", 600, { unread: false }),
  ];
}

export function demoNotifications(now: Date): NotificationItem[] {
  const n = (
    id: string,
    source: NotificationItem["source"],
    appName: string,
    title: string,
    body: string,
    minutesAgo: number,
    importance: NotificationItem["importance"],
    reasons: string[] = [],
  ): NotificationItem => ({
    id: `demo-${id}`,
    source,
    app: appName,
    appName,
    title,
    body,
    receivedAt: new Date(now.getTime() - minutesAgo * MINUTE).toISOString(),
    importance,
    reasons,
    status: "open",
  });
  return [
    n("team", "iphone", "카카오톡", "팀플 단톡방", "내일 발표 자료 오늘 밤 10시까지 올려 주세요!", 25, "high", ["‘발표’"]),
    n("parcel", "iphone", "메시지", "CJ대한통운", "고객님의 택배가 오늘 14~16시 도착 예정입니다.", 90, "high", ["‘택배’", "‘도착’"]),
    n("cal", "mac", "캘린더", "동아리 정기 회의", "오후 5:00, 학생회관 204호", 5, "high", ["중요한 앱"]),
    n("slack", "mac", "Slack", "#general", "점심 뭐 먹을래요?", 50, "normal"),
    n("music", "iphone", "YouTube", "추천 영상", "오늘의 인기 영상을 확인해 보세요.", 180, "normal"),
  ];
}

export function demoMemos(now: Date): Memo[] {
  const today = dateKey(now);
  return [
    { id: "demo-memo-1", text: "학생증 챙기기", date: today, createdAt: now.toISOString(), doneAt: null },
    { id: "demo-memo-2", text: "도서관 책 반납", date: shiftDateKey(today, 1), createdAt: now.toISOString(), doneAt: null },
  ];
}

export function demoUsageReports(now: Date): StoredUsageReport[] {
  const today = dateKey(now);
  const scale = [0.6, 1.1, 0.4, 0.9, 1.3, 0.7, 1];
  const claudeDays: UsageRow[] = [];
  const codexDays: UsageRow[] = [];
  scale.forEach((s, i) => {
    const date = shiftDateKey(today, i - 6);
    claudeDays.push({
      date,
      model: "claude-opus-5",
      input: Math.round(30_000 * s),
      output: Math.round(280_000 * s),
      cacheRead: Math.round(24_000_000 * s),
      cacheWrite: 0,
      cacheWrite1h: Math.round(1_300_000 * s),
      requests: Math.round(900 * s),
    });
    codexDays.push({
      date,
      model: "gpt-5.6-sol",
      input: Math.round(1_800_000 * s),
      output: Math.round(260_000 * s),
      cacheRead: Math.round(28_000_000 * s),
      cacheWrite: 0,
      reasoning: Math.round(90_000 * s),
      requests: Math.round(500 * s),
    });
  });
  const collectedAt = new Date(now.getTime() - 3 * MINUTE).toISOString();
  return [
    {
      host: "MacBook",
      collectedAt,
      receivedAt: collectedAt,
      claude: {
        available: true,
        days: claudeDays,
        last5h: [{ model: "claude-opus-5", input: 9_000, output: 90_000, cacheRead: 7_000_000, cacheWrite: 0, cacheWrite1h: 400_000, requests: 260 }],
        latestModel: "claude-opus-5",
        limits: {
          source: "Claude 계정 사용량",
          fetchedAt: collectedAt,
          plan: "max",
          windows: [
            { id: "five_hour", label: "5시간", usedPercent: 46, windowMinutes: 300, resetsAt: new Date(now.getTime() + 2 * HOUR + 14 * MINUTE).toISOString() },
            { id: "seven_day", label: "주간", usedPercent: 83, windowMinutes: 10080, resetsAt: new Date(now.getTime() + 2 * 24 * HOUR).toISOString() },
          ],
        },
      },
      codex: {
        available: true,
        days: codexDays,
        last5h: [{ model: "gpt-5.6-sol", input: 400_000, output: 60_000, cacheRead: 6_000_000, cacheWrite: 0, requests: 120 }],
        latestModel: "gpt-5.6-sol",
        limits: {
          source: "Codex 세션 기록",
          fetchedAt: collectedAt,
          plan: "plus",
          windows: [
            { id: "primary", label: "주간", usedPercent: 38, windowMinutes: 10080, resetsAt: new Date(now.getTime() + 4 * 24 * HOUR).toISOString() },
          ],
        },
      },
    },
  ];
}
